/**
 * Uniswap V3 & V4 Position Fetching
 * Uses direct RPC calls to NonfungiblePositionManager contracts
 */

import { ethers } from 'ethers';
import { getEvmProvider } from './evm-balances';
import { EVM_NETWORKS } from './evm-networks';

// V3 NonfungiblePositionManager addresses per network
const V3_NFPM_ADDRESSES: Record<string, string> = {
  'ethereum-mainnet': '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  'arbitrum-mainnet': '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  'base-mainnet': '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  'optimism-mainnet': '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  'polygon-mainnet': '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
};

// V4 PositionManager addresses per network
const V4_POSM_ADDRESSES: Record<string, string> = {
  'ethereum-mainnet': '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
  'arbitrum-mainnet': '0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869',
  'base-mainnet': '0x7C5f5A4bBd8fD63184577525326123B519429bDc',
  'optimism-mainnet': '0x3C3Ea4B57a46241e54610e5f022E5c45859A1017',
  'polygon-mainnet': '0x1Ec2eBf4F37E7363FDfe3551602425af0B3ceef9',
};

// Common token symbols by address (lowercase)
const TOKEN_SYMBOLS: Record<string, Record<string, string>> = {
  'arbitrum-mainnet': {
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'WETH',
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 'USDC.e',
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'USDT',
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'WBTC',
    '0x912ce59144191c1204e64559fe8253a0e49e6548': 'ARB',
  },
  'base-mainnet': {
    '0x4200000000000000000000000000000000000006': 'WETH',
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': 'USDbC',
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',
  },
  'ethereum-mainnet': {
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
    '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  },
};

// Supported networks for Uniswap
export const UNISWAP_SUPPORTED_NETWORKS = Object.keys(V3_NFPM_ADDRESSES);

// V3 Minimal ABI for position queries
const V3_NFPM_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
];

// V4 ABI for position queries
const V4_POSM_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function getPositionLiquidity(uint256 tokenId) view returns (uint128)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

// V4 StateView contract for reading pool state
const V4_STATE_VIEW_ADDRESSES: Record<string, string> = {
  'ethereum-mainnet': '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
  // Add other networks as needed
};

const V4_STATE_VIEW_ABI = [
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
];

// Decode V4 positionInfo bytes32 to get tickLower and tickUpper
function decodeV4PositionInfo(positionInfoHex: string): { tickLower: number; tickUpper: number } {
  const positionInfo = BigInt(positionInfoHex);

  // tickLower is at bits 8-31 (24 bits)
  const rawTickLower = Number((positionInfo >> 8n) & 0xffffffn);
  const tickLower = rawTickLower >= 0x800000 ? rawTickLower - 0x1000000 : rawTickLower;

  // tickUpper is at bits 32-55 (24 bits)
  const rawTickUpper = Number((positionInfo >> 32n) & 0xffffffn);
  const tickUpper = rawTickUpper >= 0x800000 ? rawTickUpper - 0x1000000 : rawTickUpper;

  return { tickLower, tickUpper };
}

// Generate V4 poolId from poolKey components
function generateV4PoolId(
  currency0: string,
  currency1: string,
  fee: number,
  tickSpacing: number,
  hooks: string
): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    ['address', 'address', 'uint24', 'int24', 'address'],
    [currency0, currency1, fee, tickSpacing, hooks]
  );
  return ethers.keccak256(encoded);
}

// Get V4 pool current tick from StateView
async function getV4PoolCurrentTick(
  poolId: string,
  networkId: string,
  provider: ethers.JsonRpcProvider
): Promise<{ sqrtPriceX96: bigint; tick: number } | null> {
  const stateViewAddress = V4_STATE_VIEW_ADDRESSES[networkId];
  if (!stateViewAddress) return null;

  try {
    const stateView = new ethers.Contract(stateViewAddress, V4_STATE_VIEW_ABI, provider);
    const result = await stateView.getSlot0(poolId);
    return {
      sqrtPriceX96: result.sqrtPriceX96,
      tick: Number(result.tick),
    };
  } catch (error) {
    console.error('[Uniswap V4] Error getting pool state:', error);
    return null;
  }
}

// ERC20 ABI for getting token info
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

