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
