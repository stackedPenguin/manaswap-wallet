
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllNetworks, type NetworkConfig, type NetworkClusterId, type NetworkKind } from '../../shared/networks';
import { defaultSettings } from '../../shared/settings';
import type { WalletSettings, AccountInfo, AccountBalance, TransactionActivity, Notification, TokenBalance } from '../../shared/types';
import { sendMessage } from '../../shared/messaging';
import { fetchJupiterPerpsPositions, calculatePositionPnl, type PerpsPosition } from '../../shared/perps';
import { Connection, PublicKey } from '@solana/web3.js';
import { ShowPrivateKeyModal } from './ShowPrivateKeyModal';
import { NotificationToast } from './NotificationToast';
import { AccountManagement, AccountDetailsModal, LedgerConnectModal } from './AccountManagement';

import { StakingPage } from './StakingPage';
import { getStakeAccountsForWallet, getX1RpcUrl } from '../../shared/staking';
import { TokenDetails } from './TokenDetails';
import { DefiPositions } from './DefiPositions';
import { ReceivePage } from './ReceiveModal';
import { SwapPage } from './SwapPage';
import { SendTransactionModal } from './SendTransactionModal';
import type { TokenInfo } from './SendTransactionModal';
import { Skeleton, Icons } from '../../shared/ui';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';
import type { PortfolioDataPoint } from '../../shared/portfolio';
import { DriftService, ExtensionWallet, type DriftPosition } from '../../shared/drift';
import { fetchEvmTokenPrices } from '../../shared/prices';
import { NATIVE_TOKEN_COINGECKO_IDS } from '../../shared/evm-balances';


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
  networkKind: NetworkKind;
}

export interface UnifiedAsset {
  type: 'token' | 'defi';
  id: string;
  mint?: string;
  name: string;
  symbol: string;
  amount: string;
  value: number;
  logoURI?: string;
  networkId: NetworkClusterId;
  networkKind: NetworkKind;
  chainBadgeUrl?: string; // Chain icon for unified EVM view
  token?: UnifiedTokenBalance;
  defi?: PerpsPosition | DriftPosition;
  defiProtocol?: 'Jupiter' | 'Drift';
}