export interface ProcessedPosition {
  id: string;
  tokenId: string;
  network: string;
  networkName: string;
  version: 'v3' | 'v4';
  token0Symbol: string;
  token1Symbol: string;
  token0Address: string;
  token1Address: string;
  token0Decimals: number;
  token1Decimals: number;
  feeTier: number;
  feePercent: string;
  liquidity: string;
  tickLower: number;
  tickUpper: number;
  currentTick?: number;
  // Token amounts
  amount0: string;
  amount1: string;
  // Price calculations
  priceLower: number;
  priceUpper: number;
  // Status
  inRange: boolean;
  isClosed: boolean;
  isFullRange: boolean;
  // Display values
  priceRangeDisplay: string;
}

// Convert tick to price
function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  const price = Math.pow(1.0001, tick);
  return price * Math.pow(10, decimals0 - decimals1);
}

// Format fee tier to percentage string
function formatFeeTier(fee: number): string {
  if (fee === 100) return '0.01%';
  if (fee === 500) return '0.05%';
  if (fee === 3000) return '0.3%';
  if (fee === 10000) return '1%';
  return `${fee / 10000}%`;
}

// Format price for display
function formatPrice(price: number): string {
  if (price === 0) return '0';
  if (price < 0.0001) return price.toExponential(2);
  if (price < 1) return price.toFixed(6);
  if (price < 1000) return price.toFixed(4);
  if (price < 1000000) return price.toFixed(2);
  return price.toExponential(2);
}

// Check if position is full range (min/max ticks for the tick spacing)
function isFullRange(tickLower: number, tickUpper: number, tickSpacing: number = 60): boolean {
  // Full range ticks are typically near -887272 and 887272 (MAX_TICK)
  // but rounded to tick spacing
  const minTick = -887272;
  const maxTick = 887272;
  const roundedMin = Math.ceil(minTick / tickSpacing) * tickSpacing;
  const roundedMax = Math.floor(maxTick / tickSpacing) * tickSpacing;
  return tickLower <= roundedMin + tickSpacing && tickUpper >= roundedMax - tickSpacing;
}

// V3 Pool ABI for getting current tick
const V3_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

// V3 Factory ABI for getting pool address
const V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
];

// V3 Factory addresses
const V3_FACTORY_ADDRESSES: Record<string, string> = {
  'ethereum-mainnet': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  'arbitrum-mainnet': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  'base-mainnet': '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  'optimism-mainnet': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  'polygon-mainnet': '0x1F98431c8aD98523631AE4a59f267346ea31F984',
};

// Calculate token amounts from liquidity and tick range
function calculateAmounts(
  liquidity: bigint,
  tickLower: number,
  tickUpper: number,
  currentTick: number,
  decimals0: number,
  decimals1: number
): { amount0: string; amount1: string } {
  if (liquidity === 0n) {
    return { amount0: '0', amount1: '0' };
  }

  const sqrtPriceLower = Math.sqrt(Math.pow(1.0001, tickLower));
  const sqrtPriceUpper = Math.sqrt(Math.pow(1.0001, tickUpper));
  const sqrtPriceCurrent = Math.sqrt(Math.pow(1.0001, currentTick));

  let amount0 = 0;
  let amount1 = 0;

  const liquidityNum = Number(liquidity);

  if (currentTick < tickLower) {
    // Price below range - all token0
    amount0 = liquidityNum * (1 / sqrtPriceLower - 1 / sqrtPriceUpper);
  } else if (currentTick >= tickUpper) {
    // Price above range - all token1
    amount1 = liquidityNum * (sqrtPriceUpper - sqrtPriceLower);
  } else {
    // Price in range - mix of both
    amount0 = liquidityNum * (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper);
    amount1 = liquidityNum * (sqrtPriceCurrent - sqrtPriceLower);
  }

  // Adjust for decimals
  amount0 = amount0 / Math.pow(10, decimals0);
  amount1 = amount1 / Math.pow(10, decimals1);

  return {
    amount0: amount0.toFixed(6),
    amount1: amount1.toFixed(6),
  };
}

