import type { EncryptedVault, KeyringData, VaultState, AccountInfo, KeySource, KeySourceType } from '../shared/types';
import { encryptData, decryptData } from '../shared/crypto';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';

const VAULT_STORAGE_KEY = 'manaswap:vault';
const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let keyring: KeyringData | null = null;
let lockTimer: any = null; // Return type of setTimeout depends on env

export async function isVaultInitialized(): Promise<boolean> {
  const stored = await chrome.storage.local.get(VAULT_STORAGE_KEY);
  return !!stored[VAULT_STORAGE_KEY];
}

export async function getVaultState(): Promise<VaultState> {
  const initialized = await isVaultInitialized();
  return {
    isInitialized: initialized,
    isLocked: initialized && keyring === null,
  };
}

export async function createVault(password: string, mnemonic?: string): Promise<void> {
  if (!mnemonic) {
    mnemonic = generateMnemonic(wordlist);
  } else {
    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error('Invalid mnemonic phrase');
    }
    mnemonic = mnemonic.trim();
  }

  const initialSource: KeySource = {
    id: crypto.randomUUID(),
    type: 'mnemonic',
    value: mnemonic,
    label: 'Main Wallet',
    accounts: [{
      address: '', // Will be populated
      index: 0,
      label: 'Wallet 1',
      type: 'derived',
      sourceId: '' // Will be populated
    }]
  };

  // Populate address and sourceId
  initialSource.accounts[0].sourceId = initialSource.id;
  const seed = mnemonicToSeedSync(mnemonic);
  const path = `m/44'/501'/0'/0'`;
  const derived = derivePath(path, Buffer.from(seed).toString('hex'));
  const kp = Keypair.fromSeed(derived.key);
  initialSource.accounts[0].address = kp.publicKey.toBase58();

  const data: KeyringData = {
    sources: [initialSource]
  };

  // Serialize and encrypt
  const encrypted = await encryptData(JSON.stringify(data), password);

  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: encrypted });

  // Set in-memory state (auto-unlock on creation)
  keyring = data;
  cachedPassword = password;
  resetLockTimer();
}

export async function restoreVault(mnemonic: string, password: string): Promise<void> {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Re-use createVault logic but with specific mnemonic and force overwrite
  await createVault(password, mnemonic);
}

export async function unlockVault(password: string): Promise<void> {
  const stored = await chrome.storage.local.get(VAULT_STORAGE_KEY);
  const encrypted = stored[VAULT_STORAGE_KEY] as EncryptedVault | undefined;

  if (!encrypted) {
    throw new Error("No vault initialized");
  }

  try {
    const json = await decryptData(encrypted.ciphertext, encrypted.iv, encrypted.salt, password);
    keyring = JSON.parse(json);

    // Migration Logic
    if (!keyring?.sources) {
      console.log('Migrating vault to Multi-Wallet format...');
      keyring!.sources = [];

      // Migrate Mnemonic
      if (keyring!.mnemonic) {
        const sourceId = crypto.randomUUID();
        const accounts: AccountInfo[] = [];
        const nextIndex = keyring!.nextIndex || 1;

        // Re-derive accounts up to nextIndex
        const seed = mnemonicToSeedSync(keyring!.mnemonic!);
        for (let i = 0; i < nextIndex; i++) {
          const path = `m/44'/501'/${i}'/0'`;
          const derived = derivePath(path, Buffer.from(seed).toString('hex'));
          const kp = Keypair.fromSeed(derived.key);
          accounts.push({
            address: kp.publicKey.toBase58(),
            index: i,
            label: `Wallet ${i + 1}`,
            type: 'derived',
            sourceId: sourceId
          });
        }

        keyring!.sources.push({
          id: sourceId,
          type: 'mnemonic',
          value: keyring!.mnemonic,
          label: 'Main Wallet',
          accounts: accounts
        });
      }

      // Migrate Imported Keys
      if (keyring!.importedKeys && keyring!.importedKeys.length > 0) {
        for (const key of keyring!.importedKeys) {
          try {
            const sk = bs58.decode(key);
            const kp = Keypair.fromSecretKey(sk);
            const sourceId = crypto.randomUUID();
            keyring!.sources.push({
              id: sourceId,
              type: 'privateKey',
              value: key,
              label: `Imported ${kp.publicKey.toBase58().slice(0, 4)}...`,
              accounts: [{
                address: kp.publicKey.toBase58(),
                index: -1,
                label: `Imported ${kp.publicKey.toBase58().slice(0, 4)}...`,
                type: 'imported',
                sourceId: sourceId
              }]
            });
          } catch (e) {
            console.error('Failed to migrate imported key', e);
          }
        }
      }

      // Cleanup old fields
      delete keyring!.mnemonic;
      delete keyring!.importedKeys;
      delete keyring!.nextIndex;
      delete keyring!.ledgerAccounts;

      // Persist migration immediately
      const reEncrypted = await encryptData(JSON.stringify(keyring), password);
      await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: reEncrypted });
    }

    cachedPassword = password;
    resetLockTimer();
  } catch (e) {
    console.error("Unlock failed", e);
    throw new Error("Incorrect password");
  }
}

