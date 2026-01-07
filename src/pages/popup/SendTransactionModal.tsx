import { useState, useEffect, useRef } from 'react';
import type { NetworkClusterId } from '../../shared/networks';
import type { AccountInfo } from '../../shared/types';
import { NETWORKS } from '../../shared/networks';
import { sendMessage } from '../../shared/messaging';
import { Icons } from '../../shared/ui';
import { resolveX1NS } from '../../shared/x1ns';

interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  logoURI?: string;
  decimals: number;
}

interface SendTransactionModalProps {
  accountAddress?: string;
  accounts: AccountInfo[];
  networkId: NetworkClusterId;
  balance: number;
  token?: TokenInfo;
  onClose: () => void;
  onSuccess?: (signature?: string) => void;
}

interface TransactionResponse {
  success: boolean;
  signature?: string;
  error?: string;
}

export function SendTransactionModal({
  accountAddress,
  accounts,
  networkId,
  balance,
  token,
  onClose,
  onSuccess,
}: SendTransactionModalProps) {
  const [recipient, setRecipient] = useState('');
  const [showOwnWallets, setShowOwnWallets] = useState(false);
  const ownWalletsRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<number | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  const network = NETWORKS.find((n) => n.id === networkId);
  const currency = token?.symbol || (network?.kind === 'x1' ? 'XNT' : 'SOL');
  const nativeCurrency = network?.kind === 'x1' ? 'XNT' : 'SOL';

  const isValidAddress = (addr: string): boolean => {
    try {
      return addr.length >= 32 && addr.length <= 44 && /^[A-Za-z0-9]+$/.test(addr);
    } catch {
      return false;
    }
  };



  // Handle X1NS Resolution
  useEffect(() => {
    const checkX1NS = async () => {
      // Only resolve if on X1 network and input looks like a domain
      if (network?.kind === 'x1' && recipient.endsWith('.x1') && recipient.length > 3) {
        setIsResolving(true);
        setResolvedAddress(null);
        setError('');

        const result = await resolveX1NS(recipient);

        setIsResolving(false);
        if (result.address) {
          setResolvedAddress(result.address);
        } else if (result.error) {
          // Don't set error on UI immediately while typing, unless it's a specific lookup
          // But here we just leave resolvedAddress null
        }
      } else {
        setResolvedAddress(null);
      }
    };

    const timer = setTimeout(checkX1NS, 500); // Debounce
    return () => clearTimeout(timer);
  }, [recipient, network?.kind]);


  useEffect(() => {
    // Determine effective address: standard address OR resolved X1NS address
    const effectiveAddress = resolvedAddress || recipient;

    if (effectiveAddress && isValidAddress(effectiveAddress) && amount && parseFloat(amount) > 0) {
      setFeeEstimate(0.000005);
    } else {
      setFeeEstimate(null);
    }
  }, [recipient, resolvedAddress, amount]);

  // Close own wallets dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ownWalletsRef.current && !ownWalletsRef.current.contains(event.target as Node)) {
        setShowOwnWallets(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectOwnWallet = (address: string) => {
    setRecipient(address);
    setShowOwnWallets(false);
    setError('');
  };

  const handleContinue = () => {
    setError('');

    // Use resolved address if available
    const effectiveRecipient = resolvedAddress || recipient;

    if (!effectiveRecipient || !isValidAddress(effectiveRecipient)) {
      setError('Invalid recipient address');
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return;
    }
    if (amountNum > balance) {
      setError(`Insufficient balance. You have ${balance.toFixed(4)} ${currency}`);
      return;
    }
    setShowReview(true);
  };

  const handleSend = async () => {
    setIsSending(true);
    setError('');
    try {
      const amountNum = parseFloat(amount);
      const effectiveRecipient = resolvedAddress || recipient;

      const res = await sendMessage<TransactionResponse>({
        type: 'manaswap:sendTransaction',
        payload: {
          recipient: effectiveRecipient,
          amount: amountNum,
          networkId,
          tokenMint: token?.mint,
          tokenDecimals: token?.decimals,
        },
      });
      if (res.success && res.signature) {
        onSuccess?.(res.signature);
        onClose();
      } else {
        setError(res.error || 'Transaction failed');
        setShowReview(false);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Transaction failed';
      setError(errorMessage);
      setShowReview(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleMax = () => {
    if (feeEstimate && !token) {
      const maxAmount = Math.max(0, balance - feeEstimate);
      setAmount(maxAmount.toFixed(6));
    } else {
      setAmount(balance.toFixed(6));
    }
  };

  // Common input style
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: '0.95rem',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    color: '#fff',
    outline: 'none',
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#09090b', // Force opaque background (Zinc-950 equivalent)
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column', // Column layout
        overflow: 'hidden', // Prevent body scroll
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '600px', // Limit width on larger screens for sanity, but effectively fills popup
          width: '100%',
          margin: '0 auto',
          padding: '0',
          overflowY: 'auto', // Allow internal scrolling
        }}
      >
        {/* Header - Fixed Top look but stays in flow, padding match StakingPage */}
        <div style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--card-border)'
        }}>
          {showReview ? (
            <button
              onClick={() => setShowReview(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Icons.ArrowLeft size={16} /> Back
            </button>
          ) : (
            <div style={{ width: '40px' }} />
          )}
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
            {showReview ? 'Confirm' : `Send ${currency}`}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <Icons.Close size={18} />
          </button>
        </div>



        {/* Content Body */}
        <div style={{ padding: '16px', flex: 1 }}>

          {/* Chain Badge for Clarity */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${network?.kind === 'x1' ? '#f59e0b' : '#22c55e'}`,
              borderRadius: '20px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: network?.kind === 'x1' ? '#f59e0b' : '#22c55e',
                boxShadow: `0 0 8px ${network?.kind === 'x1' ? '#f59e0b' : '#22c55e'}`
              }} />
              <span>Sending on <strong>{network?.label || networkId}</strong></span>
            </div>
          </div>

          {!showReview ? (
            <>
              {/* Recipient Input */}
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Recipient
                  </label>
                  {network?.kind === 'x1' && (
                    <div className="tooltip-container" style={{ position: 'relative', display: 'inline-flex' }}>
                      <div style={{
                        width: '14px', height: '14px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
                        color: 'var(--text-secondary)', cursor: 'help'
                      }} title="X1NS Domains Supported">?</div>
                    </div>
                  )}
                </div>
                {(accounts || []).length > 1 && (
                  <button
                    onClick={() => setShowOwnWallets(!showOwnWallets)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-color)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    Select My Wallet
                  </button>
                )}


                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder={network?.kind === 'x1' ? "Address or .x1 domain" : "Solana address"}
                    value={recipient}
                    onChange={(e) => { setRecipient(e.target.value); setError(''); }}
                    disabled={isSending}
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />

                  {/* Loading / Resolution Status Indicator */}
                  {isResolving && (
                    <div style={{ position: 'absolute', right: '12px', top: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Resolving...
                    </div>
                  )}

                  {/* Own Wallets Dropdown */}
                  {showOwnWallets && (
                    <div
                      ref={ownWalletsRef}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: '#1a1a1a', // Solid dark background to fix transparency issue
                        border: '1px solid var(--card-border)',
                        borderRadius: '10px',
                        zIndex: 100, // Make sure it floats above everything
                        maxHeight: '200px',
                        overflowY: 'auto',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.8)' // Stronger shadow
                      }}
                    >
                      {accounts
                        .filter(a => a.address !== accountAddress) // Don't show current sender
                        .map((acc, idx) => (
                          <div
                            key={acc.address}
                            onClick={() => selectOwnWallet(acc.address)}
                            style={{
                              padding: '10px 12px',
                              borderBottom: idx < accounts.length - 2 ? '1px solid var(--card-border)' : 'none', // -2 because we filtered one out roughly
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              background: 'transparent',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                              {acc.label || `Wallet ${idx + 1}`}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {acc.address.slice(0, 8)}...{acc.address.slice(-8)}
                            </div>
                          </div>
                        ))}
                      {accounts.length <= 1 && (
                        <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
                          No other wallets found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {recipient && !isValidAddress(recipient) && !recipient.endsWith('.x1') && (
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', margin: '4px 0 0 0' }}>
                    Invalid address
                  </p>
                )}

                {resolvedAddress && (
                  <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icons.Check size={12} />
                    <span>Resolved: {resolvedAddress.slice(0, 8)}...{resolvedAddress.slice(-8)}</span>
                  </div>
                )}
              </div>

              {/* Amount Input */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Amount</label>
                  <button
                    onClick={handleMax}
                    disabled={isSending}
                    style={{
                      fontSize: '0.7rem',
                      padding: '4px 10px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    MAX
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(''); }}
                    disabled={isSending}
                    style={{ ...inputStyle, paddingRight: '60px' }}
                  />
                  <span style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                  }}>
                    {currency}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Balance: {balance.toFixed(6)} {currency}
                </p>
              </div>

              {/* Fee Info */}
              {feeEstimate && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '20px',
                  padding: '12px',
                  background: 'var(--card-bg)',
                  borderRadius: '12px',
                  border: '1px solid var(--card-border)',
                }}>
                  <span>Network fee</span>
                  <span style={{ color: 'var(--text-primary)' }}>~{feeEstimate.toFixed(6)} {nativeCurrency}</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  padding: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  marginBottom: '12px',
                }}>
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={onClose}
                  disabled={isSending}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  disabled={isSending || !recipient || !amount || (!isValidAddress(recipient) && !resolvedAddress) || parseFloat(amount) <= 0}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    opacity: (isSending || (!recipient || !amount || (!isValidAddress(recipient) && !resolvedAddress) || parseFloat(amount) <= 0)) ? 0.5 : 1,
                  }}
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Review: Token Icon + Amount */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                {token?.logoURI ? (
                  <img
                    src={token.logoURI}
                    alt={token.symbol}
                    style={{ width: '48px', height: '48px', borderRadius: '50%', marginBottom: '12px' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    margin: '0 auto 12px',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#fff',
                  }}>
                    {currency.slice(0, 3)}
                  </div>
                )}
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#fff' }}>
                  {parseFloat(amount).toFixed(6)} {currency}
                </div>
              </div>

              {/* Compact Details */}
              <div style={{ fontSize: '0.85rem', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--card-border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>To</span>
                  <div style={{ textAlign: 'right' }}>
                    {resolvedAddress ? (
                      <>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{recipient}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace' }}>{resolvedAddress.slice(0, 8)}...{resolvedAddress.slice(-6)}</div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{recipient.slice(0, 8)}...{recipient.slice(-6)}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--card-border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Network</span>
                  <span style={{ color: 'var(--text-primary)' }}>{network?.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Fee</span>
                  <span style={{ color: 'var(--text-primary)' }}>~{(feeEstimate || 0.000005).toFixed(6)} {nativeCurrency}</span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  padding: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  marginBottom: '12px',
                }}>
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowReview(false)}
                  disabled={isSending}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || (!isValidAddress(recipient) && !resolvedAddress)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    opacity: (isSending || (!isValidAddress(recipient) && !resolvedAddress)) ? 0.7 : 1
                  }}
                >
                  {isSending ? (
                    <>
                      <div style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTop: '2px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      Sending...
                    </>
                  ) : (
                    'Send'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div >
    </div >
  );
}
