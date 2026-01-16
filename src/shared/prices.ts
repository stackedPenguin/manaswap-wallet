// CoinGecko API for EVM token prices (free tier, no auth required)
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

// Cache configuration for historical prices
const HISTORICAL_PRICE_CACHE_KEY = 'evm_historical_prices_cache';
const HISTORICAL_PRICE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// In-memory cache for current session (prevents repeated calls within same session)
let historicalPriceMemoryCache: {
  data: Map<string, Array<{ timestamp: number; price: number }>>;
  timestamp: number;
  ids: string[];
} | null = null;

interface HistoricalPriceCache {
  data: Record<string, Array<{ timestamp: number; price: number }>>;
  timestamp: number;
  ids: string[];
}

/**
 * Get cached historical prices from chrome.storage
 */
async function getCachedHistoricalPrices(
  requestedIds: string[]
): Promise<Map<string, Array<{ timestamp: number; price: number }>> | null> {
  try {
    // Check memory cache first (fastest)
    if (historicalPriceMemoryCache) {
      const cacheAge = Date.now() - historicalPriceMemoryCache.timestamp;
      if (cacheAge < HISTORICAL_PRICE_CACHE_TTL) {
        // Check if we have all requested IDs
        const hasAllIds = requestedIds.every(id =>
          historicalPriceMemoryCache!.data.has(id) || historicalPriceMemoryCache!.ids.includes(id)
        );
        if (hasAllIds) {
          console.log('[Prices] Using memory cache for historical prices');
          return historicalPriceMemoryCache.data;
        }
      }
    }

    // Check chrome.storage cache
    const result = await chrome.storage.local.get(HISTORICAL_PRICE_CACHE_KEY);
    const cache = result[HISTORICAL_PRICE_CACHE_KEY] as HistoricalPriceCache | undefined;

    if (cache) {
      const cacheAge = Date.now() - cache.timestamp;
      if (cacheAge < HISTORICAL_PRICE_CACHE_TTL) {
        // Check if we have all requested IDs
        const hasAllIds = requestedIds.every(id => cache.ids.includes(id));
        if (hasAllIds) {
          console.log('[Prices] Using storage cache for historical prices');
          // Convert back to Map
          const dataMap = new Map<string, Array<{ timestamp: number; price: number }>>();
          Object.entries(cache.data).forEach(([id, prices]) => {
            dataMap.set(id, prices);
          });
          // Update memory cache
          historicalPriceMemoryCache = {
            data: dataMap,
            timestamp: cache.timestamp,
            ids: cache.ids
          };
          return dataMap;
        }
      }
    }
  } catch (error) {
    console.warn('[Prices] Failed to read historical price cache:', error);
  }
  return null;
}

/**
 * Save historical prices to cache
 */
async function saveHistoricalPricesToCache(
  data: Map<string, Array<{ timestamp: number; price: number }>>,
  ids: string[]
): Promise<void> {
  try {
    const timestamp = Date.now();

    // Update memory cache
    historicalPriceMemoryCache = { data, timestamp, ids };

    // Convert Map to plain object for storage
    const dataObj: Record<string, Array<{ timestamp: number; price: number }>> = {};
    data.forEach((prices, id) => {
      dataObj[id] = prices;
    });

    await chrome.storage.local.set({
      [HISTORICAL_PRICE_CACHE_KEY]: { data: dataObj, timestamp, ids }
    });
    console.log('[Prices] Saved historical prices to cache');
  } catch (error) {
    console.warn('[Prices] Failed to save historical price cache:', error);
  }
}

/**
 * Fetch prices for EVM tokens using CoinGecko IDs
 * @param coingeckoIds Array of CoinGecko token IDs (e.g., ['ethereum', 'usd-coin', 'tether'])
 * @returns Map of coingeckoId -> USD price
 */