export async function revealMnemonic(password: string): Promise<string> {
  // If locked, try to unlock first (or just verify password against stored vault)
  const stored = await chrome.storage.local.get(VAULT_STORAGE_KEY);
  const encrypted = stored[VAULT_STORAGE_KEY] as EncryptedVault | undefined;

  if (!encrypted) {
    throw new Error("No vault initialized");
  }

  try {
    // Decrypt verifies the password
    const json = await decryptData(encrypted.ciphertext, encrypted.iv, encrypted.salt, password);
    const data: KeyringData = JSON.parse(json);

    if (data.mnemonic) return data.mnemonic;

    // Fallback to sources
    const source = data.sources?.find(s => s.type === 'mnemonic');
    if (source) return source.value;

    throw new Error("No mnemonic found");
  } catch (e) {
    throw new Error("Incorrect password");
  }
}

function getDerivedKeypair(source: KeySource, index: number): Keypair {
  if (source.type !== 'mnemonic') throw new Error('Invalid source type for derivation');

  const seed = mnemonicToSeedSync(source.value);
  const path = `m/44'/501'/${index}'/0'`;
  const derived = derivePath(path, Buffer.from(seed).toString('hex'));
  return Keypair.fromSeed(derived.key);
}

export function getAccountKeypair(address: string): Keypair {
  if (!keyring) {
    throw new Error('Vault is locked');
  }
  resetLockTimer();

  for (const source of keyring.sources) {
    // Check if account exists in this source
    const account = source.accounts.find(a => a.address === address);
    if (account) {
      if (source.type === 'mnemonic') {
        return getDerivedKeypair(source, account.index);
      } else if (source.type === 'privateKey') {
        const secretKey = bs58.decode(source.value);
        return Keypair.fromSecretKey(secretKey);
      }
    }
  }

  throw new Error('Account not found');
}

// Deprecated or updated for internal use? 
// We might still need to get a keypair by index for a specific source (e.g. adding account)
export function getSolanaKeypair(sourceId: string, accountIndex: number): Keypair {
  if (!keyring) throw new Error('Vault is locked');
  resetLockTimer();

  const source = keyring.sources.find(s => s.id === sourceId);
  if (!source) throw new Error('Source not found');

  return getDerivedKeypair(source, accountIndex);
}

export function getMainKeypair(): Keypair {
  if (!keyring) throw new Error('Vault is locked');
  resetLockTimer();

  // Try to find the first mnemonic source
  const source = keyring.sources.find(s => s.type === 'mnemonic');
  if (source && source.accounts.length > 0) {
    return getDerivedKeypair(source, source.accounts[0].index);
  }

  // Fallback to any source
  if (keyring.sources.length > 0 && keyring.sources[0].accounts.length > 0) {
    const s = keyring.sources[0];
    if (s.type === 'privateKey') {
      return Keypair.fromSecretKey(bs58.decode(s.value));
    }
  }

  throw new Error('No accounts found');
}

