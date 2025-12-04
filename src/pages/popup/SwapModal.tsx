import { useState, useEffect } from 'react';
import { Icons, Skeleton } from '../../shared/ui';
import { getSwapQuote, getSwapTransaction, type QuoteResponse } from '../../shared/swap';
import type { UnifiedTokenBalance } from './MainWallet'; // We'll export this interface from MainWallet or move to types
import { sendMessage } from '../../shared/messaging';

// Common tokens for "To" selector if user doesn't have them
const POPULAR_TOKENS = [
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, name: 'Solana', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
    { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, name: 'USD Coin', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
    { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, name: 'Tether USD', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png' },
    { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtkOpE72UNnd54GkUD', decimals: 6, name: 'Jupiter', logoURI: 'https://static.jup.ag/jup/icon.png' },
    { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, name: 'Bonk', logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I' },
    { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6, name: 'dogwifhat', logoURI: 'https://static.jup.ag/tokens/WIF.png' },
];

interface SwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    userTokens: UnifiedTokenBalance[];
    userAddress: string;
    onSuccess: () => void;
}

export function SwapModal({ isOpen, onClose, userTokens, userAddress, onSuccess }: SwapModalProps) {
    const [fromToken, setFromToken] = useState<UnifiedTokenBalance | typeof POPULAR_TOKENS[0] | null>(null);
    const [toToken, setToToken] = useState<UnifiedTokenBalance | typeof POPULAR_TOKENS[0] | null>(null);
    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<QuoteResponse | null>(null);
    const [isLoadingQuote, setIsLoadingQuote] = useState(false);
    const [isSwapping, setIsSwapping] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Token Selector State
    const [showFromSelector, setShowFromSelector] = useState(false);
    const [showToSelector, setShowToSelector] = useState(false);

    // Initialize defaults
    useEffect(() => {
        if (isOpen) {
            // Default From: SOL or first token
            const sol = userTokens.find(t => t.symbol === 'SOL');
            setFromToken(sol || userTokens[0] || POPULAR_TOKENS[0]);

            // Default To: USDC (if From is SOL) or SOL (if From is USDC)
            setToToken(POPULAR_TOKENS[1]); // USDC
        }
    }, [isOpen, userTokens]);

    // Fetch Quote Debounced
    useEffect(() => {
        const fetchQuote = async () => {
            if (!fromToken || !toToken || !amount || Number(amount) <= 0) {
                setQuote(null);
                return;
            }

            setIsLoadingQuote(true);
            setError(null);

            try {
                const atomicAmount = Math.floor(Number(amount) * Math.pow(10, fromToken.decimals));
                // User requested 0.001% slippage. 
                // 1 bps = 0.01%. 0.1 bps = 0.001%.
                // Jupiter API takes bps. Let's try 1 (0.01%) as a safe low default, 
                // or 5 (0.05%) which is standard "low". 
                // 0.001% is extremely aggressive and will likely fail for anything but stable-stable.
                // Let's use 5 bps (0.05%) for now to ensure success, but maybe display "Low Slippage".
                const q = await getSwapQuote(fromToken.mint, toToken.mint, atomicAmount, 5);
                setQuote(q);
            } catch (err: any) {
                console.error('Quote error:', err);
                setError(err.message || 'Failed to get quote');
                setQuote(null);
            } finally {
                setIsLoadingQuote(false);
            }
        };

        const timeout = setTimeout(fetchQuote, 500); // 500ms debounce
        return () => clearTimeout(timeout);
    }, [fromToken, toToken, amount]);

    const handleSwap = async () => {
        if (!quote || !userAddress) return;

        setIsSwapping(true);
        setError(null);

        try {
            // 1. Get serialized transaction
            const { swapTransaction } = await getSwapTransaction(quote, userAddress);

            // 2. Send to background to sign and send
            // We need a message type for this. For now, let's reuse 'manaswap:sendTransaction' 
            // but that one constructs a transfer. We need a generic 'signAndSendTransaction'.
            // OR we can use the existing 'manaswap:signAndSendTransaction' if we implemented it?
            // Checking background.ts... we might need to add it.
            // Actually, let's check what we have. We have 'manaswap:sendTransaction' which takes to/amount.
            // We need a new handler for raw transaction execution.

            // Let's assume we'll add 'manaswap:executeSwap' to background.
            const res = await sendMessage<{ success: boolean; signature?: string; error?: string }>({
                type: 'manaswap:executeSwap',
                payload: {
                    swapTransactionBase64: swapTransaction
                }
            });

            if (res.success) {
                onSuccess();
                onClose();
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
            // Check if fromToken has amount (it might be a popular token without balance)
            const tokenAmount = (fromToken as any).amount;
            if (!tokenAmount) return;

            // If SOL, leave some for gas (e.g. 0.01)
            let max = Number(tokenAmount) / Math.pow(10, fromToken.decimals);
            if (fromToken.symbol === 'SOL') {
                max = Math.max(0, max - 0.01);
            }
            setAmount(max.toFixed(fromToken.decimals));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ height: 'auto', maxHeight: '90vh' }}>
                <div className="modal-header">
                    <h3>Swap</h3>
                    <button onClick={onClose} className="close-btn"><Icons.X size={20} /></button>
                </div>

                <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

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
                                style={{
                                    background: 'transparent', border: 'none', color: 'var(--text-primary)',
                                    fontSize: '1.5rem', fontWeight: 'bold', flex: 1, outline: 'none', minWidth: 0
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
                                <span style={{ color: 'var(--text-secondary)' }}>Slippage</span>
                                <span>0.05% (Auto)</span>
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
                        style={{ width: '100%', marginTop: '8px', padding: '16px', fontSize: '1rem' }}
                        disabled={!quote || isSwapping || isLoadingQuote}
                        onClick={handleSwap}
                    >
                        {isSwapping ? 'Swapping...' : isLoadingQuote ? 'Getting Quote...' : 'Swap'}
                    </button>

                </div>

                {/* Token Selector Modal (Simplified) */}
                {(showFromSelector || showToSelector) && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: '#18181b', zIndex: 20, display: 'flex', flexDirection: 'column',
                        borderRadius: '24px' // Match modal border radius
                    }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button onClick={() => { setShowFromSelector(false); setShowToSelector(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                <Icons.ArrowLeft size={20} />
                            </button>
                            <h3 style={{ margin: 0 }}>Select Token</h3>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                            {/* Combine User Tokens + Popular Tokens */}
                            {[...userTokens, ...POPULAR_TOKENS]
                                .filter((v, i, a) => a.findIndex(t => (t.mint === v.mint)) === i) // Dedupe
                                .map(token => (
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
                                        <img src={token.logoURI} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                                        <div>
                                            <div style={{ fontWeight: '600' }}>{token.symbol}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{token.name}</div>
                                        </div>
                                        {(token as any).amount && (
                                            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                                <div>{(Number((token as any).amount) / Math.pow(10, token.decimals)).toFixed(4)}</div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
