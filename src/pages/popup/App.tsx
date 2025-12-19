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

  const checkState = async () => {
    try {
      const state = await sendMessage<VaultState>({ type: 'manaswap:getVaultState' });
      setVaultState(state);

      // Also fetch settings to get selected account
      if (state?.isInitialized && !state?.isLocked) {
        const settingsRes = await sendMessage<{ success: boolean; settings?: WalletSettings }>({
          type: 'manaswap:getSettings'
        });
        if (settingsRes.success && settingsRes.settings) {
          setSettings(settingsRes.settings);
        }
      }
    } catch (e) {
      console.error("Failed to get vault state", e);
    } finally {
      setIsLoading(false);
    }
  };

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

    checkRequests();
    const interval = setInterval(checkRequests, 2000);

    return () => clearInterval(interval);
  }, [pendingRequest]);

  if (isLoading) {
    return <div className="popup-shell"><div className="card">Checking wallet status...</div></div>;
  }

  if (!vaultState?.isInitialized) {
    return (
      <div className="popup-shell">
        <Onboarding onComplete={checkState} />
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