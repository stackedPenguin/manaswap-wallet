/**
 * EVM Balance Fetching Utilities
 * Handles native and ERC-20 token balance fetching for EVM chains
 */

import { JsonRpcProvider, Contract, formatUnits } from 'ethers';
import { getEvmNetworkConfig } from './evm-networks';
import type { TokenBalance } from './types';

// ERC-20 ABI (minimal for balance/metadata)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

// Provider cache to avoid creating new providers repeatedly
const providerCache = new Map<string, JsonRpcProvider>();

/**
 * Get or create a JsonRpcProvider for a network
 */
export function getEvmProvider(networkId: string): JsonRpcProvider {
  const cached = providerCache.get(networkId);
  if (cached) return cached;

  const network = getEvmNetworkConfig(networkId);
  if (!network) {
    throw new Error(`Unknown EVM network: ${networkId}`);
  }

  // Create provider with faster timeout settings
  const provider = new JsonRpcProvider(network.rpcUrl, {
    chainId: network.chainId,
    name: network.name,
  }, {
    staticNetwork: true, // Skip network detection for faster startup
    batchMaxCount: 1, // Don't batch requests for faster individual responses
  });

  providerCache.set(networkId, provider);
  return provider;
}

/**
 * Clear provider cache (useful when switching RPC endpoints)
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

/**
 * Fetch native balance (ETH, MATIC, etc.) for an address
 * Returns balance in the native currency units (not wei)
 */
export async function fetchEvmNativeBalance(
  address: string,
  networkId: string
): Promise<{ balance: string; symbol: string }> {
  const network = getEvmNetworkConfig(networkId);
  if (!network) {
    throw new Error(`Unknown EVM network: ${networkId}`);
  }

  const provider = getEvmProvider(networkId);
  const balanceWei = await provider.getBalance(address);
  const balance = formatUnits(balanceWei, network.nativeCurrency.decimals);

  return {
    balance,
    symbol: network.nativeCurrency.symbol,
  };
}

/**
 * Fetch ERC-20 token balance
 */
