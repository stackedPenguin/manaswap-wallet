import { useEffect, useMemo, useState } from 'react';
import { getAllNetworks, type NetworkConfig, type NetworkClusterId } from '../../shared/networks';
import { defaultSettings } from '../../shared/settings';
import type { WalletSettings, AccountInfo, AccountBalance, TransactionActivity, Notification, TokenBalance } from '../../shared/types';
import { sendMessage } from '../../shared/messaging';
import { ShowPrivateKeyModal } from './ShowPrivateKeyModal';
import { NotificationToast } from './NotificationToast';
import { AccountManagement, AccountDetailsModal, LedgerConnectModal } from './AccountManagement';
import { SendTransactionModal } from './SendTransactionModal';
import { ReceiveModal } from './ReceiveModal';
import { SwapModal } from './SwapModal';
import { Toast, Skeleton, Icons } from '../../shared/ui';


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

// Extended TokenBalance to include network info for unified display
export interface UnifiedTokenBalance extends TokenBalance {
  networkId: NetworkClusterId;
  networkKind: 'solana' | 'x1';
}

const activityBufferSize = 50;

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
                      id: id as NetworkClusterId,
                      label: newNetwork.label,
                      rpcUrl: newNetwork.rpcUrl,
                      explorerUrl: newNetwork.explorerUrl || '',
                      kind: 'solana', // Default to Solana for now
                      environment: 'custom'
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
  const [activityLog, setActivityLog] = useState<{ message: string; signature?: string; timestamp?: number; dateStr?: string; timeStr?: string }[]>([]);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);

  // Store balances per network
  const [balances, setBalances] = useState<Map<NetworkClusterId, AccountBalance>>(new Map());
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [view, setView] = useState<'home' | 'history'>('home');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());

  const selectedNetwork = useMemo(
    () => getAllNetworks(settings.customNetworks).find((network) => network.id === settings.selectedNetwork),
    [settings.selectedNetwork, settings.customNetworks],
  );

  const currency = selectedNetwork?.kind === 'x1' ? 'X1' : 'SOL';

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

  // Load balance for ALL networks when account changes
  useEffect(() => {
    if (selectedAccount) {
      void loadAllBalances();
    }
  }, [selectedAccount?.address, settings.customNetworks]); // Reload if networks change too

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

  const loadAllBalances = async () => {
    if (!selectedAccount) return;

    setIsLoadingBalance(true);
    const allNetworks = getAllNetworks(settings.customNetworks);
    const newBalances = new Map<NetworkClusterId, AccountBalance>();
    const allMints = new Set<string>(['So11111111111111111111111111111111111111112']); // Always include SOL

    try {
      console.log('[Popup] Requesting balances for all networks', selectedAccount.address);

      // Fetch balances in parallel
      const promises = allNetworks.map(async (network) => {
        try {
          const res = await sendMessage<BalanceResponse>({
            type: 'manaswap:getBalance',
            payload: {
              address: selectedAccount.address,
              networkId: network.id,
            },
          });

          if (res.success && res.balance) {
            newBalances.set(network.id, res.balance);
            res.balance.tokens.forEach(t => allMints.add(t.mint));
          }
        } catch (err) {
          console.warn(`Failed to fetch balance for network ${network.id}:`, err);
        }
      });

      await Promise.all(promises);
      setBalances(newBalances);

      // Fetch prices for all collected mints
      if (allMints.size > 0) {
        sendMessage<{ success: boolean; prices: Record<string, number> }>({
          type: 'manaswap:getTokenPrices',
          payload: { mints: Array.from(allMints) }
        }).then(priceRes => {
          if (priceRes.success && priceRes.prices) {
            const priceMap = new Map(Object.entries(priceRes.prices));
            console.log('[MainWallet] Fetched prices:', priceRes.prices);
            setPrices(priceMap);
          }
        });
      }

    } catch (error) {
      console.error('[Manaswap] Failed to load balances', error);
    } finally {
      setIsLoadingBalance(false);
    }
  };

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

  // Fetch history when view changes to 'history'
  useEffect(() => {
    if (view === 'history' && selectedAccount && selectedNetwork) {
      setActivityLog([]); // Clear current log
      setIsLoadingBalance(true); // Reuse loading state or create a new one for history

      sendMessage<{ success: boolean; history: TransactionActivity[] }>({
        type: 'manaswap:getTransactionHistory',
        payload: {
          address: selectedAccount.address,
          networkId: selectedNetwork.id,
          limit: 20
        }
      }).then(res => {
        if (res.success && res.history) {
          const logs = res.history.map(tx => {
            const date = new Date(tx.timestamp);
            return {
              message: `${tx.type === 'send' ? 'Sent' : tx.type === 'receive' ? 'Received' : 'Transaction'} ${tx.amount ? tx.amount.toFixed(4) : ''} ${currency}`,
              signature: tx.signature,
              timestamp: tx.timestamp,
              dateStr: date.toLocaleDateString(),
              timeStr: date.toLocaleTimeString()
            };
          });
          setActivityLog(logs);
        }
      }).catch(console.error)
        .finally(() => setIsLoadingBalance(false));
    }
  }, [view, selectedAccount, selectedNetwork, currency]);

  const copyAddress = () => {
    if (selectedAccount) {
      navigator.clipboard.writeText(selectedAccount.address);
      setToast({ message: 'Address copied to clipboard', type: 'success' });
    }
  };

  // Aggregate Total Equity across all networks
  const totalUsd = useMemo(() => {
    let total = 0;
    balances.forEach((balance) => {
      const solPrice = prices.get('So11111111111111111111111111111111111111112') || 0;
      total += (balance.solBalance || 0) * solPrice;

      balance.tokens.forEach(t => {
        const amount = Number(t.amount) / Math.pow(10, t.decimals);
        total += amount * (prices.get(t.mint) || 0);
      });
    });
    return total;
  }, [balances, prices]);

  // Aggregate Unified Token List
  const unifiedTokens = useMemo(() => {
    const tokens: UnifiedTokenBalance[] = [];
    const allNetworks = getAllNetworks(settings.customNetworks);

    allNetworks.forEach(network => {
      const balance = balances.get(network.id);
      if (!balance) return;

      // Add Native Token (SOL/X1)
      if (balance.solBalance > 0) {
        tokens.push({
          mint: 'So11111111111111111111111111111111111111112', // Use SOL mint for native for price lookup
          amount: (balance.solBalance * 1e9).toString(), // Convert to lamports for consistency if needed, or handle separately
          decimals: 9,
          symbol: network.kind === 'x1' ? 'X1' : 'SOL',
          name: network.kind === 'x1' ? 'X1 Native Token' : 'Solana',
          logoURI: network.kind === 'x1' ? undefined : 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          networkId: network.id,
          networkKind: network.kind,
        });
      }

      // Add SPL Tokens
      balance.tokens.forEach(t => {
        tokens.push({
          ...t,
          networkId: network.id,
          networkKind: network.kind,
        });
      });
    });

    // Sort by USD value descending
    return tokens.sort((a, b) => {
      const priceA = prices.get(a.mint) || 0;
      const amountA = Number(a.amount) / Math.pow(10, a.decimals);
      const valueA = amountA * priceA;

      const priceB = prices.get(b.mint) || 0;
      const amountB = Number(b.amount) / Math.pow(10, b.decimals);
      const valueB = amountB * priceB;

      return valueB - valueA;
    });
  }, [balances, prices, settings.customNetworks]);

  // Helper to get chain icon
  const getChainIcon = (kind: 'solana' | 'x1') => {
    if (kind === 'x1') {
      return (
        <div style={{
          width: '12px', height: '12px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
          border: '1px solid var(--card-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '8px', color: 'white', fontWeight: 'bold'
        }}>X</div>
      );
    }
    return (
      <img
        src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
        alt="SOL"
        style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1px solid var(--card-bg)' }}
      />
    );
  };

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
            <div className="action-button" onClick={() => setShowSwapModal(true)} title="Swap">
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
                  onClick={loadAllBalances}
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

              {/* Unified Token List */}
              {isLoadingBalance && balances.size === 0 ? (
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
                  {unifiedTokens.length === 0 ? (
                    <div className="empty-state" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No assets found
                    </div>
                  ) : (
                    unifiedTokens.map((token, index) => {
                      const price = prices.get(token.mint) || 0;
                      const amount = Number(token.amount) / Math.pow(10, token.decimals);
                      const value = amount * price;

                      return (
                        <div className="asset-item" key={`${token.mint}-${token.networkId}-${index}`}>
                          <div className="asset-logo" style={{ position: 'relative' }}>
                            {token.logoURI ? (
                              <img src={token.logoURI} alt={token.symbol} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                            ) : token.symbol === 'X1' ? (
                              <div style={{
                                width: '100%', height: '100%', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '10px', color: 'white', fontWeight: 'bold'
                              }}>X1</div>
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', background: 'var(--card-bg)', borderRadius: '50%' }}>
                                {token.symbol?.[0] || '?'}
                              </div>
                            )}

                            {/* Chain Icon Overlay */}
                            <div style={{
                              position: 'absolute',
                              bottom: '-2px',
                              right: '-2px',
                              zIndex: 10
                            }}>
                              {getChainIcon(token.networkKind)}
                            </div>
                          </div>

                          <div className="asset-info">
                            <div className="asset-name">{token.name || token.symbol || 'Unknown Token'}</div>
                            <div className="asset-symbol">
                              {amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {token.symbol}
                            </div>
                          </div>
                          <div className="asset-value">
                            <div className="asset-amount">${value.toFixed(2)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
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

          {showAccountManagement && (
            <AccountManagement
              onClose={() => setShowAccountManagement(false)}
            />
          )}

          {showSendModal && selectedAccount && (
            <SendTransactionModal
              accountAddress={selectedAccount.address}
              networkId={settings.selectedNetwork} // Default to selected, but ideally user selects token first
              balance={balances.get(settings.selectedNetwork)?.solBalance || 0}
              onClose={() => setShowSendModal(false)}
              onSuccess={(signature?: string) => {
                // Refresh balance after successful transaction
                void loadAllBalances();
                setToast({ message: 'Transaction sent successfully!', type: 'success' });

                setActivityLog((prev) => {
                  const entry = {
                    message: `Sent transaction @${new Date().toLocaleTimeString()}`,
                    signature,
                    timestamp: Date.now(),
                    dateStr: new Date().toLocaleDateString(),
                    timeStr: new Date().toLocaleTimeString()
                  };
                  return [entry, ...prev].slice(0, activityBufferSize);
                });
              }}
            />
          )}

          {showReceiveModal && selectedAccount && (
            <ReceiveModal
              address={selectedAccount.address}
              networkId={settings.selectedNetwork}
              onClose={() => setShowReceiveModal(false)}
            />
          )}

          {showSwapModal && selectedAccount && (
            <SwapModal
              isOpen={showSwapModal}
              onClose={() => setShowSwapModal(false)}
              userTokens={unifiedTokens}
              userAddress={selectedAccount.address}
              onSuccess={() => {
                void loadAllBalances();
                setToast({ message: 'Swap executed successfully!', type: 'success' });

                setActivityLog((prev) => {
                  const entry = {
                    message: `Swapped tokens @${new Date().toLocaleTimeString()}`,
                    timestamp: Date.now(),
                    dateStr: new Date().toLocaleDateString(),
                    timeStr: new Date().toLocaleTimeString()
                  };
                  return [entry, ...prev].slice(0, activityBufferSize);
                });
              }}
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
                fontSize: '1.2rem',
                padding: 0,
              }}
            >
              ←
            </button>
            <h3 style={{ margin: 0 }}>Transaction History</h3>
          </div>

          {isLoadingBalance ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Skeleton height={60} />
              <Skeleton height={60} />
              <Skeleton height={60} />
            </div>
          ) : activityLog.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No recent activity
            </div>
          ) : (
            <div className="activity-list">
              {activityLog.map((log, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-icon">
                    {log.message.includes('Sent') ? <Icons.Send size={16} /> :
                      log.message.includes('Received') ? <Icons.Receive size={16} /> :
                        <Icons.Swap size={16} />}
                  </div>
                  <div className="activity-details">
                    <div className="activity-message">{log.message}</div>
                    <div className="activity-time">
                      {log.dateStr} {log.timeStr}
                    </div>
                  </div>
                  {log.signature && (
                    <a
                      href={`https://solscan.io/tx/${log.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="activity-link"
                      title="View on Explorer"
                    >
                      <Icons.ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {showNetworkModal && (
        <NetworkModal
          isOpen={showNetworkModal}
          onClose={() => setShowNetworkModal(false)}
          currentNetworkId={settings.selectedNetwork}
          customNetworks={settings.customNetworks}
          onSelectNetwork={handleNetworkSelect}
          onAddNetwork={handleAddNetwork}
        />
      )}
    </>
  );
}
