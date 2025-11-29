import { useState } from 'react';
import { sendMessage } from '../../shared/messaging';
import { Icons } from '../../shared/ui';

export function Unlock({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    setError('');

    try {
      const res = await sendMessage<{ success: boolean; error?: string }>({
        type: 'manaswap:unlockVault',
        payload: { password }
      });

      if (res.success) {
        onUnlock();
      } else {
        setError(res.error || 'Incorrect password');
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unlock failed';
      setError(errorMessage);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
      minHeight: '100%',
      width: '100%',
      padding: '24px',
      textAlign: 'center',
      background: 'radial-gradient(circle at 50% 0%, #1e293b 0%, #000000 80%)',
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
            width: '80px',
            height: '80px',
            position: 'relative',
            zIndex: 1,
            borderRadius: '20px',
          }}
        />
      </div>

      <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: '700' }}>Unlock Wallet</h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 32px 0', fontSize: '0.9rem' }}>
        Enter your password to access your wallet
      </p>

      <div style={{ width: '100%', maxWidth: '320px' }}>
        <div style={{ marginBottom: '16px' }}>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && password && !isUnlocking && handleUnlock()}
            disabled={isUnlocking}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: error ? '1px solid var(--danger-color)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              transition: 'all 0.2s',
              textAlign: 'center',
            }}
            autoFocus
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
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}>
            <Icons.Warning />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleUnlock}
          disabled={isUnlocking || !password}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '1rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'white',
            color: 'black',
            border: 'none',
          }}
        >
          {isUnlocking ? (
            <>
              <div className="loading-spinner" style={{ width: '18px', height: '18px', borderColor: 'rgba(0,0,0,0.2)', borderTopColor: 'black' }} />
              <span>Unlocking...</span>
            </>
          ) : (
            <>
              <Icons.Lock size={18} />
              <span>Unlock</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
