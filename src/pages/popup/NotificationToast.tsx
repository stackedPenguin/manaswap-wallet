import { useEffect, useState } from 'react';
import { NETWORKS } from '../../shared/networks';
import type { Notification } from '../../shared/types';

interface NotificationToastProps {
  notification: Notification | null;
  onDismiss: () => void;
}

export function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      const duration = notification.duration || 5000;
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 300); // Wait for fade-out animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [notification, onDismiss]);

  if (!notification || !isVisible) {
    return null;
  }

  const network = notification.networkId
    ? NETWORKS.find((n) => n.id === notification.networkId)
    : null;

  const getTypeStyles = () => {
    switch (notification.type) {
      case 'network-switch':
        return {
          bg: '#1e3a8a',
          border: '#3b82f6',
          icon: '🔄',
        };
      case 'detection':
        return {
          bg: '#1e293b',
          border: '#64748b',
          icon: '🔍',
        };
      case 'warning':
        return {
          bg: '#7f1d1d',
          border: '#ef4444',
          icon: '⚠️',
        };
      default:
        return {
          bg: '#1e293b',
          border: '#334155',
          icon: 'ℹ️',
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        right: '16px',
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        zIndex: 10000,
        animation: isVisible ? 'slideUp 0.3s ease-out' : 'slideDown 0.3s ease-out',
        maxWidth: '328px',
        margin: '0 auto',
      }}
    >
      <style>
        {`
          @keyframes slideUp {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          @keyframes slideDown {
            from {
              transform: translateY(0);
              opacity: 1;
            }
            to {
              transform: translateY(100%);
              opacity: 0;
            }
          }
        `}
      </style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{styles.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4' }}>
            {notification.message}
          </p>
          {network && (
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              {network.label}
            </p>
          )}
          {notification.actionLabel && notification.onAction && (
            <button
              onClick={() => {
                notification.onAction?.();
                setIsVisible(false);
                setTimeout(onDismiss, 300);
              }}
              style={{
                marginTop: '8px',
                padding: '4px 8px',
                fontSize: '0.75rem',
                background: 'transparent',
                border: `1px solid ${styles.border}`,
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              {notification.actionLabel}
            </button>
          )}
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onDismiss, 300);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '1.2rem',
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

