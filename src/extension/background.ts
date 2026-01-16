import { getNetworkConfig, NETWORKS, getAllNetworks, checkNetworkHealth, type NetworkClusterId, type NetworkHealth } from '../shared/networks';
import { defaultSettings, readSettings, writeSettings } from '../shared/settings';
// Polyfill window for Service Worker (needed for @solana/web3.js WebSocket)
if (typeof window === 'undefined') {
  (self as any).window = self;
}
import type { DAppPermission, ManaswapMessage, Notification, PendingRequest, SiteDetectionPayload, WalletSettings } from '../shared/types';
import { fetchAccountBalance } from '../shared/balances';
import { fetchEvmAccountBalance } from '../shared/evm-balances';
import { fetchTokenPrices } from '../shared/prices';
import { fetchTransactionHistory } from '../shared/history';
import { sendSol, sendSplToken } from '../shared/transactions';
import {
  createVault,
  addAccount,
  importAccount,
  revealPrivateKey,
  lockVault,
  getVaultState,
  getAllAccounts,
  restoreVault,
  discoverAccounts,
  unlockVaultWithCaching,
  revealMnemonic,
  addKeySource,
  getMainKeypair,
  getAccountKeypair,
  getAccountInfo,
  setAccountLabel,
  deleteAccount,
  getEvmAddressForAccount
} from './vault';
import { Connection, VersionedTransaction, Transaction, Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { getLedgerAccounts } from './ledger';
import { getTrezorAccounts } from './trezor';
import { savePortfolioDataPoint } from '../shared/portfolio';
import { calculateEvmPortfolioValue, EVM_UNIFIED_NETWORK_ID } from '../shared/evm-history';
import { fetchEvmTokenPrices } from '../shared/prices';
import { NATIVE_TOKEN_COINGECKO_IDS } from '../shared/evm-balances';
import { fetchJupiterPerpsPositions, calculatePositionPnl } from '../shared/perps';

// In-memory cache for network health
const networkHealthCache = new Map<NetworkClusterId, NetworkHealth>();

// Health check interval (5 minutes)
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

// Pending notifications queue
const pendingNotifications = new Map<string, Notification>();

// Sites that have opted out of automatic network switching
const detectionOptOuts = new Set<string>();

// dApp permissions storage
const PERMISSIONS_STORAGE_KEY = 'manaswap:permissions';
let permissionsCache: DAppPermission[] = [];

// Pending dApp requests
const pendingRequests = new Map<string, PendingRequest & { icon?: string }>();

// Callbacks for pending dApp requests (stored separately because functions can't be serialized)
type ResponseCallback = (response: unknown) => void;
const pendingResponders = new Map<string, ResponseCallback>();

// Load permissions from storage
async function loadPermissions(): Promise<DAppPermission[]> {
  try {
    const stored = await chrome.storage.local.get(PERMISSIONS_STORAGE_KEY);
    const perms = stored[PERMISSIONS_STORAGE_KEY];
    return Array.isArray(perms) ? perms : [];
  } catch {
    return [];
  }
}

// Save permissions to storage
async function savePermissions(permissions: DAppPermission[]): Promise<void> {
  permissionsCache = permissions;
  await chrome.storage.local.set({ [PERMISSIONS_STORAGE_KEY]: permissions });
}

// Initialize permissions cache
loadPermissions().then((perms) => {
  permissionsCache = Array.isArray(perms) ? perms : [];
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const settings = await readSettings();
  await syncBadge(settings);
  console.info(`[Manaswap] Extension installed (${reason}).`);

  // Start periodic health checks
  startHealthCheckPolling();

  // Create portfolio tracking alarm
  chrome.alarms.create('portfolio-tracking', { periodInMinutes: 15 });

  // Setup auto-lock alarm
  await setupAutoLockAlarm(settings.autoLockMinutes);
});

// Track last activity time for auto-lock
let lastActivityTime = Date.now();

// Update activity time whenever a message is received
function updateActivityTime() {
  lastActivityTime = Date.now();
}

// Setup or update auto-lock alarm
async function setupAutoLockAlarm(minutes: number) {
  // Clear existing auto-lock alarm
  await chrome.alarms.clear('auto-lock');

  if (minutes > 0) {
    // Create alarm to check for inactivity every minute
    chrome.alarms.create('auto-lock', { periodInMinutes: 1 });
    console.log(`[Background] Auto-lock set to ${minutes} minutes`);
  } else {
    console.log('[Background] Auto-lock disabled');
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'portfolio-tracking') {
    await trackPortfolioValue();
  } else if (alarm.name === 'auto-lock') {
    await checkAutoLock();
  }
});

async function checkAutoLock() {
  const settings = await readSettings();
  const vaultState = await getVaultState();

  // Skip if already locked or auto-lock disabled
  if (vaultState.isLocked || settings.autoLockMinutes === 0) return;

  const inactiveMs = Date.now() - lastActivityTime;
  const autoLockMs = settings.autoLockMinutes * 60 * 1000;

  if (inactiveMs >= autoLockMs) {
    console.log('[Background] Auto-locking due to inactivity');
    await lockVault();
  }
}

