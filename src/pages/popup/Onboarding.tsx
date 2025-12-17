import { useState } from 'react';
import { sendMessage } from '../../shared/messaging';
import { Icons } from '../../shared/ui';

type FlowStep = 'welcome' | 'create-password' | 'backup-mnemonic' | 'import-mnemonic';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<FlowStep>('welcome');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Handlers
  const handleStartCreate = () => {
    setError('');
    setStep('create-password');
  };

  const handleStartImport = () => {
    setError('');
    setStep('import-mnemonic');
  };

  const handleCreateVault = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      // Create vault (generates mnemonic in background)
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'manaswap:createVault',
        payload: { password }
      });

      if (!res.success) {
        throw new Error(res.error);
      }

      // Immediately fetch mnemonic for backup
      const revealRes = await sendMessage<{ success: boolean; mnemonic: string }>({
        type: 'manaswap:revealMnemonic',
        payload: { password }
      });

      if (revealRes.success) {
        setGeneratedMnemonic(revealRes.mnemonic);
        setStep('backup-mnemonic');
      } else {
        throw new Error('Failed to retrieve recovery phrase');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create wallet');
    } finally {
      setIsBusy(false);
    }
  };

  const handleImportVault = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    const cleanMnemonic = mnemonicInput.trim();
    if (cleanMnemonic.split(' ').length < 12) {
      setError('Invalid mnemonic phrase (too short)');
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'manaswap:createVault',
        payload: { password, mnemonic: cleanMnemonic }
      });

      if (res.success) {
        onComplete();
      } else {
        setError(res.error || 'Import failed');
      }
    } catch (e: any) {
      setError(e.message || 'Import failed');
    } finally {
      setIsBusy(false);
    }
  };

  const finishBackup = () => {
    // In a real app, we would force the user to re-enter words to verify backup.
    // For this phase, we trust they backed it up.
    onComplete();
  };

  // --- Renders ---

  if (step === 'welcome') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '32px 24px',
        textAlign: 'center',
      }}>
        <div className="logo-container" style={{
          marginBottom: '32px',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)',
            filter: 'blur(20px)',
            zIndex: 0,
          }} />
          <img
            src="/icons/manaswap.png"
            alt="Manaswap Logo"
            style={{
              width: '96px',
              height: '96px',
              position: 'relative',
              zIndex: 1,
              borderRadius: '24px',
            }}
          />
        </div>

        <h1 style={{
          margin: '0 0 12px 0',
          fontSize: '2rem',
          fontWeight: '700',
          background: 'linear-gradient(135deg, var(--text-primary), var(--accent-color))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Manaswap Wallet
        </h1>

        <p style={{
          color: 'var(--text-secondary)',
          margin: '0 0 48px 0',
          fontSize: '1rem',
          lineHeight: '1.6',
          maxWidth: '280px',
        }}>
          Secure, self-custodial wallet for Solana and X1 networks
        </p>

        <div style={{ width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={handleStartCreate}
            className="btn-primary"
            style={{
              padding: '16px',
              fontSize: '1rem',
              fontWeight: '600',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            }}
          >
            Create New Wallet
          </button>
          <button
            onClick={handleStartImport}
            className="btn-secondary"
            style={{
              padding: '16px',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            Import Existing Wallet
          </button>
        </div>
      </div>
    );
  }

  if (step === 'create-password') {
    return (
      <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={() => setStep('welcome')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem',
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: '700' }}>Create Password</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            This password will unlock your wallet on this device
          </p>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="Enter password (min 8 characters)"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--card-bg)',
                border: error && error.includes('Password') ? '2px solid var(--danger-color)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                fontSize: '1rem',
              }}
              autoFocus
            />
            {password.length > 0 && password.length < 8 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--warning-color)', margin: '4px 0 0 0' }}>
                Password must be at least 8 characters
              </p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>
              Confirm Password
            </label>
            <input
              type="password"
              placeholder="Re-enter password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError('');
              }}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--card-bg)',
                border: error && error.includes('match') ? '2px solid var(--danger-color)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                fontSize: '1rem',
              }}
            />
            {confirm.length > 0 && password !== confirm && (
              <p style={{ fontSize: '0.75rem', color: 'var(--danger-color)', margin: '4px 0 0 0' }}>
                Passwords do not match
              </p>
            )}
          </div>

          {error && (
            <div style={{
              padding: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: 'var(--danger-color)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Icons.Warning />
              <span>{error}</span>
            </div>
          )}
        </div>

        <button
          onClick={handleCreateVault}
          disabled={isBusy || !password || password !== confirm || password.length < 8}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '1rem',
            fontWeight: '600',
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {isBusy ? (
            <>
              <div className="loading-spinner" style={{ width: '18px', height: '18px' }} />
              <span>Creating wallet...</span>
            </>
          ) : (
            <span>Continue</span>
          )}
        </button>
      </div>
    );
  }

  const [backedUpConfirmed, setBackedUpConfirmed] = useState(false);

  if (step === 'backup-mnemonic') {
    return (
      <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: '700' }}>Secret Recovery Phrase</h2>
        <p style={{
          color: 'var(--warning-color)',
          margin: '0 0 24px 0',
          fontSize: '0.9rem',
          lineHeight: '1.6',
          padding: '12px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
        }}>
          <Icons.Warning />
          <span>
            <strong>Write these words down and save them securely.</strong> If you lose them, you will lose access to your funds forever. Never share your recovery phrase with anyone.
          </span>
        </p>

        <div className="mnemonic-box" style={{
          marginBottom: '24px',
          padding: '20px',
          background: 'var(--bg-secondary)',
          border: '2px solid rgba(59, 130, 246, 0.3)',
        }}>
          {generatedMnemonic.split(' ').map((word, i) => (
            <div
              key={i}
              className="mnemonic-word"
              style={{
                padding: '10px 12px',
                background: 'var(--card-bg)',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
              onClick={() => {
                navigator.clipboard.writeText(word);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--card-hover)';
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--card-bg)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              }}
            >
              <span className="word-index" style={{ color: 'var(--text-muted)', marginRight: '6px' }}>{i + 1}.</span>
              {word}
            </div>
          ))}
        </div>

        <div style={{
          padding: '16px',
          background: 'var(--card-bg)',
          borderRadius: '12px',
          marginBottom: '24px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}>
          <label className="checkbox-row" style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            cursor: 'pointer',
            margin: 0,
          }}>
            <input
              type="checkbox"
              id="backed-up"
              checked={backedUpConfirmed}
              onChange={(e) => setBackedUpConfirmed(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                marginTop: '2px',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-primary)' }}>
              I have written down my recovery phrase and stored it in a safe place. I understand that if I lose it, I will lose access to my wallet forever.
            </span>
          </label>
        </div>

        <button
          onClick={finishBackup}
          disabled={!backedUpConfirmed}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '1rem',
            fontWeight: '600',
            marginTop: 'auto',
          }}
        >
          I've Backed It Up - Continue
        </button>
      </div>
    );
  }

  if (step === 'import-mnemonic') {
    const wordCount = mnemonicInput.trim().split(/\s+/).filter(w => w.length > 0).length;
    const isValidLength = wordCount === 12 || wordCount === 24;

    return (
      <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setStep('welcome')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem',
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: '700' }}>Import Wallet</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Enter your 12 or 24-word secret recovery phrase
          </p>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>
              Recovery Phrase
            </label>
            <textarea
              placeholder="Enter your recovery phrase (12 or 24 words)"
              className="mnemonic-input"
              value={mnemonicInput}
              onChange={(e) => {
                setMnemonicInput(e.target.value);
                setError('');
              }}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '14px 16px',
                background: 'var(--card-bg)',
                border: error && error.includes('mnemonic') ? '2px solid var(--danger-color)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                fontSize: '0.95rem',
                fontFamily: 'monospace',
                resize: 'vertical',
                lineHeight: '1.6',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <p style={{
                fontSize: '0.75rem',
                color: wordCount > 0 && !isValidLength ? 'var(--warning-color)' : 'var(--text-muted)',
                margin: 0,
              }}>
                {wordCount > 0 ? `${wordCount} words` : 'Enter your recovery phrase'}
              </p>
              {wordCount > 0 && !isValidLength && (
                <p style={{ fontSize: '0.75rem', color: 'var(--warning-color)', margin: 0 }}>
                  Must be 12 or 24 words
                </p>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>
              Set Password
            </label>
            <input
              type="password"
              placeholder="Enter password (min 8 characters)"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--card-bg)',
                border: error && error.includes('Password') ? '2px solid var(--danger-color)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                fontSize: '1rem',
                marginBottom: '12px',
              }}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError('');
              }}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--card-bg)',
                border: error && error.includes('match') ? '2px solid var(--danger-color)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                fontSize: '1rem',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: 'var(--danger-color)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Icons.Warning />
              <span>{error}</span>
            </div>
          )}
        </div>

        <button
          onClick={handleImportVault}
          disabled={isBusy || !isValidLength || !password || password !== confirm || password.length < 8}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '1rem',
            fontWeight: '600',
            marginTop: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {isBusy ? (
            <>
              <div className="loading-spinner" style={{ width: '18px', height: '18px' }} />
              <span>Importing wallet...</span>
            </>
          ) : (
            <span>Import Wallet</span>
          )}
        </button>
      </div>
    );
  }

  return null;
}