function NetworkModal({
  isOpen,
  onClose,
  currentNetworkId,
  customNetworks,
  onSelectNetwork,
  onAddNetwork,
  onDeleteNetwork,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentNetworkId: NetworkClusterId;
  customNetworks: NetworkConfig[];
  onSelectNetwork: (id: NetworkClusterId) => void;
  onAddNetwork: (network: NetworkConfig) => void;
  onDeleteNetwork: (id: NetworkClusterId) => void;
}) {
  const [view, setView] = useState<'list' | 'add'>('list');
  const [newNetwork, setNewNetwork] = useState<Partial<NetworkConfig>>({
    kind: 'solana',
    environment: 'custom',
  });

  if (!isOpen) return null;

  const allNetworks = getAllNetworks(customNetworks);
  // Built-in network IDs that cannot be deleted (includes EVM networks)
  const builtInIds = new Set([
    'solana-mainnet', 'solana-testnet', 'solana-devnet', 'solana-localnet',
    'x1-mainnet', 'x1-testnet', 'x1-localnet',
    'ethereum-mainnet', 'ethereum-sepolia', 'arbitrum-mainnet', 'optimism-mainnet', 'base-mainnet', 'polygon-mainnet'
  ]);

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
                + Custom
              </button>
            </div>

            {/* Solana Networks */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <img
                  src="/icons/solana-logo.png"
                  alt="Solana"
                  style={{ width: '36px', height: '36px', padding: '4px', objectFit: 'contain' }}
                />
                <span style={{ fontWeight: 600, fontSize: '1rem' }}>Solana</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginLeft: '48px' }}>
                {allNetworks.filter(n => n.kind === 'solana' && builtInIds.has(n.id)).map(net => (
                  <button
                    key={net.id}
                    onClick={() => onSelectNetwork(net.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: currentNetworkId === net.id ? '2px solid var(--accent-color)' : '1px solid var(--card-border)',
                      background: currentNetworkId === net.id ? 'var(--accent-color)' : 'var(--card-bg)',
                      color: currentNetworkId === net.id ? 'black' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: currentNetworkId === net.id ? 600 : 400,
                    }}
                  >
                    {(net.environment as string) === 'mainnet' ? 'Mainnet' :
                      (net.environment as string) === 'testnet' ? 'Testnet' :
                        (net.environment as string) === 'devnet' ? 'Devnet' :
                          (net.environment as string) === 'localnet' ? 'Localnet' : net.label}
                  </button>
                ))}
              </div>
            </div>

            {/* X1 Networks */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <img
                  src="/icons/x1-logo.png"
                  alt="X1"
                  style={{ width: '36px', height: '36px', padding: '4px', objectFit: 'contain' }}
                />
                <span style={{ fontWeight: 600, fontSize: '1rem' }}>X1</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginLeft: '48px' }}>
                {allNetworks.filter(n => n.kind === 'x1' && builtInIds.has(n.id)).map(net => (
                  <button
                    key={net.id}
                    onClick={() => onSelectNetwork(net.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: currentNetworkId === net.id ? '2px solid var(--accent-color)' : '1px solid var(--card-border)',
                      background: currentNetworkId === net.id ? 'var(--accent-color)' : 'var(--card-bg)',
                      color: currentNetworkId === net.id ? 'black' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: currentNetworkId === net.id ? 600 : 400,
                    }}
                  >
                    {(net.environment as string) === 'mainnet' ? 'Mainnet' :
                      (net.environment as string) === 'testnet' ? 'Testnet' :
                        (net.environment as string) === 'devnet' ? 'Devnet' :
                          (net.environment as string) === 'localnet' ? 'Localnet' : net.label}
                  </button>
                ))}
              </div>
            </div>

            {/* EVM Networks */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <img
                  src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png"
                  alt="Ethereum"
                  style={{ width: '36px', height: '36px', borderRadius: '50%' }}
                />
                <span style={{ fontWeight: 600, fontSize: '1rem' }}>Ethereum & L2s</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginLeft: '48px' }}>
                {allNetworks.filter(n => n.kind === 'evm').map(net => (
                  <button
                    key={net.id}
                    onClick={() => onSelectNetwork(net.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: currentNetworkId === net.id ? '2px solid var(--accent-color)' : '1px solid var(--card-border)',
                      background: currentNetworkId === net.id ? 'var(--accent-color)' : 'var(--card-bg)',
                      color: currentNetworkId === net.id ? 'black' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: currentNetworkId === net.id ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {net.iconUrl && (
                      <img src={net.iconUrl} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
                    )}
                    {net.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Networks */}
            {allNetworks.filter(n => !builtInIds.has(n.id)).length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Custom Networks
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {allNetworks.filter(n => !builtInIds.has(n.id)).map(net => (
                    <div
                      key={net.id}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        background: currentNetworkId === net.id ? 'var(--accent-color)' : 'var(--card-bg)',
                        color: currentNetworkId === net.id ? 'black' : 'var(--text-primary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid var(--card-border)',
                      }}
                    >
                      <div
                        onClick={() => onSelectNetwork(net.id)}
                        style={{ flex: 1, cursor: 'pointer' }}
                      >
                        <div style={{ fontWeight: 500 }}>{net.label}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{net.rpcUrl.slice(0, 40)}...</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNetwork(net.id);
                        }}
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: 'none',
                          color: '#ef4444',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

// Helper: Map Drift symbols to underlying mints for pricing
const getDriftUnderlyingMint = (symbol: string): string => {
  const sym = symbol.toUpperCase();
  if (sym.includes('SOL')) return 'So11111111111111111111111111111111111111112';
  if (sym.includes('BTC')) return '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh'; // Wrapped BTC (Sollet)
  if (sym.includes('ETH')) return '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs'; // Wrapped ETH (Wormhole)
  if (sym.includes('DOGE')) return 'CiKu4eCaR1U1AVKqFp4rksr5JQbw8tu2M6hQFa8n1bX'; // Wormhole DOGE
  if (sym.includes('BONK')) return 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
  if (sym.includes('WIF')) return 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
  if (sym.includes('POPCAT')) return '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr';
  return '';
};

export function MainWallet() {
  const [settings, setSettings] = useState<WalletSettings>(defaultSettings);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountInfo | null>(null);
  const [showAccountsMenu, setShowAccountsMenu] = useState(false);
  const [showAccountManagement, setShowAccountManagement] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activityLog, setActivityLog] = useState<{ message: string; signature?: string; timestamp?: number; dateStr?: string; timeStr?: string; from?: string; to?: string; type?: TransactionActivity['type'] }[]>([]);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);

  // Store balances per network
  const [balances, setBalances] = useState<Map<NetworkClusterId, AccountBalance>>(new Map());
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // EVM address for the selected account
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  // Store EVM balances for ALL chains (unified view)
  const [evmBalances, setEvmBalances] = useState<Map<string, { nativeBalance: string; nativeSymbol: string; tokens: TokenBalance[] }>>(new Map());
  // Store EVM token prices (coingeckoId -> USD price)
  const [evmPrices, setEvmPrices] = useState<Map<string, number>>(new Map());





  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [view, setView] = useState<'home' | 'history' | 'defi' | 'staking' | 'swap' | 'send' | 'receive'>('home');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [selectedTokenForDetails, setSelectedTokenForDetails] = useState<UnifiedTokenBalance | null>(null);
  const [perpsPositions, setPerpsPositions] = useState<PerpsPosition[]>([]);
  const [driftPositions, setDriftPositions] = useState<DriftPosition[]>([]);
  const [perpsValue, setPerpsValue] = useState<number>(0);
  const [initialDefiTab, setInitialDefiTab] = useState<'limit' | 'dca' | 'perps'>('perps');
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioDataPoint[]>([]);
  const [isPortfolioHistoryLoaded, setIsPortfolioHistoryLoaded] = useState(false); // Track if initial cache load is complete
  const [showChart, setShowChart] = useState(true);
  const [chartInterval, setChartInterval] = useState<'48h' | '1w' | '1m'>('48h');
  const [stakedAmount, setStakedAmount] = useState(0);
  const [hideUnverifiedTokens, setHideUnverifiedTokens] = useState(true); // Hide spam/unverified by default

  // Track portfolio history calculation to prevent repeated API calls
  const portfolioHistoryCalculationRef = useRef<{
    inProgress: boolean;
    lastCalculatedFor: string | null;
  }>({ inProgress: false, lastCalculatedFor: null });

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Check for deep link to Ledger Connect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('connectLedger') === 'true') {
      setShowLedgerModal(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);



  const selectedNetwork = useMemo(
    () => getAllNetworks(settings.customNetworks).find((network) => network.id === settings.selectedNetwork),
    [settings.selectedNetwork, settings.customNetworks],
  );

  const currency = selectedNetwork?.kind === 'x1' ? 'X1' : selectedNetwork?.kind === 'evm' ? selectedNetwork.nativeCurrency?.symbol || 'ETH' : 'SOL';

  // Display address based on network type
  const displayAddress = useMemo(() => {
    if (selectedNetwork?.kind === 'evm' && evmAddress) {
      return evmAddress;
    }
    return selectedAccount?.address || '';
  }, [selectedNetwork?.kind, evmAddress, selectedAccount?.address]);

  // Load cached portfolio history EARLY to avoid showing empty chart
  useEffect(() => {
    const loadCachedHistory = async () => {
      if (!selectedAccount?.address) {
        setIsPortfolioHistoryLoaded(true);
        return;
      }

      try {
        const { getPortfolioHistory } = await import('../../shared/portfolio');
        // Determine the right network/key for cache lookup
        const networkKey = selectedNetwork?.kind === 'evm' && evmAddress
          ? 'evm-unified'
          : (selectedNetwork?.id || 'solana-mainnet');
        const addressKey = selectedNetwork?.kind === 'evm' && evmAddress
          ? evmAddress
          : selectedAccount.address;

        const cached = await getPortfolioHistory(addressKey, networkKey);
        if (cached && cached.length > 0) {
          console.log('[Portfolio] Loaded cached history:', cached.length, 'points');
          setPortfolioHistory(cached);
        }
      } catch (err) {
        console.warn('[Portfolio] Failed to load cached history:', err);
      } finally {
        setIsPortfolioHistoryLoaded(true);
      }
    };

    loadCachedHistory();
  }, [selectedAccount?.address, selectedNetwork?.kind, selectedNetwork?.id, evmAddress]);

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
              // Try to restore selected account from settings
              const savedAddress = settingsRes.settings.selectedAccountAddress;
              const savedAccount = savedAddress ? accountsRes.accounts.find(a => a.address === savedAddress) : null;
              setSelectedAccount(savedAccount || accountsRes.accounts[0]);
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

  // Fetch EVM address when account changes
  useEffect(() => {
    if (selectedAccount) {
      sendMessage<{ success: boolean; evmAddress?: string | null; error?: string }>({
        type: 'manaswap:getEvmAddress',
        payload: { solanaAddress: selectedAccount.address }
      }).then(res => {
        if (res.success) {
          setEvmAddress(res.evmAddress || null);
        } else {
          setEvmAddress(null);
        }
      }).catch(() => setEvmAddress(null));
    } else {
      setEvmAddress(null);
    }
  }, [selectedAccount?.address]);

  // Load balance for ALL networks when account changes
  useEffect(() => {
    if (selectedAccount) {
      void loadAllBalances();
    }
  }, [selectedAccount?.address, settings.customNetworks, selectedNetwork?.id]); // Reload if networks change too

  // Fetch staked amount for X1
  useEffect(() => {
    let active = true;
    if (selectedAccount && selectedNetwork?.kind === 'x1') {
      const fetchStakes = async () => {
        try {
          const rpcUrl = getX1RpcUrl(selectedNetwork.id);
          const connection = new Connection(rpcUrl);
          const accounts = await getStakeAccountsForWallet(connection, selectedAccount.address);
          if (active) {
            const total = accounts.reduce((sum, acc) => sum + acc.balance, 0);
            setStakedAmount(total);
          }
        } catch (e) {
          console.error('Failed to fetch stakes:', e);
        }
      };
      fetchStakes();
    } else {
      setStakedAmount(0);
    }
    return () => { active = false; };
  }, [selectedAccount, selectedNetwork]);

  const loadAccounts = async () => {
    // Fetch both accounts and settings to sync selection
    const [accountsRes, settingsRes] = await Promise.all([
      sendMessage<AccountsResponse>({ type: 'manaswap:getAccounts' }),
      sendMessage<RuntimeResponse>({ type: 'manaswap:getSettings' })
    ]);

    if (accountsRes.success) {
      setAccounts(accountsRes.accounts);
      if (settingsRes && settingsRes.settings) {
        setSettings(settingsRes.settings);
        // Try to select the account specified in settings
        const savedAddress = settingsRes.settings.selectedAccountAddress;
        if (savedAddress) {
          const acc = accountsRes.accounts.find(a => a.address === savedAddress);
          if (acc) {
            setSelectedAccount(acc);
            return;
          }
        }
      }

      // Fallback logic
      if (selectedAccount && !accountsRes.accounts.find(a => a.address === selectedAccount.address)) {
        setSelectedAccount(accountsRes.accounts[accountsRes.accounts.length - 1]);
      } else if (!selectedAccount && accountsRes.accounts.length > 0) {
        setSelectedAccount(accountsRes.accounts[0]);
      }
    }
  };

  const loadAllBalances = async () => {
    if (!selectedAccount) return;

    const perfStart = performance.now();
    const logPerf = (step: string) => {
      const elapsed = ((performance.now() - perfStart) / 1000).toFixed(2);
      console.log(`[Perf] ${step} @ ${elapsed}s`);
    };

    setIsLoadingBalance(true);
    const allNetworks = getAllNetworks(settings.customNetworks);
    const newBalances = new Map<NetworkClusterId, AccountBalance>();
    const allMints = new Set<string>(['So11111111111111111111111111111111111111112']); // Always include SOL

    try {
      console.log('[Popup] Requesting balances for all networks', selectedAccount.address);
      logPerf('Started loadAllBalances');

      // First, get the EVM address for this account
      let currentEvmAddress: string | null = null;
      try {
        const evmRes = await sendMessage<{ success: boolean; evmAddress?: string | null }>({
          type: 'manaswap:getEvmAddress',
          payload: { solanaAddress: selectedAccount.address }
        });
        if (evmRes.success && evmRes.evmAddress) {
          currentEvmAddress = evmRes.evmAddress;
          setEvmAddress(evmRes.evmAddress);
        }
        logPerf('Got EVM address');
      } catch {
        console.warn('Failed to get EVM address');
      }

      // Fetch balances in parallel (Solana/X1 networks only for now)
      const solanaNetworks = allNetworks.filter(n => n.kind === 'solana' || n.kind === 'x1');
      logPerf(`Fetching ${solanaNetworks.length} Solana/X1 networks`);
      const promises = solanaNetworks.map(async (network) => {
        const networkStart = performance.now();
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
          console.log(`[Perf] Network ${network.id} done in ${((performance.now() - networkStart) / 1000).toFixed(2)}s`);
        } catch (err) {
          console.warn(`Failed to fetch balance for network ${network.id}:`, err);
          console.log(`[Perf] Network ${network.id} FAILED in ${((performance.now() - networkStart) / 1000).toFixed(2)}s`);
        }
      });

      await Promise.all(promises);
      logPerf('All Solana/X1 balances done');

      // Fetch EVM balances from ALL chains if we have an EVM address and EVM network is selected
      if (currentEvmAddress && selectedNetwork?.kind === 'evm') {
        logPerf('Starting EVM balance fetch');
        const evmNetworks = allNetworks.filter(n => n.kind === 'evm' && !n.environment?.includes('testnet'));
        const newEvmBalances = new Map<string, { nativeBalance: string; nativeSymbol: string; tokens: TokenBalance[] }>();

        // Fetch all EVM chain balances in parallel
        await Promise.all(evmNetworks.map(async (network) => {
          const evmStart = performance.now();
          try {
            const evmBalanceRes = await sendMessage<{ success: boolean; balance?: { nativeBalance: string; nativeSymbol: string; tokens: TokenBalance[] } }>({
              type: 'manaswap:getEvmBalance',
              payload: { address: currentEvmAddress, networkId: network.id }
            });
            if (evmBalanceRes.success && evmBalanceRes.balance) {
              newEvmBalances.set(network.id, evmBalanceRes.balance);
            }
            console.log(`[Perf] EVM ${network.id} done in ${((performance.now() - evmStart) / 1000).toFixed(2)}s`);
          } catch (err) {
            console.warn(`Failed to fetch EVM balance for ${network.id}:`, err);
          }
        }));

        logPerf('All EVM balances done');
        setEvmBalances(newEvmBalances);

        // Fetch EVM token prices via CoinGecko
        const coingeckoIds = new Set<string>();
        newEvmBalances.forEach((balance, networkId) => {
          // Add native token ID
          const nativeId = NATIVE_TOKEN_COINGECKO_IDS[networkId];
          if (nativeId) coingeckoIds.add(nativeId);
          // Add token IDs
          balance.tokens.forEach((t: TokenBalance & { coingeckoId?: string }) => {
            if (t.coingeckoId) coingeckoIds.add(t.coingeckoId);
          });
        });

        if (coingeckoIds.size > 0) {
          logPerf(`Fetching EVM prices for ${coingeckoIds.size} tokens`);
          try {
            const evmPriceMap = await fetchEvmTokenPrices(Array.from(coingeckoIds));
            console.log('[MainWallet] Fetched EVM prices:', Object.fromEntries(evmPriceMap));
            setEvmPrices(evmPriceMap);
            logPerf('EVM prices done');
          } catch (err) {
            console.warn('Failed to fetch EVM prices:', err);
          }
        }
      } else {
        setEvmBalances(new Map());
        setEvmPrices(new Map());
      }
      setBalances(newBalances);

      // Fetch Perps Positions
      try {
        if (selectedNetwork?.id === 'solana-mainnet') {
          logPerf('Starting perps fetch');
          const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
          const connection = new Connection(rpcUrl, { commitment: 'confirmed' });

          // Jupiter
          const perps = await fetchJupiterPerpsPositions(connection, selectedAccount.address);
          setPerpsPositions(perps);
          perps.forEach(p => allMints.add(p.marketMint));
          logPerf('Jupiter perps done');

          // Drift
          try {
            const driftService = DriftService.getInstance(connection, new ExtensionWallet(new PublicKey(selectedAccount.address), selectedAccount.address));
            await driftService.initialize();
            const drift = await driftService.getDetailedPositions();
            setDriftPositions(drift);
            drift.forEach(p => {
              const mint = getDriftUnderlyingMint(p.symbol);
              if (mint) allMints.add(mint);
            });
            logPerf('Drift positions done');
          } catch (driftErr) {
            console.warn('Failed to fetch Drift positions', driftErr);
            setDriftPositions([]);
          }

        } else {
          setPerpsPositions([]);
          setDriftPositions([]);
        }

      } catch (e) {
        console.error('Failed to fetch perps:', e);
      }

      // Fetch prices for all collected mints
      if (allMints.size > 0) {
        logPerf(`Fetching Solana prices for ${allMints.size} mints`);
        sendMessage<{ success: boolean; prices: Record<string, number> }>({
          type: 'manaswap:getTokenPrices',
          payload: { mints: Array.from(allMints) }
        }).then(priceRes => {
          if (priceRes.success && priceRes.prices) {
            const priceMap = new Map(Object.entries(priceRes.prices));
            console.log('[MainWallet] Fetched prices:', priceRes.prices);
            setPrices(priceMap);
            console.log(`[Perf] Solana prices done @ ${((performance.now() - perfStart) / 1000).toFixed(2)}s`);
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

  // Load transaction history function (extracted for refresh capability)
  const loadHistory = async () => {
    if (!selectedAccount || !selectedNetwork) return;

    setActivityLog([]); // Clear current log
    setIsLoadingBalance(true);

    try {
      const res = await sendMessage<{ success: boolean; history: TransactionActivity[] }>({
        type: 'manaswap:getTransactionHistory',
        payload: {
          address: selectedAccount.address,
          networkId: selectedNetwork.id,
          limit: 20
        }
      });

      if (res.success && res.history) {
        const logs = res.history.map(tx => {
          const date = new Date(tx.timestamp);
          return {
            message: `${tx.type === 'send' ? 'Sent' : tx.type === 'receive' ? 'Received' : 'Transaction'} ${tx.amount ? tx.amount.toFixed(4) : ''} ${currency}`,
            signature: tx.signature,
            timestamp: tx.timestamp,
            dateStr: date.toLocaleDateString(),
            timeStr: date.toLocaleTimeString(),
            from: tx.from,
            to: tx.to,
            type: tx.type
          };
        });
        setActivityLog(logs);
      }
    } catch (error) {
      console.error('[Manaswap] Failed to load history', error);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // Fetch history when view changes to 'history'
  useEffect(() => {
    if (view === 'history') {
      void loadHistory();
    }
  }, [view, selectedAccount, selectedNetwork, currency]);

  const copyAddress = () => {
    if (displayAddress) {
      navigator.clipboard.writeText(displayAddress);
      setToast({ message: 'Address copied to clipboard', type: 'success' });
    }
  };

  // Calculate Perps Net Value dynamically when prices or positions change
  useEffect(() => {
    let total = 0;
    perpsPositions.forEach(pos => {
      const currentPrice = prices.get(pos.marketMint) || 0;
      const pnl = calculatePositionPnl(pos, currentPrice);
      // Net Value = Collateral + PnL - Borrow Fee - Close Fee
      const net = pos.collateralUsd + pnl - pos.borrowFee - pos.closeFee;
      total += net;
    });
    driftPositions.forEach(pos => {
      // Drift Net Value Approx = Size / Leverage
      const net = pos.sizeUsd / (pos.leverage || 1);
      total += net;
    });
    setPerpsValue(total);
  }, [perpsPositions, driftPositions, prices]);

  // Aggregate Total Equity for selected network only
  const totalUsd = useMemo(() => {
    if (!selectedNetwork) return 0;

    let total = 0;

    // EVM network handling - aggregate all chains
    if (selectedNetwork.kind === 'evm' && evmBalances.size > 0) {
      evmBalances.forEach((evmBalance, networkId) => {
        // Native ETH/MATIC/etc value
        const nativeAmount = parseFloat(evmBalance.nativeBalance) || 0;
        const nativeCoingeckoId = NATIVE_TOKEN_COINGECKO_IDS[networkId];
        const nativePrice = nativeCoingeckoId ? (evmPrices.get(nativeCoingeckoId) || 0) : 0;
        total += nativeAmount * nativePrice;

        // ERC-20 tokens
        evmBalance.tokens.forEach((t: TokenBalance & { coingeckoId?: string }) => {
          const amount = Number(t.amount) / Math.pow(10, t.decimals);
          const tokenPrice = t.coingeckoId ? (evmPrices.get(t.coingeckoId) || 0) : 0;
          total += amount * tokenPrice;
        });
      });

      return total;
    }

    // Solana/X1 network handling
    const balance = balances.get(selectedNetwork.id);
    if (!balance) return 0;

    // Native token: X1 uses $1 hardcoded, Solana uses fetched price
    const nativePrice = selectedNetwork.kind === 'x1'
      ? 1.0
      : (prices.get('So11111111111111111111111111111111111111112') || 0);
    total += (balance.solBalance || 0) * nativePrice;

    // SPL Tokens: X1 tokens have no price API support
    balance.tokens.forEach(t => {
      const amount = Number(t.amount) / Math.pow(10, t.decimals);
      const tokenPrice = selectedNetwork.kind === 'x1' ? 0 : (prices.get(t.mint) || 0);
      total += amount * tokenPrice;
    });

    if (selectedNetwork.id === 'solana-mainnet') {
      total += perpsValue;
    }

    if (selectedNetwork.kind === 'x1') {
      total += stakedAmount;
    }

    return total;
  }, [balances, prices, perpsValue, selectedNetwork, stakedAmount, evmBalances, evmPrices]);

  // Load Portfolio History
  useEffect(() => {
    if (selectedAccount) {
      // For EVM networks, use EVM address and unified network ID
      if (selectedNetwork?.kind === 'evm' && evmAddress) {
        sendMessage<{ success: boolean; history: PortfolioDataPoint[] }>({
          type: 'manaswap:getPortfolioHistory',
          payload: { address: evmAddress, networkId: 'evm-unified' }
        }).then(res => {
          if (res.success && res.history) {
            setPortfolioHistory(res.history);
          }
        });
      } else {
        // Solana/X1 networks
        sendMessage<{ success: boolean; history: PortfolioDataPoint[] }>({
          type: 'manaswap:getPortfolioHistory',
          payload: { address: selectedAccount.address, networkId: selectedNetwork?.id || 'solana-mainnet' }
        }).then(res => {
          if (res.success && res.history) {
            setPortfolioHistory(res.history);
          }
        });
      }
    }
  }, [selectedAccount, selectedNetwork?.kind, evmAddress]);

  // Render Portfolio Chart
  useEffect(() => {
    if (view !== 'home' || !showChart) return;
    if (!isPortfolioHistoryLoaded) return; // Wait for cached history to load first

    const chartContainer = document.getElementById('portfolio-chart');
    if (!chartContainer) return;

    // Clear previous chart
    chartContainer.innerHTML = '';

    // Create Tooltip Element
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.padding = '8px';
    tooltip.style.boxSizing = 'border-box';
    tooltip.style.fontSize = '12px';
    tooltip.style.textAlign = 'left';
    tooltip.style.zIndex = '1000';
    tooltip.style.top = '12px';
    tooltip.style.left = '12px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.border = '1px solid var(--card-border)';
    tooltip.style.borderRadius = '4px';
    tooltip.style.background = 'var(--bg-secondary)';
    tooltip.style.color = 'var(--text-primary)';
    tooltip.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.3)';
    chartContainer.appendChild(tooltip);

    const chart = createChart(chartContainer, {
      width: chartContainer.clientWidth,
      height: 150, // Increased height for time scale
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        visible: true,
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: {
          visible: true,
          labelVisible: false,
          style: 2, // Dashed
          width: 1,
          color: '#9ca3af',
        },
        horzLine: {
          visible: false,
          labelVisible: false,
        },
      },
      handleScroll: false,
      handleScale: false,
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#22c55e',
      topColor: 'rgba(34, 197, 94, 0.4)',
      bottomColor: 'rgba(34, 197, 94, 0.0)',
      lineWidth: 2,
    });

    // Calculate interval cutoff time
    const intervalMs = {
      '48h': 48 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '1m': 30 * 24 * 60 * 60 * 1000,
    }[chartInterval];
    const cutoffTime = Date.now() - intervalMs;

    // Filter and sort history by timestamp based on interval
    const sortedHistory = [...portfolioHistory]
      .filter(p => p.timestamp >= cutoffTime)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Add current value as the latest point if it's newer than the last history point
    // This makes the chart feel "live"
    if (sortedHistory.length > 0) {
      const lastPoint = sortedHistory[sortedHistory.length - 1];
      // Only add if significantly newer (e.g. > 1 min) to avoid jitter
      if (Date.now() - lastPoint.timestamp > 60000) {
        sortedHistory.push({ timestamp: Date.now(), value: totalUsd });
      }
    } else {
      // If no history in interval, synthesize points to show flat line
      sortedHistory.push({ timestamp: cutoffTime, value: totalUsd });
      sortedHistory.push({ timestamp: Date.now(), value: totalUsd });
    }

    const data = sortedHistory.map(p => ({
      time: p.timestamp / 1000 as any, // lightweight-charts uses seconds
      value: p.value,
    }));

    // Deduplicate time points (lightweight-charts strictness) - keep last value for each time
    const timeToValue = new Map<number, number>();
    data.forEach(p => {
      timeToValue.set(p.time, p.value);
    });

    const uniqueData = Array.from(timeToValue.entries())
      .map(([time, value]) => ({ time: time as any, value }))
      .sort((a, b) => a.time - b.time);

    console.log('[ChartDebug] Data points:', uniqueData.length, 'Min:', Math.min(...uniqueData.map(d => d.value)).toFixed(2), 'Max:', Math.max(...uniqueData.map(d => d.value)).toFixed(2));

    if (uniqueData.length > 0) {
      areaSeries.setData(uniqueData);
      chart.timeScale().fitContent();

      // Force proper y-axis scaling to show full range
      chart.priceScale('right').applyOptions({
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      });
    }

    // Tooltip Logic
    chart.subscribeCrosshairMove(param => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > chartContainer.clientWidth ||
        param.point.y < 0 ||
        param.point.y > chartContainer.clientHeight
      ) {
        tooltip.style.display = 'none';
      } else {
        const dateStr = new Date((param.time as number) * 1000).toLocaleString();
        const dataPoint = param.seriesData.get(areaSeries) as { value: number; time: any } | undefined;
        const price = dataPoint ? dataPoint.value : 0;

        tooltip.style.display = 'block';
        tooltip.innerHTML = `
                <div style="font-weight: bold;">$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style="color: var(--text-secondary);">${dateStr}</div>
            `;

        // Position tooltip near mouse but keep inside container
        // Actually let's just keep it fixed top-left or follow mouse?
        // User asked for "mouse hover tooltips", usually implies following mouse or near point.
        // Let's make it follow mouse but with some offset
        const x = param.point.x;
        const y = param.point.y;

        // Simple positioning logic
        let left = x + 10;
        let top = y + 10;

        // Boundary checks
        if (left + 150 > chartContainer.clientWidth) {
          left = x - 160;
        }
        if (top + 60 > chartContainer.clientHeight) {
          top = y - 60;
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
      }
    });

    return () => {
      chart.remove();
    };
  }, [view, portfolioHistory, totalUsd, showChart, chartInterval, isPortfolioHistoryLoaded]);



  // Aggregate Unified Asset List (Tokens + DeFi)
  const unifiedAssets = useMemo<UnifiedAsset[]>(() => {
    const assets: UnifiedAsset[] = [];

    // Only show assets from the selected network
    if (!selectedNetwork) return assets;

    // Handle EVM networks - show assets from ALL chains with chain badges
    if (selectedNetwork.kind === 'evm') {
      if (evmBalances.size === 0) return assets;

      // Get all EVM network configs for chain info
      const allNets = getAllNetworks(settings.customNetworks);
      const evmNetworkConfigs = allNets.filter((n: NetworkConfig) => n.kind === 'evm');

      // Iterate over all EVM chain balances
      evmBalances.forEach((evmBalance, networkId) => {
        const networkConfig = evmNetworkConfigs.find((n: NetworkConfig) => n.id === networkId);
        if (!networkConfig) return;

        // Add native token (ETH, MATIC, etc.)
        const nativeAmount = parseFloat(evmBalance.nativeBalance) || 0;
        if (nativeAmount > 0) {
          // Get native token price from CoinGecko
          const nativeCoingeckoId = NATIVE_TOKEN_COINGECKO_IDS[networkId];
          const nativePrice = nativeCoingeckoId ? (evmPrices.get(nativeCoingeckoId) || 0) : 0;
          const nativeValue = nativeAmount * nativePrice;

          assets.push({
            type: 'token',
            id: `native-${networkId}`,
            mint: `native-${networkId}`,
            name: networkConfig.nativeCurrency?.name || 'Ether',
            symbol: evmBalance.nativeSymbol || 'ETH',
            amount: nativeAmount.toString(),
            value: nativeValue,
            logoURI: networkConfig.iconUrl || 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
            networkId: networkId,
            networkKind: 'evm',
            chainBadgeUrl: networkConfig.iconUrl, // Chain badge for unified view
            token: {
              mint: `native-${networkId}`,
              amount: nativeAmount.toString(),
              decimals: networkConfig.nativeCurrency?.decimals || 18,
              symbol: evmBalance.nativeSymbol || 'ETH',
              name: networkConfig.nativeCurrency?.name || 'Ether',
              networkId: networkId,
              networkKind: 'evm',
            } as UnifiedTokenBalance
          });
        }

        // Add ERC-20 tokens
        evmBalance.tokens.forEach((t: TokenBalance & { coingeckoId?: string }) => {
          const amount = Number(t.amount) / Math.pow(10, t.decimals);
          // Get token price from CoinGecko
          const tokenPrice = t.coingeckoId ? (evmPrices.get(t.coingeckoId) || 0) : 0;
          const tokenValue = amount * tokenPrice;

          assets.push({
            type: 'token',
            id: `token-${t.mint}-${networkId}`,
            mint: t.mint,
            name: t.name || 'Unknown Token',
            symbol: t.symbol || 'Unknown',
            amount: amount.toString(),
            value: tokenValue,
            logoURI: t.logoURI,
            networkId: networkId,
            networkKind: 'evm',
            chainBadgeUrl: networkConfig.iconUrl, // Chain badge for unified view
            token: { ...t, networkId: networkId, networkKind: 'evm' as NetworkKind }
          });
        });
      });

      return assets.sort((a, b) => b.value - a.value);
    }

    // Solana/X1 network handling
    const balance = balances.get(selectedNetwork.id);
    if (!balance) return assets;

    // 1. Add Native Token
    if (balance.solBalance > 0) {
      // X1 networks: use hardcoded $1 price for XNT (no price APIs support it)
      // Solana networks: use fetched SOL price
      const price = selectedNetwork.kind === 'x1'
        ? 1.0  // XNT hardcoded to $1
        : (prices.get('So11111111111111111111111111111111111111112') || 0);

      assets.push({
        type: 'token',
        id: `native-${selectedNetwork.id}`,
        mint: 'So11111111111111111111111111111111111111112',
        name: selectedNetwork.kind === 'x1' ? 'X1 Native Token' : 'Solana',
        symbol: selectedNetwork.kind === 'x1' ? 'XNT' : 'SOL',
        amount: (balance.solBalance).toString(),
        value: balance.solBalance * price,
        logoURI: selectedNetwork.kind === 'x1' ? '/icons/x1-logo.png' : 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        networkId: selectedNetwork.id,
        networkKind: selectedNetwork.kind,
        token: {
          mint: 'So11111111111111111111111111111111111111112',
          amount: (balance.solBalance * 1e9).toString(),
          decimals: 9,
          symbol: selectedNetwork.kind === 'x1' ? 'XNT' : 'SOL',
          name: selectedNetwork.kind === 'x1' ? 'X1 Native Token' : 'Solana',
          logoURI: selectedNetwork.kind === 'x1' ? '/icons/x1-logo.png' : 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          networkId: selectedNetwork.id,
          networkKind: selectedNetwork.kind,
        } as UnifiedTokenBalance
      });
    }

    // 2. Add SPL Tokens (for selected network only)
    balance.tokens.forEach(t => {
      // Skip unverified tokens if hiding is enabled (includes undefined isVerified)
      if (hideUnverifiedTokens && !t.isVerified) {
        return;
      }

      // For X1, tokens don't have price API support - use 0 for now
      const price = selectedNetwork.kind === 'x1' ? 0 : (prices.get(t.mint) || 0);
      const amount = Number(t.amount) / Math.pow(10, t.decimals);
      assets.push({
        type: 'token',
        id: `token-${t.mint}-${selectedNetwork.id}`,
        mint: t.mint,
        name: t.name || 'Unknown Token',
        symbol: t.symbol || 'Unknown',
        amount: amount.toString(),
        value: amount * price,
        logoURI: t.logoURI,
        networkId: selectedNetwork.id,
        networkKind: selectedNetwork.kind,
        token: { ...t, networkId: selectedNetwork.id, networkKind: selectedNetwork.kind }
      });
    });

    // 3. Add DeFi Positions (Jupiter Perps) - only on Solana mainnet
    if (selectedNetwork.id === 'solana-mainnet') {
      perpsPositions.forEach((pos) => {
        const currentPrice = prices.get(pos.marketMint) || 0;
        const pnl = calculatePositionPnl(pos, currentPrice);
        const netValue = pos.collateralUsd + pnl - pos.borrowFee - pos.closeFee;

        const isSol = pos.marketMint === 'So11111111111111111111111111111111111111112';
        const symbol = isSol ? 'SOL' : 'Unknown';

        assets.push({
          type: 'defi',
          id: `perp-${pos.publicKey}`,
          name: 'Jupiter Perp',
          symbol: `${pos.side} ${symbol}`,
          amount: `${pos.leverage.toFixed(1)}x`,
          value: netValue,
          logoURI: '/icons/jupiter-defi.png',
          networkId: 'solana-mainnet',
          networkKind: 'solana',
          defi: pos,
          defiProtocol: 'Jupiter'
        });
      });

      // 4. Add DeFi Positions (Drift) - only on Solana mainnet
      driftPositions.forEach((pos) => {
        // Net Value = Collateral + PnL
        const netValue = pos.collateralUsd + pos.pnl;

        const symbol = pos.symbol;

        assets.push({
          type: 'defi',
          id: `drift-${pos.marketIndex}`,
          name: 'Drift Perp',
          symbol: `${pos.side} ${symbol}`,
          amount: `${pos.leverage.toFixed(1)}x`,
          value: netValue,
          logoURI: '/icons/drift-defi.png',
          networkId: 'solana-mainnet',
          networkKind: 'solana',
          defi: pos,
          defiProtocol: 'Drift'
        });
      });
    }

    // Sort by USD value descending
    return assets.sort((a, b) => b.value - a.value);
  }, [balances, prices, selectedNetwork, perpsPositions, driftPositions, hideUnverifiedTokens, evmBalances, evmPrices, settings.customNetworks]);

  useEffect(() => {
    if (view === 'home' && unifiedAssets.length > 0 && selectedAccount && selectedNetwork) {
      // Handle EVM networks - calculate portfolio history with CoinGecko historical prices
      if (selectedNetwork.kind === 'evm' && evmAddress && evmBalances.size > 0) {
        // Create a unique key for this calculation context
        const calculationKey = `evm-${evmAddress}-${evmBalances.size}`;

        // Guard: Skip if calculation already in progress or already done for this context
        if (portfolioHistoryCalculationRef.current.inProgress) {
          console.log('[MainWalletDebug] Skipping EVM portfolio calculation - already in progress');
          return;
        }
        if (portfolioHistoryCalculationRef.current.lastCalculatedFor === calculationKey && portfolioHistory.length > 10) {
          console.log('[MainWalletDebug] Skipping EVM portfolio calculation - already calculated for this context');
          return;
        }

        console.log('[MainWalletDebug] EVM network detected, calculating historical portfolio...');
        portfolioHistoryCalculationRef.current.inProgress = true;

        // Collect current balances with their coingecko IDs
        const currentBalances = new Map<string, number>(); // coingeckoId -> amount
        const coingeckoIds = new Set<string>();

        evmBalances.forEach((balance, networkId) => {
          // Native token
          const nativeAmount = parseFloat(balance.nativeBalance) || 0;
          const nativeId = NATIVE_TOKEN_COINGECKO_IDS[networkId];
          if (nativeId && nativeAmount > 0) {
            currentBalances.set(nativeId, (currentBalances.get(nativeId) || 0) + nativeAmount);
            coingeckoIds.add(nativeId);
          }

          // ERC-20 tokens
          balance.tokens.forEach((t: any) => {
            if (t.coingeckoId) {
              const amount = Number(t.amount) / Math.pow(10, t.decimals);
              currentBalances.set(t.coingeckoId, (currentBalances.get(t.coingeckoId) || 0) + amount);
              coingeckoIds.add(t.coingeckoId);
            }
          });
        });

        if (coingeckoIds.size > 0) {
          // Fetch historical prices from CoinGecko
          import('../../shared/prices').then(({ fetchEvmHistoricalPrices }) => {
            fetchEvmHistoricalPrices(Array.from(coingeckoIds), 7).then(historicalPrices => {
              import('../../shared/portfolio').then(({ calculateEvmHistoricalPortfolio, savePortfolioHistory }) => {
                const history = calculateEvmHistoricalPortfolio(currentBalances, historicalPrices);
                console.log('[MainWalletDebug] EVM portfolio history calculated:', history.length, 'points');

                if (history.length > 0) {
                  setPortfolioHistory(history);
                  // Save to cache
                  savePortfolioHistory(evmAddress, 'evm-unified', history);
                }

                // Mark calculation complete
                portfolioHistoryCalculationRef.current.inProgress = false;
                portfolioHistoryCalculationRef.current.lastCalculatedFor = calculationKey;
              });
            }).catch(err => {
              console.error('[MainWalletDebug] EVM fetchEvmHistoricalPrices error:', err);
              portfolioHistoryCalculationRef.current.inProgress = false;
            });
          });
        } else {
          portfolioHistoryCalculationRef.current.inProgress = false;
        }
        return;
      }

      if (selectedNetwork.kind === 'x1') {
        const network = selectedNetwork;
        const account = selectedAccount;
        const balance = balances.get(network.id);
        const xntBalance = balance?.solBalance || 0;
        const totalXntValue = xntBalance + stakedAmount; // Include staked XNT in portfolio value
        const XNT_PRICE = 1.0;

        console.log('[MainWalletDebug] X1 network detected, fetching balance changes...');
        console.log('[MainWalletDebug] Current XNT balance:', xntBalance, 'Staked:', stakedAmount, 'Total:', totalXntValue);

        // Fetch x1 balance changes
        import('../../shared/history').then(({ fetchBalanceChanges }) => {
          if (!account || !network) return;
          fetchBalanceChanges(account.address, network.id).then(balanceChanges => {
            console.log('[MainWalletDebug] X1 balance changes received:', balanceChanges.length);

            // Generate hourly timestamps for past 7 days
            const now = Date.now();
            const history: PortfolioDataPoint[] = [];
            let currentBalance = xntBalance;

            // Sort balance changes by timestamp (newest first for backward replay)
            const sortedChanges = [...balanceChanges].sort((a, b) => b.timestamp - a.timestamp);
            let changeIndex = 0;

            // Calculate portfolio value at each hour going backward
            for (let i = 0; i < 168; i++) {
              const time = now - (i * 3600 * 1000);

              // Apply balance changes that occurred after this time
              while (changeIndex < sortedChanges.length && sortedChanges[changeIndex].timestamp > time) {
                // Reverse the change to get previous balance
                currentBalance -= sortedChanges[changeIndex].amount;
                changeIndex++;
              }

              // Total value = liquid balance + staked amount (staked treated as constant over history period)
              const value = Math.max(0, (currentBalance + stakedAmount) * XNT_PRICE);
              history.push({ timestamp: time, value });
            }

            console.log('[MainWalletDebug] X1 portfolio history generated:', history.length, 'points');
            console.log('[MainWalletDebug] First value:', history[history.length - 1]?.value, 'Last value:', history[0]?.value);

            setPortfolioHistory(history.reverse());
          }).catch(err => {
            console.error('[MainWalletDebug] X1 fetchBalanceChanges error:', err);
            // Fallback to flat history
            const fallbackNow = Date.now();
            const flatHistory: PortfolioDataPoint[] = [];
            for (let i = 0; i < 168; i++) {
              flatHistory.push({
                timestamp: fallbackNow - (i * 3600 * 1000),
                value: totalXntValue * XNT_PRICE
              });
            }
            setPortfolioHistory(flatHistory.reverse());
          });
        });
        return;
      }

      // For Solana networks: Calculate with OHLC data
      const assetsForHistory = unifiedAssets
        .filter(a => (a.type === 'token' && (a.value > 1 || a.symbol === 'SOL' || a.symbol === 'XNT')) || (a.type === 'defi' && a.value > 1)) // Include Tokens > $1, SOL, XNT, and DeFi > $1
        .map(a => {
          if (a.type === 'defi' && a.defi) {
            let underlyingMint = '';
            const defi = a.defi as any;

            // Handle Jupiter (has marketMint)
            if (defi.marketMint) {
              underlyingMint = defi.marketMint;
            }
            // Handle Drift (has symbol)
            else if (defi.symbol) {
              underlyingMint = getDriftUnderlyingMint(defi.symbol);
            }

            if (!underlyingMint) {
              console.warn('[MainWalletDebug] Skipping DeFi asset for history (unknown mint):', a.symbol, a.name);
              return null;
            }

            const currentPrice = prices.get(underlyingMint) || 0;
            if (currentPrice === 0) {
              console.warn('[MainWalletDebug] DeFi asset has 0 price for mint:', underlyingMint);
            }
            const effectiveAmount = currentPrice > 0 ? a.value / currentPrice : 0;

            return {
              mint: underlyingMint,
              amount: effectiveAmount,
              value: a.value
            };
          }

          return {
            // For x1 native token (XNT), use 'XNT' as mint to match balance changes
            // For Solana native token (SOL), use wrapped SOL mint
            mint: a.mint || (a.symbol === 'XNT' ? 'XNT' : (a.symbol === 'SOL' ? 'So11111111111111111111111111111111111111112' : a.id)),
            amount: parseFloat(a.amount),
            value: a.value
          };
        })
        .filter((a) => a !== null) as { mint: string; amount: number; value: number }[];

      console.log('[MainWalletDebug] Assets for history:', assetsForHistory.length, assetsForHistory.map(a => ({ mint: a.mint.slice(0, 8), amount: a.amount })));

      if (assetsForHistory.length > 0) {
        Promise.all([
          import('../../shared/portfolio'),
          import('../../shared/history')
        ]).then(([{ calculateHistoricalPortfolio }, { fetchBalanceChanges }]) => {
          console.log('[MainWalletDebug] Fetching balance changes for network:', selectedNetwork.id);

          fetchBalanceChanges(selectedAccount.address, selectedNetwork.id).then(balanceChanges => {
            console.log('[MainWalletDebug] Balance changes received:', balanceChanges.length);

            calculateHistoricalPortfolio(assetsForHistory, balanceChanges, prices).then(history => {
              console.log('[MainWalletDebug] Portfolio history calculated:', history.length, 'points');
              if (history.length > 0) {
                // Always update with latest data
                setPortfolioHistory(history);
                // Save to cache
                import('../../shared/portfolio').then(({ savePortfolioHistory }) => {
                  savePortfolioHistory(selectedAccount.address, selectedNetwork.id || 'solana-mainnet', history);
                });
              }
            }).catch(err => {
              console.error('[MainWalletDebug] calculateHistoricalPortfolio error:', err);
            });
          }).catch(err => {
            console.error('[MainWalletDebug] fetchBalanceChanges error:', err);
          });
        }).catch(err => {
          console.error('[MainWalletDebug] Module import error:', err);
        });
      } else {
        console.log('[MainWalletDebug] No assets for history, skipping calculation');
      }
    }
  }, [unifiedAssets, view, selectedAccount, selectedNetwork, prices, evmAddress, evmBalances]);


  // Load cached history on mount - but only if wallet has assets
  useEffect(() => {
    if (selectedAccount?.address && unifiedAssets.length > 0) {
      import('../../shared/portfolio').then(({ getPortfolioHistory }) => {
        getPortfolioHistory(selectedAccount.address, selectedNetwork?.id || 'solana-mainnet').then(cachedHistory => {
          if (cachedHistory && cachedHistory.length > 0) {
            setPortfolioHistory(prev => {
              // Only set if we don't have data yet (or if it's the initial empty state)
              if (prev.length <= 1) {
                return cachedHistory;
              }
              return prev;
            });
          }
        });
      });
    } else if (unifiedAssets.length === 0) {
      // Clear history when wallet has no assets
      setPortfolioHistory([]);
    }
  }, [selectedAccount?.address, unifiedAssets.length, stakedAmount, selectedNetwork?.kind]);

  // Helper to get chain icon
  const getChainIcon = (kind: NetworkKind, chainBadgeUrl?: string) => {
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
    if (kind === 'evm') {
      // Use chain badge URL if available (for unified EVM view)
      if (chainBadgeUrl) {
        return (
          <img
            src={chainBadgeUrl}
            alt=""
            style={{
              width: '14px', height: '14px', borderRadius: '50%',
              border: '1.5px solid var(--card-bg)',
              background: 'var(--card-bg)'
            }}
          />
        );
      }
      return (
        <div style={{
          width: '12px', height: '12px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #627EEA, #3C3C3D)',
          border: '1px solid var(--card-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '7px', color: 'white', fontWeight: 'bold'
        }}>E</div>
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

  if (selectedTokenForDetails) {
    return (
      <TokenDetails
        key={`token-details-${selectedTokenForDetails.mint}`}
        token={selectedTokenForDetails}
        onBack={() => setSelectedTokenForDetails(null)}
        onSend={() => {
          setSelectedTokenForDetails(null);
          setView('send');
        }}
        onReceive={() => {
          setSelectedTokenForDetails(null);
          setView('receive');
        }}
        onSwap={() => {
          setSelectedTokenForDetails(null);
          setView('swap');
        }}
      />
    );
  }

  if (view === 'staking' && selectedAccount && selectedNetwork?.kind === 'x1') {
    return (
      <StakingPage
        onBack={() => setView('home')}
        walletAddress={selectedAccount.address}
        networkId={selectedNetwork.id}
        xntBalance={balances.get(selectedNetwork.id)?.solBalance || 0}
        onSignTransaction={async (transaction, additionalSigners) => {
          // Sign and send transaction through background
          const result = await sendMessage<{ success: boolean; signature?: string; error?: string }>({
            type: 'manaswap:signAndSendRawTransaction',
            payload: {
              transaction: Array.from(transaction.serialize({ requireAllSignatures: false })),
              accountAddress: selectedAccount.address,
              networkId: selectedNetwork.id,
              additionalSigners: additionalSigners?.map(k => Array.from(k.secretKey)),
            }
          });
          if (!result.success) {
            throw new Error(result.error || 'Transaction failed');
          }
          return result.signature || '';
        }}
        showToast={(message, type) => setToast({ message, type })}
      />
    );
  }

  if (view === 'receive' && selectedAccount && selectedNetwork) {
    return (
      <ReceivePage
        address={selectedAccount.address}
        networkId={selectedNetwork.id}
        onBack={() => setView('home')}
      />
    );
  }

  if (view === 'swap' && selectedAccount && selectedNetwork) {
    return (
      <SwapPage
        userTokens={unifiedAssets.filter(a => a.type === 'token').map(a => a.token!)}
        userAddress={selectedAccount.address}
        currentNetworkId={selectedNetwork.id}
        onSuccess={() => {
          setView('home');
          loadAllBalances();
          setToast({ message: 'Swap successful!', type: 'success' });
        }}
        onBack={() => setView('home')}
      />
    );
  }

  if (view === 'send' && selectedAccount && selectedNetwork) {
    const nativeBalance = balances.get(selectedNetwork.id)?.solBalance || 0;
    const availableTokens: TokenInfo[] = unifiedAssets
      .filter(a => a.type === 'token' && a.token && a.token.symbol)
      .map(a => ({
        mint: a.token!.mint,
        symbol: a.token!.symbol || '',
        name: a.token!.name || a.token!.symbol || '',
        logoURI: a.token!.logoURI,
        decimals: a.token!.decimals,
        balance: Number(a.token!.amount) / Math.pow(10, a.token!.decimals),
        price: prices.get(a.token!.mint),
      }));

    return (
      <SendTransactionModal
        accountAddress={selectedAccount.address}
        accounts={accounts}
        networkId={selectedNetwork.id}
        defaultBalance={nativeBalance}
        availableTokens={availableTokens}
        onClose={() => setView('home')}
        onSuccess={(sig) => {
          setView('home');
          loadAllBalances();
          setToast({ message: sig ? `Sent! ${sig.slice(0, 8)}...` : 'Transaction sent!', type: 'success' });
        }}
      />
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
                <span className="account-address">{displayAddress.slice(0, 6)}...{displayAddress.slice(-4)}</span>
              </div>
              <Icons.ChevronDown size={14} />
            </div>

            {/* Right: Actions */}
            <div className="header-actions">
              <button onClick={copyAddress} className="header-icon-btn" title="Copy Address">
                <Icons.Copy size={16} />
              </button>
              <button
                onClick={() => setView('defi')}
                className="header-icon-btn"
                title="DeFi Positions"
              >
                <Icons.DeFi size={16} />
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
                title="Switch Network"
              >
                <Icons.Network size={16} />
              </button>
              <button
                onClick={() => chrome.runtime.openOptionsPage()}
                className="header-icon-btn"
                title="Settings"
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
                    onClick={async () => {
                      // Clear current balances immediately for visual feedback
                      setBalances(new Map());
                      setPortfolioHistory([]);

                      setSelectedAccount(acc);
                      setShowAccountsMenu(false);

                      // Load cached portfolio history for this account
                      import('../../shared/portfolio').then(({ getPortfolioHistory }) => {
                        getPortfolioHistory(acc.address, selectedNetwork?.id || 'solana-mainnet').then((cached: PortfolioDataPoint[]) => {
                          if (cached.length > 0) {
                            setPortfolioHistory(cached);
                          }
                        });
                      });

                      // Persist selection
                      const newSettings = { ...settings, selectedAccountAddress: acc.address };
                      setSettings(newSettings);
                      await sendMessage({ type: 'manaswap:setSettings', payload: newSettings });
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
          {/* Total Equity */}
          <div className="total-equity">
            <div className="total-equity-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Total Equity
              <button
                onClick={() => setShowChart(!showChart)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
                title={showChart ? "Hide Chart" : "Show Chart"}
              >
                {showChart ? <Icons.EyeOff size={14} /> : <Icons.Eye size={14} />}
              </button>
            </div>
            <div className="total-equity-amount">
              ${totalUsd.toFixed(2)}
            </div>
            {/* Interval Selector */}
            {showChart && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                {(['48h', '1w', '1m'] as const).map(interval => (
                  <button
                    key={interval}
                    onClick={() => setChartInterval(interval)}
                    style={{
                      background: chartInterval === interval ? 'var(--primary)' : 'var(--surface-light)',
                      color: chartInterval === interval ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {interval.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {/* Portfolio Chart Container */}
            {showChart && <div id="portfolio-chart" style={{ width: '100%', height: '150px', marginTop: '12px', position: 'relative' }} />}

            {/* Staked Amount Display (X1) */}
            {selectedNetwork?.kind === 'x1' && stakedAmount > 0 && (
              <div
                onClick={() => setView('staking')}
                style={{
                  marginTop: '12px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icons.Zap size={14} style={{ color: '#f59e0b' }} />
                <span style={{ fontWeight: 600, color: '#f59e0b' }}>{stakedAmount.toFixed(4)} XNT Staked</span>
                <Icons.ChevronRight size={14} style={{ color: '#f59e0b', marginLeft: 'auto' }} />
              </div>
            )}
          </div>


          {/* Action Buttons */}
          <div className="action-buttons">
            <div className="action-button" onClick={() => setView('send')}>
              <div className="action-button-icon"><Icons.Send /></div>
              <div className="action-button-label">Send</div>
            </div>
            <div className="action-button" onClick={() => setView('receive')} title="Receive">
              <div className="action-button-icon"><Icons.Receive /></div>
              <div className="action-button-label">Receive</div>
            </div>
            <div className="action-button" onClick={() => setView('swap')} title="Swap">
              <div className="action-button-icon"><Icons.Swap /></div>
              <div className="action-button-label">Swap</div>
            </div>
            {selectedNetwork?.kind === 'x1' && (
              <div className="action-button" onClick={() => setView('staking')} title="Stake XNT">
                <div className="action-button-icon"><Icons.Stake /></div>
                <div className="action-button-label">Stake</div>
              </div>
            )}
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

              {/* Spam Filter Toggle - Show count of hidden tokens */}
              {(() => {
                const balance = selectedNetwork ? balances.get(selectedNetwork.id) : undefined;
                const hiddenCount = balance?.tokens.filter(t => !t.isVerified).length || 0;
                if (hiddenCount > 0) {
                  return (
                    <button
                      onClick={() => setHideUnverifiedTokens(!hideUnverifiedTokens)}
                      style={{
                        width: '100%',
                        padding: '8px 16px',
                        background: hideUnverifiedTokens ? 'rgba(234, 179, 8, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid',
                        borderColor: hideUnverifiedTokens ? 'rgba(234, 179, 8, 0.3)' : 'rgba(59, 130, 246, 0.3)',
                        borderRadius: '8px',
                        color: hideUnverifiedTokens ? 'var(--warning-color)' : 'var(--accent-color)',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Icons.Warning size={12} />
                      {hideUnverifiedTokens
                        ? `${hiddenCount} unverified token${hiddenCount > 1 ? 's' : ''} hidden`
                        : `Showing ${hiddenCount} unverified token${hiddenCount > 1 ? 's' : ''}`}
                    </button>
                  );
                }
                return null;
              })()}

              {/* Unified Asset List */}
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
                  {unifiedAssets.length === 0 ? (
                    <div className="empty-state" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No assets found
                    </div>
                  ) : (
                    unifiedAssets.map((asset, index) => {
                      return (
                        <div
                          className="asset-item"
                          key={`${asset.id}-${index}`}
                          onClick={() => {
                            if (asset.type === 'defi') {
                              setInitialDefiTab('perps');
                              setView('defi');
                            } else if (asset.type === 'token' && asset.token) {
                              setSelectedTokenForDetails(asset.token);
                            }
                          }}
                        >
                          <div className="asset-logo" style={{ position: 'relative' }}>
                            {asset.logoURI ? (
                              <img src={asset.logoURI} alt={asset.symbol} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                            ) : asset.symbol === 'X1' ? (
                              <div style={{
                                width: '100%', height: '100%', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '10px', color: 'white', fontWeight: 'bold'
                              }}>X1</div>
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', background: 'var(--card-bg)', borderRadius: '50%' }}>
                                {asset.symbol?.[0] || '?'}
                              </div>
                            )}

                            {/* Chain Icon Overlay for Tokens */}
                            {asset.type === 'token' && (
                              <div style={{
                                position: 'absolute',
                                bottom: '-2px',
                                right: '-2px',
                                zIndex: 10
                              }}>
                                {getChainIcon(asset.networkKind, asset.chainBadgeUrl)}
                              </div>
                            )}
                          </div>

                          <div className="asset-info">
                            <div className="asset-name">{asset.name}</div>
                            <div className="asset-symbol">
                              {asset.type === 'token' ? (
                                <>
                                  {Number(asset.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.symbol}
                                </>
                              ) : (
                                <span style={{ color: 'var(--accent-color)' }}>{asset.amount}</span>
                              )}
                            </div>
                          </div>

                          <div className="asset-value">
                            <div className="asset-value-usd">
                              ${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {asset.type === 'token' && (() => {
                              // Calculate display price based on network type
                              let displayPrice = 0;
                              if (asset.networkKind === 'x1' && asset.mint === 'So11111111111111111111111111111111111111112') {
                                // X1 native token: hardcoded $1
                                displayPrice = 1.0;
                              } else if (asset.networkKind === 'evm') {
                                // EVM tokens: use coingeckoId to lookup in evmPrices
                                if (asset.mint?.startsWith('native-')) {
                                  // Native token (ETH, MATIC, etc.)
                                  const networkId = asset.networkId || '';
                                  const coingeckoId = NATIVE_TOKEN_COINGECKO_IDS[networkId];
                                  displayPrice = coingeckoId ? (evmPrices.get(coingeckoId) || 0) : 0;
                                } else {
                                  // ERC-20 token
                                  const coingeckoId = (asset.token as any)?.coingeckoId;
                                  displayPrice = coingeckoId ? (evmPrices.get(coingeckoId) || 0) : 0;
                                }
                              } else {
                                // Solana tokens: use mint to lookup in prices
                                displayPrice = prices.get(asset.mint || '') || 0;
                              }
                              return (
                                <div className="asset-price-per-token" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  @${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: displayPrice < 0.01 ? 6 : displayPrice < 1 ? 4 : 2 })}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : view === 'history' ? (
        <div className="history-section" style={{ padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', marginBottom: '16px' }}>
            <button
              onClick={() => setView('home')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              ← Back
            </button>
            <h3 style={{ margin: 0, flex: 1 }}>Transaction History</h3>
            <button
              onClick={() => void loadHistory()}
              disabled={isLoadingBalance}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--card-border)',
                color: 'var(--text-primary)',
                cursor: isLoadingBalance ? 'not-allowed' : 'pointer',
                padding: '8px 12px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                opacity: isLoadingBalance ? 0.6 : 1
              }}
            >
              <span style={{
                display: 'inline-block',
                animation: isLoadingBalance ? 'spin 1s linear infinite' : 'none'
              }}>↻</span>
              Refresh
            </button>
          </div>
          {isLoadingBalance ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <Skeleton width="100%" height={40} count={3} style={{ marginBottom: '10px' }} />
            </div>
          ) : activityLog.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No recent activity
            </div>
          ) : (
            <div className="activity-list">
              {activityLog.map((log, i) => (
                <div key={i} className="activity-item" style={{
                  padding: '12px',
                  background: 'var(--card-bg)',
                  borderRadius: '12px',
                  marginBottom: '8px',
                  border: '1px solid var(--card-border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ fontWeight: '500' }}>{log.message}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.dateStr}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '0.75rem', color: log.type === 'send' ? '#ef4444' : log.type === 'receive' ? '#22c55e' : 'var(--text-secondary)' }}>
                      {log.type?.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.timeStr}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : view === 'defi' ? (
        <DefiPositions
          walletAddress={selectedAccount?.address || ''}
          onBack={() => setView('home')}
          tokens={unifiedAssets.filter(a => a.type === 'token').map(a => a.token!)}
          initialTab={initialDefiTab}
          prices={prices}
        />
      ) : null}





      <NetworkModal
        isOpen={showNetworkModal}
        onClose={() => setShowNetworkModal(false)}
        currentNetworkId={settings.selectedNetwork}
        customNetworks={settings.customNetworks}
        onSelectNetwork={handleNetworkSelect}
        onAddNetwork={handleAddNetwork}
        onDeleteNetwork={async (networkId) => {
          const newSettings = {
            ...settings,
            customNetworks: (settings.customNetworks || []).filter(n => n.id !== networkId),
          };
          // If deleted network was selected, switch to default
          if (settings.selectedNetwork === networkId) {
            newSettings.selectedNetwork = 'solana-mainnet';
          }
          await sendMessage({ type: 'manaswap:setSettings', payload: newSettings });
          setSettings(newSettings);
        }}
      />

      {showPrivateKeyModal && selectedAccount && (
        <ShowPrivateKeyModal
          accountAddress={selectedAccount.address}
          accountIndex={accounts.findIndex(a => a.address === selectedAccount.address)}
          onClose={() => setShowPrivateKeyModal(false)}
        />
      )}

      {showAccountDetails && selectedAccount && (
        <AccountDetailsModal
          account={selectedAccount}
          onClose={() => setShowAccountDetails(false)}
          onSuccess={() => {
            loadAccounts();
          }}
          onAccountsChanged={() => {
            loadAccounts();
          }}
        />
      )}

      {showAccountManagement && (
        <AccountManagement
          onClose={() => setShowAccountManagement(false)}
          onAccountsChanged={() => {
            loadAccounts();
          }}
        />
      )}

      {showLedgerModal && (
        <LedgerConnectModal
          onClose={() => setShowLedgerModal(false)}
          onSuccess={() => {
            loadAccounts();
            setShowLedgerModal(false);
          }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '48px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'success'
            ? 'rgba(34, 197, 94, 0.15)'
            : toast.type === 'error'
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(59, 130, 246, 0.15)',
          backdropFilter: 'blur(12px)',
          color: toast.type === 'success'
            ? '#4ade80'
            : toast.type === 'error'
              ? '#f87171'
              : '#60a5fa',
          padding: '12px 20px',
          borderRadius: '12px',
          border: `1px solid ${toast.type === 'success'
            ? 'rgba(34, 197, 94, 0.3)'
            : toast.type === 'error'
              ? 'rgba(239, 68, 68, 0.3)'
              : 'rgba(59, 130, 246, 0.3)'
            }`,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          zIndex: 200,
          fontSize: '0.85rem',
          fontWeight: 500,
          animation: 'fadeIn 0.3s ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
          {toast.message}
        </div>
      )}

      {currentNotification && (
        <NotificationToast
          notification={currentNotification}
          onDismiss={async () => {
            if (currentNotification) {
              await sendMessage({ type: 'manaswap:clearNotification', payload: { notificationId: currentNotification.id } });
            }
            setCurrentNotification(null);
          }}
        />
      )}

      {/* Status Bar - Network Selector */}
      <div
        className="status-bar"
        onClick={() => setShowNetworkModal(true)}
        title="Click to switch network"
      >
        {selectedNetwork?.kind === 'evm' && selectedNetwork?.iconUrl ? (
          <img
            src={selectedNetwork.iconUrl}
            alt=""
            style={{ width: '16px', height: '16px', objectFit: 'contain', marginRight: '6px', borderRadius: '50%' }}
          />
        ) : (
          <img
            src={selectedNetwork?.kind === 'x1' ? '/icons/x1-logo.png' : '/icons/solana-logo.png'}
            alt=""
            style={{ width: '16px', height: '16px', objectFit: 'contain', marginRight: '6px' }}
          />
        )}
        <span className="status-dot" style={{
          background: selectedNetwork?.kind === 'x1' ? '#f59e0b' : selectedNetwork?.kind === 'evm' ? '#627EEA' : '#22c55e'
        }} />
        <span>{selectedNetwork?.label || 'Select Network'}</span>
        <Icons.ChevronDown size={12} style={{ marginLeft: 4 }} />
      </div>

    </>
  );
}



