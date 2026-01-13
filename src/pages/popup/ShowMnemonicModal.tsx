import { useState } from 'react';
import { sendMessage } from '../../shared/messaging';

interface ShowMnemonicModalProps {
    onClose: () => void;
}

export function ShowMnemonicModal({ onClose }: ShowMnemonicModalProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mnemonic, setMnemonic] = useState<string | null>(null);
    const [hasCopied, setHasCopied] = useState(false);

    const handleReveal = async () => {
        setIsLoading(true);
        setError('');

        try {
            const res = await sendMessage<{ success: boolean; mnemonic?: string; error?: string }>({
                type: 'manaswap:revealMnemonic',
                payload: { password }
            });

            if (res.success && res.mnemonic) {
                setMnemonic(res.mnemonic);
            } else {
                setError(res.error || 'Failed to reveal recovery phrase');
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Failed to reveal recovery phrase';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!mnemonic) return;

        try {
            await navigator.clipboard.writeText(mnemonic);
            setHasCopied(true);
            setTimeout(() => setHasCopied(false), 2000);
        } catch (e) {
            console.error('[Manaswap] Failed to copy mnemonic', e);
            setError('Failed to copy to clipboard');
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
                zIndex: 1100, // Higher than AccountManagement
                padding: '16px',
                backdropFilter: 'blur(4px)'
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
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--card-border)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Show Recovery Phrase</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            padding: '0',
                        }}
                    >
                        ×
                    </button>
                </div>

                {!mnemonic ? (
                    <>
                        <div
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '8px',
                                padding: '12px',
                                marginBottom: '16px',
                            }}
                        >
                            <p style={{ color: '#ef4444', fontSize: '0.9rem', margin: 0, fontWeight: '600' }}>
                                ⚠️ Security Warning
                            </p>
                            <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '8px 0 0 0', lineHeight: '1.4' }}>
                                Your recovery phrase (seed phrase) can fully restore your wallet. Never share it with anyone.
                                Manaswap support will NEVER ask for this phrase.
                            </p>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label htmlFor="mnemonic-password" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                                Enter password to view:
                            </label>
                            <input
                                id="mnemonic-password"
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && password && handleReveal()}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--bg-color)', color: 'white' }}
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="error-msg" style={{ marginBottom: '12px' }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={onClose}
                                className="btn-secondary"
                                style={{ flex: 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReveal}
                                disabled={isLoading || !password}
                                className="btn-primary"
                                style={{ flex: 1 }}
                            >
                                {isLoading ? 'Verifying...' : 'Reveal Phrase'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ marginBottom: '20px' }}>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px', textAlign: 'center' }}>
                                Write these words down in order and store them safely.
                            </p>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '8px',
                                marginBottom: '16px'
                            }}>
                                {mnemonic.split(' ').map((word, i) => (
                                    <div key={i} style={{
                                        background: '#000',
                                        border: '1px solid var(--card-border)',
                                        borderRadius: '6px',
                                        padding: '8px 4px',
                                        textAlign: 'center',
                                        fontSize: '0.85rem',
                                        position: 'relative'
                                    }}>
                                        <span style={{
                                            position: 'absolute',
                                            top: '2px',
                                            left: '4px',
                                            fontSize: '0.6rem',
                                            color: 'var(--text-secondary)',
                                            opacity: 0.7
                                        }}>{i + 1}</span>
                                        {word}
                                    </div>
                                ))}
                            </div>

                            <div style={{ background: '#000', padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', marginBottom: '16px' }}>
                                <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Full Phrase:</p>
                                <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', lineHeight: '1.4', wordBreak: 'break-word', userSelect: 'text' }}>
                                    {mnemonic}
                                </div>
                            </div>

                            <button
                                onClick={handleCopy}
                                className={hasCopied ? 'btn-primary' : 'btn-secondary'}
                                style={{ width: '100%' }}
                            >
                                {hasCopied ? '✓ Copied to Clipboard' : 'Copy Full Phrase'}
                            </button>
                        </div>

                        <button
                            onClick={onClose}
                            className="btn-primary"
                            style={{ width: '100%' }}
                        >
                            Done
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
