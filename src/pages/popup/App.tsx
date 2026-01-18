import { useEffect, useState } from 'react';
import { sendMessage } from '../../shared/messaging';
import type { PendingRequest, VaultState, WalletSettings } from '../../shared/types';
import { MainWallet } from './MainWallet';
import { Onboarding } from './Onboarding';
import { Unlock } from './Unlock';
import { DAppApprovalModal } from './DAppApprovalModal';
import { EvmApprovalModal } from './EvmApprovalModal';
import './index.css';

// Helper to check if a request is an EVM request
function isEvmRequest(request: PendingRequest | null): boolean {
  if (!request) return false;
  return request.type.startsWith('evm-');
}

export function App() {
  const [vaultState, setVaultState] = useState<VaultState | null>(null);
  const [settings, setSettings] = useState<WalletSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [hasStartedOnboarding, setHasStartedOnboarding] = useState(false);

  const checkState = async () => {
    try {
      const state = await sendMessage<VaultState>({ type: 'manaswap:getVaultState' });

      setVaultState(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(state)) {
          return state;
        }
        return prev;
      });

      // Also fetch settings to get selected account
      if (state?.isInitialized && !state?.isLocked) {
        // Optimize: Only fetch settings if we don't have them or checks invalid
        const settingsRes = await sendMessage<{ success: boolean; settings?: WalletSettings }>({
          type: 'manaswap:getSettings'
        });
        if (settingsRes.success && settingsRes.settings) {
          setSettings(prev => JSON.stringify(prev) !== JSON.stringify(settingsRes.settings) ? settingsRes.settings! : prev);
        }
      }
    } catch (e) {
      console.error("Failed to get vault state", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (vaultState && !vaultState.isInitialized && !hasStartedOnboarding) {
      setHasStartedOnboarding(true);
    }
  }, [vaultState, hasStartedOnboarding]);

  useEffect(() => {
    checkState();

    // Check for pending dApp requests
    const checkRequests = async () => {
      try {
        const res = await sendMessage<{ success: boolean; requests?: PendingRequest[] }>({
          type: 'manaswap:getPendingRequests',
        });
        if (res.success && res.requests && res.requests.length > 0 && !pendingRequest) {
          setPendingRequest(res.requests[0]);
        }
      } catch (error) {
        console.error('[Manaswap] Failed to check pending requests', error);
      }
    };

    const runChecks = () => {
      checkState();
      checkRequests();
    };

    runChecks();
    const interval = setInterval(runChecks, 2000);

    return () => clearInterval(interval);
  }, []); // Remove dependencies to prevent loop, relies on internal state setters

  useEffect(() => {
    // 1. Redirect Logic (Fake Popup)
    if (vaultState && !vaultState.isInitialized && !hasStartedOnboarding && window.innerWidth < 600) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/popup/index.html') });
      window.close();
    }

    // 2. Migration: Fix broken X1 RPC URL in stored settings
    // If user has a custom network with the old broken URL, update it.
    if (settings && settings.customNetworks) {
      let needsUpdate = false;
      const newCustomNetworks = settings.customNetworks.map(net => {
        if (net.id === 'x1-mainnet' && net.rpcUrl.includes('xen.network')) {
          needsUpdate = true;
          return { ...net, rpcUrl: 'https://rpc.mainnet.x1.xyz' };
        }
        return net;
      });

      if (needsUpdate) {
        setSettings({ ...settings, customNetworks: newCustomNetworks });
        // Also update storage proper
        chrome.storage.local.set({ settings: { ...settings, customNetworks: newCustomNetworks } });
        console.log('Migrated X1 RPC URL to new endpoint.');
        // Force a reload to pick up new connection?
        // checkState() will run next interval and pick it up.
      }
    }
  }, [vaultState, hasStartedOnboarding, settings]);

  if (isLoading) {
    return <div className="popup-shell"><div className="card">Checking wallet status...</div></div>;
  }


  if ((!vaultState?.isInitialized) || (hasStartedOnboarding)) {
    if (window.innerWidth < 600) return null;
    return (
      <div className="popup-shell">
        <Onboarding onComplete={() => {
          setHasStartedOnboarding(false);
          checkState();
        }} />
      </div>
    );
  }

  if (vaultState.isLocked) {
    return (
      <div className="popup-shell">
        <Unlock onUnlock={checkState} />
      </div>
    );
  }

  // Convert EVM pending request to EvmApprovalData format
  const getEvmApprovalData = () => {
    if (!pendingRequest || !isEvmRequest(pendingRequest)) return null;

    const evmReq = pendingRequest as PendingRequest & { evmAddress?: string; payload?: any; network?: string };

    // Map request type to approval modal type
    let type: 'connect' | 'sign' | 'typedData' | 'transaction' = 'connect';
    if (pendingRequest.type === 'evm-sign') type = 'sign';
    else if (pendingRequest.type === 'evm-sign-typed-data') type = 'typedData';
    else if (pendingRequest.type === 'evm-transaction') type = 'transaction';

    return {
      popupId: pendingRequest.id,
      type,
      origin: pendingRequest.origin,
      hostname: pendingRequest.hostname,
      address: evmReq.evmAddress,
      message: evmReq.payload?.message,
      to: evmReq.payload?.to,
      value: evmReq.payload?.value,
      data: evmReq.payload?.data,
      network: evmReq.network,
    };
  };

  const evmApprovalData = getEvmApprovalData();

  return (
    <div className="popup-shell">
      <MainWallet />
      {pendingRequest && !isEvmRequest(pendingRequest) && (
        <DAppApprovalModal
          request={pendingRequest}
          accountAddress={settings?.selectedAccountAddress || null}
          onApprove={() => {
            setPendingRequest(null);
            // Refresh state to show updated permissions
            void checkState();
          }}
          onReject={() => {
            setPendingRequest(null);
          }}
        />
      )}
      {evmApprovalData && (
        <EvmApprovalModal
          data={evmApprovalData}
          onApprove={async () => {
            await sendMessage({
              type: 'manaswap:approveRequest',
              payload: { requestId: evmApprovalData.popupId }
            });
            setPendingRequest(null);
            void checkState();
          }}
          onReject={async () => {
            await sendMessage({
              type: 'manaswap:rejectRequest',
              payload: { requestId: evmApprovalData.popupId }
            });
            setPendingRequest(null);
          }}
        />
      )}
    </div>
  );
}

export default App;