// Get current tick from V3 pool
async function getPoolCurrentTick(
  token0: string,
  token1: string,
  fee: number,
  networkId: string,
  provider: ethers.JsonRpcProvider
): Promise<number | null> {
  const factoryAddress = V3_FACTORY_ADDRESSES[networkId];
  if (!factoryAddress) return null;

  try {
    const factory = new ethers.Contract(factoryAddress, V3_FACTORY_ABI, provider);
    const poolAddress = await factory.getPool(token0, token1, fee);

    if (poolAddress === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);
    const slot0 = await pool.slot0();
    return Number(slot0.tick);
  } catch (error) {
    console.error('[Uniswap] Error getting pool tick:', error);
    return null;
  }
}

// Get token symbol from cache or fetch from contract
async function getTokenSymbol(
  address: string,
  networkId: string,
  provider: ethers.JsonRpcProvider
): Promise<string> {
  const lowerAddress = address.toLowerCase();
  const cachedSymbols = TOKEN_SYMBOLS[networkId] || {};

  if (cachedSymbols[lowerAddress]) {
    return cachedSymbols[lowerAddress];
  }

  try {
    const token = new ethers.Contract(address, ERC20_ABI, provider);
    return await token.symbol();
  } catch {
    return address.slice(0, 6) + '...' + address.slice(-4);
  }
}

// Get token decimals
async function getTokenDecimals(
  address: string,
  provider: ethers.JsonRpcProvider
): Promise<number> {
  try {
    const token = new ethers.Contract(address, ERC20_ABI, provider);
    const decimals = await token.decimals();
    return Number(decimals);
  } catch {
    return 18; // Default to 18
  }
}

/**
 * Fetch Uniswap V3 positions for a wallet address on a specific network
 */
export async function fetchUniswapV3Positions(
  walletAddress: string,
  networkId: string
): Promise<ProcessedPosition[]> {
  const nfpmAddress = V3_NFPM_ADDRESSES[networkId];
  if (!nfpmAddress) {
    return [];
  }

  const network = EVM_NETWORKS.find(n => n.id === networkId);
  if (!network) {
    return [];
  }

  try {
    const provider = getEvmProvider(networkId);
    const nfpm = new ethers.Contract(nfpmAddress, V3_NFPM_ABI, provider);

    // Get balance (number of position NFTs)
    const balance = await nfpm.balanceOf(walletAddress);
    const positionCount = Number(balance);

    if (positionCount === 0) {
      return [];
    }

    const positions: ProcessedPosition[] = [];

    // Fetch each position
    for (let i = 0; i < positionCount; i++) {
      try {
        const tokenId = await nfpm.tokenOfOwnerByIndex(walletAddress, i);
        const position = await nfpm.positions(tokenId);

        const token0Symbol = await getTokenSymbol(position.token0, networkId, provider);
        const token1Symbol = await getTokenSymbol(position.token1, networkId, provider);
        const token0Decimals = await getTokenDecimals(position.token0, provider);
        const token1Decimals = await getTokenDecimals(position.token1, provider);

        const tickLower = Number(position.tickLower);
        const tickUpper = Number(position.tickUpper);
        const liquidityBigInt = position.liquidity;
        const liquidity = liquidityBigInt.toString();
        const isClosed = liquidity === '0';
        const fullRange = isFullRange(tickLower, tickUpper);
        const fee = Number(position.fee);

        // Calculate prices
        const priceLower = tickToPrice(tickLower, token0Decimals, token1Decimals);
        const priceUpper = tickToPrice(tickUpper, token0Decimals, token1Decimals);

        // Get current pool tick and calculate amounts
        let currentTick: number | undefined;
        let amount0 = '0';
        let amount1 = '0';
        let inRange = !isClosed;

        if (!isClosed) {
          const tick = await getPoolCurrentTick(
            position.token0,
            position.token1,
            fee,
            networkId,
            provider
          );
          if (tick !== null) {
            currentTick = tick;
            inRange = tick >= tickLower && tick < tickUpper;
            const amounts = calculateAmounts(
              liquidityBigInt,
              tickLower,
              tickUpper,
              tick,
              token0Decimals,
              token1Decimals
            );
            amount0 = amounts.amount0;
            amount1 = amounts.amount1;
          }
        }

        positions.push({
          id: `${networkId}-v3-${tokenId.toString()}`,
          tokenId: tokenId.toString(),
          network: networkId,
          networkName: network.name,
          version: 'v3',
          token0Symbol,
          token1Symbol,
          token0Address: position.token0,
          token1Address: position.token1,
          token0Decimals,
          token1Decimals,
          feeTier: fee,
          feePercent: formatFeeTier(fee),
          liquidity,
          tickLower,
          tickUpper,
          currentTick,
          amount0,
          amount1,
          priceLower,
          priceUpper,
          inRange,
          isClosed,
          isFullRange: fullRange,
          priceRangeDisplay: fullRange ? 'Full Range' : `${formatPrice(priceLower)} - ${formatPrice(priceUpper)}`,
        });
      } catch (error) {
        console.error(`[Uniswap V3] Error fetching position ${i}:`, error);
      }
    }

    return positions;
  } catch (error) {
    console.error(`[Uniswap V3] Failed to fetch positions for ${networkId}:`, error);
    return [];
  }
}

