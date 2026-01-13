import { useEffect, useState } from 'react';
import { sendMessage } from '../../shared/messaging';
import type { PendingRequest, VaultState, WalletSettings } from '../../shared/types';
import { MainWallet } from './MainWallet';
import { Onboarding } from './Onboarding';
import { Unlock } from './Unlock';
import { DAppApprovalModal } from './DAppApprovalModal';
import './index.css';

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
          // Also ensure we have settings for the Blowfish simulation
          if (!settings) {
            // Let the main checkState handle settings fetching, or do it here if urgent
            // But avoiding duplicate calls is better. checkState loop handles it.
          }
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

  return (
    <div className="popup-shell">
      <MainWallet />
      {pendingRequest && (
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
    </div>
  );
}

export default App;