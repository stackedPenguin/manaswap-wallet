import { useState } from 'react';

export interface EvmApprovalData {
  popupId: string;
  type: 'connect' | 'sign' | 'typedData' | 'transaction';
  origin: string;
  hostname?: string;
  address?: string;
  message?: string;
  to?: string;
  value?: string;
  data?: string;
  network?: string;
}

interface EvmApprovalModalProps {
  data: EvmApprovalData;
  onApprove: () => void;
  onReject: () => void;
}

function truncateAddress(address?: string): string {
  if (!address) return '';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEther(value?: string): string {
  if (!value || value === '0' || value === '0x0') return '0';
  try {
    // Convert from wei (hex or decimal string) to ETH
    const wei = value.startsWith('0x') ? BigInt(value) : BigInt(value);
    const eth = Number(wei) / 1e18;
    if (eth === 0) return '0';
    if (eth < 0.0001) return '< 0.0001';
    return eth.toFixed(6).replace(/\.?0+$/, '');
  } catch {
    return value;
  }
}

function getDomainFromOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return origin;
  }
}

export function EvmApprovalModal({ data, onApprove, onReject }: EvmApprovalModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject();
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    switch (data.type) {
      case 'connect':
        return (
          <div className="evm-approval-content">
            <div className="evm-approval-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </div>
            <h2 className="evm-approval-title">Connect to {data.hostname || getDomainFromOrigin(data.origin)}</h2>
            <p className="evm-approval-origin">{data.origin}</p>

            <div className="evm-approval-permissions">
              <p className="permissions-label">This site wants to:</p>
              <ul>
                <li>View your wallet address</li>
                <li>Request approval for transactions</li>
              </ul>
            </div>

            <div className="evm-approval-account">
              <span className="account-label">Connecting as:</span>
              <span className="account-address">{truncateAddress(data.address)}</span>
            </div>
          </div>
        );

      case 'sign':
        return (
          <div className="evm-approval-content">
            <div className="evm-approval-icon warning">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h2 className="evm-approval-title">Sign Message</h2>
            <p className="evm-approval-origin">{data.hostname || getDomainFromOrigin(data.origin)}</p>

            <div className="evm-approval-message">
              <p className="message-label">Message:</p>
              <pre className="message-content">{data.message || '(empty message)'}</pre>
            </div>

            <div className="evm-approval-warning">
              Only sign messages you understand. Malicious messages can steal your funds.
            </div>
          </div>
        );

      case 'typedData':
        return (
          <div className="evm-approval-content">
            <div className="evm-approval-icon warning">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h2 className="evm-approval-title">Sign Typed Data</h2>
            <p className="evm-approval-origin">{data.hostname || getDomainFromOrigin(data.origin)}</p>

            <div className="evm-approval-warning">
              This request involves signing structured data. Review carefully before signing.
            </div>
          </div>
        );

      case 'transaction':
        // Check if this is a token approval (ERC-20 approve function)
        const isTokenApproval = data.data?.startsWith('0x095ea7b3');
        return (
          <div className="evm-approval-content">
            <div className="evm-approval-icon transaction">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <h2 className="evm-approval-title">{isTokenApproval ? 'Token Approval' : 'Confirm Transaction'}</h2>
            <p className="evm-approval-origin">{data.hostname || getDomainFromOrigin(data.origin)}</p>

            <div className="evm-approval-tx-details">
              {isTokenApproval && (
                <div className="tx-row">
                  <span className="tx-label">Action:</span>
                  <span className="tx-value">Approve token spending</span>
                </div>
              )}
              {data.to && (
                <div className="tx-row">
                  <span className="tx-label">{isTokenApproval ? 'Token:' : 'To:'}</span>
                  <span className="tx-value">{truncateAddress(data.to)}</span>
                </div>
              )}
              {data.value && data.value !== '0' && data.value !== '0x0' && (
                <div className="tx-row">
                  <span className="tx-label">Value:</span>
                  <span className="tx-value">{formatEther(data.value)} ETH</span>
                </div>
              )}
              {data.network && (
                <div className="tx-row">
                  <span className="tx-label">Network:</span>
                  <span className="tx-value">{data.network}</span>
                </div>
              )}
            </div>

            <div className="evm-approval-warning">
              {isTokenApproval
                ? 'This will allow the contract to spend tokens on your behalf.'
                : 'Review transaction details carefully. This action cannot be undone.'}
            </div>
          </div>
        );

      default:
        return (
          <div className="evm-approval-content">
            <h2 className="evm-approval-title">Unknown Request</h2>
            <p>Request type: {data.type}</p>
          </div>
        );
    }
  };

  return (
    <div className="evm-approval-overlay">
      <div className="evm-approval-modal">
        {renderContent()}

        <div className="evm-approval-buttons">
          <button
            className="evm-btn-reject"
            onClick={handleReject}
            disabled={isSubmitting}
          >
            Reject
          </button>
          <button
            className="evm-btn-approve"
            onClick={handleApprove}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
