import React from 'react';

// Loading Skeleton Component
export function Skeleton({ width = '100%', height = '20px', className = '', ...props }: { width?: string | number; height?: string | number; className?: string;[key: string]: any }) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: '8px',
        ...props.style,
      }}
      {...props}
    />
  );
}

// Toast Component for user feedback
export function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error' | 'info'; onClose: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: { bg: '#22c55e', border: '#16a34a' },
    error: { bg: '#ef4444', border: '#dc2626' },
    info: { bg: '#3b82f6', border: '#2563eb' },
  };

  const color = colors[type];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: color.bg,
        color: 'white',
        padding: '12px 20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        zIndex: 10001,
        fontSize: '0.9rem',
        fontWeight: '500',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <span>{type === 'success' ? <Icons.Check /> : type === 'error' ? <Icons.Close /> : <Icons.Warning />}</span>
      <span>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '1.2rem',
          lineHeight: 1,
          marginLeft: '8px',
        }}
      >
        ×
      </button>
    </div>
  );
}

import {
  Send,
  ArrowDown,
  ArrowLeftRight,
  Lock,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  X,
  Clock,
  ArrowLeft,
  ChevronDown,
  ArrowUpRight,
  Wallet,
  Settings,
  Plus,
  HardDrive
} from 'lucide-react';

// Icon Components
// Icon Components
export const Icons = {
  Send: (props: any) => <Send size={20} {...props} />,
  Receive: (props: any) => <ArrowDown size={20} {...props} />,
  Swap: (props: any) => <ArrowLeftRight size={20} {...props} />,
  Lock: (props: any) => <Lock size={16} {...props} />,
  Refresh: (props: any) => <RefreshCw size={16} {...props} />,
  Copy: (props: any) => <Copy size={14} {...props} />,
  Check: (props: any) => <Check size={14} {...props} />,
  Warning: (props: any) => <AlertTriangle size={14} {...props} />,
  Close: (props: any) => <X size={18} {...props} />,
  Clock: (props: any) => <Clock size={18} {...props} />,
  ArrowLeft: (props: any) => <ArrowLeft size={18} {...props} />,
  ChevronDown: (props: any) => <ChevronDown size={14} {...props} />,
  ArrowUpRight: (props: any) => <ArrowUpRight size={14} {...props} />,
  Wallet: (props: any) => <Wallet size={16} {...props} />,
  Settings: (props: any) => <Settings size={14} {...props} />,
  Plus: (props: any) => <Plus size={14} {...props} />,
  Hardware: (props: any) => <HardDrive size={16} {...props} />,
  X: (props: any) => <X size={18} {...props} />,
  ArrowDown: (props: any) => <ArrowDown size={18} {...props} />,
};

