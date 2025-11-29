import { useState } from 'react';
import { sendMessage } from '../../shared/messaging';
import { Icons } from '../../shared/ui';

interface RestoreWalletModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export function RestoreWalletModal({ onClose, onSuccess }: RestoreWalletModalProps) {
    const [step, setStep] = useState<'input' | 'restoring' | 'discovering' | 'success'>('input');
    const [mnemonic, setMnemonic] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [discoveredCount, setDiscoveredCount] = useState(0);

    const handleRestore = async () => {
        if (!mnemonic.trim()) {
            setError('Please enter your recovery phrase');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        try {
            setStep('restoring');
            await sendMessage({
                type: 'manaswap:restoreVault',
                payload: { mnemonic: mnemonic.trim(), password }
            });

            setStep('discovering');
            // Start discovery on Mainnet Beta (default)
            const res = await sendMessage<{ success: boolean; count: number }>({
                type: 'manaswap:discoverAccounts',
                payload: { networkId: 'solana-mainnet' }
            });

            if (res.success) {
                setDiscoveredCount(res.count);
                setStep('success');
            } else {
                throw new Error('Discovery failed');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to restore wallet');
            setStep('input');
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(4px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: '16px',
                padding: '24px',
                width: '100%',
                maxWidth: '400px',
                border: '1px solid var(--card-border)',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            }}>
                {step === 'input' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0 }}>Import Recovery Phrase</h3>
                            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <Icons.Close />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px' }}>
                                <Icons.Warning />
                                <div>Warning: This will wipe your current wallet. Make sure you have backed it up!</div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Recovery Phrase</label>
                                <textarea
                                    value={mnemonic}
                                    onChange={(e) => setMnemonic(e.target.value)}
                                    placeholder="Enter your 12 or 24-word recovery phrase"
                                    style={{
                                        width: '100%',
                                        height: '80px',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        background: 'var(--input-bg)',
                                        border: '1px solid var(--input-border)',
                                        color: 'var(--text-primary)',
                                        resize: 'none',
                                        fontFamily: 'monospace'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>New Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="At least 8 characters"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Confirm Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm password"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            {error && <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>{error}</div>}

                            <button
                                className="btn-primary"
                                onClick={handleRestore}
                                disabled={!mnemonic || !password || !confirmPassword}
                                style={{ width: '100%', padding: '12px' }}
                            >
                                Import Wallet
                            </button>
                        </div>
                    </>
                )}

                {step === 'restoring' && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div className="loading-spinner" style={{ width: '40px', height: '40px', margin: '0 auto 20px' }} />
                        <h3>Restoring Wallet...</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>Verifying recovery phrase and encrypting vault.</p>
                    </div>
                )}

                {step === 'discovering' && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div className="loading-spinner" style={{ width: '40px', height: '40px', margin: '0 auto 20px' }} />
                        <h3>Discovering Accounts...</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>Scanning blockchain for your active accounts.</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>This may take a minute.</p>
                    </div>
                )}

                {step === 'success' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ width: '60px', height: '60px', background: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <Icons.Check />
                        </div>
                        <h3>Wallet Imported!</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                            Successfully restored wallet and found <strong>{discoveredCount}</strong> active account(s).
                        </p>
                        <button
                            className="btn-primary"
                            onClick={onSuccess}
                            style={{ width: '100%', padding: '12px' }}
                        >
                            Start Using Wallet
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
