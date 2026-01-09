import { useState, useEffect, useMemo } from 'react';
import { Icons, Skeleton } from '../../shared/ui';
import { getSwapQuote, getSwapTransaction, getTradableTokens, type QuoteResponse } from '../../shared/swap';
import type { UnifiedTokenBalance } from './MainWallet';
import { sendMessage } from '../../shared/messaging';
import { getChainId } from '../../shared/networks';

interface SwapPageProps {
    userTokens: UnifiedTokenBalance[];
    userAddress: string;
    onSuccess: () => void;
    currentNetworkId: string;
    onBack: () => void;
}

export function SwapPage({ userTokens, userAddress, onSuccess, currentNetworkId, onBack }: SwapPageProps) {
    // Determine default tokens
    const chainId = getChainId(currentNetworkId);
    const nativeSymbol = chainId === 195 ? 'XNT' : 'SOL';
    const usdcSymbol = chainId === 195 ? 'USDC.X' : 'USDC';

    const [fromToken, setFromToken] = useState<UnifiedTokenBalance | any | null>(null);
    const [toToken, setToToken] = useState<UnifiedTokenBalance | any | null>(null);
    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<QuoteResponse | null>(null);
    const [isLoadingQuote, setIsLoadingQuote] = useState(false);
    const [isSwapping, setIsSwapping] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Token List State
    const [tradableTokens, setTradableTokens] = useState<UnifiedTokenBalance[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Token Selector State
    const [showFromSelector, setShowFromSelector] = useState(false);
    const [showToSelector, setShowToSelector] = useState(false);

    // Fetch Tradable Tokens on Mount/Network Change
    useEffect(() => {
        const loadTokens = async () => {
            try {
                // Fetch market tokens (from pools/API)
                const marketTokens = await getTradableTokens(currentNetworkId);
                setTradableTokens(marketTokens as UnifiedTokenBalance[]);
            } catch (e) {
                console.error('Failed to load tradable tokens', e);
            }
        };
        loadTokens();
    }, [currentNetworkId]);

    // Initialize defaults once tokens are loaded
    useEffect(() => {
        if (tradableTokens.length > 0 && !fromToken) {
            let defaultFrom = userTokens.find(t => t.symbol === nativeSymbol || t.symbol === 'SOL');
            if (!defaultFrom) defaultFrom = tradableTokens.find(t => t.symbol === nativeSymbol || t.symbol === 'SOL');
            if (!defaultFrom) defaultFrom = userTokens[0] || tradableTokens[0];
            setFromToken(defaultFrom || null);

            // Default To Token
            if (!toToken) {
                const usdc = tradableTokens.find(t => t.symbol === usdcSymbol) || userTokens.find(t => t.symbol === usdcSymbol);
                // If From is USDC/USDC.X, set To as XNT/SOL, else set To as USDC/USDC.X
                const isFromUSDC = defaultFrom?.symbol === usdcSymbol;
                const targetTo = isFromUSDC ? (tradableTokens.find(t => t.symbol === nativeSymbol) || null) : (usdc || null);

                setToToken(targetTo || tradableTokens.find(t => t.mint !== (defaultFrom as any)?.mint) || null);
            }
        }
    }, [tradableTokens, currentNetworkId, userTokens]); // Only re-run if tokens change

    // Filtered Tokens for Selector
    const filteredTokens = useMemo(() => {
        // Combine User Tokens + Tradable Tokens
        const combined = [...userTokens, ...tradableTokens];

        // Deduplicate by Mint
        const unique = combined.filter((v, i, a) => a.findIndex(t => (t.mint === v.mint)) === i);

        // Filter by Search
        if (!searchQuery) return unique;
        const lower = searchQuery.toLowerCase();
        return unique.filter(t =>
            (t.symbol || '').toLowerCase().includes(lower) ||
            (t.name || '').toLowerCase().includes(lower) ||
            t.mint.toLowerCase() === lower
        );
    }, [userTokens, tradableTokens, searchQuery]);


    // Fetch Quote Debounced
    useEffect(() => {
        const fetchQuote = async () => {
            if (!fromToken || !toToken || !amount || Number(amount) <= 0) {
                setQuote(null);
                setError(null);
                return;
            }

            // Prevent quoting same token
            if (fromToken.mint === toToken.mint) {
                setError("Cannot swap same token");
                setQuote(null);
                return;
            }

            setIsLoadingQuote(true);
            setError(null);

            try {
                const atomicAmount = Math.floor(Number(amount) * Math.pow(10, fromToken.decimals));
                const q = await getSwapQuote(currentNetworkId, fromToken.mint, toToken.mint, atomicAmount, 50, userAddress);
                setQuote(q);
            } catch (err: any) {
                console.error('Quote error:', err);
                const msg = err.message || 'Failed to get quote';
                // Detect Liquidity Error
                if (msg.includes('Insufficient liquidity') || msg.includes('No pool found')) {
                    setError('Insufficient liquidity for this pair');
                } else {
                    setError(msg);
                }
                setQuote(null);
            } finally {
                setIsLoadingQuote(false);
            }
        };

        const timeout = setTimeout(fetchQuote, 500); // 500ms debounce
        return () => clearTimeout(timeout);
    }, [fromToken, toToken, amount, currentNetworkId]);

    const handleSwap = async () => {
        if (!quote || !userAddress) return;

        setIsSwapping(true);
        setError(null);

        try {
            const { swapTransaction } = await getSwapTransaction(currentNetworkId, quote, userAddress);

            const res = await sendMessage<{ success: boolean; signature?: string; error?: string }>({
                type: 'manaswap:executeSwap',
                payload: {
                    swapTransactionBase64: swapTransaction
                }
            });

            if (res.success) {
                onSuccess();
            } else {
                throw new Error(res.error || 'Swap failed');
            }

        } catch (err: any) {
            console.error('Swap error:', err);
            setError(err.message || 'Swap failed');
        } finally {
            setIsSwapping(false);
        }
    };

    const handleMax = () => {
        if (fromToken) {
            const tokenAmount = (fromToken as any).amount;
            if (!tokenAmount) return;

            let max = Number(tokenAmount) / Math.pow(10, fromToken.decimals);
            if (fromToken.symbol === 'SOL' || fromToken.symbol === 'XNT') { // Keep gas for XNT too
                max = Math.max(0, max - 0.01);
            }
            setAmount(max.toFixed(fromToken.decimals > 6 ? 6 : fromToken.decimals));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
            {/* Standard Header */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--card-border)',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                    <Icons.ArrowLeft />
                </button>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Swap</h2>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>

                {/* From Token */}
                <div className="swap-input-container" style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>You Pay</span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Balance: {fromToken && (fromToken as any).amount ? (Number((fromToken as any).amount) / Math.pow(10, fromToken.decimals)).toFixed(4) : '0'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                            type="number"
                            placeholder="0.00"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            onWheel={e => e.currentTarget.blur()}
                            style={{
                                background: 'transparent', border: 'none', color: 'var(--text-primary)',
                                fontSize: '1.5rem', fontWeight: 'bold', flex: 1, outline: 'none', minWidth: 0,
                                MozAppearance: 'textfield', WebkitAppearance: 'none', appearance: 'textfield'
                            }}
                        />
                        <button
                            onClick={() => setShowFromSelector(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: 'var(--bg-secondary)', border: '1px solid var(--card-border)',
                                padding: '8px 12px', borderRadius: '20px', cursor: 'pointer', color: 'var(--text-primary)',
                                maxWidth: '140px'
                            }}
                        >
                            {fromToken ? (
                                <>
                                    <img src={fromToken.logoURI} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0 }} />
                                    <span style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fromToken.symbol}</span>
                                </>
                            ) : <span>Select</span>}
                            <Icons.ChevronDown size={14} style={{ flexShrink: 0 }} />
                        </button>
                    </div>
                    <div style={{ textAlign: 'right', marginTop: '4px' }}>
                        <button onClick={handleMax} style={{ background: 'transparent', border: 'none', color: 'var(--accent-color)', fontSize: '0.8rem', cursor: 'pointer' }}>MAX</button>
                    </div>
                </div>

                {/* Swap Arrow */}
                <div style={{ display: 'flex', justifyContent: 'center', margin: '-10px 0' }}>
                    <div style={{ background: 'var(--bg-primary)', padding: '8px', borderRadius: '50%', border: '1px solid var(--card-border)', cursor: 'pointer' }} onClick={() => {
                        const temp = fromToken;
                        setFromToken(toToken);
                        setToToken(temp);
                    }}>
                        <Icons.ArrowDown size={16} />
                    </div>
                </div>

                {/* To Token */}
                <div className="swap-input-container" style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>You Receive</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flex: 1, fontSize: '1.5rem', fontWeight: 'bold', color: isLoadingQuote ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                            {isLoadingQuote ? <Skeleton width={100} height={24} /> : quote ? (Number(quote.outAmount) / Math.pow(10, toToken?.decimals || 6)).toFixed(6) : '0.00'}
                        </div>
                        <button
                            onClick={() => setShowToSelector(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: 'var(--bg-secondary)', border: '1px solid var(--card-border)',
                                padding: '8px 12px', borderRadius: '20px', cursor: 'pointer', color: 'var(--text-primary)'
                            }}
                        >
                            {toToken ? (
                                <>
                                    <img src={toToken.logoURI} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                                    <span style={{ fontWeight: '600' }}>{toToken.symbol}</span>
                                </>
                            ) : <span>Select</span>}
                            <Icons.ChevronDown size={14} />
                        </button>
                    </div>
                </div>

                {/* Quote Info */}
                {quote && (
                    <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Rate</span>
                            <span>1 {fromToken?.symbol} ≈ {(Number(quote.outAmount) / Math.pow(10, toToken?.decimals || 6) / (Number(amount))).toFixed(4)} {toToken?.symbol}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Price Impact</span>
                            <span style={{ color: Number(quote.priceImpactPct) > 1 ? 'red' : 'var(--accent-color)' }}>{Number(quote.priceImpactPct).toFixed(2)}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Route</span>
                            <span>{currentNetworkId.includes('x1') ? 'XDEX' : 'Jupiter'}</span>
                        </div>
                    </div>
                )}

                {/* Pool Stats (X1 Only) */}
                {quote && quote.poolStats && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '-8px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>24h Vol</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>${Number(quote.poolStats.vol24h).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>24h Txns</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{quote.poolStats.txns24h}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>APR</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--accent-color)' }}>{quote.poolStats.apr24h.toFixed(1)}%</div>
                        </div>
                    </div>
                )}

                {error && (
                    <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 59, 48, 0.1)', color: '#ff3b30', fontSize: '0.9rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                <button
                    className="btn-primary"
                    style={{ width: '100%', marginTop: 'auto', padding: '16px', fontSize: '1rem', opacity: (error || !quote) ? 0.5 : 1, cursor: (error || !quote) ? 'not-allowed' : 'pointer' }}
                    disabled={!quote || isSwapping || isLoadingQuote || !!error}
                    onClick={handleSwap}
                >
                    {isSwapping ? 'Swapping...' : isLoadingQuote ? 'Getting Quote...' : error ? 'Swap Unavailable' : 'Swap'}
                </button>


                {/* Token Selector Modal (Full Screen Overlay) */}
                {(showFromSelector || showToSelector) && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: '#18181b', zIndex: 100, display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ padding: '24px 16px 16px', borderBottom: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button onClick={() => { setShowFromSelector(false); setShowToSelector(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                    <Icons.ArrowLeft size={20} />
                                </button>
                                <h3 style={{ margin: 0 }}>Select Token</h3>
                            </div>
                            <div className="search-input-container" style={{
                                display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)',
                                borderRadius: '8px', padding: '8px 12px', gap: '8px'
                            }}>
                                <Icons.Search size={16} color="var(--text-secondary)" />
                                <input
                                    type="text"
                                    placeholder="Search name or mint address"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    autoFocus
                                    style={{
                                        background: 'transparent', border: 'none', color: 'var(--text-primary)',
                                        outline: 'none', flex: 1, fontSize: '0.9rem'
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                            {filteredTokens.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '20px' }}>
                                    No tokens found
                                </div>
                            ) : (
                                filteredTokens.map(token => (
                                    <div
                                        key={token.mint}
                                        onClick={() => {
                                            if (showFromSelector) setFromToken(token);
                                            else setToToken(token);
                                            setShowFromSelector(false);
                                            setShowToSelector(false);
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                                            borderRadius: '8px', cursor: 'pointer', marginBottom: '4px',
                                            background: 'transparent', transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <img src={token.logoURI || 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'} alt=""
                                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' }}
                                            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', background: '#333' }} />
                                        <div>
                                            <div style={{ fontWeight: '600' }}>{token.symbol}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{token.name}</div>
                                        </div>
                                        {(token as any).amount && Number((token as any).amount) > 0 && (
                                            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                                <div>{(Number((token as any).amount) / Math.pow(10, token.decimals)).toFixed(4)}</div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

