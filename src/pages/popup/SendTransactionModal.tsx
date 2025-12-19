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
  token?: TokenInfo;  // Optional: if provided, sending SPL token; otherwise native SOL/X1
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
  // Use token symbol if sending SPL token, otherwise native currency
  const currency = token?.symbol || (network?.kind === 'x1' ? 'XNT' : 'SOL');

  // Validate recipient address
  const isValidAddress = (addr: string): boolean => {
    try {
      // Basic Solana address validation (base58, 32-44 chars)
      return addr.length >= 32 && addr.length <= 44 && /^[A-Za-z0-9]+$/.test(addr);
    } catch {
      return false;
    }
  };

  // Estimate transaction fee
  useEffect(() => {
    if (recipient && isValidAddress(recipient) && amount && parseFloat(amount) > 0) {
      // Standard Solana transaction fee is ~5000 lamports (0.000005 SOL)
      setFeeEstimate(0.000005);
    } else {
      setFeeEstimate(null);
    }
  }, [recipient, amount]);

  const handleContinue = () => {
    setError('');

    // Validation
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
          // Include token info for SPL token transfers
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
    if (feeEstimate) {
      const maxAmount = Math.max(0, balance - feeEstimate);
      setAmount(maxAmount.toFixed(4));
    } else {
      setAmount(balance.toFixed(4));
    }
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '400px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          {showReview ? (
            <>
              <button
                onClick={() => setShowReview(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.9rem',
                }}
              >
                ← Back
              </button>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>Review Transaction</h2>
              <div style={{ width: '60px' }} />
            </>
          ) : (
            <>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>Send {currency}</h2>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <Icons.Close />
              </button>
            </>
          )}
        </div>

        {!showReview ? (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="recipient" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>
                Recipient Address
              </label>
              <input
                id="recipient"
                type="text"
                placeholder="Enter Solana address"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setError('');
                }}
                disabled={isSending}
                style={{
                  marginBottom: '4px',
                  padding: '14px 16px',
                  fontSize: '0.95rem',
                  fontFamily: 'monospace',
                }}
              />
              {recipient && !isValidAddress(recipient) && (
                <p style={{
                  fontSize: '0.75rem',
                  color: 'var(--danger-color)',
                  margin: '4px 0 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <Icons.Warning />
                  Invalid address format
                </p>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label htmlFor="amount" style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                  Amount ({currency})
                </label>
                <button
                  onClick={handleMax}
                  disabled={isSending}
                  style={{
                    fontSize: '0.75rem',
                    padding: '6px 12px',
                    background: 'var(--card-bg)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--card-hover)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--card-bg)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  Max
                </button>
              </div>
              <input
                id="amount"
                type="number"
                step="0.0001"
                min="0"
                max={balance}
                placeholder="0.0000"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
                disabled={isSending}
                style={{
                  padding: '14px 16px',
                  fontSize: '1rem',
                }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Available: {balance.toFixed(4)} {currency}
              </p>
            </div>

            {feeEstimate && (
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(6, 182, 212, 0.1))',
                borderRadius: '12px',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                fontSize: '0.85rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                    <span>ℹ️</span>
                    <span>Network Fee:</span>
                  </div>
                  <span style={{ fontWeight: '600' }}>&lt; {feeEstimate.toFixed(6)} {currency}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Total:</span>
                  <span style={{ fontWeight: '700', fontSize: '1rem' }}>{(parseFloat(amount || '0') + feeEstimate).toFixed(6)} {currency}</span>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: 'var(--danger-color)',
                fontSize: '0.85rem',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Icons.Warning />
                <span>{error}</span>
              </div>
            )}

            <div className="btn-row">
              <button
                onClick={onClose}
                className="btn-secondary"
                disabled={isSending}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleContinue}
                disabled={isSending || !recipient || !amount || !isValidAddress(recipient) || parseFloat(amount) <= 0}
                className="btn-primary"
                style={{ flex: 1 }}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Review Step */}
            <div style={{
              textAlign: 'center',
              marginBottom: '24px',
              padding: '24px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(6, 182, 212, 0.1))',
              borderRadius: '16px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}>
              {/* Token logo */}
              {token?.logoURI ? (
                <img
                  src={token.logoURI}
                  alt={token.symbol}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    margin: '0 auto 16px',
                    objectFit: 'cover',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="logo" style={{
                  width: '64px',
                  height: '64px',
                  fontSize: '24px',
                  margin: '0 auto 16px',
                  background: network?.kind === 'x1'
                    ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                    : 'linear-gradient(135deg, #9945ff, #14f195)',
                }}>
                  {currency.slice(0, 3)}
                </div>
              )}
              <div style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '4px', color: 'var(--text-primary)' }}>
                {parseFloat(amount).toFixed(6)} {currency}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {token?.name || (network?.kind === 'x1' ? 'X1 Native Token' : 'Solana')}
              </div>
            </div>

            {/* Transaction Details */}
            <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                padding: '12px',
                background: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    👤
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>From</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>Account 1</div>
                  </div>
                </div>
                <span style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>→</span>
                <div style={{ textAlign: 'right', maxWidth: '140px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>To</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', wordBreak: 'break-all' }}>
                    {recipient.slice(0, 6)}...{recipient.slice(-6)}
                  </div>
                </div>
              </div>

              <div style={{
                padding: '12px',
                background: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <span>🌐</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Network</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="network-badge">{network?.label}</span>
                </div>
              </div>

              <div style={{
                padding: '12px',
                background: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <span>ℹ️</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Network Fee</span>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                  &lt; {feeEstimate?.toFixed(6) || '0.000005'} {currency}
                </div>
              </div>

              <div style={{
                padding: '12px',
                background: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <span>🚀</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Speed</span>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--success-color)' }}>
                  &lt; 1 sec
                </div>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: 'var(--danger-color)',
                fontSize: '0.85rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Icons.Warning />
                <span>{error}</span>
              </div>
            )}

            <div className="btn-row">
              <button
                onClick={() => setShowReview(false)}
                className="btn-secondary"
                disabled={isSending}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isSending}
                className="btn-primary"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {isSending ? (
                  <>
                    <div className="loading-spinner" style={{ width: '18px', height: '18px' }} />
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Confirm</span>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

