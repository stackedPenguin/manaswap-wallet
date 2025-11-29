import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { AccountBalance } from './types';
import { getNetworkConfig, type NetworkClusterId } from './networks';
import { fetchUserTokens } from './tokens';


/**
 * Fetches SOL balance for an address
 */
export async function fetchSolBalance(
  address: string,
  networkId: NetworkClusterId
): Promise<number> {
  const config = getNetworkConfig(networkId);
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const publicKey = new PublicKey(address);

  const balance = await connection.getBalance(publicKey);
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
  networkId: NetworkClusterId
): Promise<AccountBalance> {
  const config = getNetworkConfig(networkId);
  const connection = new Connection(config.rpcUrl, 'confirmed');

  const solBalance = await connection.getBalance(new PublicKey(address));
  const tokens = await fetchUserTokens(connection, address);

  return {
    solBalance: solBalance / LAMPORTS_PER_SOL,
    tokens,
    lastUpdated: Date.now(),
  };
}