async function trackPortfolioValue() {
  try {
    const settings = await readSettings();
    if (!settings.selectedAccountAddress) return;

    const address = settings.selectedAccountAddress;

    // Usually portfolio value is USD, so we need prices.
    // We should probably track for all networks or just the active one?
    // Let's track for the active account across all networks (unified).

    console.log('[Background] Tracking portfolio value for', address);

    // We need to track value for EACH network separately to support per-chain history
    const allNetworks = getAllNetworks(settings.customNetworks);

    // Fetch Balances for all networks
    const balances = await Promise.all(allNetworks.map(n => fetchAccountBalance(address, n.id, settings.customNetworks).catch(() => null)));
    const balancesMap = new Map();
    allNetworks.forEach((n, i) => {
      if (balances[i]) balancesMap.set(n.id, balances[i]);
    });

    // Calculate and save value for each network
    for (const network of allNetworks) {
      try {
        const balance = balancesMap.get(network.id);
        if (!balance) continue;

        // 1. Native Token Value
        let nativeValue = 0;
        if (network.kind === 'x1') {
          // X1 is hardcoded $1 (for now, or fetched if XNT price available)
          nativeValue = balance.solBalance * 1.0;
        } else {
          // Solana use SOL price
          const solMint = 'So11111111111111111111111111111111111111112';
          const prices = await fetchTokenPrices([solMint]);
          nativeValue = balance.solBalance * (prices.get(solMint) || 0);
        }

        // 2. Token Value
        let tokenValue = 0;
        const mints = balance.tokens.map((t: any) => t.mint);
        if (mints.length > 0 && network.kind === 'solana') {
          const prices = await fetchTokenPrices(mints);
          balance.tokens.forEach((t: any) => {
            const price = prices.get(t.mint) || 0;
            tokenValue += (Number(t.amount) / Math.pow(10, t.decimals)) * price;
          });
        }

        // 3. Perps Value (Solana Mainnet Only)
        let perpsValue = 0;
        if (network.id === 'solana-mainnet') {
          try {
            const rpcUrl = 'https://api.mainnet-beta.solana.com';
            const connection = new Connection(rpcUrl);
            const perps = await fetchJupiterPerpsPositions(connection, address);

            // Need perps market prices
            const perpsMints = perps.map(p => p.marketMint);
            const perpsPrices = await fetchTokenPrices(perpsMints);

            perps.forEach(pos => {
              const currentPrice = perpsPrices.get(pos.marketMint) || 0;
              const pnl = calculatePositionPnl(pos, currentPrice);
              perpsValue += pos.collateralUsd + pnl - pos.borrowFee - pos.closeFee;
            });
          } catch (e) {
            // console.error('[Background] Failed to fetch perps for history', e);
          }
        }

        // 4. Staked Value (X1 Only)
        let stakedValue = 0;
        if (network.kind === 'x1') {
          // We need to fetch staked amount? 
          // `fetchAccountBalance` might not include stakes. 
          // For now, let's omit expensive stake fetch in background loop to avoid RPC blast.
          // Or assume user wants it? User said "confusing chains". 
          // Let's stick to simple balance + perps separation first.
        }

        const totalValue = nativeValue + tokenValue + perpsValue + stakedValue;

        await savePortfolioDataPoint(address, network.id, {
          timestamp: Date.now(),
          value: totalValue
        });

      } catch (e) {
        // Continue to next network
      }
    }

    // Track EVM portfolio (unified across all chains)
    try {
      const accountInfo = await getAccountInfo(address);
      const evmAddress = accountInfo ? getEvmAddressForAccount(accountInfo) : null;
      if (evmAddress) {
        console.log('[Background] Tracking EVM portfolio for', evmAddress);

        // Get all EVM mainnet networks
        const evmNetworks = allNetworks.filter(n => n.kind === 'evm' && !n.id.includes('testnet') && !n.id.includes('sepolia'));

        // Fetch EVM balances from all chains in parallel
        const evmBalances = new Map<string, { nativeBalance: string; nativeSymbol: string; tokens: any[] }>();
        await Promise.all(evmNetworks.map(async (network) => {
          try {
            const balance = await fetchEvmAccountBalance(evmAddress, network.id);
            evmBalances.set(network.id, balance);
          } catch {
            // Skip failed networks
          }
        }));

        // Collect all CoinGecko IDs for price fetching
        const coingeckoIds = new Set<string>();
        evmBalances.forEach((balance, networkId) => {
          const nativeId = NATIVE_TOKEN_COINGECKO_IDS[networkId];
          if (nativeId) coingeckoIds.add(nativeId);
          balance.tokens.forEach((t: any) => {
            if (t.coingeckoId) coingeckoIds.add(t.coingeckoId);
          });
        });

        // Fetch prices
        const evmPrices = await fetchEvmTokenPrices(Array.from(coingeckoIds));

        // Calculate total EVM portfolio value
        const { totalValue } = calculateEvmPortfolioValue(evmBalances, evmPrices);

        // Save unified EVM portfolio data point
        await savePortfolioDataPoint(evmAddress, EVM_UNIFIED_NETWORK_ID, {
          timestamp: Date.now(),
          value: totalValue
        });

        console.log('[Background] EVM portfolio value:', totalValue);
      }
    } catch (e) {
      console.warn('[Background] Error tracking EVM portfolio:', e);
    }
  } catch (e) {
    console.error('[Background] Error in trackPortfolioValue', e);
  }
}

// Start periodic health check polling
function startHealthCheckPolling() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }

  // Initial check
  void checkAllNetworksHealth();

  // Set up periodic checks
  healthCheckTimer = setInterval(() => {
    void checkAllNetworksHealth();
  }, HEALTH_CHECK_INTERVAL_MS);
}

// Check health for all networks
async function checkAllNetworksHealth() {
  const checks = NETWORKS.map((network) => checkNetworkHealth(network.id));
  const results = await Promise.allSettled(checks);

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      networkHealthCache.set(result.value.networkId, result.value);
    } else {
      const networkId = NETWORKS[index]?.id;
      if (networkId) {
        networkHealthCache.set(networkId, {
          networkId,
          status: 'unknown',
          latencyMs: null,
          lastChecked: Date.now(),
          error: result.reason?.message || 'Check failed',
        });
      }
    }
  });
}

let isPopupOpening = false;

// Helper to open the extension popup
async function openPopup() {
  // Check if any popup window is already open (native or fallback)
  // This is critical because getViews({ type: 'popup' }) only returns native popups
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const popupUrl = chrome.runtime.getURL('src/pages/popup/index.html');
    const existingPopup = windows.find(w =>
      w.tabs?.some(t => t.url?.includes(popupUrl))
    );

    if (existingPopup || isPopupOpening) {
      if (existingPopup?.id) {
        await chrome.windows.update(existingPopup.id, { focused: true });
      }
      return;
    }
  } catch (err) {
    console.debug('[Manaswap] Failed to check existing windows', err);
  }

  isPopupOpening = true;
  try {
    // Try to open the extension popup directly (cleaner UI)
    try {
      // @ts-ignore - openPopup is available in Chrome 99+
      await chrome.action.openPopup();
      isPopupOpening = false;
      return;
    } catch (e: any) {
      // If the popup is already open, openPopup throws an error.
      if (e.message && (e.message.includes('already open') || e.message.includes('Extension popup'))) {
        isPopupOpening = false;
        return;
      }
      console.debug('chrome.action.openPopup failed, falling back to window', e);
    }

    // Fallback to creating a new window
    await chrome.windows.create({
      url: 'src/pages/popup/index.html',
      type: 'popup',
      width: 360,
      height: 600,
      focused: true,
    });
  } catch (error) {
    console.error('[Manaswap] Failed to open popup', error);
  } finally {
    // Reset lock
    setTimeout(() => { isPopupOpening = false; }, 1000);
  }
}