export async function fetchEvmTokenBalance(
  address: string,
  tokenAddress: string,
  networkId: string
): Promise<TokenBalance | null> {
  try {
    const provider = getEvmProvider(networkId);
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);

    // Fetch balance and metadata in parallel
    const [balance, decimals, symbol, name] = await Promise.all([
      contract.balanceOf(address) as Promise<bigint>,
      contract.decimals() as Promise<number>,
      contract.symbol() as Promise<string>,
      contract.name() as Promise<string>,
    ]);

    // Skip if balance is 0
    if (balance === 0n) {
      return null;
    }

    return {
      mint: tokenAddress,
      amount: balance.toString(),
      decimals: Number(decimals), // Ensure decimals is a number, not BigInt
      symbol,
      name,
      isVerified: false, // Would need a token list to verify
    };
  } catch (error) {
    console.warn(`Failed to fetch token balance for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Fetch token metadata
 */
export async function getEvmTokenMetadata(
  tokenAddress: string,
  networkId: string
): Promise<{ name: string; symbol: string; decimals: number } | null> {
  try {
    const provider = getEvmProvider(networkId);
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);

    const [decimals, symbol, name] = await Promise.all([
      contract.decimals() as Promise<number>,
      contract.symbol() as Promise<string>,
      contract.name() as Promise<string>,
    ]);

    return { name, symbol, decimals };
  } catch (error) {
    console.warn(`Failed to fetch token metadata for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Common ERC-20 tokens by chain for initial token detection
 * These are well-known tokens that users commonly hold
 */
export interface CommonToken {
  address: string;
  symbol: string;
  logoURI: string;
  coingeckoId?: string; // For price fetching
}

// Helper to get trustwallet logo URL
const getTrustwalletLogo = (chain: string, address: string) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain}/assets/${address}/logo.png`;

export const COMMON_TOKENS: Record<string, CommonToken[]> = {
  'ethereum-mainnet': [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', logoURI: getTrustwalletLogo('ethereum', '0xdAC17F958D2ee523a2206206994597C13D831ec7'), coingeckoId: 'tether' },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', logoURI: getTrustwalletLogo('ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'), coingeckoId: 'usd-coin' },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', logoURI: getTrustwalletLogo('ethereum', '0x6B175474E89094C44Da98b954EedeAC495271d0F'), coingeckoId: 'dai' },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', logoURI: getTrustwalletLogo('ethereum', '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'), coingeckoId: 'wrapped-bitcoin' },
  ],
  'arbitrum-mainnet': [
    { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', logoURI: getTrustwalletLogo('arbitrum', '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'), coingeckoId: 'tether' },
    { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', logoURI: getTrustwalletLogo('arbitrum', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), coingeckoId: 'usd-coin' },
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', logoURI: getTrustwalletLogo('arbitrum', '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'), coingeckoId: 'ethereum' },
  ],
  'optimism-mainnet': [
    { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', logoURI: getTrustwalletLogo('optimism', '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'), coingeckoId: 'tether' },
    { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', logoURI: getTrustwalletLogo('optimism', '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'), coingeckoId: 'usd-coin' },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png', coingeckoId: 'ethereum' },
  ],
  'base-mainnet': [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', logoURI: getTrustwalletLogo('base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), coingeckoId: 'usd-coin' },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png', coingeckoId: 'ethereum' },
  ],
  'polygon-mainnet': [
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', logoURI: getTrustwalletLogo('polygon', '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'), coingeckoId: 'tether' },
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', logoURI: getTrustwalletLogo('polygon', '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'), coingeckoId: 'usd-coin' },
    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', logoURI: getTrustwalletLogo('polygon', '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'), coingeckoId: 'ethereum' },
  ],
};

// Map of coingecko IDs for native tokens
export const NATIVE_TOKEN_COINGECKO_IDS: Record<string, string> = {
  'ethereum-mainnet': 'ethereum',
  'ethereum-sepolia': 'ethereum',
  'arbitrum-mainnet': 'ethereum',
  'optimism-mainnet': 'ethereum',
  'base-mainnet': 'ethereum',
  'polygon-mainnet': 'polygon-ecosystem-token', // POL (formerly MATIC)
};

/**
 * Fetch balances for common tokens on a network
 * Includes logoURI and coingeckoId from COMMON_TOKENS
 */
export async function fetchCommonTokenBalances(
  address: string,
  networkId: string
): Promise<TokenBalance[]> {
  const tokens = COMMON_TOKENS[networkId] || [];
  if (tokens.length === 0) return [];

  const results: TokenBalance[] = [];

  await Promise.all(
    tokens.map(async (token) => {
      const balance = await fetchEvmTokenBalance(address, token.address, networkId);
      if (balance) {
        // Enrich with logoURI and coingeckoId from COMMON_TOKENS
        results.push({
          ...balance,
          logoURI: token.logoURI,
          coingeckoId: token.coingeckoId,
        });
      }
    })
  );

  return results;
}

// Timeout helper for EVM balance fetching
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Fetch all balances (native + common tokens) for an address
 * Includes a 10-second timeout to prevent slow RPCs from blocking
 */
export async function fetchEvmAccountBalance(
  address: string,
  networkId: string
): Promise<{ nativeBalance: string; nativeSymbol: string; tokens: TokenBalance[] }> {
  const perfStart = performance.now();
  const TIMEOUT_MS = 10000; // 10 second timeout per network

  const defaultResult = {
    nativeBalance: '0',
    nativeSymbol: getEvmNetworkConfig(networkId)?.nativeCurrency.symbol || 'ETH',
    tokens: [] as TokenBalance[],
  };

  try {
    const [native, tokens] = await withTimeout(
      Promise.all([
        fetchEvmNativeBalance(address, networkId),
        fetchCommonTokenBalances(address, networkId),
      ]),
      TIMEOUT_MS,
      [{ balance: '0', symbol: defaultResult.nativeSymbol }, [] as TokenBalance[]]
    );

    console.log(`[Perf] EVM ${networkId} balance done in ${((performance.now() - perfStart) / 1000).toFixed(2)}s (${tokens.length} tokens)`);

    return {
      nativeBalance: native.balance,
      nativeSymbol: native.symbol,
      tokens,
    };
  } catch (error) {
    console.warn(`[EVM] ${networkId} balance fetch failed:`, error);
    console.log(`[Perf] EVM ${networkId} balance FAILED in ${((performance.now() - perfStart) / 1000).toFixed(2)}s`);
    return defaultResult;
  }
}