/**
 * Find V4 position token IDs by searching Transfer events
 * V4 doesn't have tokenOfOwnerByIndex, so we search events
 */
async function findV4TokenIds(
  walletAddress: string,
  posmAddress: string,
  provider: ethers.JsonRpcProvider
): Promise<bigint[]> {
  const posm = new ethers.Contract(posmAddress, V4_POSM_ABI, provider);

  // First check if user has any positions
  const balance = await posm.balanceOf(walletAddress);
  if (Number(balance) === 0) {
    return [];
  }

  const tokenIds: bigint[] = [];
  const currentBlock = await provider.getBlockNumber();

  // Search in chunks of 10000 blocks (RPC limit is usually 50000)
  const filter = posm.filters.Transfer(null, walletAddress);
  const chunkSize = 10000;
  const maxChunks = 20; // Search last ~200k blocks

  for (let i = 0; i < maxChunks && tokenIds.length < Number(balance); i++) {
    const toBlock = currentBlock - (i * chunkSize);
    const fromBlock = Math.max(0, toBlock - chunkSize);

    try {
      const events = await posm.queryFilter(filter, fromBlock, toBlock);
      for (const event of events) {
        // Cast to EventLog to access args
        const eventLog = event as ethers.EventLog;
        if (eventLog.args && eventLog.args.tokenId) {
          tokenIds.push(eventLog.args.tokenId);
        }
      }
    } catch {
      // RPC error, continue with next chunk
    }
  }

  return tokenIds;
}

/**
 * Fetch Uniswap V4 positions for a wallet address on a specific network
 */
