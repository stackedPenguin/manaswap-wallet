import { useState } from 'react';
import type { PendingRequest } from '../../shared/types';
import { sendMessage } from '../../shared/messaging';

interface DAppApprovalModalProps {
  request: PendingRequest;
  onApprove: () => void;
  onReject: () => void;
}

export function DAppApprovalModal({ request, onApprove, onReject }: DAppApprovalModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

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
      default:
        return 'Request';
    }
  };

  const getRequestDescription = () => {
    switch (request.type) {
      case 'connect':
        return `${request.hostname} wants to connect to your wallet. This will allow the site to view your public address.`;
      case 'sign-transaction':
        return `${request.hostname} wants you to sign a transaction. Review the transaction details carefully before approving.`;
      case 'sign-all-transactions':
        return `${request.hostname} wants you to sign multiple transactions. Review each transaction carefully before approving.`;
      case 'sign-message':
        return `${request.hostname} wants you to sign a message. Make sure you trust this request.`;
      default:
        return 'Unknown request type';
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
        zIndex: 10000,
        padding: '16px',
      }}
      onClick={onReject}
    >
      <div
        className="card"
        style={{
          maxWidth: '400px',
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{getRequestTitle()}</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px' }}>
            {getRequestDescription()}
          </p>
          <div
            style={{
              background: '#0f172a',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #334155',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ marginBottom: '4px', color: '#94a3b8' }}>Site:</div>
            <div style={{ fontWeight: '600' }}>{request.hostname}</div>
            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#64748b' }}>
              {request.origin}
            </div>
          </div>
        </div>

        {request.type === 'connect' && (
          <div
            style={{
              background: '#1e3a8a',
              border: '1px solid #3b82f6',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
            }}
          >
            <p style={{ fontSize: '0.85rem', color: '#93c5fd', margin: 0, lineHeight: '1.5' }}>
              ⚠️ Only connect to sites you trust. Connected sites can view your public address and request transaction signatures.
            </p>
          </div>
        )}

        {(request.type === 'sign-transaction' || request.type === 'sign-all-transactions') && (
          <div
            style={{
              background: '#7f1d1d',
              border: '1px solid #991b1b',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
            }}
          >
            <p style={{ fontSize: '0.85rem', color: '#fca5a5', margin: 0, lineHeight: '1.5' }}>
              ⚠️ Review transaction details carefully. Only sign if you understand what the transaction will do.
            </p>
          </div>
        )}

        <div className="btn-row">
          <button
            onClick={handleReject}
            disabled={isProcessing}
            className="btn-secondary"
            style={{ flex: 1 }}
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="btn-primary"
            style={{ flex: 1 }}
          >
            {isProcessing ? 'Processing...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

