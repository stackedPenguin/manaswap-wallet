/**
 * EVM Provider Injection Script
 * Implements EIP-1193 (Ethereum Provider API) and EIP-6963 (Wallet Discovery)
 * This script is injected into web pages to provide window.ethereum
 */

// Types for EIP-1193
interface RequestArguments {
  method: string;
  params?: unknown[] | object;
}

interface ProviderRpcError extends Error {
  code: number;
  data?: unknown;
}

// Unused but kept for EIP-1193 reference
// interface ProviderMessage { type: string; data: unknown; }
// interface ProviderConnectInfo { chainId: string; }

// EIP-6963 types
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: ManaswapEvmProvider;
}

// Manaswap wallet icon as data URI (simple M logo)
const MANASWAP_ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iMjQiIGZpbGw9IiMxYTFhMmUiLz4KPHBhdGggZD0iTTMyIDg4VjQwTDY0IDcyTDk2IDQwVjg4IiBzdHJva2U9IiM0ZWNkYzQiIHN0cm9rZS13aWR0aD0iOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPg==';

// Generate a unique ID for this wallet instance
const MANASWAP_UUID = crypto.randomUUID();

// RPC error codes
const RPC_ERRORS = {
  USER_REJECTED: { code: 4001, message: 'User rejected the request' },
  UNAUTHORIZED: { code: 4100, message: 'Unauthorized' },
  UNSUPPORTED_METHOD: { code: 4200, message: 'Unsupported method' },
  DISCONNECTED: { code: 4900, message: 'Disconnected' },
  CHAIN_DISCONNECTED: { code: 4901, message: 'Chain disconnected' },
  UNRECOGNIZED_CHAIN: { code: 4902, message: 'Unrecognized chain ID' },
};

/**
 * Manaswap EVM Provider - EIP-1193 compliant
 */
class ManaswapEvmProvider extends EventTarget {
  // EIP-1193 required properties
  isMetaMask = true; // For compatibility with dApps that check for MetaMask
  isManaswap = true;

  // Provider state
  private _chainId: string = '0x1'; // Default to Ethereum mainnet
  private _accounts: string[] = [];
  private _connected = false;
  private _requestId = 0;
  private _pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();

  constructor() {
    super();
    this._setupMessageListener();
    this._initializeState();
  }

  /**
   * Initialize provider state from background
   */
  private async _initializeState(): Promise<void> {
    try {
      // Get initial chain ID and accounts from background
      const response = await this._sendToBackground('manaswap:evmGetState', {});
      if (response?.success) {
        this._chainId = response.chainId || '0x1';
        this._accounts = response.accounts || [];
        this._connected = response.connected || false;
      }
    } catch (e) {
      console.warn('[Manaswap EVM] Failed to initialize state:', e);
    }
  }

