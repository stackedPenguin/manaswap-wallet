import { getNetworkConfig, NETWORKS, checkNetworkHealth, type NetworkClusterId, type NetworkHealth } from '../shared/networks';
import { defaultSettings, readSettings, writeSettings } from '../shared/settings';
import type { DAppPermission, ManaswapMessage, Notification, PendingRequest, SiteDetectionPayload, WalletSettings } from '../shared/types';
import { fetchAccountBalance } from '../shared/balances';
import { fetchTokenPrices } from '../shared/prices';
import { fetchTransactionHistory } from '../shared/history';
import { sendSol } from '../shared/transactions';
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
  setAccountLabel
} from './vault';
import { Connection } from '@solana/web3.js';
import { getLedgerAccounts } from './ledger';

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
const pendingRequests = new Map<string, PendingRequest>();

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
});

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

chrome.runtime.onMessage.addListener((message: ManaswapMessage, _sender, sendResponse) => {
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
          const account = await addAccount(message.payload.label);
          sendResponse({ success: true, account });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:setAccountLabel': {
        try {
          await setAccountLabel(message.payload.address, message.payload.label);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:importAccount': {
        try {
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
          await addKeySource(message.payload.type, message.payload.value, message.payload.label);
          sendResponse({ success: true });
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
          console.log('[Background] Received getBalance request for', message.payload.address);
          const balance = await fetchAccountBalance(
            message.payload.address,
            message.payload.networkId
          );
          console.log('[Background] Balance fetched successfully', balance);
          sendResponse({ success: true, balance });
        } catch (e: any) {
          console.error('[Background] Failed to fetch balance', e);
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      // Transaction Handlers
      case 'manaswap:sendTransaction': {
        try {
          // TODO: Support sending from specific account. For now, we need to find the account that matches the sender?
          // The message payload doesn't have sender address currently. 
          // We should update the message type or assume active account.
          // For now, let's assume we use the first account or we need to update sendTransaction to accept sender.
          // Let's default to first account for now to keep it working, but ideally we pass sender.
          const keypair = getMainKeypair();
          const signature = await sendSol(
            keypair,
            message.payload.recipient,
            message.payload.amount,
            message.payload.networkId
          );
          sendResponse({ success: true, signature });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      // dApp Handlers
      case 'manaswap:dappConnect': {
        try {
          const hostname = normalizeHostname(message.payload.hostname);
          const origin = message.payload.origin;

          // Check if already has permission
          const existing = permissionsCache.find((p) => p.origin === origin);
          if (existing) {
            // Update last used
            existing.lastUsed = Date.now();
            await savePermissions(permissionsCache);

            const keypair = getMainKeypair();
            const settings = await readSettings();
            sendResponse({
              success: true,
              data: {
                publicKey: keypair.publicKey.toBase58(),
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
            timestamp: Date.now(),
          };
          pendingRequests.set(requestId, request);

          sendResponse({ success: true, requestId });
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
      case 'manaswap:dappSignMessage': {
        try {
          const origin = message.payload.origin;

          // Check permission
          const permission = permissionsCache.find((p) => p.origin === origin);
          if (!permission) {
            sendResponse({ success: false, error: 'Not connected' });
            break;
          }

          // Create pending request
          const requestId = `${message.type}-${Date.now()}-${Math.random()}`;
          let payload: unknown;
          let requestType: 'sign-transaction' | 'sign-all-transactions' | 'sign-message';

          if (message.type === 'manaswap:dappSignTransaction') {
            requestType = 'sign-transaction';
            payload = (message.payload as { transaction: unknown }).transaction;
          } else if (message.type === 'manaswap:dappSignAllTransactions') {
            requestType = 'sign-all-transactions';
            payload = (message.payload as { transactions: unknown[] }).transactions;
          } else {
            requestType = 'sign-message';
            payload = (message.payload as { message: Uint8Array }).message;
          }

          const request: PendingRequest = {
            id: requestId,
            type: requestType,
            origin,
            hostname: permission.hostname,
            payload,
            timestamp: Date.now(),
          };
          pendingRequests.set(requestId, request);

          // Update last used
          permission.lastUsed = Date.now();
          await savePermissions(permissionsCache);

          sendResponse({ success: true, requestId });
        } catch (e: any) {
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

          const keypair = getMainKeypair();
          const settings = await readSettings();
          let result: unknown;

          if (request.type === 'connect') {
            // Grant permission
            const permission: DAppPermission = {
              origin: request.origin,
              hostname: request.hostname,
              publicKey: keypair.publicKey.toBase58(),
              networkId: settings.selectedNetwork,
              grantedAt: Date.now(),
              lastUsed: Date.now(),
            };
            permissionsCache.push(permission);
            await savePermissions(permissionsCache);
            result = { publicKey: permission.publicKey };
          } else if (request.type === 'sign-transaction') {
            // TODO: Implement actual transaction signing
            result = request.payload;
          } else if (request.type === 'sign-all-transactions') {
            // TODO: Implement actual transaction signing
            result = request.payload;
          } else if (request.type === 'sign-message') {
            // TODO: Implement actual message signing
            result = { signature: new Uint8Array(64) }; // Placeholder
          }

          pendingRequests.delete(message.payload.requestId);
          sendResponse({ success: true, data: result });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }
      case 'manaswap:rejectRequest': {
        pendingRequests.delete(message.payload.requestId);
        sendResponse({ success: true });
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

  if (next.autoDetectNetworks && next.selectedNetwork !== payload.detectedNetwork) {
    next = { ...next, selectedNetwork: payload.detectedNetwork };

    // Create notification for network switch
    const network = getNetworkConfig(payload.detectedNetwork);
    const notificationId = `network-switch-${Date.now()}`;
    const notification: Notification = {
      id: notificationId,
      type: 'network-switch',
      message: `Network automatically switched to ${network.label}`,
      networkId: payload.detectedNetwork,
      duration: 6000,
    };
    pendingNotifications.set(notificationId, notification);

    // Clear notification after duration
    setTimeout(() => {
      pendingNotifications.delete(notificationId);
    }, notification.duration || 5000);
  } else if (payload.confidence >= 0.6 && next.selectedNetwork !== payload.detectedNetwork) {
    // High confidence detection but user has auto-detect disabled or different network
    const network = getNetworkConfig(payload.detectedNetwork);
    const notificationId = `detection-${Date.now()}`;
    const notification: Notification = {
      id: notificationId,
      type: 'detection',
      message: `Detected ${network.label} network for this site`,
      networkId: payload.detectedNetwork,
      actionLabel: 'Switch',
      onAction: async () => {
        const updated = { ...next, selectedNetwork: payload.detectedNetwork };
        await writeSettings(updated);
        await syncBadge(updated);
      },
      duration: 8000,
    };
    pendingNotifications.set(notificationId, notification);

    setTimeout(() => {
      pendingNotifications.delete(notificationId);
    }, notification.duration || 8000);
  }

  await writeSettings(next);
  await syncBadge(next);
  return next;
}

async function syncBadge(settings: WalletSettings) {
  if (!chrome.action) return;
  const network = getNetworkConfig(settings.selectedNetwork);
  const label = network.kind === 'x1' ? 'X1' : 'SOL';
  const color = network.kind === 'x1' ? '#f97316' : '#22d3ee';
  await chrome.action.setBadgeText({ text: label });
  await chrome.action.setBadgeBackgroundColor({ color });
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
