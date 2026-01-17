import type { NetworkClusterId } from '../shared/networks';
import type { SiteDetectionPayload } from '../shared/types';
import { detectNetwork } from '../shared/detection';

// Wrapper to handle "Extension context invalidated" gracefully
const safeSendMessage = async <T>(message: unknown): Promise<T | null> => {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    // Silently ignore "Extension context invalidated" - happens when extension reloads
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      console.warn('[Manaswap] Extension reloaded - please refresh this page');
      return null;
    }
    throw error;
  }
};

const injectProvider = () => {
  try {
    // Inject Solana provider
    const solanaUrl = chrome.runtime.getURL('assets/inject.js');
    const solanaScript = document.createElement('script');
    solanaScript.type = 'module';
    solanaScript.src = solanaUrl;
    solanaScript.addEventListener('load', () => solanaScript.remove());
    (document.head || document.documentElement).appendChild(solanaScript);

    // Inject EVM provider
    const evmUrl = chrome.runtime.getURL('assets/inject-evm.js');
    const evmScript = document.createElement('script');
    evmScript.type = 'module';
    evmScript.src = evmUrl;
    evmScript.addEventListener('load', () => evmScript.remove());
    (document.head || document.documentElement).appendChild(evmScript);
  } catch (error) {
    console.error('[Manaswap] Failed to inject provider', error);
  }
};

const detectNetworkFromLocation = (): { network: NetworkClusterId; confidence: number } | null => {
  const url = window.location.href;
  const hostname = window.location.hostname;

  const result = detectNetwork(hostname, url);

  if (result) {
    const confidenceMap = { high: 0.9, medium: 0.6, low: 0.3 };
    return {
      network: result.network,
      confidence: confidenceMap[result.confidence],
    };
  }

  return null;
};

const notifyDetection = (network: NetworkClusterId, confidence: number) => {
  const payload: SiteDetectionPayload = {
    origin: window.location.origin,
    hostname: window.location.hostname,
    detectedNetwork: network,
    confidence,
  };

  safeSendMessage({ type: 'manaswap:detectionEvent', payload });
};

// Listen for EVM provider requests and forward to background
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;

  // Handle EVM provider messages
  if (event.data?.source === 'manaswap-evm') {
    const { type, payload, requestId, origin, hostname } = event.data;

    try {
      const response = await safeSendMessage({
        type,
        payload: { ...payload, origin, hostname },
      });

      // Send response back to EVM provider
      window.postMessage({
        source: 'manaswap-evm-content',
        type: 'response',
        requestId,
        ...(response as object),
      }, '*');
    } catch (error) {
      window.postMessage({
        source: 'manaswap-evm-content',
        type: 'response',
        requestId,
        success: false,
        error: { code: -32603, message: error instanceof Error ? error.message : 'Unknown error' },
      }, '*');
    }
  }
});

// Listen for Solana provider requests and forward to background
window.addEventListener('message', async (event) => {
  // Only process messages from the same origin
  if (event.source !== window) return;

  if (event.data?.source === 'manaswap') {
    const { type, payload, requestId } = event.data;
    const origin = window.location.origin;
    const hostname = window.location.hostname;

    try {
      let response: unknown;

      switch (type) {
        case 'connect-request': {
          // Extract RPC hints if available
          const rpcHint = (payload as any)?.rpcUrl;
          if (rpcHint) {
            const url = window.location.href;
            const result = detectNetwork(hostname, url, rpcHint);
            if (result) {
              const confidenceMap = { high: 0.9, medium: 0.6, low: 0.3 };
              notifyDetection(result.network, confidenceMap[result.confidence]);
            }
          }

          const getFavicon = () => {
            const link = document.querySelector('link[rel~="icon"]');
            if (link && (link as HTMLLinkElement).href) {
              return (link as HTMLLinkElement).href;
            }
            return '/favicon.ico'; // Fallback
          };

          response = await safeSendMessage({
            type: 'manaswap:dappConnect',
            payload: { origin, hostname, icon: getFavicon() },
          });
          break;
        }
        case 'disconnect-request': {
          await safeSendMessage({
            type: 'manaswap:dappDisconnect',
            payload: { origin },
          });
          response = { success: true };
          break;
        }
        case 'sign-transaction': {
          response = await safeSendMessage({
            type: 'manaswap:dappSignTransaction',
            payload: { origin, transaction: payload },
          });
          break;
        }
        case 'sign-all-transactions': {
          response = await safeSendMessage({
            type: 'manaswap:dappSignAllTransactions',
            payload: { origin, transactions: payload },
          });
          break;
        }
        case 'sign-message': {
          response = await safeSendMessage({
            type: 'manaswap:dappSignMessage',
            payload: { origin, message: new Uint8Array(payload as number[]) },
          });
          break;
        }
        case 'get-network': {
          response = await safeSendMessage({
            type: 'manaswap:dappGetNetwork',
            payload: { origin },
          });
          break;
        }
        case 'switch-chain': {
          response = await safeSendMessage({
            type: 'manaswap:dappSwitchChain',
            payload: { origin, networkId: (payload as { networkId: string }).networkId },
          });
          break;
        }
        case 'sign-and-send-transaction': {
          const { transaction, options } = payload as { transaction: unknown; options?: { skipPreflight?: boolean } };
          response = await safeSendMessage({
            type: 'manaswap:dappSignAndSendTransaction',
            payload: { origin, transaction, options },
          });
          break;
        }
        default:
          response = { success: false, error: 'Unknown request type' };
      }

      // Send response back to provider
      window.postMessage(
        {
          source: 'manaswap-content',
          requestId,
          ...(response as { success: boolean; data?: unknown; error?: string }),
        },
        '*'
      );
    } catch (error) {
      window.postMessage(
        {
          source: 'manaswap-content',
          requestId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        '*'
      );
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const detected = detectNetworkFromLocation();
    if (detected) {
      notifyDetection(detected.network, detected.confidence);
    }
  }
});

const bootstrap = () => {
  injectProvider();
  const detected = detectNetworkFromLocation();
  if (detected) {
    notifyDetection(detected.network, detected.confidence);
  }
};

bootstrap();
