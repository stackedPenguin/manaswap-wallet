import React, { useState, useMemo } from 'react';
import type { PendingRequest } from '../../shared/types';
import { sendMessage } from '../../shared/messaging';
import { parseTransaction, shortenAddress, type ParsedTransaction, type ParsedInstruction } from '../../shared/txParser';
import { LedgerSignModal } from './LedgerSignModal';
import { useBlowfishEvaluation, transactionBytesToBase64, type BlowfishEvaluation } from '../../shared/blowfish';

// Blowfish balance changes display component
function BalanceChanges({ evaluation, isLoading, error }: {
  evaluation?: BlowfishEvaluation;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        border: '1px solid var(--card-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
          <div className="loading-spinner" style={{ width: '16px', height: '16px' }} />
          <span>Simulating transaction...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(255, 180, 0, 0.1)',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '12px',
        border: '1px solid rgba(255, 180, 0, 0.3)',
        color: '#ffb400',
        fontSize: '0.85rem',
      }}>
        ⚠️ Simulation unavailable - proceed with caution
      </div>
    );
  }

  if (!evaluation) return null;

  const hasChanges = evaluation.expectedStateChanges &&
    Object.keys(evaluation.expectedStateChanges).length > 0;

  return (
    <div style={{ marginBottom: '12px' }}>
      {/* Security warnings */}
      {(evaluation.warnings.length > 0 || evaluation.errors.length > 0) && (
        <div style={{ marginBottom: '12px' }}>
          {evaluation.warnings.map((warning, i) => (
            <div key={i} style={{
              background: warning.severity === 'CRITICAL'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(255, 180, 0, 0.1)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '8px',
              border: `1px solid ${warning.severity === 'CRITICAL'
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(255, 180, 0, 0.3)'}`,
              color: warning.severity === 'CRITICAL' ? '#ef4444' : '#ffb400',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}>
              <span>{warning.severity === 'CRITICAL' ? '🚨' : '⚠️'}</span>
              <span>{warning.message}</span>
            </div>
          ))}
          {evaluation.errors.map((err, i) => (
            <div key={`err-${i}`} style={{
              background: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '8px',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
              fontSize: '0.85rem',
            }}>
              ❌ {err}
            </div>
          ))}
        </div>
      )}

      {/* Balance changes */}
      {hasChanges && (
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--card-border)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '0.9rem' }}>
            Expected Balance Changes
          </div>
          {Object.entries(evaluation.expectedStateChanges!).map(([account, changes]) => (
            <div key={account} style={{ marginBottom: '8px' }}>
              {changes.map((change, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: i < changes.length - 1 ? '1px solid var(--card-border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {change.asset?.imageUrl && (
                      <img
                        src={change.asset.imageUrl}
                        alt={change.asset.name}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: change.asset.isNonFungible ? '4px' : '50%',
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <span style={{ fontSize: '0.9rem' }}>
                      {change.asset?.name || 'Unknown Asset'}
                    </span>
                  </div>
                  <span style={{
                    color: change.suggestedColor === 'DEBIT' ? '#ef4444' :
                      change.suggestedColor === 'CREDIT' ? '#22c55e' :
                        'var(--text-primary)',
                    fontWeight: 500,
                    fontSize: '0.9rem',
                  }}>
                    {change.humanReadableDiff}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface DAppApprovalModalProps {
  request: PendingRequest;
  onApprove: () => void;
  onReject: () => void;
}

function InstructionCard({ ix, index }: { ix: ParsedInstruction; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        borderRadius: '8px',
        padding: '12px',
        fontSize: '0.85rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <span style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>#{index + 1}</span>
          <span style={{ fontWeight: 600 }}>{ix.programName}</span>
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
          {expanded ? '▼' : '▶'}
        </span>
      </div>

      {ix.summary && (
        <div style={{ marginTop: '8px', color: 'var(--accent-color)', fontWeight: 500 }}>
          {ix.summary}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <div style={{ marginBottom: '4px' }}>
            <strong>Program:</strong> {shortenAddress(ix.programId, 6)}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Accounts:</strong> {ix.accounts.length}
          </div>
          <div style={{
            maxHeight: '80px',
            overflowY: 'auto',
            fontSize: '0.7rem',
            fontFamily: 'monospace',
            background: 'var(--bg-secondary)',
            padding: '4px',
            borderRadius: '4px',
          }}>
            {ix.accounts.map((acc, i) => (
              <div key={i}>{shortenAddress(acc, 6)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionDetails({ payload }: { payload: unknown }) {
  const parsed = useMemo((): ParsedTransaction | null => {
    if (!payload) return null;

    try {
      // Payload could be an array of numbers or a Uint8Array-like object
      if (Array.isArray(payload)) {
        return parseTransaction(payload);
      } else if (typeof payload === 'object' && payload !== null) {
        // Could be object with nested transaction data
        const p = payload as Record<string, unknown>;
        if (Array.isArray(p.transaction)) {
          return parseTransaction(p.transaction);
        }
        // Try to extract data property
        if (p.data && Array.isArray(p.data)) {
          return parseTransaction(p.data);
        }
      }
      return null;
    } catch {
      return null;
    }
  }, [payload]);

  if (!parsed) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        padding: '12px',
        borderRadius: '8px',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
      }}>
        Unable to parse transaction details
      </div>
    );
  }

  if (parsed.error) {
    return (
      <div style={{
        background: '#7f1d1d',
        padding: '12px',
        borderRadius: '8px',
        fontSize: '0.85rem',
        color: '#fca5a5',
      }}>
        Parse error: {parsed.error}
      </div>
    );
  }

  return (
    <div style={{ fontSize: '0.85rem' }}>
      {/* Summary header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '12px',
        padding: '12px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
      }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Fee Payer</div>
          <div style={{ fontFamily: 'monospace' }}>{shortenAddress(parsed.feePayer, 6)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Version</div>
          <div>{parsed.version === 0 ? 'V0' : 'Legacy'}</div>
        </div>
      </div>

      {/* Instructions */}
      <div style={{ marginBottom: '8px', fontWeight: 600 }}>
        Instructions ({parsed.instructions.length})
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxHeight: '200px',
        overflowY: 'auto',
      }}>
        {parsed.instructions.map((ix, i) => (
          <InstructionCard key={i} ix={ix} index={i} />
        ))}
      </div>
    </div>
  );
}

function MessageDetails({ payload }: { payload: unknown }) {
  const messageText = useMemo(() => {
    if (!payload) return null;

    try {
      let bytes: Uint8Array;
      if (payload instanceof Uint8Array) {
        bytes = payload;
      } else if (Array.isArray(payload)) {
        bytes = new Uint8Array(payload);
      } else {
        return null;
      }

      // Try to decode as UTF-8 text
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(bytes);
    } catch {
      // Show as hex if not valid UTF-8
      if (Array.isArray(payload)) {
        return `0x${Array.from(new Uint8Array(payload)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      }
      return null;
    }
  }, [payload]);

  if (!messageText) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        padding: '12px',
        borderRadius: '8px',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
      }}>
        Unable to display message
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      padding: '12px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '0.8rem',
      wordBreak: 'break-all',
      maxHeight: '150px',
      overflowY: 'auto',
    }}>
      {messageText}
    </div>
  );
}

function SignAllTransactionsDetails({ request }: { request: PendingRequest }): React.JSX.Element | null {
  if (request.type !== 'sign-all-transactions') return null;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          background: '#7f1d1d',
          border: '1px solid #991b1b',
          borderRadius: '8px',
          padding: '10px',
          marginBottom: '12px',
        }}
      >
        <p style={{ fontSize: '0.8rem', color: '#fca5a5', margin: 0 }}>
          ⚠️ Review carefully. This will sign a blockchain transaction.
        </p>
      </div>
      <div style={{ fontSize: '0.85rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '8px' }}>
          {request.payload.length} Transactions
        </div>
        <div style={{
          maxHeight: '200px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {request.payload.map((tx, i) => (
            <div key={i} style={{
              background: 'var(--bg-secondary)',
              padding: '8px',
              borderRadius: '8px'
            }}>
              <div style={{ fontWeight: 500, marginBottom: '4px' }}>Transaction {i + 1}</div>
              <TransactionDetails payload={tx} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DAppApprovalModal({ request, onApprove, onReject }: DAppApprovalModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Extract user account from request context
  const userAccount = (request as { publicKey?: string }).publicKey || null;

  // Convert transaction to base64 for Blowfish API
  const transactionBase64 = useMemo(() => {
    if (request.type !== 'sign-transaction' && request.type !== 'sign-and-send-transaction') {
      return null;
    }
    try {
      const payload = request.payload;
      if (Array.isArray(payload)) {
        return transactionBytesToBase64(payload);
      } else if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        if (Array.isArray(p.transaction)) {
          return transactionBytesToBase64(p.transaction);
        }
      }
    } catch {
      return null;
    }
    return null;
  }, [request]);

  // Blowfish simulation hook
  const { isLoading: blowfishLoading, error: blowfishError, evaluation } =
    useBlowfishEvaluation(transactionBase64, userAccount, request.origin);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'manaswap:approveRequest',
        payload: { requestId: request.id },
      });

      if (res.success) {
        onApprove();
      } else {
        alert(res.error || 'Failed to approve request');
        setIsProcessing(false);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to approve request');
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await sendMessage({ type: 'manaswap:rejectRequest', payload: { requestId: request.id } });
      onReject();
    } catch (error) {
      console.error('[Manaswap] Failed to reject request', error);
      setIsProcessing(false);
    }
  };

  const getRequestTitle = () => {
    switch (request.type) {
      case 'connect':
        return 'Connection Request';
      case 'sign-transaction':
        return 'Sign Transaction';
      case 'sign-all-transactions':
        return 'Sign Multiple Transactions';
      case 'sign-message':
        return 'Sign Message';
      case 'switch-chain':
        return 'Switch Network';
      case 'ledger-sign-transaction':
      case 'ledger-sign-and-send':
        return 'Approve on Ledger';
      case 'ledger-sign-message':
        return 'Sign Message on Ledger';
      default:
        return 'Request';
    }
  };

  // Handle Ledger signing requests - show Ledger modal
  if (request.type === 'ledger-sign-transaction' || request.type === 'ledger-sign-and-send' || request.type === 'ledger-sign-message') {
    const ledgerRequest = request as PendingRequest & { derivationPath: string };
    return (
      <LedgerSignModal
        derivationPath={ledgerRequest.derivationPath}
        payload={ledgerRequest.payload as number[]}
        type={request.type === 'ledger-sign-message' ? 'message' : 'transaction'}
        onSuccess={async (signature) => {
          // Send the signature back to background to forward to dApp
          const res = await sendMessage<{ success: boolean; error?: string }>({
            type: 'manaswap:ledgerSignResult',
            payload: { requestId: request.id, signature: Array.from(signature) },
          });
          if (res.success) {
            onApprove();
          }
        }}
        onCancel={() => {
          onReject();
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#0f0f0f',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          flex: 1,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header - different layout for connect vs other requests */}
        {request.type === 'connect' ? (
          /* Connection request: "{hostname} would like to connect!" centered */
          <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>
              {request.hostname.length > 25
                ? request.hostname.slice(0, 22) + '...'
                : request.hostname
              } would like to connect!
            </h2>
          </div>
        ) : request.type !== 'sign-transaction' && request.type !== 'sign-and-send-transaction' ? (
          /* Other requests except transactions (which have their own header) */
          <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>{getRequestTitle()}</h2>
          </div>
        ) : null}

        {/* Connect request - Backpack style */}
        {request.type === 'connect' && (
          <div style={{ marginBottom: '16px' }}>
            {/* Large circular dApp icon */}
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 16px',
              background: 'var(--bg-secondary)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--card-border)',
              overflow: 'hidden'
            }}>
              {request.icon ? (
                <img
                  src={request.icon}
                  alt={request.hostname}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    // Fallback to Google favicon API
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes('google.com/s2/favicons')) {
                      target.src = `https://www.google.com/s2/favicons?domain=${request.origin}&sz=180`;
                    }
                  }}
                />
              ) : (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${request.origin}&sz=180`}
                  alt={request.hostname}
                  style={{ width: '64px', height: '64px', objectFit: 'contain' }}
                  onError={(e) => {
                    // Show placeholder letter on error
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement!.innerHTML = `<div style="font-size: 32px; font-weight: bold; color: var(--text-secondary)">?</div>`;
                  }}
                />
              )}
            </div>

            {/* dApp name and URL */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                {request.hostname}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                {request.origin}
              </div>
            </div>

            {/* Permissions list */}
            <div style={{ margin: '0 16px 16px' }}>
              <div style={{ fontWeight: 600, marginBottom: '12px' }}>
                This app would like to:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#22c55e', fontSize: '1.1rem' }}>✓</span>
                  <span>View wallet balance & activity</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#22c55e', fontSize: '1.1rem' }}>✓</span>
                  <span>Request approval for transactions</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transaction signing - Phantom style */}
        {(request.type === 'sign-transaction' || request.type === 'sign-and-send-transaction') && (
          <div style={{ marginBottom: '16px' }}>
            {/* Header with site info */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0
              }}>
                {request.icon ? (
                  <img
                    src={request.icon}
                    alt={request.hostname}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('google.com/s2/favicons')) {
                        target.src = `https://www.google.com/s2/favicons?domain=${request.origin}&sz=128`;
                      }
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '20px' }}>🌐</span>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Confirm Transaction</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {request.hostname}
                </div>
              </div>
            </div>

            {/* Blowfish simulation results */}
            <BalanceChanges
              evaluation={evaluation}
              isLoading={blowfishLoading}
              error={blowfishError}
            />

            {/* Balance changes disclaimer */}
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginBottom: '12px'
            }}>
              Balance changes are estimated. Amounts and assets involved are not guaranteed.
            </div>

            {/* Estimated changes - clickable to show details */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '12px',
                border: '1px solid var(--card-border)',
                cursor: 'pointer',
              }}
              onClick={() => setShowDetails(!showDetails)}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px'
                  }}>◎</div>
                  <span style={{ fontWeight: 500 }}>Transaction Request</span>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {showDetails ? '▲ Hide' : '▼ View Details'}
                </span>
              </div>

              {/* Expandable transaction details */}
              {showDetails && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--card-border)'
                }}>
                  <TransactionDetails payload={request.payload} />
                </div>
              )}
            </div>

            {/* Network info */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              overflow: 'hidden',
              marginBottom: '12px',
              border: '1px solid var(--card-border)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid var(--card-border)'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Network</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)'
                  }} />
                  <span style={{ fontWeight: 500 }}>Solana</span>
                </div>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Network Fee</span>
                <span style={{ fontWeight: 500 }}>&lt; 0.00001 SOL</span>
              </div>
            </div>

            {/* Trust warning */}
            <div style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              marginTop: '16px'
            }}>
              Only confirm if you trust this website.
            </div>
          </div>
        )}

        <SignAllTransactionsDetails request={request} />

        {/* Message signing */}
        {request.type === 'sign-message' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem' }}>
              Message Content
            </div>
            <MessageDetails payload={request.payload} />
          </div>
        )}

        {/* Chain switch request */}
        {request.type === 'switch-chain' && request.payload && (
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '16px',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                This site wants to switch your wallet to a different network
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
              }}>
                <div style={{
                  background: 'var(--accent-color)',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}>
                  {(request.payload as { targetNetworkName: string }).targetNetworkName}
                </div>
              </div>
            </div>
            <div
              style={{
                background: '#1e3a8a',
                border: '1px solid #3b82f6',
                borderRadius: '8px',
                padding: '10px',
                marginTop: '12px',
              }}
            >
              <p style={{ fontSize: '0.8rem', color: '#93c5fd', margin: 0 }}>
                ℹ️ Your wallet will be switched to this network for all dApps.
              </p>
            </div>
          </div>
        )}

        {/* Requested by section - shown for non-connect and non-transaction requests */}
        {request.type !== 'connect' && request.type !== 'sign-transaction' && request.type !== 'sign-and-send-transaction' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Requested by
            </div>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              {/* dApp Icon */}
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--card-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0
              }}>
                {request.icon ? (
                  <img
                    src={request.icon}
                    alt={request.hostname}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('google.com/s2/favicons')) {
                        target.src = `https://www.google.com/s2/favicons?domain=${request.origin}&sz=128`;
                      }
                    }}
                  />
                ) : (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${request.origin}&sz=128`}
                    alt={request.hostname}
                    style={{ width: '28px', height: '28px' }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.parentElement!.innerHTML = '<span style="font-size: 16px; color: var(--text-secondary)">?</span>';
                    }}
                  />
                )}
              </div>
              {/* dApp Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {request.hostname}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {request.origin}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons - sticky at bottom */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '12px',
          padding: '20px',
          paddingTop: '16px',
          marginTop: 'auto',
          background: '#0f0f0f',
        }}>
          <button
            onClick={handleReject}
            disabled={isProcessing}
            style={{
              flex: 1,
              background: 'var(--bg-secondary)',
              color: 'white',
              border: '1px solid var(--card-border)',
              borderRadius: '12px',
              padding: '14px 20px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.7 : 1,
            }}
          >
            {request.type === 'sign-transaction' || request.type === 'sign-and-send-transaction' || request.type === 'sign-all-transactions' ? 'Cancel' : 'Reject'}
          </button>
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            style={{
              flex: 1,
              background: request.type === 'sign-transaction' || request.type === 'sign-and-send-transaction' || request.type === 'sign-all-transactions'
                ? '#9945FF' // Purple for transactions
                : 'var(--accent-color)', // Default for connections
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '14px 20px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.7 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {isProcessing ? 'Processing...' : (request.type === 'sign-transaction' || request.type === 'sign-and-send-transaction' || request.type === 'sign-all-transactions' ? 'Confirm' : 'Approve')}
          </button>
        </div>
      </div>
    </div>
  );
}

