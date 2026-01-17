import type { NetworkClusterId } from './networks';

export interface WalletSettings {
  autoDetectNetworks: boolean;
  selectedNetwork: NetworkClusterId;
  selectedAccountAddress?: string;
  siteOverrides: Record<string, NetworkClusterId>;
  customNetworks: import('./networks').NetworkConfig[];
  autoLockMinutes: number; // Auto-lock wallet after N minutes of inactivity (0 = never)
  evmChainId?: string; // Current EVM chain ID in hex (e.g., '0x1' for Ethereum mainnet)
}

export interface SiteDetectionPayload {
  origin: string;
  hostname: string;
  detectedNetwork: NetworkClusterId;
  confidence: number; // 0-1 for future heuristics
}

// --- Vault & Keyring Types ---

export interface EncryptedVault {
  ciphertext: string;
  iv: string;
  salt: string;
}

export type KeySourceType = 'mnemonic' | 'privateKey' | 'ledger' | 'trezor';

export interface KeySource {
  id: string;
  type: KeySourceType;
  value: string; // Mnemonic or Secret Key (encrypted in vault)
  label?: string;
  accounts: AccountInfo[]; // Active accounts derived from this source
}

export interface KeyringData {
  sources: KeySource[];
  // Deprecated fields for migration (optional)
  mnemonic?: string;
  importedKeys?: string[];
  nextIndex?: number;
  ledgerAccounts?: AccountInfo[];
}

export interface VaultState {
  isInitialized: boolean;
  isLocked: boolean;
}

export interface AccountInfo {
  address: string;
  index: number; // For derived accounts
  label?: string;
  type: 'derived' | 'imported' | 'ledger' | 'trezor';
  derivationPath?: string; // For Ledger hardware wallets
  sourceId?: string; // ID of the KeySource this account belongs to
}

export interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  usdValue?: number;
  isVerified?: boolean; // True if token is on Jupiter strict list
  coingeckoId?: string; // CoinGecko ID for price fetching (EVM tokens)
}

export interface AccountBalance {
  solBalance: number;
  tokens: TokenBalance[];
  lastUpdated: number;
}

