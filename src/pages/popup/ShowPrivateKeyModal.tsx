import { useState } from 'react';
import { sendMessage } from '../../shared/messaging';

interface ShowPrivateKeyModalProps {
  accountAddress: string;
  accountIndex: number;
  onClose: () => void;
}

export function ShowPrivateKeyModal({ accountAddress, accountIndex, onClose }: ShowPrivateKeyModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [copyLogged, setCopyLogged] = useState(false);

  const handleReveal = async () => {
    setIsLoading(true);
    setError('');

    try {
      const res = await sendMessage<{ success: boolean; privateKey?: string; error?: string }>({
        type: 'manaswap:revealPrivateKey',
        payload: { password, accountAddress }
      });

      if (res.success && res.privateKey) {
        setPrivateKey(res.privateKey);
        // Log the reveal action
        console.log(`[Manaswap] Private key revealed for account ${accountIndex} at ${new Date().toISOString()}`);
      } else {
        setError(res.error || 'Failed to reveal private key');
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to reveal private key';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!privateKey) return;

    try {
      await navigator.clipboard.writeText(privateKey);
      setHasCopied(true);

      // Log the copy action (as per PRD requirement)
      if (!copyLogged) {
        console.log(`[Manaswap] Private key copied to clipboard for account ${accountIndex} at ${new Date().toISOString()}`);
        setCopyLogged(true);
      }

      // Reset the "copied" state after 2 seconds
      setTimeout(() => setHasCopied(false), 2000);
    } catch (e) {
      console.error('[Manaswap] Failed to copy private key', e);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2>Show Private Key</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {!privateKey ? (
          <>
            <div
              style={{
                background: '#7f1d1d',
                border: '1px solid #991b1b',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <p style={{ color: '#fca5a5', fontSize: '0.9rem', margin: 0, fontWeight: '600' }}>
                ⚠️ WARNING: Security Risk
              </p>
              <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: '8px 0 0 0', lineHeight: '1.5' }}>
                Never share your private key with anyone. Anyone with access to this key can control your wallet and steal your funds. Only reveal your private key if you need to export it to another wallet or recover access.
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Account Address:
              </p>
              <div
                style={{
                  background: '#0f172a',
                  padding: '8px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  wordBreak: 'break-all',
                  border: '1px solid #334155',
                }}
              >
                {accountAddress}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="private-key-password" style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                Enter your password to reveal the private key:
              </label>
              <input
                id="private-key-password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && password && handleReveal()}
                style={{ marginBottom: '8px' }}
              />
            </div>

            {error && (
              <div className="error-msg" style={{ marginBottom: '12px' }}>
                {error}
              </div>
            )}

            <div className="btn-row">
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
                {isLoading ? 'Verifying...' : 'Reveal Private Key'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                background: '#7f1d1d',
                border: '1px solid #991b1b',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <p style={{ color: '#fca5a5', fontSize: '0.85rem', margin: 0, lineHeight: '1.5' }}>
                ⚠️ Keep this private key secure and never share it. Anyone with access can control your wallet.
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '600' }}>
                Your Private Key (Base64):
              </label>
              <div
                style={{
                  background: '#0f172a',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  wordBreak: 'break-all',
                  border: '1px solid #334155',
                  fontFamily: 'monospace',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  marginBottom: '8px',
                }}
              >
                {privateKey}
              </div>
              <button
                onClick={handleCopy}
                className={hasCopied ? 'btn-primary' : 'btn-secondary'}
                style={{ width: '100%' }}
              >
                {hasCopied ? '✓ Copied to Clipboard' : 'Copy Private Key'}
              </button>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #334155' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                This action has been logged for security purposes. Make sure to store this key in a secure location if you need it for recovery.
              </p>
            </div>

            <button
              onClick={onClose}
              className="btn-primary"
              style={{ width: '100%', marginTop: '16px' }}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