export async function fetchUniswapV4Positions(
  walletAddress: string,
  networkId: string
): Promise<ProcessedPosition[]> {
  const posmAddress = V4_POSM_ADDRESSES[networkId];
  if (!posmAddress) {
    return [];
  }

  const network = EVM_NETWORKS.find(n => n.id === networkId);
  if (!network) {
    return [];
  }

  try {
    const provider = getEvmProvider(networkId);

    // Find token IDs via Transfer events
    const tokenIds = await findV4TokenIds(walletAddress, posmAddress, provider);

    if (tokenIds.length === 0) {
      return [];
    }

    const positions: ProcessedPosition[] = [];
    const posm = new ethers.Contract(posmAddress, V4_POSM_ABI, provider);

    for (const tokenId of tokenIds) {
      try {
        // Get position info via raw call (ABI decoding is tricky for V4)
        const iface = new ethers.Interface(['function getPoolAndPositionInfo(uint256 tokenId)']);
        const data = iface.encodeFunctionData('getPoolAndPositionInfo', [tokenId]);
        const result = await provider.call({ to: posmAddress, data });

        // Decode manually: PoolKey (currency0, currency1, fee, tickSpacing, hooks) + positionInfo
        // Each field is 32 bytes (64 hex chars), addresses are right-padded
        // result[0:2] = "0x"
        // result[2:66] = currency0 (32 bytes)
        // result[66:130] = currency1 (32 bytes)
        // result[130:194] = fee (32 bytes)
        // result[194:258] = tickSpacing (32 bytes)
        // result[258:322] = hooks (32 bytes)
        // result[322:386] = positionInfo (32 bytes)
        const currency0 = '0x' + result.slice(26, 66);
        const currency1 = '0x' + result.slice(90, 130);
        const fee = parseInt(result.slice(130, 194), 16);
        const tickSpacing = parseInt(result.slice(194, 258), 16);
        // Convert tickSpacing if negative (int24)
        const tickSpacingInt = tickSpacing >= 0x800000 ? tickSpacing - 0x1000000 : tickSpacing;
        const hooks = '0x' + result.slice(282, 322);
        const positionInfoHex = '0x' + result.slice(322, 386);

        // Decode positionInfo to get tickLower and tickUpper
        const { tickLower, tickUpper } = decodeV4PositionInfo(positionInfoHex);

        // Get liquidity
        const liquidity = await posm.getPositionLiquidity(tokenId);
        const liquidityStr = liquidity.toString();
        const isClosed = liquidityStr === '0';

        // Get token info
        const token0Symbol = await getTokenSymbol(currency0, networkId, provider);
        const token1Symbol = await getTokenSymbol(currency1, networkId, provider);
        const token0Decimals = await getTokenDecimals(currency0, provider);
        const token1Decimals = await getTokenDecimals(currency1, provider);

        // Calculate prices from ticks
        const priceLower = tickToPrice(tickLower, token0Decimals, token1Decimals);
        const priceUpper = tickToPrice(tickUpper, token0Decimals, token1Decimals);
        const fullRange = isFullRange(tickLower, tickUpper, tickSpacingInt);

        // Get current pool tick from StateView and calculate amounts
        let currentTick: number | undefined;
        let amount0 = '0';
        let amount1 = '0';
        let inRange = !isClosed;

        if (!isClosed) {
          // Generate poolId for StateView lookup
          const poolId = generateV4PoolId(currency0, currency1, fee, tickSpacingInt, hooks);
          const poolState = await getV4PoolCurrentTick(poolId, networkId, provider);

          if (poolState) {
            currentTick = poolState.tick;
            inRange = currentTick >= tickLower && currentTick < tickUpper;

            // Calculate token amounts
            const amounts = calculateAmounts(
              liquidity,
              tickLower,
              tickUpper,
              currentTick,
              token0Decimals,
              token1Decimals
            );
            amount0 = amounts.amount0;
            amount1 = amounts.amount1;
          }
        }

        positions.push({
          id: `${networkId}-v4-${tokenId.toString()}`,
          tokenId: tokenId.toString(),
          network: networkId,
          networkName: network.name,
          version: 'v4',
          token0Symbol,
          token1Symbol,
          token0Address: currency0,
          token1Address: currency1,
          token0Decimals,
          token1Decimals,
          feeTier: fee,
          feePercent: formatFeeTier(fee),
          liquidity: liquidityStr,
          tickLower,
          tickUpper,
          currentTick,
          amount0,
          amount1,
          priceLower,
          priceUpper,
          inRange,
          isClosed,
          isFullRange: fullRange,
          priceRangeDisplay: fullRange ? 'Full Range' : `${formatPrice(priceLower)} - ${formatPrice(priceUpper)}`,
        });
      } catch (error) {
        console.error(`[Uniswap V4] Error fetching position ${tokenId}:`, error);
      }
    }

    return positions;
  } catch (error) {
    console.error(`[Uniswap V4] Failed to fetch positions for ${networkId}:`, error);
    return [];
  }
}

/**
 * Fetch all Uniswap positions (V3 + V4) across all supported networks
 */
export async function fetchAllUniswapPositions(
  walletAddress: string
): Promise<ProcessedPosition[]> {
  // Fetch V3 and V4 positions in parallel
  const [v3Results, v4Results] = await Promise.all([
    Promise.all(
      UNISWAP_SUPPORTED_NETWORKS.map(networkId =>
        fetchUniswapV3Positions(walletAddress, networkId)
      )
    ),
    Promise.all(
      Object.keys(V4_POSM_ADDRESSES).map(networkId =>
        fetchUniswapV4Positions(walletAddress, networkId)
      )
    ),
  ]);

  // Flatten and sort - active positions first, then by version (V4 first), then by network
  return [...v3Results.flat(), ...v4Results.flat()]
    .sort((a, b) => {
      // Active positions first
      if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
      // V4 before V3
      if (a.version !== b.version) return a.version === 'v4' ? -1 : 1;
      // Then by network
      return a.networkName.localeCompare(b.networkName);
    });
}

// Backwards compatibility alias
export const fetchUniswapPositions = fetchUniswapV3Positions;
