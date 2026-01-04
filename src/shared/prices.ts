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

// Jupiter Price API v3 Interface


const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex/tokens';
const JUPITER_PRICE_API_V3_URL = 'https://api.jup.ag/price/v3/get';

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

    // Jupiter Price API v3 supports up to 100 mints
    const chunkedMints = mints.slice(0, 100);
    const ids = chunkedMints.join(',');
    const url = `${JUPITER_PRICE_API_V3_URL}?ids=${ids}&vsToken=USDC`;

    try {
        // console.log(`[Prices] Fetching prices from Jupiter API v3: ${url}`);

        const apiKey = import.meta.env.VITE_JUPITER_ULTRA_API_KEY;
        const headers: HeadersInit = {};
        if (apiKey) {
            headers['x-api-key'] = apiKey;
        }

        const response = await fetch(url, {
            cache: 'no-store',
            headers
        });

        if (!response.ok) {
            throw new Error(`Jupiter Price API v3 error: ${response.status}`);
        }

        const data = await response.json();
        const priceMap = new Map<string, number>();

        // V3 response is a direct map: { "mint": { "price": ... } }
        // Note: The response format might vary slightly based on docs vs reality.
        // Based on reproduction script output:
        // { "So111...": { "usdPrice": 135.37, ... } }
        // Wait, the reproduction script showed "usdPrice". Let's double check the interface.

        if (data) {
            Object.entries(data).forEach(([mint, priceData]: [string, any]) => {
                // Check for 'price' or 'usdPrice'
                const price = priceData?.price || priceData?.usdPrice;
                if (price) {
                    priceMap.set(mint, parseFloat(price.toString()));
                }
            });
        }

        // console.log(`[Prices] Parsed ${priceMap.size} prices from Jupiter API v3`);
        return priceMap;
    } catch (error) {
        console.error('Failed to fetch Jupiter prices:', error);
        return new Map();
    }
}

export async function fetchTokenPrices(mints: string[]): Promise<Map<string, number>> {
    if (mints.length === 0) return new Map();

    // 1. Try Jupiter Price API v2 first (Faster, supports batching up to 100)
    // Use public endpoint or Ultra if available (we use public for now as per existing code)
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
