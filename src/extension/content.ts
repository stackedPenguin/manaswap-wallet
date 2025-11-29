import type { NetworkClusterId } from '../shared/networks';
import type { SiteDetectionPayload } from '../shared/types';
import { detectNetwork } from '../shared/detection';

const injectProvider = () => {
  try {
    const url = chrome.runtime.getURL('src/provider/inject.ts');
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url;
    script.addEventListener('load', () => script.remove());
    (document.head || document.documentElement).appendChild(script);
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

  chrome.runtime
    .sendMessage({ type: 'manaswap:detectionEvent', payload })
    .catch((error) => console.warn('[Manaswap] Unable to notify detection', error));
};

// Listen for provider requests and forward to background
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
          
          const connectRes = await chrome.runtime.sendMessage({
            type: 'manaswap:dappConnect',
            payload: { origin, hostname },
          });
          response = connectRes;
          break;
        }
        case 'disconnect-request': {
          await chrome.runtime.sendMessage({
            type: 'manaswap:dappDisconnect',
            payload: { origin },
          });
          response = { success: true };
          break;
        }
        case 'sign-transaction': {
          const signRes = await chrome.runtime.sendMessage({
            type: 'manaswap:dappSignTransaction',
            payload: { origin, transaction: payload },
          });
          response = signRes;
          break;
        }
        case 'sign-all-transactions': {
          const signAllRes = await chrome.runtime.sendMessage({
            type: 'manaswap:dappSignAllTransactions',
            payload: { origin, transactions: payload },
          });
          response = signAllRes;
          break;
        }
        case 'sign-message': {
          const signMsgRes = await chrome.runtime.sendMessage({
            type: 'manaswap:dappSignMessage',
            payload: { origin, message: new Uint8Array(payload as number[]) },
          });
          response = signMsgRes;
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
