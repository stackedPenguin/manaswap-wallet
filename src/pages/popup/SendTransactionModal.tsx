import { useState, useEffect } from 'react';
import type { NetworkClusterId } from '../../shared/networks';
import { NETWORKS } from '../../shared/networks';
import { sendMessage } from '../../shared/messaging';
import { Icons } from '../../shared/ui';

interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  logoURI?: string;
  decimals: number;
}

interface SendTransactionModalProps {
  accountAddress?: string;
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
  networkId,
  balance,
  token,
  onClose,
  onSuccess,
}: SendTransactionModalProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<number | null>(null);
  const [showReview, setShowReview] = useState(false);

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

  useEffect(() => {
    if (recipient && isValidAddress(recipient) && amount && parseFloat(amount) > 0) {
      setFeeEstimate(0.000005);
    } else {
      setFeeEstimate(null);
    }
  }, [recipient, amount]);

  const handleContinue = () => {
    setError('');
    if (!recipient || !isValidAddress(recipient)) {
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
      const res = await sendMessage<TransactionResponse>({
        type: 'manaswap:sendTransaction',
        payload: {
          recipient,
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
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: '360px',
          width: '100%',
          background: 'var(--bg-secondary)',
          borderRadius: '24px',
          padding: '24px',
          border: '1px solid var(--card-border)',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column' as const,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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

        {!showReview ? (
          <>
            {/* Recipient Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Recipient
              </label>
              <input
                type="text"
                placeholder="Solana address"
                value={recipient}
                onChange={(e) => { setRecipient(e.target.value); setError(''); }}
                disabled={isSending}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
              {recipient && !isValidAddress(recipient) && (
                <p style={{ fontSize: '0.75rem', color: '#ef4444', margin: '4px 0 0 0' }}>
                  Invalid address
                </p>
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
                disabled={isSending || !recipient || !amount || !isValidAddress(recipient) || parseFloat(amount) <= 0}
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
                  opacity: (!recipient || !amount || !isValidAddress(recipient) || parseFloat(amount) <= 0) ? 0.5 : 1,
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
                <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{recipient.slice(0, 8)}...{recipient.slice(-6)}</span>
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
                disabled={isSending}
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
    </div>
  );
}
