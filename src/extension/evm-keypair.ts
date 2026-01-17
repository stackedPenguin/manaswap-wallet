/**
 * EVM Keypair Utilities
 * Handles key derivation and wallet creation for EVM chains
 */

import { HDNodeWallet, Wallet, isAddress, getAddress } from 'ethers';

// EVM BIP44 derivation path: m/44'/60'/0'/0/index
// 60 is the coin type for Ethereum
const EVM_DERIVATION_PATH_PREFIX = "m/44'/60'/0'/0";

/**
 * Derive EVM address from mnemonic at a given index
 * Uses standard Ethereum derivation path: m/44'/60'/0'/0/{index}
 */
export function deriveEvmAddress(mnemonic: string, index: number): string {
  const path = `${EVM_DERIVATION_PATH_PREFIX}/${index}`;
  const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  return wallet.address;
}

/**
 * Get EVM wallet (signer) from mnemonic at a given index
 */
export function getEvmWalletFromMnemonic(mnemonic: string, index: number): Wallet {
  const path = `${EVM_DERIVATION_PATH_PREFIX}/${index}`;
  const hdWallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  // Convert HDNodeWallet to regular Wallet for signing
  return new Wallet(hdWallet.privateKey);
}

/**
 * Get EVM wallet from private key
 */
export function getEvmWalletFromPrivateKey(privateKey: string): Wallet {
  // Ensure private key has 0x prefix
  const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  return new Wallet(normalizedKey);
}

/**
 * Derive multiple EVM addresses from mnemonic
 */
export function deriveEvmAddresses(mnemonic: string, count: number, startIndex = 0): string[] {
  const addresses: string[] = [];
  for (let i = startIndex; i < startIndex + count; i++) {
    addresses.push(deriveEvmAddress(mnemonic, i));
  }
  return addresses;
}

/**
 * Validate EVM private key format
 */
export function isValidEvmPrivateKey(key: string): boolean {
  try {
    // Normalize the key
    const normalizedKey = key.startsWith('0x') ? key : `0x${key}`;
    // Try to create a wallet - this will validate the key
    new Wallet(normalizedKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate EVM address format
 */
export function isValidEvmAddress(address: string): boolean {
  return isAddress(address);
}

/**
 * Get checksummed EVM address
 */
export function toChecksumAddress(address: string): string {
  return getAddress(address);
}

/**
 * Get private key from wallet (with 0x prefix)
 */
export function getPrivateKey(wallet: Wallet): string {
  return wallet.privateKey;
}

/**
 * Generate a new random EVM wallet
 */
export function generateRandomEvmWallet(): HDNodeWallet {
  return Wallet.createRandom();
}

/**
 * Check if an address is an EVM address (starts with 0x and is 42 chars)
 */
export function looksLikeEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if a string looks like a Solana address (base58, 32-44 chars)
 */
export function looksLikeSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/**
 * Determine address type
 */
export function getAddressType(address: string): 'evm' | 'solana' | 'unknown' {
  if (looksLikeEvmAddress(address)) return 'evm';
  if (looksLikeSolanaAddress(address)) return 'solana';
  return 'unknown';
}
