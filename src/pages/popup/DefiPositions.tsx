import { useEffect, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { Icons, Skeleton } from '../../shared/ui';
import { fetchJupiterLimitOrders, fetchJupiterDCAOrders, type JupiterLimitOrder, type JupiterDCAOrder } from '../../shared/defi';
import { fetchJupiterPerpsPositions, calculatePositionPnl, type PerpsPosition } from '../../shared/perps';
import type { UnifiedTokenBalance } from './MainWallet';

interface DefiPositionsProps {
    walletAddress: string;
    onBack: () => void;
    tokens: UnifiedTokenBalance[]; // To resolve symbols
    prices: Map<string, number>;
    initialTab?: 'limit' | 'dca' | 'perps';
}

export function DefiPositions({ walletAddress, onBack, tokens, prices, initialTab = 'perps' }: DefiPositionsProps) {
    const [limitOrders, setLimitOrders] = useState<JupiterLimitOrder[]>([]);
    const [dcaOrders, setDcaOrders] = useState<JupiterDCAOrder[]>([]);
    const [perpsPositions, setPerpsPositions] = useState<PerpsPosition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'limit' | 'dca' | 'perps'>(initialTab);

    useEffect(() => {
        let mounted = true;
        setIsLoading(true);

        const fetchData = async () => {
            const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
            const connection = new Connection(rpcUrl);

            const [limits, dcas, perps] = await Promise.all([
                fetchJupiterLimitOrders(walletAddress),
                fetchJupiterDCAOrders(walletAddress),
                fetchJupiterPerpsPositions(connection, walletAddress)
            ]);

            if (mounted) {
                setLimitOrders(limits);
                setDcaOrders(dcas);
                setPerpsPositions(perps);
                setIsLoading(false);
            }
        };

        fetchData();
        return () => { mounted = false; };
    }, [walletAddress]);

    const getTokenSymbol = (mint: string) => {
        const token = tokens.find(t => t.mint === mint);
        return token ? token.symbol : `${mint.slice(0, 4)}..${mint.slice(-4)}`;
    };

    const getTokenDecimals = (mint: string) => {
        const token = tokens.find(t => t.mint === mint);
        return token ? token.decimals : 6; // Default to 6 if unknown
    };

    const formatAmount = (amount: string, mint: string) => {
        const decimals = getTokenDecimals(mint);
        const val = Number(amount) / Math.pow(10, decimals);
        return val.toLocaleString(undefined, { maximumFractionDigits: 4 });
    };



    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: '1px solid var(--card-border)' }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        padding: 0,
                    }}
                >
                    <Icons.ArrowLeft size={20} />
                </button>
                <h3 style={{ margin: 0 }}>DeFi Positions</h3>
            </div>

            <div style={{ padding: '16px 16px 0 16px' }}>
                <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '4px' }}>
                    <button
                        onClick={() => setActiveTab('perps')}
                        style={{
                            flex: 1,
                            background: activeTab === 'perps' ? 'var(--card-bg)' : 'transparent',
                            border: 'none',
                            color: activeTab === 'perps' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            padding: '8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                        }}
                    >
                        Perps ({perpsPositions.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('limit')}
                        style={{
                            flex: 1,
                            background: activeTab === 'limit' ? 'var(--card-bg)' : 'transparent',
                            border: 'none',
                            color: activeTab === 'limit' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            padding: '8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                        }}
                    >
                        Limit Orders ({limitOrders.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('dca')}
                        style={{
                            flex: 1,
                            background: activeTab === 'dca' ? 'var(--card-bg)' : 'transparent',
                            border: 'none',
                            color: activeTab === 'dca' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            padding: '8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                        }}
                    >
                        DCA ({dcaOrders.length})
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Skeleton height={80} />
                        <Skeleton height={80} />
                    </div>
                ) : activeTab === 'limit' ? (
                    limitOrders.length === 0 ? (
                        <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No open limit orders
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {limitOrders.map(order => (
                                <div key={order.publicKey} style={{
                                    background: 'var(--card-bg)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    border: '1px solid var(--card-border)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ fontWeight: '600' }}>
                                            {getTokenSymbol(order.account.inputMint)} → {getTokenSymbol(order.account.outputMint)}
                                        </div>
                                        <div style={{
                                            background: 'rgba(34, 197, 94, 0.1)',
                                            color: 'var(--success-color)',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            LIMIT
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Selling</span>
                                            <span>{formatAmount(order.account.inAmount, order.account.inputMint)} {getTokenSymbol(order.account.inputMint)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Buying</span>
                                            <span>{formatAmount(order.account.outAmount, order.account.outputMint)} {getTokenSymbol(order.account.outputMint)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : activeTab === 'dca' ? (
                    dcaOrders.length === 0 ? (
                        <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No active DCA orders
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {dcaOrders.map(order => (
                                <div key={order.publicKey} style={{
                                    background: 'var(--card-bg)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    border: '1px solid var(--card-border)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ fontWeight: '600' }}>
                                            {getTokenSymbol(order.account.inputMint)} → {getTokenSymbol(order.account.outputMint)}
                                        </div>
                                        <div style={{
                                            background: 'rgba(59, 130, 246, 0.1)',
                                            color: '#3b82f6',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            DCA
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Remaining</span>
                                            <span>{formatAmount(order.account.inAmount, order.account.inputMint)} {getTokenSymbol(order.account.inputMint)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Per Cycle</span>
                                            <span>{formatAmount(order.account.inAmountPerCycle, order.account.inputMint)} {getTokenSymbol(order.account.inputMint)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Frequency</span>
                                            <span>{Number(order.account.cycleFrequency) / 60} min</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    perpsPositions.length === 0 ? (
                        <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No active Perps positions
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {perpsPositions.map(pos => {
                                const currentPrice = prices.get(pos.marketMint) || 0;
                                const pnl = calculatePositionPnl(pos, currentPrice);
                                return (
                                    <div key={pos.publicKey} style={{
                                        background: 'var(--card-bg)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        border: '1px solid var(--card-border)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {pos.side === 'Long' ? <Icons.ArrowUpRight size={16} color="var(--success-color)" /> : <Icons.ArrowDown size={16} color="var(--danger-color)" />}
                                                {pos.side} {pos.leverage.toFixed(1)}x
                                            </div>
                                            <div style={{
                                                background: 'rgba(168, 85, 247, 0.1)',
                                                color: '#a855f7',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600
                                            }}>
                                                PERP
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Size</span>
                                                <span>${pos.sizeUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Entry Price</span>
                                                <span>${pos.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Collateral</span>
                                                <span>${pos.collateralUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>PnL</span>
                                                <span style={{ color: pnl >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                                                    {pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                </span>
                                            </div>

                                            {/* Fees Breakdown */}
                                            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--card-border)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-secondary)' }}>Borrow Fee</span>
                                                    <span style={{ color: 'var(--danger-color)' }}>-${pos.borrowFee.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-secondary)' }}>Open/Close Fee</span>
                                                    <span style={{ color: 'var(--danger-color)' }}>-${(pos.openFee + pos.closeFee).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                </div>
                                            </div>

                                            {/* Net Value */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--card-border)', fontWeight: '600' }}>
                                                <span>Net Value</span>
                                                <span>${(pos.collateralUsd + pnl - pos.borrowFee - pos.closeFee).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
