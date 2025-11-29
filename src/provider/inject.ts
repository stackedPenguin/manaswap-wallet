type ManaswapEventPayload = {
  provider: string;
  version: string;
};

class ManaswapProvider extends EventTarget {
  public isConnected = false;
  public publicKey: string | null = null;

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

  async connect(): Promise<{ publicKey: string }> {
    try {
      const result = await this.sendRequest('connect-request') as { publicKey: string };
      this.isConnected = true;
      this.publicKey = result.publicKey;
      this.dispatchEvent(new CustomEvent('connect', { detail: { publicKey: result.publicKey } }));
      return result;
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

  async signTransaction<T>(transaction: T): Promise<T> {
    try {
      const result = await this.sendRequest('sign-transaction', transaction) as T;
      return result;
    } catch (error) {
      throw error;
    }
  }

  async signAllTransactions<T>(transactions: T[]): Promise<T[]> {
    try {
      const result = await this.sendRequest('sign-all-transactions', transactions) as T[];
      return result;
    } catch (error) {
      throw error;
    }
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
  
  const detail: ManaswapEventPayload = { provider: 'manaswap', version: '0.1.0' };
  window.dispatchEvent(new CustomEvent('manaswap#initialized', { detail }));
})();
