/**
 * EVM Transaction History and Portfolio Tracking
 *
 * Note: Unlike Solana (which uses Helius API for transaction history),
 * EVM block explorer APIs (Etherscan, etc.) require API keys.
 *
 * For EVM, we use a simplified snapshot-based approach:
 * - Background job saves portfolio snapshots every 15 minutes
 * - Chart displays those snapshots as history
 * - No complex balance change reconstruction needed
 */

import type { TokenBalance } from './types';
import { NATIVE_TOKEN_COINGECKO_IDS } from './evm-balances';

export interface EvmPortfolioSnapshot {
  timestamp: number;
  totalValue: number;
  // Breakdown per chain (for debugging/analysis)
  chains: {
    networkId: string;
    nativeValue: number;
    tokenValue: number;
  }[];
}

/**
 * Calculate total EVM portfolio value across all chains
 * @param evmBalances Map of networkId -> balance data
 * @param evmPrices Map of coingeckoId -> USD price
 * @returns Total portfolio value in USD
 */
export function calculateEvmPortfolioValue(
  evmBalances: Map<string, { nativeBalance: string; nativeSymbol: string; tokens: TokenBalance[] }>,
  evmPrices: Map<string, number>
): { totalValue: number; chains: { networkId: string; nativeValue: number; tokenValue: number }[] } {
  let totalValue = 0;
  const chains: { networkId: string; nativeValue: number; tokenValue: number }[] = [];

  evmBalances.forEach((balance, networkId) => {
    let nativeValue = 0;
    let tokenValue = 0;

    // Calculate native token value (ETH, POL, etc.)
    const nativeAmount = parseFloat(balance.nativeBalance) || 0;
    const nativeCoingeckoId = NATIVE_TOKEN_COINGECKO_IDS[networkId];
    if (nativeCoingeckoId && nativeAmount > 0) {
      const nativePrice = evmPrices.get(nativeCoingeckoId) || 0;
      nativeValue = nativeAmount * nativePrice;
    }

    // Calculate ERC-20 token values
    balance.tokens.forEach((token: TokenBalance & { coingeckoId?: string }) => {
      const amount = Number(token.amount) / Math.pow(10, token.decimals);
      if (token.coingeckoId) {
        const price = evmPrices.get(token.coingeckoId) || 0;
        tokenValue += amount * price;
      }
    });

    totalValue += nativeValue + tokenValue;
    chains.push({ networkId, nativeValue, tokenValue });
  });

  return { totalValue, chains };
}

/**
 * Storage key for unified EVM portfolio history
 */
export const EVM_PORTFOLIO_KEY_PREFIX = 'portfolio_history_';
export const EVM_UNIFIED_NETWORK_ID = 'evm-unified';

/**
 * Get the storage key for EVM unified portfolio history
 */
export function getEvmPortfolioStorageKey(evmAddress: string): string {
  return `${EVM_PORTFOLIO_KEY_PREFIX}${evmAddress}_${EVM_UNIFIED_NETWORK_ID}`;
}
