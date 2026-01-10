import { Connection } from '@solana/web3.js';

export type NetworkClusterId =
  | 'solana-mainnet'
  | 'solana-testnet'
  | 'solana-devnet'
  | 'solana-localnet'
  | 'x1-mainnet'
  | 'x1-testnet'
  | 'x1-localnet'
  | string; // Allow custom network IDs

export interface NetworkConfig {
  id: NetworkClusterId;
  label: string;
  rpcUrl: string;
  explorerUrl: string;
  kind: 'solana' | 'x1';
  environment: 'mainnet' | 'testnet' | 'devnet' | 'localnet' | 'custom';
}

export type NetworkHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface NetworkHealth {
  networkId: NetworkClusterId;
  status: NetworkHealthStatus;
  latencyMs: number | null;
  lastChecked: number; // timestamp
  error?: string;
}

export const NETWORKS: NetworkConfig[] = [
  {
    id: 'solana-mainnet',
    label: 'Solana Mainnet',
    rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL || 'https://rpc.ankr.com/solana',
    explorerUrl: 'https://explorer.solana.com',
    kind: 'solana',
    environment: 'mainnet',
  },
  {
    id: 'solana-testnet',
    label: 'Solana Testnet',
    rpcUrl: 'https://api.testnet.solana.com',
    explorerUrl: 'https://explorer.solana.com?cluster=testnet',
    kind: 'solana',
    environment: 'testnet',
  },
  {
    id: 'solana-devnet',
    label: 'Solana Devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    explorerUrl: 'https://explorer.solana.com?cluster=devnet',
    kind: 'solana',
    environment: 'devnet',
  },
  {
    id: 'x1-mainnet',
    label: 'X1 Mainnet',
    rpcUrl: 'https://rpc.mainnet.x1.xyz',
    explorerUrl: 'https://explorer.x1.xyz',
    kind: 'x1',
    environment: 'mainnet',
  },
  {
    id: 'x1-testnet',
    label: 'X1 Testnet',
    rpcUrl: 'https://rpc.testnet.x1.xyz',
    explorerUrl: 'https://explorer.x1.xyz?cluster=testnet',
    kind: 'x1',
    environment: 'testnet',
  },
  {
    id: 'solana-localnet',
    label: 'Solana Localnet',
    rpcUrl: 'http://127.0.0.1:8899',
    explorerUrl: 'https://explorer.solana.com?cluster=custom&customUrl=http://127.0.0.1:8899',
    kind: 'solana',
    environment: 'localnet',
  },
  {
    id: 'x1-localnet',
    label: 'X1 Localnet',
    rpcUrl: 'http://127.0.0.1:8901',
    explorerUrl: 'https://explorer.x1.xyz?cluster=custom&customUrl=http://127.0.0.1:8901',
    kind: 'x1',
    environment: 'localnet',
  },
];

export const DEFAULT_NETWORK_ID: NetworkClusterId = 'solana-mainnet';

export function getNetworkConfig(id: NetworkClusterId, customNetworks: NetworkConfig[] = []): NetworkConfig {
  const allNetworks = [...NETWORKS, ...customNetworks];
  const match = allNetworks.find((network) => network.id === id);
  if (!match) {
    // Fallback to default if not found (or throw, but fallback is safer for UI)
    console.warn(`Unknown network id: ${id}, falling back to default`);
    return NETWORKS[0];
  }
  return match;
}

export function getAllNetworks(customNetworks: NetworkConfig[] = []): NetworkConfig[] {
  return [...NETWORKS, ...customNetworks];
}

/**
 * Checks RPC latency by performing a getHealth check.
 * Returns latency in milliseconds, or null if the check fails.
 */
export async function checkNetworkLatency(
  rpcUrl: string,
  timeoutMs = 5000
): Promise<{ latencyMs: number | null; error?: string }> {
  // Use performance.now() if available, otherwise Date.now()
  const getTime = () => {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    return Date.now();
  };
  const startTime = getTime();

  try {
    const connection = new Connection(rpcUrl, 'confirmed');

    // Use Promise.race to implement timeout
    // getHealth() doesn't exist in @solana/web3.js, use getVersion() instead
    const healthCheck = connection.getVersion();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    });

    await Promise.race([healthCheck, timeoutPromise]);

    const latencyMs = Math.round(getTime() - startTime);
    return { latencyMs };
  } catch (error) {
    Math.round(getTime() - startTime); // Measure latency even on error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { latencyMs: null, error: errorMessage };
  }
}

/**
 * Determines health status based on latency.
 */
export function getHealthStatus(latencyMs: number | null): NetworkHealthStatus {
  if (latencyMs === null) {
    return 'down';
  }
  if (latencyMs < 500) {
    return 'healthy';
  }
  if (latencyMs < 2000) {
    return 'degraded';
  }
  return 'down';
}

/**
 * Checks health for a specific network.
 */
export async function checkNetworkHealth(
  networkId: NetworkClusterId
): Promise<NetworkHealth> {
  const config = getNetworkConfig(networkId);
  const { latencyMs, error } = await checkNetworkLatency(config.rpcUrl);
  const status = getHealthStatus(latencyMs);

  return {
    networkId,
    status,
    latencyMs,
    lastChecked: Date.now(),
    error,
  };
}

// XDEX API Endpoints
// Solana: Uses Jupiter Aggregator (Open Routing)
export const XDEX_SOLANA_API = 'https://quote-api.jup.ag/v6';

// X1: Uses Custom XDEX Aggregator (Forked from Jupiter Metis)

export const XDEX_X1_API = 'https://api.xdex.xyz/api/xendex'; // Custom X1 aggregator

export function getChainId(networkId: NetworkClusterId): number {
  if (networkId === 'x1-mainnet' || networkId === 'x1-testnet') return 195;
  if (typeof networkId === 'string' && networkId.startsWith('x1-')) return 195;
  return 101; // Solana Mainnet-beta
}

export function isX1Network(networkId: NetworkClusterId): boolean {
  return networkId.startsWith('x1-');
}