export async function addAccount(label?: string): Promise<AccountInfo> {
  if (!keyring) throw new Error('Vault is locked');

  // Default to the first mnemonic source for now
  // In the future, we might want to specify which source to add to
  const source = keyring.sources.find(s => s.type === 'mnemonic');
  if (!source) throw new Error('No mnemonic wallet found');

  // Find the next available index for this source
  // We can just look at the last account's index + 1, or find the max index
  const maxIndex = source.accounts.reduce((max, acc) => Math.max(max, acc.index), -1);
  const newIndex = maxIndex + 1;

  const kp = getDerivedKeypair(source, newIndex);

  const newAccount: AccountInfo = {
    address: kp.publicKey.toBase58(),
    index: newIndex,
    label: label || `Wallet ${newIndex + 1}`,
    type: 'derived',
    sourceId: source.id
  };

  source.accounts.push(newAccount);

  // Persist changes
  await saveVault();

  return newAccount;
}

export async function importAccount(privateKey: string, label?: string): Promise<AccountInfo> {
  if (!keyring) throw new Error('Vault is locked');

  // Validate key
  let secretKey: Uint8Array;
  try {
    secretKey = bs58.decode(privateKey);
    if (secretKey.length !== 64) throw new Error('Invalid key length');
  } catch {
    throw new Error('Invalid private key format');
  }

  const kp = Keypair.fromSecretKey(secretKey);
  const address = kp.publicKey.toBase58();

  // Check if already exists in any source
  for (const source of keyring.sources) {
    if (source.accounts.some(a => a.address === address)) {
      throw new Error('Account already imported');
    }
  }

  const sourceId = crypto.randomUUID();
  const newAccount: AccountInfo = {
    address,
    index: -1,
    label: label || `Imported ${address.slice(0, 4)}...`,
    type: 'imported',
    sourceId: sourceId
  };

  keyring.sources.push({
    id: sourceId,
    type: 'privateKey',
    value: privateKey,
    label: label || `Imported ${address.slice(0, 4)}...`,
    accounts: [newAccount]
  });

  await saveVault();

  return newAccount;
}

async function saveVault() {
  await saveKeyring();
}

// Internal password cache (cleared on lock)
let cachedPassword: string | null = null;

export async function unlockVaultWithCaching(password: string): Promise<void> {
  await unlockVault(password);
  // cachedPassword is now set in unlockVault
}

export async function saveKeyring(): Promise<void> {
  if (!keyring || !cachedPassword) {
    throw new Error('Cannot save vault: locked or password missing');
  }
  const encrypted = await encryptData(JSON.stringify(keyring), cachedPassword);
  await chrome.storage.local.set({ [VAULT_STORAGE_KEY]: encrypted });
}

export async function revealPrivateKey(password: string, accountAddress: string): Promise<string> {
  // Verify password by attempting to decrypt the vault (or use cached if matches)
  const stored = await chrome.storage.local.get(VAULT_STORAGE_KEY);
  const encrypted = stored[VAULT_STORAGE_KEY] as EncryptedVault | undefined;

  if (!encrypted) {
    throw new Error("No vault initialized");
  }

  try {
    const json = await decryptData(encrypted.ciphertext, encrypted.iv, encrypted.salt, password);
    const data: KeyringData = JSON.parse(json);

    // Find account in sources
    if (data.sources) {
      for (const source of data.sources) {
        const account = source.accounts.find(a => a.address === accountAddress);
        if (account) {
          if (source.type === 'mnemonic') {
            const seed = mnemonicToSeedSync(source.value);
            const path = `m/44'/501'/${account.index}'/0'`;
            const derived = derivePath(path, Buffer.from(seed).toString('hex'));
            const kp = Keypair.fromSeed(derived.key);
            return bs58.encode(kp.secretKey);
          } else if (source.type === 'privateKey') {
            return source.value;
          }
        }
      }
    }

    // Fallback for migration edge case (shouldn't happen if migration worked)
    throw new Error('Account not found');
  } catch (e) {
    throw new Error("Incorrect password or account not found");
  }
}

export async function lockVault(): Promise<void> {
  keyring = null;
  cachedPassword = null;
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;
}

// Internal helper to keep the session alive
export function resetLockTimer() {
  if (keyring === null) return; // Don't start timer if locked

  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    lockVault().then(() => console.log('Vault auto-locked'));
  }, LOCK_TIMEOUT_MS);
}