  /**
   * Setup message listener for responses from content script
   */
  private _setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== 'manaswap-evm-content') return;

      const { type, requestId, result, error, event: eventType, data } = event.data;

      // Handle responses to requests
      if (type === 'response' && requestId !== undefined) {
        const pending = this._pendingRequests.get(requestId);
        if (pending) {
          this._pendingRequests.delete(requestId);
          if (error) {
            pending.reject(this._createError(error.code, error.message));
          } else {
            pending.resolve(result);
          }
        }
      }

      // Handle events from background
      if (type === 'event') {
        switch (eventType) {
          case 'accountsChanged':
            this._accounts = data || [];
            this._emitEvent('accountsChanged', this._accounts);
            break;
          case 'chainChanged':
            this._chainId = data;
            this._emitEvent('chainChanged', data);
            break;
          case 'connect':
            this._connected = true;
            this._emitEvent('connect', { chainId: this._chainId });
            break;
          case 'disconnect':
            this._connected = false;
            this._accounts = [];
            this._emitEvent('disconnect', RPC_ERRORS.DISCONNECTED);
            break;
        }
      }
    });
  }

  /**
   * Send request to background via content script
   */
  private _sendToBackground(type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = ++this._requestId;
      this._pendingRequests.set(requestId, { resolve, reject });

      window.postMessage({
        source: 'manaswap-evm',
        type,
        requestId,
        payload,
        origin: window.location.origin,
        hostname: window.location.hostname,
      }, '*');

      // Timeout after 5 minutes (for user interaction)
      setTimeout(() => {
        if (this._pendingRequests.has(requestId)) {
          this._pendingRequests.delete(requestId);
          reject(this._createError(RPC_ERRORS.USER_REJECTED.code, 'Request timed out'));
        }
      }, 300000);
    });
  }

  /**
   * Create a standardized RPC error
   */
  private _createError(code: number, message: string): ProviderRpcError {
    const error = new Error(message) as ProviderRpcError;
    error.code = code;
    return error;
  }

  /**
   * Emit an event to listeners
   */
  private _emitEvent(eventName: string, data: any): void {
    // EventTarget style
    this.dispatchEvent(new CustomEvent(eventName, { detail: data }));

    // Legacy on* style
    const legacyHandler = (this as any)[`on${eventName}`];
    if (typeof legacyHandler === 'function') {
      legacyHandler(data);
    }
  }

  // ===========================================
  // EIP-1193 Required Methods
  // ===========================================

  /**
   * Main request method - EIP-1193
   */
  async request(args: RequestArguments): Promise<unknown> {
    const { method, params } = args;

    switch (method) {
      // Connection methods
      case 'eth_requestAccounts':
        return this._requestAccounts();
      case 'eth_accounts':
        return this._accounts;

      // Chain methods
      case 'eth_chainId':
        return this._chainId;
      case 'net_version':
        return String(parseInt(this._chainId, 16));
      case 'wallet_switchEthereumChain':
        return this._switchChain(params as [{ chainId: string }]);
      case 'wallet_addEthereumChain':
        return this._addChain(params as [any]);

      // Signing methods
      case 'personal_sign':
        return this._personalSign(params as [string, string]);
      case 'eth_sign':
        return this._ethSign(params as [string, string]);
      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4':
        return this._signTypedData(params as [string, string], method);

      // Transaction methods
      case 'eth_sendTransaction':
        return this._sendTransaction(params as [any]);
      case 'eth_signTransaction':
        return this._signTransaction(params as [any]);

      // Read-only methods - proxy to RPC
      case 'eth_call':
      case 'eth_estimateGas':
      case 'eth_getBalance':
      case 'eth_getCode':
      case 'eth_getTransactionCount':
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash':
      case 'eth_getTransactionByHash':
      case 'eth_getTransactionReceipt':
      case 'eth_blockNumber':
      case 'eth_gasPrice':
      case 'eth_feeHistory':
      case 'eth_maxPriorityFeePerGas':
      case 'eth_getLogs':
      case 'eth_getStorageAt':
        return this._proxyRpcCall(method, params);

      // Wallet methods
      case 'wallet_getPermissions':
        return this._getPermissions();
      case 'wallet_requestPermissions':
        return this._requestPermissions(params as [any]);

      default:
        // Try to proxy unknown methods to RPC
        return this._proxyRpcCall(method, params);
    }
  }

  /**
   * Legacy enable method (deprecated but still used by some dApps)
   */
  async enable(): Promise<string[]> {
    return this._requestAccounts();
  }

  /**
   * Legacy send method (deprecated)
   */
  send(methodOrPayload: string | any, paramsOrCallback?: any[] | ((error: any, result: any) => void)): any {
    // Handle legacy callback style
    if (typeof paramsOrCallback === 'function') {
      const payload = methodOrPayload;
      const callback = paramsOrCallback;
      this.request({ method: payload.method, params: payload.params })
        .then((result) => callback(null, { result }))
        .catch((error) => callback(error, null));
      return;
    }

    // Handle promise style
    return this.request({ method: methodOrPayload, params: paramsOrCallback });
  }

  /**
   * Legacy sendAsync method (deprecated)
   */
  sendAsync(payload: any, callback: (error: any, result: any) => void): void {
    this.request({ method: payload.method, params: payload.params })
      .then((result) => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
      .catch((error) => callback(error, null));
  }

  // ===========================================
  // Event subscription methods
  // ===========================================

  on(eventName: string, handler: (...args: any[]) => void): this {
    this.addEventListener(eventName, ((e: CustomEvent) => handler(e.detail)) as EventListener);
    return this;
  }

  removeListener(eventName: string, handler: (...args: any[]) => void): this {
    this.removeEventListener(eventName, handler as EventListener);
    return this;
  }

  // Aliases
  addListener = this.on;
  off = this.removeListener;

  // ===========================================
  // Internal methods
  // ===========================================

  private async _requestAccounts(): Promise<string[]> {
    const response = await this._sendToBackground('manaswap:evmRequestAccounts', {});
    if (response?.success) {
      this._accounts = response.accounts || [];
      this._connected = true;
      return this._accounts;
    }
    throw this._createError(RPC_ERRORS.USER_REJECTED.code, response?.error || 'User rejected connection');
  }

  private async _switchChain(params: [{ chainId: string }]): Promise<null> {
    const chainId = params[0]?.chainId;
    if (!chainId) {
      throw this._createError(RPC_ERRORS.UNRECOGNIZED_CHAIN.code, 'Invalid chain ID');
    }

    const response = await this._sendToBackground('manaswap:evmSwitchChain', { chainId });
    if (response?.success) {
      this._chainId = chainId;
      return null;
    }
    throw this._createError(
      response?.errorCode || RPC_ERRORS.UNRECOGNIZED_CHAIN.code,
      response?.error || 'Failed to switch chain'
    );
  }

  private async _addChain(params: [any]): Promise<null> {
    const chainData = params[0];
    const response = await this._sendToBackground('manaswap:evmAddChain', { chain: chainData });
    if (response?.success) {
      return null;
    }
    throw this._createError(RPC_ERRORS.USER_REJECTED.code, response?.error || 'Failed to add chain');
  }

  private async _personalSign(params: [string, string]): Promise<string> {
    const [message, address] = params;
    const response = await this._sendToBackground('manaswap:evmPersonalSign', { message, address });
    if (response?.success) {
      return response.signature;
    }
    throw this._createError(RPC_ERRORS.USER_REJECTED.code, response?.error || 'User rejected signing');
  }

  private async _ethSign(params: [string, string]): Promise<string> {
    const [address, message] = params;
    const response = await this._sendToBackground('manaswap:evmSign', { address, message });
    if (response?.success) {
      return response.signature;
    }
    throw this._createError(RPC_ERRORS.USER_REJECTED.code, response?.error || 'User rejected signing');
  }

  private async _signTypedData(params: [string, string], method: string): Promise<string> {
    const [address, data] = params;
    const response = await this._sendToBackground('manaswap:evmSignTypedData', {
      address,
      data: typeof data === 'string' ? data : JSON.stringify(data),
      version: method.includes('v4') ? 'v4' : method.includes('v3') ? 'v3' : 'v1'
    });
    if (response?.success) {
      return response.signature;
    }
    throw this._createError(RPC_ERRORS.USER_REJECTED.code, response?.error || 'User rejected signing');
  }

  private async _sendTransaction(params: [any]): Promise<string> {
    const tx = params[0];
    const response = await this._sendToBackground('manaswap:evmSendTransaction', { transaction: tx });
    if (response?.success) {
      return response.hash;
    }
    throw this._createError(RPC_ERRORS.USER_REJECTED.code, response?.error || 'User rejected transaction');
  }

  private async _signTransaction(params: [any]): Promise<string> {
    const tx = params[0];
    const response = await this._sendToBackground('manaswap:evmSignTransaction', { transaction: tx });
    if (response?.success) {
      return response.signedTransaction;
    }
    throw this._createError(RPC_ERRORS.USER_REJECTED.code, response?.error || 'User rejected transaction');
  }

  private async _proxyRpcCall(method: string, params: unknown): Promise<unknown> {
    const response = await this._sendToBackground('manaswap:evmRpcCall', { method, params });
    if (response?.success !== false) {
      return response?.result;
    }
    throw this._createError(-32603, response?.error || 'RPC call failed');
  }

  private async _getPermissions(): Promise<any[]> {
    const response = await this._sendToBackground('manaswap:evmGetPermissions', {});
    return response?.permissions || [];
  }

  private async _requestPermissions(params: [any]): Promise<any[]> {
    const response = await this._sendToBackground('manaswap:evmRequestPermissions', { permissions: params[0] });
    if (response?.success) {
      return response.permissions || [];
    }
    throw this._createError(RPC_ERRORS.USER_REJECTED.code, response?.error || 'User rejected permissions');
  }

  // ===========================================
  // Public getters for state
  // ===========================================

  get chainId(): string {
    return this._chainId;
  }

  get selectedAddress(): string | null {
    return this._accounts[0] || null;
  }

  get networkVersion(): string {
    return String(parseInt(this._chainId, 16));
  }

  isConnected(): boolean {
    return this._connected;
  }
}

// ===========================================
// Provider Injection
// ===========================================

function injectProvider(): void {
  const provider = new ManaswapEvmProvider();

  // Inject as window.ethereum
  const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: true,
      configurable: true,
    });
  } else {
    // If ethereum already exists and is not configurable, try to extend it
    console.warn('[Manaswap] window.ethereum already exists and is not configurable');
  }

  // Also expose as window.manaswapEvm for direct access
  (window as any).manaswapEvm = provider;

  // EIP-6963: Announce wallet for discovery
  announceEip6963Provider(provider);
}

/**
 * EIP-6963: Multi Injected Provider Discovery
 * This allows dApps to discover all available wallets
 */
function announceEip6963Provider(provider: ManaswapEvmProvider): void {
  const info: EIP6963ProviderInfo = {
    uuid: MANASWAP_UUID,
    name: 'Manaswap',
    icon: MANASWAP_ICON,
    rdns: 'com.manaswap.wallet',
  };

  const detail: EIP6963ProviderDetail = {
    info,
    provider,
  };

  // Dispatch announce event
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze(detail),
    })
  );

  // Listen for request events and re-announce
  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze(detail),
      })
    );
  });
}

// Inject immediately
injectProvider();

console.log('[Manaswap] EVM provider injected');