export async function fetchEvmTokenPrices(coingeckoIds: string[]): Promise<Map<string, number>> {
  if (coingeckoIds.length === 0) return new Map();

  // Remove duplicates and empty strings
  const uniqueIds = [...new Set(coingeckoIds.filter(id => !!id))];
  if (uniqueIds.length === 0) return new Map();

  const ids = uniqueIds.join(',');
  const url = `${COINGECKO_API_URL}/simple/price?ids=${ids}&vs_currencies=usd`;

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const priceMap = new Map<string, number>();

    // Response format: { "ethereum": { "usd": 3500.00 }, "usd-coin": { "usd": 1.00 } }
    Object.entries(data).forEach(([id, priceData]: [string, any]) => {
      if (priceData?.usd) {
        priceMap.set(id, priceData.usd);
      }
    });

    return priceMap;
  } catch (error) {
    console.error('Failed to fetch CoinGecko prices:', error);
    return new Map();
  }
}

/**
 * Fetch historical prices for EVM tokens from CoinGecko market_chart API
 * With caching and proper rate limiting to avoid 429 errors.
 *
 * @param coingeckoIds Array of CoinGecko token IDs
 * @param days Number of days of history (default 7)
 * @returns Map of coingeckoId -> array of {timestamp, price} sorted by time
 */