chrome.runtime.onMessage.addListener((message: ManaswapMessage, _sender, sendResponse) => {
  // Track activity for auto-lock
  updateActivityTime();

  (async () => {
    switch (message.type) {
      case 'manaswap:getSettings': {
        const settings = await readSettings();
        sendResponse({ settings });
        break;
      }
      case 'manaswap:setSettings': {
        const next = normalizeSettings(message.payload);
        await writeSettings(next);
        await syncBadge(next);
        // Update auto-lock timer if changed
        await setupAutoLockAlarm(next.autoLockMinutes ?? 10);
        sendResponse({ settings: next });
        break;
      }
      case 'manaswap:detectionEvent': {
        const next = await handleDetection(message.payload);
        sendResponse({ settings: next });
        break;
      }
      // Vault Handlers
      case 'manaswap:getVaultState': {
        const state = await getVaultState();
        sendResponse(state);
        break;
      }
      case 'manaswap:createVault': {
        try {
          await createVault(message.payload.password, message.payload.mnemonic);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:unlockVault': {
        try {
          await unlockVaultWithCaching(message.payload.password);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:lockVault': {
        await lockVault();
        sendResponse({ success: true });
        break;
      }
      case 'manaswap:revealMnemonic': {
        try {
          const mnemonic = await revealMnemonic(message.payload.password);
          sendResponse({ success: true, mnemonic });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:revealPrivateKey': {
        try {
          const privateKey = await revealPrivateKey(
            message.payload.password,
            message.payload.accountAddress
          );
          sendResponse({ success: true, privateKey });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:getAccounts': {
        try {
          const accounts = getAllAccounts();
          sendResponse({ success: true, accounts });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:addAccount': {
        try {
          await getVaultState(); // Ensure session is restored
          const account = await addAccount(message.payload.label);
          sendResponse({ success: true, account });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:setAccountLabel': {
        try {
          await getVaultState(); // Ensure session is restored
          await setAccountLabel(message.payload.address, message.payload.label);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:deleteAccount': {
        try {
          await getVaultState(); // Ensure session is restored
          await deleteAccount(message.payload.address);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:importAccount': {
        try {
          await getVaultState(); // Ensure session is restored
          const account = await importAccount(message.payload.privateKey, message.payload.label);
          sendResponse({ success: true, account });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:restoreVault': {
        try {
          await restoreVault(message.payload.mnemonic, message.payload.password);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:discoverAccounts': {
        try {
          await getVaultState(); // Ensure session is restored
          const config = getNetworkConfig(message.payload.networkId);
          const connection = new Connection(config.rpcUrl, 'confirmed');
          const count = await discoverAccounts(connection);
          sendResponse({ success: true, count });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:addKeySource': {
        try {
          await getVaultState(); // Ensure session is restored
          const accounts = await addKeySource(message.payload.type, message.payload.value, message.payload.label);
          sendResponse({ success: true, accounts });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:getLedgerAccounts': {
        try {
          // @ts-ignore - payload might not exist on type yet, need to update types
          const accounts = await getLedgerAccounts(message.payload?.pathStart, message.payload?.limit);
          sendResponse({ success: true, accounts });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:getTrezorAccounts': {
        try {
          // @ts-ignore
          const accounts = await getTrezorAccounts(message.payload?.pathStart, message.payload?.limit);
          sendResponse({ success: true, accounts });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      // Network Health Handlers
      case 'manaswap:checkNetworkHealth': {
        try {
          const health = await checkNetworkHealth(message.payload.networkId);
          networkHealthCache.set(health.networkId, health);
          sendResponse({ success: true, health });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:checkAllNetworkHealth': {
        await checkAllNetworksHealth();
        const allHealth = Array.from(networkHealthCache.values());
        sendResponse({ success: true, health: allHealth });
        break;
      }
      case 'manaswap:getNetworkHealth': {
        const allHealth = Array.from(networkHealthCache.values());
        sendResponse({ success: true, health: allHealth });
        break;
      }
      // Notification Handlers
      case 'manaswap:getPendingNotifications': {
        const notifications = Array.from(pendingNotifications.values());
        sendResponse({ success: true, notifications });
        break;
      }
      case 'manaswap:clearNotification': {
        pendingNotifications.delete(message.payload.notificationId);
        sendResponse({ success: true });
        break;
      }
      case 'manaswap:optOutDetection': {
        const hostname = normalizeHostname(message.payload.hostname);
        if (hostname) {
          detectionOptOuts.add(hostname);
        }
        sendResponse({ success: true });
        break;
      }
      // Balance Handlers
      case 'manaswap:getBalance':
      case 'manaswap:refreshBalance': {
        try {
          // console.log('[Background] Received getBalance request for', message.payload.address, 'network:', message.payload.networkId);
          const settings = await readSettings();
          const balance = await fetchAccountBalance(
            message.payload.address,
            message.payload.networkId,
            settings.customNetworks || []
          );
          // console.log('[Background] Balance for', message.payload.networkId, ':', balance.solBalance, 'tokens:', balance.tokens.length);
          sendResponse({ success: true, balance });
        } catch (e: any) {
          console.error('[Background] Failed to fetch balance', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      // EVM Balance Handler
      case 'manaswap:getEvmBalance': {
        try {
          const { address, networkId } = message.payload;
          console.log('[Background] Fetching EVM balance for', address, 'on', networkId);
          const evmBalance = await fetchEvmAccountBalance(address, networkId);
          console.log('[Background] EVM balance:', evmBalance.nativeBalance, evmBalance.nativeSymbol);
          sendResponse({ success: true, balance: evmBalance });
        } catch (e: any) {
          console.error('[Background] Failed to fetch EVM balance', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      // EVM Address Handler
      case 'manaswap:getEvmAddress': {
        try {
          const { solanaAddress } = message.payload;
          const accountInfo = getAccountInfo(solanaAddress);
          if (!accountInfo) {
            sendResponse({ success: false, error: 'Account not found' });
            break;
          }
          const evmAddress = getEvmAddressForAccount(accountInfo);
          sendResponse({ success: true, evmAddress });
        } catch (e: any) {
          console.error('[Background] Failed to get EVM address', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      // Transaction Handlers
      case 'manaswap:sendTransaction': {
        try {
          // Use the selected account, not the main keypair
          const settings = await readSettings();
          if (!settings.selectedAccountAddress) {
            throw new Error('No account selected');
          }

          const keypair = getAccountKeypair(settings.selectedAccountAddress);
          const { recipient, amount, networkId, tokenMint, tokenDecimals } = message.payload;

          let signature: string;

          // Check if this is an SPL token transfer or native SOL
          if (tokenMint && tokenMint !== 'So11111111111111111111111111111111111111112') {
            // SPL token transfer
            console.log(`[sendTransaction] Sending SPL token from ${keypair.publicKey.toBase58()}`);
            signature = await sendSplToken(
              keypair,
              recipient,
              amount,
              tokenMint,
              tokenDecimals || 9, // Default to 9 decimals if not provided
              networkId
            );
          } else {
            // Native SOL transfer
            console.log(`[sendTransaction] Sending native SOL from ${keypair.publicKey.toBase58()}`);
            signature = await sendSol(
              keypair,
              recipient,
              amount,
              networkId
            );
          }

          sendResponse({ success: true, signature });
        } catch (e: any) {
          console.error('[Background] sendTransaction failed:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:signAndSendRawTransaction': {
        try {
          const { transaction: txBytes, accountAddress, networkId, additionalSigners } = message.payload;

          // Get keypair for the specified account
          const keypair = getAccountKeypair(accountAddress);

          // Deserialize the transaction
          const transaction = Transaction.from(Buffer.from(txBytes));

          // Build signers array (wallet + any additional signers like stake account)
          const signers: Keypair[] = [keypair];
          if (additionalSigners) {
            for (const signerBytes of additionalSigners) {
              const additionalKeypair = Keypair.fromSecretKey(new Uint8Array(signerBytes));
              signers.push(additionalKeypair);
            }
          }

          // Sign the transaction
          transaction.sign(...signers);

          // Get network config and send
          const settings = await readSettings();
          const config = getNetworkConfig(networkId, settings.customNetworks);
          const connection = new Connection(config.rpcUrl, 'confirmed');

          // Send and confirm
          const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

          // Wait for confirmation
          await connection.confirmTransaction(signature, 'confirmed');

          console.log('[Background] Raw transaction sent:', signature);
          sendResponse({ success: true, signature });
        } catch (e: any) {
          console.error('[Background] signAndSendRawTransaction failed:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:executeSwap': {
        try {
          const { swapTransactionBase64 } = message.payload;

          // Get current settings and selected account
          const settings = await readSettings();
          if (!settings.selectedAccountAddress) {
            throw new Error('No account selected');
          }

          const keypair = getAccountKeypair(settings.selectedAccountAddress);

          // Decode the base64 transaction
          const transactionBuffer = Buffer.from(swapTransactionBase64, 'base64');
          const transaction = VersionedTransaction.deserialize(transactionBuffer);

          // Sign the transaction
          transaction.sign([keypair]);

          // Get current network and send
          const config = getNetworkConfig(settings.selectedNetwork, settings.customNetworks);
          const connection = new Connection(config.rpcUrl, 'confirmed');

          // Send and confirm
          const signature = await connection.sendTransaction(transaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

          console.log('[Background] Swap executed:', signature);
          sendResponse({ success: true, signature });
        } catch (e: any) {
          console.error('[Background] Swap execution failed:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:broadcastTransaction': {
        try {
          const { serializedTransaction, networkId } = message.payload;
          const settings = await readSettings();
          // Use networkId from payload or fallback to settings
          const targetNetworkId = networkId || settings.selectedNetwork;

          const config = getNetworkConfig(targetNetworkId, settings.customNetworks);
          const connection = new Connection(config.rpcUrl, 'confirmed');

          // Send and confirm
          // Note: serializedTransaction comes as Object/Array from JSON message, need to convert to Uint8Array/Buffer
          const txBuffer = Buffer.from(Object.values(serializedTransaction));

          const signature = await connection.sendRawTransaction(txBuffer, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

          // Wait for confirmation logic could be added here or just return signature
          console.log('[Background] Broadcasted raw transaction:', signature);

          sendResponse({ success: true, signature });
        } catch (e: any) {
          console.error('[Background] Broadcast failed:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      // dApp Handlers
      case 'manaswap:dappConnect': {
        try {
          const hostname = normalizeHostname(message.payload.hostname);
          const origin = message.payload.origin;
          const settings = await readSettings();
          console.log('[dAppConnect] Connecting from:', origin);

          // Check if already has permission
          const existingIndex = permissionsCache.findIndex((p) => p.origin === origin);
          console.log('[dAppConnect] Existing permission index:', existingIndex);

          if (existingIndex !== -1) {
            // Get currently selected account
            // const settings = await readSettings();
            console.log('[dAppConnect] Settings selectedAccountAddress:', settings.selectedAccountAddress);

            // Check vault state first
            const vaultState = await getVaultState();
            console.log('[dAppConnect] Vault state:', vaultState);

            if (vaultState.isLocked) {
              // Vault is locked - we can't access the keypair
              // For reconnection with existing permission, use the selected account address from settings
              // If that's not set, return error asking user to unlock
              if (settings.selectedAccountAddress) {
                console.log('[dAppConnect] Vault locked, using settings.selectedAccountAddress:', settings.selectedAccountAddress);

                // Update permission with the selected account address
                permissionsCache[existingIndex] = {
                  ...permissionsCache[existingIndex],
                  publicKey: settings.selectedAccountAddress,
                  lastUsed: Date.now(),
                };
                await savePermissions(permissionsCache);

                sendResponse({
                  success: true,
                  data: {
                    publicKey: settings.selectedAccountAddress,
                    networkId: settings.selectedNetwork,
                  },
                });
                break;
              } else {
                console.log('[dAppConnect] Vault locked and no selectedAccountAddress - returning error');
                sendResponse({ success: false, error: 'Wallet is locked. Please unlock to connect.' });
                break;
              }
            }

            // Vault is unlocked - get the keypair for the selected account
            let keypair;
            try {
              if (settings.selectedAccountAddress) {
                console.log('[dAppConnect] Using getAccountKeypair for:', settings.selectedAccountAddress);
                keypair = getAccountKeypair(settings.selectedAccountAddress);
              } else {
                console.log('[dAppConnect] No selectedAccountAddress, using getMainKeypair');
                keypair = getMainKeypair();
              }
            } catch (e) {
              console.log('[dAppConnect] getAccountKeypair failed, fallback to getMainKeypair:', e);
              keypair = getMainKeypair();
            }

            const selectedPubkey = keypair.publicKey.toBase58();
            console.log('[dAppConnect] Returning publicKey:', selectedPubkey);

            // Update permission with current account and timestamp
            permissionsCache[existingIndex] = {
              ...permissionsCache[existingIndex],
              publicKey: selectedPubkey,
              lastUsed: Date.now(),
            };
            await savePermissions(permissionsCache);

            sendResponse({
              success: true,
              data: {
                publicKey: selectedPubkey,
                networkId: settings.selectedNetwork,
              },
            });
            break;
          }

          // Create pending request
          const requestId = `connect-${Date.now()}-${Math.random()}`;
          const request: PendingRequest = {
            id: requestId,
            type: 'connect',
            origin,
            hostname,
            icon: message.payload.icon,
            timestamp: Date.now(),
            networkId: (hostname?.includes('.x1.xyz') && !settings.selectedNetwork.startsWith('x1-'))
              ? (hostname.includes('staging') || hostname.includes('test') ? 'x1-testnet' : 'x1-mainnet')
              : settings.selectedNetwork,
          };
          pendingRequests.set(requestId, request);

          // Store the sendResponse callback so we can call it when user approves/rejects
          pendingResponders.set(requestId, sendResponse);

          // Open popup to prompt user
          void openPopup();

          // Return true to indicate we will respond asynchronously
          return true;
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:dappDisconnect': {
        try {
          const origin = message.payload.origin;
          const index = permissionsCache.findIndex((p) => p.origin === origin);
          if (index >= 0) {
            permissionsCache.splice(index, 1);
            await savePermissions(permissionsCache);
          }
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:dappSignTransaction':
      case 'manaswap:dappSignAllTransactions':
      case 'manaswap:dappSignMessage':
      case 'manaswap:dappSignAndSendTransaction': {
        try {
          const origin = message.payload.origin;
          console.log('[dappSign] Received sign request from:', origin, 'type:', message.type);

          // Check permission
          const permission = permissionsCache.find((p) => p.origin === origin);
          if (!permission) {
            console.log('[dappSign] Not connected, rejecting');
            sendResponse({ success: false, error: 'Not connected' });
            break;
          }

          // Create pending request
          const requestId = `${message.type}-${Date.now()}-${Math.random()}`;

          // Get selected account for Blowfish simulation
          const settings = await readSettings();
          const selectedAccountAddress = settings.selectedAccountAddress;

          // Network override logic
          const targetNetworkId = (permission.hostname?.includes('.x1.xyz') && !settings.selectedNetwork.startsWith('x1-'))
            ? (permission.hostname.includes('staging') || permission.hostname.includes('test') ? 'x1-testnet' : 'x1-mainnet')
            : settings.selectedNetwork;

          console.log('[dappSign] Network override evaluation:', {
            hostname: permission.hostname,
            currentSettingsNetwork: settings.selectedNetwork,
            resolvedNetworkId: targetNetworkId,
            origin: origin
          });

          let request: PendingRequest;
          const baseRequest = {
            id: requestId,
            origin,
            hostname: permission.hostname,
            timestamp: Date.now(),
            publicKey: selectedAccountAddress, // For Blowfish simulation
            networkId: targetNetworkId,
          };

          // Check if selected account is a Ledger account (settings already fetched above)
          const accountInfo = selectedAccountAddress ? getAccountInfo(selectedAccountAddress) : null;
          const isLedgerAccount = accountInfo?.type === 'ledger';
          const derivationPath = accountInfo?.derivationPath || "44'/501'/0'";

          console.log('[dappSign] Account type:', accountInfo?.type, 'isLedger:', isLedgerAccount, 'publicKey:', selectedAccountAddress);

          if (message.type === 'manaswap:dappSignTransaction') {
            const txPayload = (message.payload as { transaction: number[] }).transaction;
            if (isLedgerAccount) {
              request = { ...baseRequest, type: 'ledger-sign-transaction', payload: txPayload, derivationPath };
            } else {
              request = { ...baseRequest, type: 'sign-transaction', payload: txPayload };
            }
          } else if (message.type === 'manaswap:dappSignAllTransactions') {
            const txsPayload = (message.payload as { transactions: number[][] }).transactions;
            // Ledger can't sign multiple transactions at once - we'd need to sign each one
            // For now, use regular type and let the approval fail with helpful error
            request = { ...baseRequest, type: 'sign-all-transactions', payload: txsPayload };
          } else if (message.type === 'manaswap:dappSignAndSendTransaction') {
            const signSendPayload = message.payload as { transaction: number[]; options?: { skipPreflight?: boolean } };
            if (isLedgerAccount) {
              request = { ...baseRequest, type: 'ledger-sign-and-send', payload: signSendPayload.transaction, derivationPath, options: signSendPayload.options };
            } else {
              request = { ...baseRequest, type: 'sign-and-send-transaction', payload: signSendPayload.transaction, options: signSendPayload.options };
            }
          } else {
            const rawMsg = (message.payload as { message: any }).message;
            console.log('[dappSign] Raw message payload type:', typeof rawMsg, 'isArray:', Array.isArray(rawMsg), 'value:', rawMsg);

            // Handle array-like object serialization from Chrome messaging
            const msgPayload = Array.isArray(rawMsg)
              ? rawMsg
              : (rawMsg && typeof rawMsg === 'object')
                ? Object.values(rawMsg)
                : Array.from(rawMsg);

            console.log('[dappSign] Parsed message payload length:', msgPayload.length);

            if (isLedgerAccount) {
              request = { ...baseRequest, type: 'ledger-sign-message', payload: msgPayload, derivationPath };
            } else {
              request = { ...baseRequest, type: 'sign-message', payload: msgPayload };
            }
          }
          pendingRequests.set(requestId, request);
          console.log('[dappSign] Created pending request:', requestId);

          // Store the sendResponse callback so we can call it when user approves/rejects
          pendingResponders.set(requestId, sendResponse);
          console.log('[dappSign] Stored responder for requestId:', requestId);

          // Open popup to prompt user
          void openPopup();

          // Update last used
          permission.lastUsed = Date.now();
          await savePermissions(permissionsCache);

          // Return true to indicate we will respond asynchronously
          return true;
        } catch (e: any) {
          console.error('[dappSign] Error:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:getPendingRequests': {
        const requests = Array.from(pendingRequests.values());
        sendResponse({ success: true, requests });
        break;
      }
      case 'manaswap:approveRequest': {
        try {
          const request = pendingRequests.get(message.payload.requestId);
          if (!request) {
            sendResponse({ success: false, error: 'Request not found' });
            break;
          }

          const settings = await readSettings();
          console.log('[approveRequest] Settings selectedAccountAddress:', settings.selectedAccountAddress);

          // Check vault state
          const vaultState = await getVaultState();
          console.log('[approveRequest] Vault state:', vaultState);

          let publicKeyToUse: string;

          if (vaultState.isLocked) {
            // Vault is locked - use settings.selectedAccountAddress directly
            if (settings.selectedAccountAddress) {
              console.log('[approveRequest] Vault locked, using settings.selectedAccountAddress');
              publicKeyToUse = settings.selectedAccountAddress;
            } else {
              console.log('[approveRequest] Vault locked and no selectedAccountAddress - error');
              sendResponse({ success: false, error: 'Wallet is locked. Please unlock to connect.' });
              break;
            }
          } else {
            // Vault is unlocked - get keypair
            let keypair;
            try {
              if (settings.selectedAccountAddress) {
                console.log('[approveRequest] Using getAccountKeypair for:', settings.selectedAccountAddress);
                keypair = getAccountKeypair(settings.selectedAccountAddress);
              } else {
                console.log('[approveRequest] No selectedAccountAddress, using getMainKeypair');
                keypair = getMainKeypair();
              }
            } catch (e) {
              console.log('[approveRequest] getAccountKeypair failed, fallback to getMainKeypair:', e);
              keypair = getMainKeypair();
            }
            publicKeyToUse = keypair.publicKey.toBase58();
          }

          console.log('[approveRequest] Using publicKey:', publicKeyToUse);

          let result: unknown;

          if (request.type === 'connect') {
            // Grant permission
            const permission: DAppPermission = {
              origin: request.origin,
              hostname: request.hostname,
              publicKey: publicKeyToUse,
              networkId: settings.selectedNetwork,
              grantedAt: Date.now(),
              lastUsed: Date.now(),
            };
            permissionsCache.push(permission);
            await savePermissions(permissionsCache);
            result = { publicKey: permission.publicKey };
            console.log('[approveRequest] Connect approved, publicKey:', permission.publicKey);
          } else if (request.type === 'sign-transaction') {
            console.log('[approveRequest] Signing single transaction');
            // Actually sign the transaction
            const txBytes = new Uint8Array(request.payload as number[]);
            console.log('[approveRequest] Transaction bytes length:', txBytes.length);

            // Try to deserialize as versioned transaction first
            let signedTx: Uint8Array;
            try {
              const tx = VersionedTransaction.deserialize(txBytes);
              console.log('[approveRequest] Deserialized as VersionedTransaction');

              // Get keypair for currently selected account
              const settings = await readSettings();
              let keypair;
              try {
                keypair = settings.selectedAccountAddress
                  ? getAccountKeypair(settings.selectedAccountAddress)
                  : getMainKeypair();
              } catch (e) {
                keypair = getMainKeypair();
              }
              console.log('[approveRequest] Signing with keypair:', keypair.publicKey.toBase58());

              tx.sign([keypair]);
              signedTx = tx.serialize();
              console.log('[approveRequest] Signed transaction, new length:', signedTx.length);
            } catch (versionedError) {
              console.log('[approveRequest] Not a VersionedTransaction, trying legacy:', versionedError);
              // Try legacy transaction
              const tx = Transaction.from(txBytes);

              const settings = await readSettings();
              let keypair;
              try {
                keypair = settings.selectedAccountAddress
                  ? getAccountKeypair(settings.selectedAccountAddress)
                  : getMainKeypair();
              } catch (e) {
                keypair = getMainKeypair();
              }
              console.log('[approveRequest] Signing legacy tx with keypair:', keypair.publicKey.toBase58());

              tx.partialSign(keypair);
              signedTx = tx.serialize({ requireAllSignatures: false });
              console.log('[approveRequest] Signed legacy transaction, new length:', signedTx.length);
            }

            result = { transaction: Array.from(signedTx) };
            console.log('[approveRequest] Transaction signed successfully');
          } else if (request.type === 'sign-all-transactions') {
            console.log('[approveRequest] Signing multiple transactions');
            const transactions = request.payload as number[][];
            const signedTransactions: number[][] = [];

            const settings = await readSettings();
            let keypair;
            try {
              keypair = settings.selectedAccountAddress
                ? getAccountKeypair(settings.selectedAccountAddress)
                : getMainKeypair();
            } catch (e) {
              keypair = getMainKeypair();
            }
            console.log('[approveRequest] Signing with keypair:', keypair.publicKey.toBase58());



            for (let i = 0; i < transactions.length; i++) {
              const txBytes = new Uint8Array(transactions[i]);
              console.log(`[approveRequest] Signing tx ${i + 1}/${transactions.length}`);

              try {
                const tx = VersionedTransaction.deserialize(txBytes);
                tx.sign([keypair]);
                signedTransactions.push(Array.from(tx.serialize()));
              } catch {
                const tx = Transaction.from(txBytes);
                tx.partialSign(keypair);
                signedTransactions.push(Array.from(tx.serialize({ requireAllSignatures: false })));
              }
            }

            result = { transactions: signedTransactions };
            console.log('[approveRequest] All transactions signed');
          } else if (request.type === 'sign-message') {
            console.log('[approveRequest] Signing message');
            const messageBytes = new Uint8Array(request.payload as number[]);

            const settings = await readSettings();
            let keypair;
            try {
              keypair = settings.selectedAccountAddress
                ? getAccountKeypair(settings.selectedAccountAddress)
                : getMainKeypair();
            } catch (e) {
              keypair = getMainKeypair();
            }
            console.log('[approveRequest] Signing message with keypair:', keypair.publicKey.toBase58());

            // Sign the message using tweetnacl
            const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

            result = { signature: Array.from(signature) };
            console.log('[approveRequest] Message signed, signature length:', signature.length);
          } else if (request.type === 'sign-and-send-transaction') {
            console.log('[approveRequest] Sign and send transaction');
            const txBytes = new Uint8Array(request.payload as number[]);
            const txOptions = (request as any).options || {};

            const settings = await readSettings();
            let keypair;
            try {
              keypair = settings.selectedAccountAddress
                ? getAccountKeypair(settings.selectedAccountAddress)
                : getMainKeypair();
            } catch (e) {
              keypair = getMainKeypair();
            }
            console.log('[approveRequest] Signing with keypair:', keypair.publicKey.toBase58());

            // Use the wallet's CURRENT selected network (user's explicit choice)
            // NOT the permission's stored networkId - that would override user's selection
            const networkToUse = settings.selectedNetwork;
            console.log('[approveRequest] Using current wallet network:', networkToUse);

            // Get connection for current network
            const config = getNetworkConfig(networkToUse, settings.customNetworks);
            const connection = new Connection(config.rpcUrl, 'confirmed');
            console.log('[approveRequest] RPC URL:', config.rpcUrl);

            let txSignature: string;
            try {
              // Try versioned transaction first
              const tx = VersionedTransaction.deserialize(txBytes);

              // Just sign and send - do NOT modify blockhash (would invalidate dApp's signatures)
              tx.sign([keypair]);
              const serialized = tx.serialize();

              txSignature = await connection.sendRawTransaction(serialized, {
                skipPreflight: txOptions.skipPreflight || false,
                preflightCommitment: 'confirmed',
                maxRetries: 3,
              });
              console.log('[approveRequest] Sent versioned transaction:', txSignature);
            } catch (versionedError) {
              console.log('[approveRequest] Trying legacy transaction:', versionedError);
              // Try legacy transaction
              const tx = Transaction.from(txBytes);

              // Just sign - do NOT modify blockhash
              tx.partialSign(keypair);

              txSignature = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: txOptions.skipPreflight || false,
                preflightCommitment: 'confirmed',
                maxRetries: 3,
              });
              console.log('[approveRequest] Sent legacy transaction:', txSignature);
            }

            result = { signature: txSignature };
            console.log('[approveRequest] Transaction sent successfully');
          } else if (request.type === 'switch-chain') {
            console.log('[approveRequest] Switching chain');
            const payload = request.payload as { targetNetworkId: string; targetNetworkName: string };

            // Actually switch the network
            const settings = await readSettings();
            const newSettings = { ...settings, selectedNetwork: payload.targetNetworkId };
            await writeSettings(newSettings);
            await syncBadge(newSettings);

            console.log('[approveRequest] Network switched to:', payload.targetNetworkId);
            result = { success: true };
          }

          pendingRequests.delete(message.payload.requestId);
          console.log('[approveRequest] Deleted pending request, calling responder');

          // Call the original responder to complete the dApp connection
          const responder = pendingResponders.get(message.payload.requestId);
          if (responder) {
            pendingResponders.delete(message.payload.requestId);
            console.log('[approveRequest] Calling responder with result');
            responder({ success: true, data: result });
          } else {
            console.log('[approveRequest] No responder found for requestId:', message.payload.requestId);
          }

          sendResponse({ success: true, data: result });
          console.log('[approveRequest] Sent response to popup');
        } catch (e: any) {
          console.error('[approveRequest] Error:', e);
          // Also notify original responder of error
          const responder = pendingResponders.get(message.payload.requestId);
          if (responder) {
            pendingResponders.delete(message.payload.requestId);
            responder({ success: false, error: e.message });
          }
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:rejectRequest': {
        // Notify original responder of rejection
        const responder = pendingResponders.get(message.payload.requestId);
        if (responder) {
          pendingResponders.delete(message.payload.requestId);
          responder({ success: false, error: 'User rejected the request' });
        }
        pendingRequests.delete(message.payload.requestId);
        sendResponse({ success: true });
        break;
      }
      case 'manaswap:ledgerSignResult': {
        // Handle Ledger signing result from popup
        const request = pendingRequests.get(message.payload.requestId);
        const responder = pendingResponders.get(message.payload.requestId);

        if (!request || !responder) {
          sendResponse({ success: false, error: 'Request not found' });
          break;
        }

        try {
          const signature = new Uint8Array(message.payload.signature);
          let result: unknown;

          if (request.type === 'ledger-sign-transaction') {
            // For sign-transaction, apply signature to transaction and return
            const txBytes = new Uint8Array(request.payload as number[]);
            const tx = VersionedTransaction.deserialize(txBytes);
            // Add the Ledger signature
            tx.addSignature(tx.message.staticAccountKeys[0], signature);
            result = { signedTransaction: Array.from(tx.serialize()) };
          } else if (request.type === 'ledger-sign-and-send') {
            // Sign and send - apply signature and broadcast
            const txBytes = new Uint8Array(request.payload as number[]);
            const tx = VersionedTransaction.deserialize(txBytes);
            tx.addSignature(tx.message.staticAccountKeys[0], signature);

            const settings = await readSettings();
            const config = getNetworkConfig(settings.selectedNetwork, settings.customNetworks);
            const connection = new Connection(config.rpcUrl, 'confirmed');

            const txSignature = await connection.sendRawTransaction(tx.serialize(), {
              skipPreflight: (request as any).options?.skipPreflight || false,
              preflightCommitment: 'confirmed',
            });
            result = { signature: txSignature };
          } else if (request.type === 'ledger-sign-message') {
            result = { signature: Array.from(signature) };
          }

          pendingRequests.delete(message.payload.requestId);
          pendingResponders.delete(message.payload.requestId);
          responder({ success: true, ...(result as object) });
          sendResponse({ success: true });
        } catch (e: any) {
          console.error('[ledgerSignResult] Error:', e);
          responder({ success: false, error: e.message });
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:getPermissions': {
        sendResponse({ success: true, permissions: permissionsCache });
        break;
      }
      case 'manaswap:revokePermission': {
        try {
          const index = permissionsCache.findIndex((p) => p.origin === message.payload.origin);
          if (index >= 0) {
            permissionsCache.splice(index, 1);
            await savePermissions(permissionsCache);
          }
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:dappGetNetwork': {
        try {
          const origin = message.payload.origin;
          // Check if dApp is connected
          const permission = permissionsCache.find((p) => p.origin === origin);
          if (!permission) {
            sendResponse({ success: false, error: 'Not connected' });
            break;
          }

          const settings = await readSettings();
          const config = getNetworkConfig(settings.selectedNetwork, settings.customNetworks);
          sendResponse({
            success: true,
            networkId: settings.selectedNetwork,
            name: config.label,
            rpcUrl: config.rpcUrl,
          });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:dappSwitchChain': {
        try {
          const origin = message.payload.origin;
          const targetNetworkId = message.payload.networkId;
          console.log('[dappSwitchChain] Request from:', origin, 'target:', targetNetworkId);

          // Check if dApp is connected
          const permission = permissionsCache.find((p) => p.origin === origin);
          if (!permission) {
            sendResponse({ success: false, error: 'Not connected' });
            break;
          }

          // Validate target network exists
          const settings = await readSettings();
          const allNetworks = [...NETWORKS, ...(settings.customNetworks || [])];
          const targetNetwork = allNetworks.find((n) => n.id === targetNetworkId);
          if (!targetNetwork) {
            sendResponse({ success: false, error: `Unknown network: ${targetNetworkId}` });
            break;
          }

          // If already on the requested network, return success immediately
          if (settings.selectedNetwork === targetNetworkId) {
            sendResponse({ success: true });
            break;
          }

          // Create pending request for user approval
          const requestId = `switch-chain-${Date.now()}-${Math.random()}`;
          const request: PendingRequest = {
            id: requestId,
            type: 'switch-chain',
            origin,
            hostname: permission.hostname,
            payload: { targetNetworkId, targetNetworkName: targetNetwork.label },
            timestamp: Date.now(),
          };
          pendingRequests.set(requestId, request);
          pendingResponders.set(requestId, sendResponse);

          console.log('[dappSwitchChain] Created pending request:', requestId);

          // Open popup for user approval
          void openPopup();

          // Return true to indicate async response
          return true;
        } catch (e: any) {
          console.error('[dappSwitchChain] Error:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:getTokenPrices': {
        try {
          const prices = await fetchTokenPrices(message.payload.mints);
          // Convert Map to Object for serialization
          sendResponse({ success: true, prices: Object.fromEntries(prices) });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:signTransaction': {
        try {
          // Internal sign request (for SDKs like Drift)
          const { transaction: txBytes, accountAddress } = message.payload;

          // Get keypair
          const keypair = getAccountKeypair(accountAddress);

          // Try VersionedTransaction first, fall back to legacy
          let signedTxBytes: number[];

          try {
            const tx = VersionedTransaction.deserialize(new Uint8Array(txBytes));
            tx.sign([keypair]);
            signedTxBytes = Array.from(tx.serialize());
          } catch {
            const tx = Transaction.from(Buffer.from(txBytes));
            tx.sign(keypair); // Legacy transaction sign
            signedTxBytes = Array.from(tx.serialize());
          }

          sendResponse({ success: true, signedTransaction: signedTxBytes });
        } catch (e: any) {
          console.error('[Background] signTransaction failed:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:getTransactionHistory': {
        try {
          const { address, networkId, limit } = message.payload;
          const config = getNetworkConfig(networkId);
          const connection = new Connection(config.rpcUrl, 'confirmed');
          const history = await fetchTransactionHistory(connection, address, networkId, limit);
          sendResponse({ success: true, history });
        } catch (e: any) {
          console.error('History fetch failed:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:getPortfolioHistory': {
        try {
          // Dynamic import to avoid circular dependencies if any, or just import at top
          const { getPortfolioHistory } = await import('../shared/portfolio');
          const { address, networkId } = message.payload;
          const history = await getPortfolioHistory(address, networkId);
          sendResponse({ success: true, history });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      default:
        console.warn('[Manaswap] Received unsupported message', message);
        sendResponse({ error: 'unsupported-message' });
    }
  })();
  return true;
});

async function handleDetection(payload: SiteDetectionPayload): Promise<WalletSettings> {
  const settings = await readSettings();
  const normalizedHostname = normalizeHostnameForDetection(payload.hostname);
  let next: WalletSettings = settings;

  if (normalizedHostname) {
    // Check if site has opted out
    if (detectionOptOuts.has(normalizedHostname)) {
      return settings; // Don't auto-switch for opted-out sites
    }

    next = {
      ...next,
      siteOverrides: {
        ...next.siteOverrides,
        [normalizedHostname]: payload.detectedNetwork,
      },
    };
  }

  // DISABLED: No automatic network switching
  // Network should only change when:
  // 1. User explicitly switches in wallet UI
  // 2. dApp explicitly requests via switch-chain request
  // The auto-detect feature is disabled to prevent unexpected UX

  await writeSettings(next);
  await syncBadge(next);
  return next;
}

async function syncBadge(_settings: WalletSettings) {
  if (!chrome.action) return;
  // Clear badge - don't show network indicator as it covers the logo
  await chrome.action.setBadgeText({ text: '' });
}

function normalizeSettings(settings: WalletSettings): WalletSettings {
  return {
    ...defaultSettings,
    ...settings,
    siteOverrides: settings.siteOverrides ?? {},
  };
}

function normalizeHostnameForDetection(hostname: string): string {
  try {
    const normalized = hostname.trim();
    if (!normalized) return '';
    const url = normalized.includes('://') ? new URL(normalized) : new URL(`https://${normalized}`);
    return url.hostname.toLowerCase();
  } catch (error) {
    console.warn('[Manaswap] Failed to normalize hostname', hostname, error);
    return '';
  }
}

function normalizeHostname(hostname: string): string {
  return normalizeHostnameForDetection(hostname);
}