// Accessor for other background modules (e.g. transaction signing)
export function getKeyring(): KeyringData | null {
  resetLockTimer(); // Accessing keys refreshes the timer
  return keyring;
}

export function getAllAccounts(): AccountInfo[] {
  if (!keyring) return [];

  // Flatten accounts from all sources
  return keyring.sources.flatMap(s => s.accounts);
}

export async function discoverAccounts(connection: any): Promise<number> {
  if (!keyring) throw new Error('Vault is locked');

  let totalDiscovered = 0;
  const GAP_LIMIT = 20;

  console.log('[Discovery] Starting account discovery...');

  // Iterate over all mnemonic sources
  for (const source of keyring.sources) {
    if (source.type !== 'mnemonic') continue;

    let gapCount = 0;
    // Start checking from the next index after the last known account
    // Or just check from 0? Checking from 0 is safer but slower.
    // Let's check from the max index + 1
    const maxIndex = source.accounts.reduce((max, acc) => Math.max(max, acc.index), -1);
    let currentIndex = maxIndex + 1;

    // If it's a fresh restore, maxIndex is 0 (Account 1). So we start at 1.
    // Wait, if we just restored, we might have only Account 1 (index 0).
    // So we should start at 1.

    // Actually, if we just restored, we might want to verify Account 1 too?
    // But Account 1 is already added.

    while (gapCount < GAP_LIMIT) {
      const kp = getDerivedKeypair(source, currentIndex);
      const pubkey = kp.publicKey;

      try {
        const balance = await connection.getBalance(pubkey);
        const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 1 });

        const isActive = balance > 0 || signatures.length > 0;

        if (isActive) {
          console.log(`[Discovery] Found active account at index ${currentIndex}: ${pubkey.toBase58()}`);
          totalDiscovered++;
          gapCount = 0;

          // Add to source accounts
          source.accounts.push({
            address: pubkey.toBase58(),
            index: currentIndex,
            label: `Wallet ${currentIndex + 1}`,
            type: 'derived',
            sourceId: source.id
          });
        } else {
          gapCount++;
        }
      } catch (e) {
        console.error(`[Discovery] Error checking account ${currentIndex}`, e);
        gapCount++;
      }

      currentIndex++;
    }
  }

  if (totalDiscovered > 0) {
    await saveVault();
  }

  return totalDiscovered;
}

export async function addKeySource(type: KeySourceType, value?: string, label?: string): Promise<void> {
  if (!keyring) throw new Error('Vault is locked');

  if (type === 'mnemonic') {
    let mnemonic = value;
    if (!mnemonic) {
      mnemonic = generateMnemonic(wordlist);
    } else {
      if (!validateMnemonic(mnemonic, wordlist)) {
        throw new Error('Invalid mnemonic phrase');
      }
      mnemonic = mnemonic.trim();
    }

    // Check if already exists
    if (keyring.sources.some(s => s.type === 'mnemonic' && s.value === mnemonic)) {
      throw new Error('Wallet already added');
    }

    const sourceId = crypto.randomUUID();
    const seed = mnemonicToSeedSync(mnemonic);
    const path = `m/44'/501'/0'/0'`;
    const derived = derivePath(path, Buffer.from(seed).toString('hex'));
    const kp = Keypair.fromSeed(derived.key);

    keyring.sources.push({
      id: sourceId,
      type: 'mnemonic',
      value: mnemonic,
      label: label || `Wallet ${keyring.sources.length + 1}`,
      accounts: [{
        address: kp.publicKey.toBase58(),
        index: 0,
        label: label || 'Wallet 1',
        type: 'derived',
        sourceId: sourceId
      }]
    });
  } else {
    throw new Error('Unsupported key source type');
  }

  await saveVault();
}

export async function setAccountLabel(address: string, label: string): Promise<void> {
  if (!keyring) throw new Error('Vault is locked');

  let found = false;
  for (const source of keyring.sources) {
    const account = source.accounts.find(a => a.address === address);
    if (account) {
      account.label = label;
      found = true;
      break;
    }
  }

  if (!found) throw new Error('Account not found');

  await saveVault();
}
