import type { NetworkClusterId } from './networks';

export interface DAppPermission {
  origin: string;
  hostname: string;
  publicKey: string;
  networkId: NetworkClusterId;
  grantedAt: number;
  lastUsed: number;
}

export interface PendingRequest {
  id: string;
  type: 'connect' | 'sign-transaction' | 'sign-all-transactions' | 'sign-message';
  origin: string;
  hostname: string;
  payload?: unknown;
  timestamp: number;
}

/**
 * Normalizes hostname for storage
 */
export function normalizeHostname(hostname: string): string {
  try {
    const normalized = hostname.trim().toLowerCase();
    if (!normalized) return '';
    const url = normalized.includes('://') ? new URL(normalized) : new URL(`https://${normalized}`);
    return url.hostname;
  } catch {
    return hostname.toLowerCase();
  }
}