export interface TransactionActivity {
  id: string;
  type: 'send' | 'receive' | 'token-transfer' | 'dapp-interaction';
  signature?: string;
  from: string;
  to?: string;
  amount?: number;
  tokenMint?: string;
  networkId: NetworkClusterId;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface DAppPermission {
  origin: string;
  hostname: string;
  publicKey: string;
  networkId: NetworkClusterId;
  grantedAt: number;
  lastUsed: number;
}

// Base properties shared by all pending requests
interface PendingRequestBase {
  id: string;
  origin: string;
  hostname: string;
  timestamp: number;
  icon?: string;
  publicKey?: string; // User's wallet address for Blowfish simulation
  networkId?: NetworkClusterId; // Network context for the request
}

// Discriminated union for pending requests with typed payloads
export type PendingRequest =
  | (PendingRequestBase & { type: 'connect'; payload?: undefined })
  | (PendingRequestBase & { type: 'sign-transaction'; payload: number[] })
  | (PendingRequestBase & { type: 'sign-all-transactions'; payload: number[][] })
  | (PendingRequestBase & { type: 'sign-message'; payload: number[] })
  | (PendingRequestBase & { type: 'sign-and-send-transaction'; payload: number[]; options?: { skipPreflight?: boolean } })
  | (PendingRequestBase & { type: 'switch-chain'; payload: { targetNetworkId: string; targetNetworkName: string } })
  // Ledger hardware wallet requests - handled by popup doing WebHID signing
  | (PendingRequestBase & { type: 'ledger-sign-transaction'; payload: number[]; derivationPath: string })
  | (PendingRequestBase & { type: 'ledger-sign-message'; payload: number[]; derivationPath: string })
  | (PendingRequestBase & { type: 'ledger-sign-and-send'; payload: number[]; derivationPath: string; options?: { skipPreflight?: boolean } });

// Re-export NetworkHealth for convenience
export type { NetworkHealth } from './networks';

// --- Notifications ---
export interface Notification {
  id: string;
  type: 'network-switch' | 'detection' | 'info' | 'warning';
  message: string;
  networkId?: NetworkClusterId;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

// --- Messages ---

export type ManaswapMessage =
  | { type: 'manaswap:getSettings' }
  | { type: 'manaswap:setSettings'; payload: WalletSettings }
  | { type: 'manaswap:detectionEvent'; payload: SiteDetectionPayload }
  // Vault Messages
  | { type: 'manaswap:getVaultState' }
  | { type: 'manaswap:createVault'; payload: { password: string; mnemonic?: string } } // mnemonic optional (generate new if missing)
  | { type: 'manaswap:unlockVault'; payload: { password: string } }
  | { type: 'manaswap:lockVault' }
  | { type: 'manaswap:revealMnemonic'; payload: { password: string } }
  | { type: 'manaswap:revealPrivateKey'; payload: { password: string; accountAddress: string } }
  | { type: 'manaswap:getAccounts' }
  | { type: 'manaswap:addAccount'; payload: { label?: string } }
  | { type: 'manaswap:manageAccount'; payload: { action: 'showMnemonic' | 'showPrivateKey'; accountIndex: number; password?: string } }
  | { type: 'manaswap:restoreVault'; payload: { mnemonic: string; password: string } }
  | { type: 'manaswap:discoverAccounts'; payload: { networkId: NetworkClusterId } }
  | { type: 'manaswap:addKeySource'; payload: { type: KeySourceType; value?: string; label?: string } }
  | { type: 'manaswap:importAccount'; payload: { privateKey: string; label?: string; password: string } }
  | { type: 'manaswap:setAccountLabel'; payload: { address: string; label: string } }
  | { type: 'manaswap:deleteAccount'; payload: { address: string } }
  | { type: 'manaswap:getLedgerAccounts'; payload: { pathStart?: number; limit?: number } }
  // Network Health Messages
  | { type: 'manaswap:checkNetworkHealth'; payload: { networkId: NetworkClusterId } }
  | { type: 'manaswap:checkAllNetworkHealth' }
  | { type: 'manaswap:getNetworkHealth' }
  // Notification Messages
  | { type: 'manaswap:getPendingNotifications' }
  | { type: 'manaswap:clearNotification'; payload: { notificationId: string } }
  | { type: 'manaswap:optOutDetection'; payload: { hostname: string } }
  // Balance Messages
  | { type: 'manaswap:getBalance'; payload: { address: string; networkId: NetworkClusterId } }
  | { type: 'manaswap:refreshBalance'; payload: { address: string; networkId: NetworkClusterId } }
  // EVM Balance Messages
  | { type: 'manaswap:getEvmBalance'; payload: { address: string; networkId: NetworkClusterId } }
  // EVM Account Messages
  | { type: 'manaswap:getEvmAddress'; payload: { solanaAddress: string } }
  // Transaction Messages
  | { type: 'manaswap:sendTransaction'; payload: { recipient: string; amount: number; networkId: NetworkClusterId; tokenMint?: string; tokenDecimals?: number } }
  | {
    type: 'manaswap:signAndSendRawTransaction'; payload: {
      transaction: number[]; // Serialized transaction bytes
      accountAddress: string;
      networkId: NetworkClusterId;
      additionalSigners?: number[][]; // Array of secret key bytes for additional signers (e.g., stake account keypair)
    }
  }
  // dApp Messages
  | { type: 'manaswap:dappConnect'; payload: { origin: string; hostname: string; icon?: string } }
  | { type: 'manaswap:dappDisconnect'; payload: { origin: string } }
  | { type: 'manaswap:dappSignTransaction'; payload: { origin: string; transaction: unknown } }
  | { type: 'manaswap:dappSignAllTransactions'; payload: { origin: string; transactions: unknown[] } }
  | { type: 'manaswap:dappSignMessage'; payload: { origin: string; message: Uint8Array } }
  | { type: 'manaswap:dappSignAndSendTransaction'; payload: { origin: string; transaction: unknown; options?: { skipPreflight?: boolean } } }
  | { type: 'manaswap:getPendingRequests' }
  | { type: 'manaswap:approveRequest'; payload: { requestId: string } }
  | { type: 'manaswap:rejectRequest'; payload: { requestId: string } }
  | { type: 'manaswap:getPermissions' }
  | { type: 'manaswap:revokePermission'; payload: { origin: string } }
  | { type: 'manaswap:getTokenPrices'; payload: { mints: string[] } }
  | { type: 'manaswap:getTransactionHistory'; payload: { address: string; networkId: NetworkClusterId; limit?: number } }
  | { type: 'manaswap:executeSwap'; payload: { swapTransactionBase64: string } }
  | { type: 'manaswap:getPortfolioHistory'; payload: { address: string; networkId: NetworkClusterId } }
  // Ledger Messages
  | { type: 'manaswap:ledgerSignResult'; payload: { requestId: string; signature: number[] } }
  | {
    type: 'manaswap:broadcastTransaction';
    payload: {
      serializedTransaction: Uint8Array;
      networkId: NetworkClusterId;
    };
  }
  // Internal Signing (for SDKs)
  | {
    type: 'manaswap:signTransaction';
    payload: {
      transaction: number[];
      accountAddress: string;
    };
  }
  // dApp Network Messages
  | { type: 'manaswap:dappGetNetwork'; payload: { origin: string } }
  | { type: 'manaswap:dappSwitchChain'; payload: { origin: string; networkId: string } }
  // Trezor Messages
  | { type: 'manaswap:getTrezorAccounts' }
  // EVM Provider Messages
  | { type: 'manaswap:evmGetState'; payload: { origin?: string } }
  | { type: 'manaswap:evmRequestAccounts'; payload: { origin: string; hostname: string } }
  | { type: 'manaswap:evmSwitchChain'; payload: { chainId: string } }
  | { type: 'manaswap:evmPersonalSign'; payload: { message: string; address: string; origin: string; hostname: string } }
  | { type: 'manaswap:evmSignTypedData'; payload: { address: string; data: string; version: string; origin: string; hostname: string } }
  | { type: 'manaswap:evmSendTransaction'; payload: { transaction: any; origin: string; hostname: string } }
  | { type: 'manaswap:evmRpcCall'; payload: { method: string; params: unknown } }
  | { type: 'manaswap:evmApprovalResponse'; payload: { popupId: string; approved: boolean } }
  | { type: 'manaswap:evmGetPermissions' }
  | { type: 'manaswap:evmRevokePermission'; payload: { origin: string; address: string } };