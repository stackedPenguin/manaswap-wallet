import { useState, useEffect } from 'react';
import { sendMessage } from '../../shared/messaging';
import { Icons } from '../../shared/ui';
import { LedgerConnectModal, TrezorConnectModal } from './AccountManagement';

type FlowStep = 'welcome' | 'create-password' | 'backup-mnemonic' | 'import-mnemonic' | 'import-privkey' | 'success';

export function Onboarding({ onComplete: _onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<FlowStep>('welcome');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [backedUpConfirmed, setBackedUpConfirmed] = useState(false);
  const [mnemonicLength, setMnemonicLength] = useState<12 | 24>(12);
  const [mnemonicWords, setMnemonicWords] = useState<string[]>(Array(12).fill(''));
  const [privateKey, setPrivateKey] = useState('');
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [showTrezorModal, setShowTrezorModal] = useState(false);

  // Reset mnemonic words array when length changes
  useEffect(() => {
    setMnemonicWords(Array(mnemonicLength).fill(''));
  }, [mnemonicLength]);

  // Paste handler for word boxes
  const handlePaste = (e: React.ClipboardEvent, index: number) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const words = pastedData.trim().split(/\s+/);

    if (words.length > 1) {
      const newWords = [...mnemonicWords];
      words.forEach((word, i) => {
        if (index + i < newWords.length) {
          newWords[index + i] = word;
        }
      });
      setMnemonicWords(newWords);
    } else {
      const newWords = [...mnemonicWords];
      newWords[index] = pastedData.trim();
      setMnemonicWords(newWords);
    }
  };

  // Word change handler
  const handleWordChange = (index: number, value: string) => {
    const newWords = [...mnemonicWords];
    newWords[index] = value;
    setMnemonicWords(newWords);
  };

  // Handlers
  const handleStartCreate = () => {
    setError('');
    setStep('create-password');
  };

  const handleStartImport = () => {
    setError('');
    setStep('import-mnemonic');
  };

  const handleStartImportPK = () => {
    setError('');
    setStep('import-privkey');
  };

  const handleImportPrivateKey = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!privateKey.trim()) {
      setError('Please enter a private key');
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      // First create vault with password
      const vaultRes = await sendMessage<{ success: boolean; error?: string }>({
        type: 'manaswap:createVault',
        payload: { password }
      });

      if (!vaultRes.success) {
        throw new Error(vaultRes.error || 'Failed to create vault');
      }

      // Then import the private key
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'manaswap:addKeySource',
        payload: { type: 'privateKey', value: privateKey.trim(), label: 'Imported Account' }
      });

      if (res.success) {
        setStep('success');
      } else {
        setError(res.error || 'Failed to import private key');
      }
    } catch (e: any) {
      setError(e.message || 'Import failed');
    } finally {
      setIsBusy(false);
    }
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
    const cleanMnemonic = mnemonicWords.join(' ').trim();
    const wordCount = cleanMnemonic.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount !== mnemonicLength) {
      setError(`Please enter all ${mnemonicLength} words`);
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
        setStep('success');
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
    // For this phase, we trust they backed it up.
    setStep('success');
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
            Import Recovery Phrase
          </button>
          <button
            onClick={handleStartImportPK}
            className="btn-secondary"
            style={{
              padding: '16px',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            Import Private Key
          </button>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              onClick={() => setShowLedgerModal(true)}
              className="btn-secondary"
              style={{
                flex: 1,
                padding: '14px',
                fontSize: '0.9rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Icons.Hardware size={18} />
              Ledger
            </button>
            <button
              onClick={() => setShowTrezorModal(true)}
              className="btn-secondary"
              style={{
                flex: 1,
                padding: '14px',
                fontSize: '0.9rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Icons.Hardware size={18} />
              Trezor
            </button>
          </div>
        </div>

        {showLedgerModal && (
          <LedgerConnectModal
            onClose={() => setShowLedgerModal(false)}
            onSuccess={() => {
              setShowLedgerModal(false);
              setShowLedgerModal(false);
              setStep('success');
            }}
          />
        )}

        {showTrezorModal && (
          <TrezorConnectModal
            onClose={() => setShowTrezorModal(false)}
            onSuccess={() => {
              setShowTrezorModal(false);
              setShowTrezorModal(false);
              setStep('success');
            }}
          />
        )}
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
    const filledWordCount = mnemonicWords.filter(w => w.trim().length > 0).length;

    return (
      <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setStep('welcome')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '8px',
              marginBottom: '12px',
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
          {/* Word Length Toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <button
              onClick={() => setMnemonicLength(12)}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                background: mnemonicLength === 12 ? 'var(--text-primary)' : 'var(--card-bg)',
                color: mnemonicLength === 12 ? 'black' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.85rem',
                transition: 'all 0.2s',
              }}
            >
              12 Words
            </button>
            <button
              onClick={() => setMnemonicLength(24)}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                background: mnemonicLength === 24 ? 'var(--text-primary)' : 'var(--card-bg)',
                color: mnemonicLength === 24 ? 'black' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.85rem',
                transition: 'all 0.2s',
              }}
            >
              24 Words
            </button>
          </div>

          {/* Word Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            maxHeight: mnemonicLength === 24 ? '240px' : 'auto',
            overflowY: mnemonicLength === 24 ? 'auto' : 'visible',
            paddingRight: mnemonicLength === 24 ? '4px' : '0'
          }}>
            {mnemonicWords.map((word, index) => (
              <div key={index} style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  pointerEvents: 'none'
                }}>
                  {index + 1}.
                </span>
                <input
                  type="text"
                  value={word}
                  onChange={(e) => handleWordChange(index, e.target.value)}
                  onPaste={(e) => handlePaste(e, index)}
                  style={{
                    width: '100%',
                    padding: '10px 8px 10px 28px',
                    fontSize: '0.85rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    marginBottom: 0
                  }}
                />
              </div>
            ))}
          </div>

          {/* Word Count */}
          <p style={{
            fontSize: '0.75rem',
            color: filledWordCount > 0 && filledWordCount < mnemonicLength ? 'var(--warning-color)' : 'var(--text-muted)',
            margin: 0,
            textAlign: 'center'
          }}>
            {filledWordCount > 0 ? `${filledWordCount} of ${mnemonicLength} words entered` : 'Paste your recovery phrase to auto-fill'}
          </p>

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
          disabled={isBusy || filledWordCount !== mnemonicLength || !password || password !== confirm || password.length < 8}
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

  if (step === 'import-privkey') {
    return (
      <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setStep('welcome')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '8px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem',
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: '700' }}>Import Private Key</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Enter your private key and set a password
          </p>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>
              Private Key
            </label>
            <textarea
              placeholder="Enter private key (Base58 or JSON array format)"
              value={privateKey}
              onChange={(e) => {
                setPrivateKey(e.target.value);
                setError('');
              }}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--card-bg)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                height: '80px',
                resize: 'none',
              }}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Supports Base58 or JSON array format [x,x,x,...]
            </p>
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
          onClick={handleImportPrivateKey}
          disabled={isBusy || !privateKey.trim() || !password || password !== confirm || password.length < 8}
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
              <span>Importing...</span>
            </>
          ) : (
            <span>Import Wallet</span>
          )}
        </button>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div style={{
        padding: '32px 24px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(34, 197, 94, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          color: '#4ade80'
        }}>
          <Icons.CheckCircle size={48} />
        </div>

        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.75rem', fontWeight: '700' }}>
          All Set!
        </h2>

        <p style={{
          color: 'var(--text-secondary)',
          margin: '0 0 32px 0',
          fontSize: '1rem',
          lineHeight: '1.6',
          maxWidth: '300px'
        }}>
          Your wallet has been successfully created and is ready to use.
        </p>

        <div style={{
          background: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '32px',
          border: '1px solid var(--card-border)',
          width: '100%'
        }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', textAlign: 'left' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--text-primary)',
              color: 'black',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '0.8rem',
              flexShrink: 0
            }}>1</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Click the Manaswap icon in your browser toolbar to access your wallet
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', textAlign: 'left' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--text-primary)',
              color: 'black',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '0.8rem',
              flexShrink: 0
            }}>2</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              You may close this window now
            </div>
          </div>
        </div>

        <button
          onClick={() => window.close()}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '1rem',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
          }}
        >
          Done
        </button>
      </div >
    );
  }

  return null;
}