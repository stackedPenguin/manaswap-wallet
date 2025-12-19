import { registerWallet } from './register';
import { ManaswapWalletImpl } from './walletStandard';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

type ManaswapEventPayload = {
  provider: string;
  version: string;
};

// Helper to serialize a transaction to bytes
function serializeTransaction(tx: Transaction | VersionedTransaction): number[] {
  if ('version' in tx && tx.version !== undefined) {
    // VersionedTransaction
    return Array.from((tx as VersionedTransaction).serialize());
  } else {
    // Legacy Transaction
    return Array.from((tx as Transaction).serialize({ requireAllSignatures: false, verifySignatures: false }));
  }
}

// Helper to deserialize bytes back to transaction
function deserializeTransaction<T>(bytes: number[], isVersioned: boolean): T {
  const buffer = Buffer.from(bytes);
  if (isVersioned) {
    return VersionedTransaction.deserialize(buffer) as unknown as T;
  } else {
    return Transaction.from(buffer) as unknown as T;
  }
}

class ManaswapProvider extends EventTarget {
  public isConnected = false;
  public publicKey: PublicKey | null = null;
  public isManaswap = true;
  public isPhantom = false; // Compatibility check - we're not Phantom

  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor() {
    super();
    // Listen for responses from content script
    window.addEventListener('message', (event) => {
      if (event.data?.source === 'manaswap-content' && event.data?.requestId !== undefined) {
        const { requestId, success, data, error } = event.data;
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          if (success) {
            pending.resolve(data);
          } else {
            pending.reject(new Error(error || 'Request failed'));
          }
        }
      }

      // Handle accountChanged notifications from background
      if (event.data?.source === 'manaswap-content' && event.data?.type === 'accountChanged') {
        const newPublicKey = event.data.publicKey ? new PublicKey(event.data.publicKey) : null;
        this.publicKey = newPublicKey;
        this.isConnected = !!newPublicKey;
        this.dispatchEvent(new CustomEvent('accountChanged', { detail: newPublicKey }));
      }
    });
  }

  private async sendRequest(type: string, payload?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      this.pendingRequests.set(requestId, { resolve, reject });

      window.postMessage(
        {
          source: 'manaswap',
          type,
          payload,
          requestId,
        },
        '*'
      );

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 5 * 60 * 1000);
    });
  }

  async connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }> {
    try {
      const result = await this.sendRequest('connect-request', options) as { publicKey: string };
      this.isConnected = true;
      this.publicKey = new PublicKey(result.publicKey);
      this.dispatchEvent(new CustomEvent('connect', { detail: { publicKey: this.publicKey } }));
      return { publicKey: this.publicKey };
    } catch (error) {
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.sendRequest('disconnect-request');
      this.isConnected = false;
      this.publicKey = null;
      this.dispatchEvent(new CustomEvent('disconnect'));
    } catch (error) {
      throw error;
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    try {
      const isVersioned = 'version' in transaction && transaction.version !== undefined;
      const txBytes = serializeTransaction(transaction);
      const result = await this.sendRequest('sign-transaction', txBytes) as { transaction: number[] };
      return deserializeTransaction<T>(result.transaction, isVersioned);
    } catch (error) {
      throw error;
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    try {
      const serialized = transactions.map(tx => ({
        bytes: serializeTransaction(tx),
        isVersioned: 'version' in tx && tx.version !== undefined
      }));
      const result = await this.sendRequest('sign-all-transactions', serialized) as { transactions: number[][] };
      return result.transactions.map((txBytes, i) =>
        deserializeTransaction<T>(txBytes, serialized[i].isVersioned)
      );
    } catch (error) {
      throw error;
    }
  }

  async signAndSendTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
    options?: {
      skipPreflight?: boolean;
      preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
      minContextSlot?: number;
      maxRetries?: number;
    }
  ): Promise<{ signature: string }> {
    try {
      const txBytes = serializeTransaction(transaction);
      const result = await this.sendRequest('sign-and-send-transaction', { transaction: txBytes, options }) as { signature: string };
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Alias for signAndSendTransaction - some dApps use this
  async send<T extends Transaction | VersionedTransaction>(transaction: T, _signers?: unknown[], options?: { skipPreflight?: boolean }): Promise<string> {
    const result = await this.signAndSendTransaction(transaction, options);
    return result.signature;
  }

  async signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }> {
    try {
      const result = await this.sendRequest('sign-message', Array.from(message)) as { signature: number[] };
      return {
        signature: new Uint8Array(result.signature),
      };
    } catch (error) {
      throw error;
    }
  }

  // Sign In With Solana (SIWS) - for authentication
  async signIn(input?: {
    domain?: string;
    address?: string;
    statement?: string;
    uri?: string;
    version?: string;
    chainId?: string;
    nonce?: string;
    issuedAt?: string;
    expirationTime?: string;
    notBefore?: string;
    requestId?: string;
    resources?: string[];
  }): Promise<{
    account: { address: string; publicKey: Uint8Array };
    signedMessage: Uint8Array;
    signature: Uint8Array;
  }> {
    try {
      const result = await this.sendRequest('sign-in', input) as {
        publicKey: string;
        signedMessage: number[];
        signature: number[];
      };
      return {
        account: {
          address: result.publicKey,
          publicKey: new PublicKey(result.publicKey).toBytes(),
        },
        signedMessage: new Uint8Array(result.signedMessage),
        signature: new Uint8Array(result.signature),
      };
    } catch (error) {
      throw error;
    }
  }

  async getNetwork(): Promise<{ networkId: string; name: string; rpcUrl: string }> {
    try {
      const result = await this.sendRequest('get-network') as { success: boolean; networkId: string; name: string; rpcUrl: string };
      if (!result.success) {
        throw new Error('Failed to get network');
      }
      return { networkId: result.networkId, name: result.name, rpcUrl: result.rpcUrl };
    } catch (error) {
      throw error;
    }
  }

  async switchChain(networkId: string): Promise<{ success: boolean }> {
    try {
      const result = await this.sendRequest('switch-chain', { networkId }) as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to switch chain');
      }
      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  async request(request: { method: string; params?: unknown }): Promise<unknown> {
    return this.sendRequest('rpc-request', request);
  }
}

declare global {
  interface Window {
    manaswap?: ManaswapProvider;
    solana?: ManaswapProvider;
  }
}

(() => {
  if (window.manaswap) {
    return;
  }
  const provider = new ManaswapProvider();
  window.manaswap = provider;

  // Also expose as window.solana for compatibility
  if (!window.solana) {
    window.solana = provider;
  }

  // Register Wallet Standard
  try {
    registerWallet(new ManaswapWalletImpl(provider));
  } catch (error) {
    console.error('[Manaswap] Failed to register wallet standard', error);
  }

  const detail: ManaswapEventPayload = { provider: 'manaswap', version: '0.1.0' };
  window.dispatchEvent(new CustomEvent('manaswap#initialized', { detail }));
  console.log('[Manaswap] Wallet Standard Injected & Registered');
})();