export async function fetchEvmHistoricalPrices(
  coingeckoIds: string[],
  days: number = 7
): Promise<Map<string, Array<{ timestamp: number; price: number }>>> {
  const result = new Map<string, Array<{ timestamp: number; price: number }>>();

  if (coingeckoIds.length === 0) return result;

  // Remove duplicates and empty strings
  const uniqueIds = [...new Set(coingeckoIds.filter(id => !!id))];

  // Check cache first
  const cached = await getCachedHistoricalPrices(uniqueIds);
  if (cached) {
    return cached;
  }

  const perfStart = performance.now();
  console.log(`[Prices] Fetching historical prices for ${uniqueIds.length} tokens from CoinGecko...`);

  // CoinGecko free tier rate limit: ~10-30 calls/min
  // Use longer delays and retry logic to handle rate limits
  const DELAY_BETWEEN_REQUESTS = 2500; // 2.5 seconds between requests
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 5000; // 5 seconds retry delay on 429

  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i];
    let retries = 0;
    let success = false;

    while (!success && retries <= MAX_RETRIES) {
      try {
        const url = `${COINGECKO_API_URL}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (response.status === 429) {
          // Rate limited - wait and retry
          retries++;
          if (retries <= MAX_RETRIES) {
            console.warn(`[Prices] Rate limited for ${id}, waiting ${RETRY_DELAY / 1000}s before retry ${retries}/${MAX_RETRIES}`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
            continue;
          } else {
            console.warn(`[Prices] Rate limited for ${id}, max retries exceeded`);
            break;
          }
        }

        if (!response.ok) {
          console.warn(`[Prices] CoinGecko market_chart error for ${id}: ${response.status}`);
          break;
        }

        const data = await response.json();

        // Response format: { prices: [[timestamp_ms, price], ...], ... }
        if (data?.prices && Array.isArray(data.prices)) {
          const priceHistory = data.prices.map((p: [number, number]) => ({
            timestamp: Math.floor(p[0] / 1000), // Convert ms to seconds
            price: p[1]
          }));
          result.set(id, priceHistory);
        }

        success = true;
        console.log(`[Perf] Historical price for ${id} fetched (${i + 1}/${uniqueIds.length}) @ ${((performance.now() - perfStart) / 1000).toFixed(2)}s`);
      } catch (error) {
        console.warn(`[Prices] Failed to fetch historical prices for ${id}:`, error);
        break;
      }
    }

    // Delay between requests to avoid rate limiting
    if (i < uniqueIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
  }

  // Save to cache if we got any results
  if (result.size > 0) {
    await saveHistoricalPricesToCache(result, uniqueIds);
  }

  console.log(`[Perf] All historical prices done @ ${((performance.now() - perfStart) / 1000).toFixed(2)}s`);
  return result;
}

// DexScreener Interfaces
export interface DexScreenerPair {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    baseToken: {
        address: string;
        name: string;
        symbol: string;
    };
    quoteToken: {
        address: string;
        name: string;
        symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    txns: {
        m5: { buys: number; sells: number };
        h1: { buys: number; sells: number };
        h6: { buys: number; sells: number };
        h24: { buys: number; sells: number };
    };
    volume: {
        h24: number;
        h6: number;
        h1: number;
        m5: number;
    };
    priceChange: {
        m5: number;
        h1: number;
        h6: number;
        h24: number;
    };
    liquidity?: {
        usd?: number;
        base: number;
        quote: number;
    };
    fdv?: number;
    marketCap?: number;
    pairCreatedAt?: number;
}

export interface DexScreenerResponse {
    schemaVersion: string;
    pairs: DexScreenerPair[];
}

// Jupiter Price API v2 (public, no auth required)

const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex/tokens';
const JUPITER_PRICE_API_V2_URL = 'https://api.jup.ag/price/v2';

async function fetchDexScreenerPrices(mints: string[]): Promise<Map<string, number>> {
    if (mints.length === 0) return new Map();

    const chunkedMints = mints.slice(0, 30);
    const ids = chunkedMints.join(',');
    const url = `${DEXSCREENER_API_URL}/${ids}`;

    try {
        // console.log(`[Prices] Fetching prices from DexScreener: ${url}`);
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`DexScreener API error: ${response.status}`);
        }

        const data: DexScreenerResponse = await response.json();
        const priceMap = new Map<string, number>();

        const pairsByToken = new Map<string, DexScreenerPair[]>();

        if (data.pairs) {
            data.pairs.forEach(pair => {
                const baseMint = pair.baseToken.address;
                if (!pairsByToken.has(baseMint)) {
                    pairsByToken.set(baseMint, []);
                }
                pairsByToken.get(baseMint)?.push(pair);
            });
        }

        chunkedMints.forEach(mint => {
            const pairs = pairsByToken.get(mint);
            if (pairs && pairs.length > 0) {
                pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
                const bestPair = pairs[0];
                if (bestPair.priceUsd) {
                    priceMap.set(mint, parseFloat(bestPair.priceUsd));
                }
            }
        });

        // console.log(`[Prices] Parsed ${priceMap.size} prices from DexScreener`);
        return priceMap;
    } catch (error) {
        console.error('Failed to fetch DexScreener prices:', error);
        return new Map();
    }
}

async function fetchJupiterPrices(mints: string[]): Promise<Map<string, number>> {
    if (mints.length === 0) return new Map();

    // Jupiter Price API v2 supports up to 100 mints (public, no auth required)
    const chunkedMints = mints.filter(m => !!m).slice(0, 100);
    const ids = chunkedMints.join(',');
    const url = `${JUPITER_PRICE_API_V2_URL}?ids=${ids}`;

    try {
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`Jupiter Price API error: ${response.status}`);
        }

        const data = await response.json();
        const priceMap = new Map<string, number>();

        // v2 response format: { data: { "mint": { "price": "123.45" } } }
        if (data?.data) {
            Object.entries(data.data).forEach(([mint, priceData]: [string, any]) => {
                const price = priceData?.price;
                if (price) {
                    priceMap.set(mint, parseFloat(price.toString()));
                }
            });
        }

        return priceMap;
    } catch (error: any) {
        // Jupiter v2 now often returns 401 without an API key.
        // We suppress this specific error to avoid console noise.
        // DexScreener will serve as fallback/primary.
        if (error.message && !error.message.includes('401')) {
            console.warn('Failed to fetch Jupiter prices:', error.message);
        }
        return new Map();
    }
}

export async function fetchTokenPrices(mints: string[]): Promise<Map<string, number>> {
    if (mints.length === 0) return new Map();

    // 1. Try Jupiter Price API v2 first (Faster, supports batching up to 100)
    const jupiterPrices = await fetchJupiterPrices(mints);

    // Check which mints are missing
    const missingMints = mints.filter(mint => !jupiterPrices.has(mint));

    if (missingMints.length === 0) {
        return jupiterPrices;
    }

    // console.log(`[Prices] ${missingMints.length} tokens missing from Jupiter, trying DexScreener fallback...`);

    // 2. Try DexScreener as fallback (Good for new/obscure tokens)
    const dexScreenerPrices = await fetchDexScreenerPrices(missingMints);

    // Merge results
    const finalPrices = new Map(jupiterPrices);
    dexScreenerPrices.forEach((price, mint) => {
        finalPrices.set(mint, price);
    });

    return finalPrices;
}
