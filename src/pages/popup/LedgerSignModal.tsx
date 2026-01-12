import { useState, useEffect } from 'react';
import { signTransactionLedger, signMessageLedger } from './ledger';

interface LedgerSignModalProps {
    derivationPath: string;
    payload: number[];
    type: 'transaction' | 'message';
    onSuccess: (signature: Uint8Array) => void;
    onCancel: () => void;
}

type SigningStatus = 'connecting' | 'waiting' | 'signing' | 'success' | 'error';

const STATUS_MESSAGES: Record<SigningStatus, string> = {
    connecting: 'Connect your Ledger device...',
    waiting: 'Open the Solana app on your Ledger',
    signing: 'Approve the transaction on your Ledger device',
    success: 'Signed successfully!',
    error: 'Signing failed',
};

export function LedgerSignModal({ derivationPath, payload, type, onSuccess, onCancel }: LedgerSignModalProps) {
    const [status, setStatus] = useState<SigningStatus>('connecting');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function sign() {
            try {
                setStatus('connecting');

                // Small delay to show connecting status
                await new Promise(r => setTimeout(r, 500));
                if (cancelled) return;

                setStatus('signing');

                const buffer = Buffer.from(payload);
                const signature = type === 'transaction'
                    ? await signTransactionLedger(derivationPath, buffer)
                    : await signMessageLedger(derivationPath, buffer);

                if (cancelled) return;

                setStatus('success');
                setTimeout(() => {
                    if (!cancelled) {
                        onSuccess(new Uint8Array(signature));
                    }
                }, 500);
            } catch (e: any) {
                if (cancelled) return;
                console.error('[LedgerSign] Error:', e);
                setStatus('error');

                // Parse common Ledger errors
                let errorMsg = e.message || 'Unknown error';
                if (errorMsg.includes('0x6985')) {
                    errorMsg = 'Transaction rejected on device';
                } else if (errorMsg.includes('0x5515')) {
                    errorMsg = 'Device is locked - please unlock your Ledger';
                } else if (errorMsg.includes('0x6D02') || errorMsg.includes('0x6511')) {
                    errorMsg = 'Please open the Solana app on your Ledger';
                } else if (errorMsg.includes('requestDevice')) {
                    errorMsg = 'Please connect your Ledger and try again';
                }

                setError(errorMsg);
            }
        }

        sign();

        return () => {
            cancelled = true;
        };
    }, [derivationPath, payload, type, onSuccess]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#0f0f0f',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 10000,
        }}>
            {/* Ledger Icon */}
            <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: status === 'error' ? 'rgba(255, 100, 100, 0.2)' : 'rgba(149, 69, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '24px',
            }}>
                {status === 'error' ? (
                    <span style={{ fontSize: '36px' }}>❌</span>
                ) : status === 'success' ? (
                    <span style={{ fontSize: '36px' }}>✅</span>
                ) : (
                    <div style={{
                        width: '40px',
                        height: '40px',
                        border: '3px solid #9945FF',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }} />
                )}
            </div>

            {/* Status text */}
            <h2 style={{
                margin: '0 0 12px',
                fontSize: '1.3rem',
                textAlign: 'center',
            }}>
                {status === 'error' ? 'Signing Failed' : 'Approve on Ledger'}
            </h2>

            <p style={{
                color: 'var(--text-secondary)',
                textAlign: 'center',
                margin: '0 0 32px',
                maxWidth: '280px',
            }}>
                {error || STATUS_MESSAGES[status]}
            </p>

            {/* Buttons */}
            <div style={{
                display: 'flex',
                gap: '12px',
                width: '100%',
                maxWidth: '320px',
            }}>
                <button
                    onClick={onCancel}
                    style={{
                        flex: 1,
                        background: 'var(--bg-secondary)',
                        color: 'white',
                        border: '1px solid var(--card-border)',
                        borderRadius: '12px',
                        padding: '14px 20px',
                        fontSize: '1rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Cancel
                </button>

                {status === 'error' && (
                    <button
                        onClick={() => {
                            setStatus('connecting');
                            setError(null);
                            // Re-trigger the effect by updating a key (would need component remount)
                            window.location.reload();
                        }}
                        style={{
                            flex: 1,
                            background: '#9945FF',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '14px 20px',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Retry
                    </button>
                )}
            </div>

            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
