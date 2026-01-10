import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { AccountBalance } from './types';
import { getNetworkConfig, type NetworkClusterId, type NetworkConfig } from './networks';
import { fetchUserTokens } from './tokens';
import { isX1Network } from './networks';

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Fetches SOL balance for an address
 */
export async function fetchSolBalance(
  address: string,
  networkId: NetworkClusterId,
  customNetworks: NetworkConfig[] = []
): Promise<number> {
  const config = getNetworkConfig(networkId, customNetworks);
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const publicKey = new PublicKey(address);

  const balance = await withRetry(() => connection.getBalance(publicKey));
  // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
  return balance / LAMPORTS_PER_SOL; // Use LAMPORTS_PER_SOL
}

/**
 * Fetches all SPL token accounts for an address
 */
/**
 * Fetches complete balance information for an account
 */
export async function fetchAccountBalance(
  address: string,
  networkId: NetworkClusterId,
  customNetworks: NetworkConfig[] = []
): Promise<AccountBalance> {
  const config = getNetworkConfig(networkId, customNetworks);
  const connection = new Connection(config.rpcUrl, 'confirmed');

  const solBalance = await withRetry(() =>
    connection.getBalance(new PublicKey(address))
  );

  const tokens = await withRetry(() =>
    fetchUserTokens(connection, address, isX1Network(networkId))
  );

  return {
    solBalance: solBalance / LAMPORTS_PER_SOL,
    tokens,
    lastUpdated: Date.now(),
  };
}
