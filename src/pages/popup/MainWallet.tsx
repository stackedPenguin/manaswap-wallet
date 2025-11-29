import { useEffect, useMemo, useState } from 'react';
import { NETWORKS, getAllNetworks, type NetworkConfig, type NetworkClusterId } from '../../shared/networks';
import { defaultSettings } from '../../shared/settings';
import type { AccountBalance, AccountInfo, WalletSettings } from '../../shared/types';
import { sendMessage } from '../../shared/messaging';
import { ShowPrivateKeyModal } from './ShowPrivateKeyModal';
import { NotificationToast } from './NotificationToast';
import { SendTransactionModal } from './SendTransactionModal';
import { Toast, Skeleton, Icons } from '../../shared/ui';
import type { Notification } from '../../shared/types';
import { AccountManagement, AccountDetailsModal, LedgerConnectModal } from './AccountManagement';
import { ReceiveModal } from './ReceiveModal';


interface RuntimeResponse {
  settings: WalletSettings;
}

interface AccountsResponse {
  success: boolean;
  accounts: AccountInfo[];
}

interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
}

interface BalanceResponse {
  success: boolean;
  balance?: AccountBalance;
  error?: string;
}

const activityBufferSize = 6;

function NetworkModal({
  isOpen,
  onClose,
  currentNetworkId,
  customNetworks,
  onSelectNetwork,
  onAddNetwork,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentNetworkId: NetworkClusterId;
  customNetworks: NetworkConfig[];
  onSelectNetwork: (id: NetworkClusterId) => void;
  onAddNetwork: (network: NetworkConfig) => void;
}) {
  const [view, setView] = useState<'list' | 'add'>('list');
  const [newNetwork, setNewNetwork] = useState<Partial<NetworkConfig>>({
    kind: 'solana',
    environment: 'custom',
  });

  if (!isOpen) return null;

  const allNetworks = getAllNetworks(customNetworks);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(4px)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'flex-end',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-secondary)',
        width: '100%',
        borderTopLeftRadius: '24px',
        borderTopRightRadius: '24px',
        padding: '24px',
        maxHeight: '80vh',
        overflowY: 'auto',
        border: '1px solid var(--card-border)',
      }} onClick={e => e.stopPropagation()}>
        {view === 'list' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Select Network</h3>
              <button
                onClick={() => setView('add')}
                style={{
                  background: 'var(--accent-secondary)',
                  border: 'none',
                  color: 'var(--text-primary)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                + Add Custom
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {allNetworks.map(net => (
                <div
                  key={net.id}
                  onClick={() => onSelectNetwork(net.id)}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: currentNetworkId === net.id ? 'var(--accent-color)' : 'var(--card-bg)',
                    color: currentNetworkId === net.id ? 'black' : 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid var(--card-border)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{net.label}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{net.kind.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <button
                onClick={() => setView('list')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: 0,
                }}
              >
                ←
              </button>
              <h3 style={{ margin: 0 }}>Add Custom RPC</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Network Name</label>
                <input
                  type="text"
                  placeholder="My Custom Node"
                  value={newNetwork.label || ''}
                  onChange={e => setNewNetwork({ ...newNetwork, label: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>RPC URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={newNetwork.rpcUrl || ''}
                  onChange={e => setNewNetwork({ ...newNetwork, rpcUrl: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Explorer URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://explorer.solana.com"
                  value={newNetwork.explorerUrl || ''}
                  onChange={e => setNewNetwork({ ...newNetwork, explorerUrl: e.target.value })}
                />
              </div>
              <button
                className="btn-primary"
                disabled={!newNetwork.label || !newNetwork.rpcUrl}
                onClick={() => {
                  if (newNetwork.label && newNetwork.rpcUrl) {
                    const id = `custom-${Date.now()}`;
                    onAddNetwork({
                      id,
                      label: newNetwork.label,
                      rpcUrl: newNetwork.rpcUrl,
                      explorerUrl: newNetwork.explorerUrl || '',
                      kind: 'solana', // Default to Solana for now
                      environment: 'custom',
                    });
                    setView('list');
                  }
                }}
              >
                Add Network
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function MainWallet() {
  const [settings, setSettings] = useState<WalletSettings>(defaultSettings);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountInfo | null>(null);
  const [showAccountsMenu, setShowAccountsMenu] = useState(false);
  const [showAccountManagement, setShowAccountManagement] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activityLog, setActivityLog] = useState<Array<{ message: string; signature?: string }>>([]);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [view, setView] = useState<'home' | 'history'>('home');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const [settingsRes, accountsRes] = await Promise.all([
          sendMessage<RuntimeResponse>({ type: 'manaswap:getSettings' }),
          sendMessage<AccountsResponse>({ type: 'manaswap:getAccounts' }),
        ]);

        if (mounted) {
          setSettings(settingsRes.settings);
          if (accountsRes.success) {
            setAccounts(accountsRes.accounts);
            if (accountsRes.accounts.length > 0) {
              setSelectedAccount(accountsRes.accounts[0]);
            }
          }
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[Manaswap] Failed to load wallet state', error);
        setIsLoading(false);
      }
    };

    loadData();

    // Check for pending notifications
    const checkNotifications = async () => {
      try {
        const res = await sendMessage<NotificationsResponse>({ type: 'manaswap:getPendingNotifications' });
        if (res.success && res.notifications.length > 0 && !currentNotification) {
          setCurrentNotification(res.notifications[0]);
        }
      } catch (error) {
        console.error('[Manaswap] Failed to get notifications', error);
      }
    };

    checkNotifications();
    const notificationInterval = setInterval(checkNotifications, 2000);

    return () => {
      mounted = false;
      clearInterval(notificationInterval);
    };
  }, [currentNotification]);

  // Load balance when account or network changes
  useEffect(() => {
    if (selectedAccount && settings.selectedNetwork) {
      void loadBalance();
    }
  }, [selectedAccount?.address, settings.selectedNetwork]);

  const loadAccounts = async () => {
    const res = await sendMessage<AccountsResponse>({ type: 'manaswap:getAccounts' });
    if (res.success) {
      setAccounts(res.accounts);
      // If selected account is not in list (e.g. after import), select the last one
      if (selectedAccount && !res.accounts.find(a => a.address === selectedAccount.address)) {
        setSelectedAccount(res.accounts[res.accounts.length - 1]);
      } else if (!selectedAccount && res.accounts.length > 0) {
        setSelectedAccount(res.accounts[0]);
      }
    }
  };

  const loadBalance = async () => {
    if (!selectedAccount) return;

    setIsLoadingBalance(true);
    try {
      console.log('[Popup] Requesting balance for', selectedAccount.address);
      const res = await sendMessage<BalanceResponse>({
        type: 'manaswap:getBalance',
        payload: {
          address: selectedAccount.address,
          networkId: settings.selectedNetwork,
        },
      });
      console.log('[Popup] Balance response:', res);

      if (res.success && res.balance) {
        setBalance(res.balance);

        // Fetch prices for SOL and tokens
        const mints = ['So11111111111111111111111111111111111111112']; // SOL
        res.balance.tokens.forEach(t => mints.push(t.mint));

        sendMessage<{ success: boolean; prices: Record<string, number> }>({
          type: 'manaswap:getTokenPrices',
          payload: { mints }
        }).then(priceRes => {
          if (priceRes.success && priceRes.prices) {
            const priceMap = new Map(Object.entries(priceRes.prices));
            console.log('[MainWallet] Fetched prices:', priceRes.prices);
            setPrices(priceMap);
          }
        });
      }
    } catch (error) {
      console.error('[Manaswap] Failed to load balance', error);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const selectedNetwork = useMemo(
    () => getAllNetworks(settings.customNetworks).find((network) => network.id === settings.selectedNetwork),
    [settings.selectedNetwork, settings.customNetworks],
  );

  const handleNetworkSelect = async (networkId: NetworkClusterId) => {
    const newSettings = { ...settings, selectedNetwork: networkId };
    setSettings(newSettings);
    await sendMessage({ type: 'manaswap:setSettings', payload: newSettings });
    setShowNetworkModal(false);
    setToast({ message: 'Network switched', type: 'success' });
  };

  const handleAddNetwork = async (network: NetworkConfig) => {
    const newCustomNetworks = [...(settings.customNetworks || []), network];
    const newSettings = { ...settings, customNetworks: newCustomNetworks, selectedNetwork: network.id };
    setSettings(newSettings);
    await sendMessage({ type: 'manaswap:setSettings', payload: newSettings });
    setShowNetworkModal(false);
    setToast({ message: 'Network added', type: 'success' });
  };




  const copyAddress = () => {
    if (selectedAccount) {
      navigator.clipboard.writeText(selectedAccount.address);
      setToast({ message: 'Address copied to clipboard', type: 'success' });
    }
  };

  const currency = selectedNetwork?.kind === 'x1' ? 'X1' : 'SOL';
  const solPrice = prices.get('So11111111111111111111111111111111111111112') || 0;
  const solValue = (balance?.solBalance || 0) * solPrice;

  let totalTokenValue = 0;
  balance?.tokens.forEach(t => {
    const amount = Number(t.amount) / Math.pow(10, t.decimals);
    totalTokenValue += amount * (prices.get(t.mint) || 0);
  });

  const totalUsd = solValue + totalTokenValue;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px' }}>
        <Skeleton width={200} height={24} style={{ marginBottom: '12px' }} />
        <Skeleton width={150} height={20} />
      </div>
    );
  }

  return (
    <>
      {/* Top Bar */}
      {/* Rabby-style Header */}
      <div className="rabby-header">
        {selectedAccount && (
          <div className="header-content">
            {/* Left: Account Selector */}
            <div
              className="rabby-account-selector"
              onClick={() => setShowAccountsMenu(!showAccountsMenu)}
            >
              <div className="account-icon-small">
                {selectedAccount.label?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="account-info-compact">
                <span className="account-label">{selectedAccount.label || `Account ${selectedAccount.index + 1}`}</span>
                <span className="account-address">{selectedAccount.address.slice(0, 6)}...{selectedAccount.address.slice(-4)}</span>
              </div>
              <Icons.ChevronDown size={14} />
            </div>

            {/* Right: Actions */}
            <div className="header-actions">
              <button onClick={copyAddress} className="header-icon-btn" title="Copy Address">
                <Icons.Copy size={16} />
              </button>
              <button
                onClick={() => setView('history')}
                className="header-icon-btn"
                title="Transaction History"
              >
                <Icons.Clock size={16} />
              </button>
              <button
                onClick={() => setShowNetworkModal(true)}
                className="header-icon-btn"
                title="Settings / Network"
              >
                <Icons.Settings size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Account Dropdown */}
        {showAccountsMenu && (
          <>
            <div
              className="dropdown-overlay"
              onClick={() => setShowAccountsMenu(false)}
            />
            <div className="rabby-dropdown">
              <div className="dropdown-scroll">
                {accounts.map(acc => (
                  <div
                    key={acc.address}
                    onClick={() => {
                      setSelectedAccount(acc);
                      setShowAccountsMenu(false);
                    }}
                    className={`dropdown-item ${selectedAccount?.address === acc.address ? 'active' : ''}`}
                  >
                    <div className="dropdown-item-icon">
                      {acc.label?.[0]?.toUpperCase() || 'A'}
                    </div>
                    <div className="dropdown-item-info">
                      <div className="dropdown-item-label">{acc.label || `Account ${acc.index + 1}`}</div>
                      <div className="dropdown-item-address">
                        {acc.address.slice(0, 6)}...{acc.address.slice(-4)}
                      </div>
                    </div>
                    {selectedAccount?.address === acc.address && <Icons.Check size={16} />}
                  </div>
                ))}
              </div>
              <div className="dropdown-divider" />
              <button
                onClick={() => {
                  setShowAccountManagement(true);
                  setShowAccountsMenu(false);
                }}
                className="dropdown-action-btn"
              >
                <Icons.Plus size={16} /> Add / Manage Wallets
              </button>
            </div>
          </>
        )}
      </div>

      {view === 'home' ? (
        <>
          {/* Total Equity */}
          <div className="total-equity">
            <div className="total-equity-label">Total Equity</div>
            <div className="total-equity-amount">
              ${totalUsd.toFixed(2)}
            </div>
            <div className="total-equity-change">
              <span><Icons.ArrowUpRight /></span>
              <span>{(balance?.solBalance || 0).toFixed(4)} {currency}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <div className="action-button" onClick={() => setShowSendModal(true)}>
              <div className="action-button-icon"><Icons.Send /></div>
              <div className="action-button-label">Send</div>
            </div>
            <div className="action-button" onClick={() => setShowReceiveModal(true)} title="Receive">
              <div className="action-button-icon"><Icons.Receive /></div>
              <div className="action-button-label">Receive</div>
            </div>
            <div className="action-button" title="Coming soon">
              <div className="action-button-icon"><Icons.Swap /></div>
              <div className="action-button-label">Swap</div>
            </div>
          </div>

          {/* My Assets Section */}
          {selectedAccount && (
            <div className="assets-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>My Assets</h3>
                <button
                  onClick={loadBalance}
                  disabled={isLoadingBalance}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: isLoadingBalance ? 'wait' : 'pointer',
                    padding: '4px',
                    borderRadius: '6px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Refresh balance"
                >
                  {isLoadingBalance ? (
                    <div className="loading-spinner" style={{ width: '16px', height: '16px' }} />
                  ) : (
                    <Icons.Refresh />
                  )}
                </button>
              </div>

              {/* Chain Filters */}
              <div className="chain-filters">
                <div className="chain-filter active">All chains</div>
                <div className="chain-filter">{selectedNetwork?.kind === 'x1' ? 'X1' : 'Solana'}</div>
                {NETWORKS.filter(n => n.kind !== selectedNetwork?.kind).map(network => (
                  <div key={network.id} className="chain-filter">{network.kind === 'x1' ? 'X1' : 'Solana'}</div>
                ))}
              </div>

              {/* Native Token */}
              {isLoadingBalance && !balance ? (
                <div style={{ display: 'flex', gap: '12px', padding: '12px', marginBottom: '8px' }}>
                  <Skeleton width={40} height={40} style={{ borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="60%" height={16} style={{ marginBottom: '8px' }} />
                    <Skeleton width="40%" height={12} />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Skeleton width={80} height={16} style={{ marginBottom: '8px' }} />
                    <Skeleton width={60} height={12} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="asset-item">
                    {selectedNetwork?.kind === 'x1' ? (
                      <div
                        className="asset-logo"
                        style={{
                          background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                          boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)',
                        }}
                      >
                        X1
                      </div>
                    ) : (
                      <div className="asset-logo" style={{ background: 'transparent', boxShadow: 'none' }}>
                        <img
                          src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                          alt="Solana"
                          style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                        />
                      </div>
                    )}
                    <div className="asset-info">
                      <div className="asset-name">
                        {selectedNetwork?.kind === 'x1' ? 'X1 Native Token' : 'Solana'}
                      </div>
                      <div className="asset-symbol">
                        {balance?.solBalance.toFixed(4) || '0.00'} {currency}
                      </div>
                    </div>
                    <div className="asset-value">
                      <div className="asset-amount">
                        ${((balance?.solBalance || 0) * (prices.get('So11111111111111111111111111111111111111112') || 0)).toFixed(2)}
                      </div>
                      {/* 24h change placeholder */}
                    </div>
                  </div>

                  {/* SPL Tokens */}
                  {balance?.tokens.map((token) => {
                    const price = prices.get(token.mint) || 0;
                    const amount = Number(token.amount) / Math.pow(10, token.decimals);
                    const value = amount * price;

                    return (
                      <div className="asset-item" key={token.mint}>
                        <div className="asset-logo">
                          {token.logoURI ? (
                            <img src={token.logoURI} alt={token.symbol} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', background: 'var(--card-bg)', borderRadius: '50%' }}>
                              {token.symbol?.[0] || '?'}
                            </div>
                          )}
                        </div>
                        <div className="asset-info">
                          <div className="asset-name">{token.name || token.symbol || 'Unknown Token'}</div>
                          <div className="asset-symbol">
                            {amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {token.symbol}
                          </div>
                        </div>
                        <div className="asset-value">
                          <div className="asset-amount">${value.toFixed(2)}</div>
                          {/* <div className="asset-usd">24h %</div> */}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {showPrivateKeyModal && selectedAccount && (
            <ShowPrivateKeyModal
              accountAddress={selectedAccount.address}
              accountIndex={selectedAccount.index}
              onClose={() => setShowPrivateKeyModal(false)}
            />
          )}

          {showLedgerModal && (
            <LedgerConnectModal
              onClose={() => setShowLedgerModal(false)}
              onSuccess={() => {
                loadAccounts();
                setToast({ message: 'Ledger connected', type: 'success' });
              }}
            />
          )}

          {showAccountDetails && selectedAccount && (
            <AccountDetailsModal
              account={selectedAccount}
              onClose={() => setShowAccountDetails(false)}
            />
          )}

          {showSendModal && selectedAccount && balance && selectedNetwork && (
            <SendTransactionModal
              accountAddress={selectedAccount.address}
              networkId={selectedNetwork.id}
              balance={balance.solBalance}
              onClose={() => setShowSendModal(false)}
              onSuccess={(signature?: string) => {
                // Refresh balance after successful transaction
                void loadBalance();
                setToast({ message: 'Transaction sent successfully!', type: 'success' });

                setActivityLog((prev) => {
                  const entry = {
                    message: `Sent transaction @ ${new Date().toLocaleTimeString()}`,
                    signature,
                  };
                  return [entry, ...prev].slice(0, activityBufferSize);
                });
              }}
            />
          )}

          {showReceiveModal && selectedAccount && selectedNetwork && (
            <ReceiveModal
              address={selectedAccount.address}
              networkId={selectedNetwork.id}
              onClose={() => setShowReceiveModal(false)}
            />
          )}

          <NotificationToast
            notification={currentNotification}
            onDismiss={async () => {
              if (currentNotification) {
                await sendMessage({ type: 'manaswap:clearNotification', payload: { notificationId: currentNotification.id } });
              }
              setCurrentNotification(null);
            }}
          />

        </>
      ) : (
        <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <button
              onClick={() => setView('home')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Icons.ArrowLeft />
            </button>
            <h3 style={{ margin: 0 }}>Transaction History</h3>
          </div>

          {activityLog.length === 0 ? (
            <div className="empty-state" style={{
              background: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              padding: '32px 24px',
            }}>
              <div className="empty-state-icon"><Icons.Copy /></div>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No transactions yet</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Your transaction history will appear here
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activityLog.map((entry, index) => (
                <div
                  key={`${entry.message}-${index}`}
                  style={{
                    padding: '12px',
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent-color), var(--x1-color))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                      }}>
                        <Icons.Send />
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', marginBottom: '2px' }}>Sent {currency}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {entry.message.split('@')[1] || 'Recently'}
                        </div>
                      </div>
                    </div>
                    {entry.signature && selectedNetwork && (
                      <a
                        href={`${selectedNetwork.explorerUrl}/tx/${entry.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--accent-color)',
                          textDecoration: 'none',
                        }}
                      >
                        View
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
      }

      {
        showAccountManagement && (
          <AccountManagement onClose={() => {
            setShowAccountManagement(false);
            loadAccounts();
          }} />
        )
      }

      {
        toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )
      }

      <NetworkModal
        isOpen={showNetworkModal}
        onClose={() => setShowNetworkModal(false)}
        currentNetworkId={settings.selectedNetwork}
        customNetworks={settings.customNetworks || []}
        onSelectNetwork={handleNetworkSelect}
        onAddNetwork={handleAddNetwork}
      />

      <div className="status-bar" onClick={() => setShowNetworkModal(true)}>
        <div className="status-dot"></div>
        {selectedNetwork?.label || 'Unknown Network'}
      </div>
    </>
  );
}
