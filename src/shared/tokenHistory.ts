export interface OHLCData {
    time: number; // Unix timestamp in seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface TokenMarketData {
    priceUsd: number;
    marketCap: number;
    volume24h: number;
    priceChange24h: number;
}

const GECKOTERMINAL_API_BASE = 'https://api.geckoterminal.com/api/v2';

export async function fetchTokenPoolAddress(mint: string): Promise<string | null> {
    try {
        // Fetch top pools for the token
        const url = `${GECKOTERMINAL_API_BASE}/networks/solana/tokens/${mint}/pools?page=1`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        if (data.data && data.data.length > 0) {
            // Return the address of the first (top) pool
            return data.data[0].attributes.address;
        }
        return null;
    } catch (error) {
        console.error('Failed to fetch pool address:', error);
        return null;
    }
}

export async function fetchTokenOHLC(mint: string, timeframe: 'hour' | 'day' = 'day', limit: number = 100): Promise<OHLCData[]> {
    // Go directly to GeckoTerminal (Birdeye requires API key)
    return fetchGeckoTerminalOHLC(mint, timeframe, limit);
}

async function fetchGeckoTerminalOHLC(mint: string, timeframe: 'hour' | 'day', limit: number): Promise<OHLCData[]> {
    try {
        // 1. Get pool address
        const poolAddress = await fetchTokenPoolAddress(mint);
        if (!poolAddress) {
            console.warn(`No pool found for mint: ${mint}`);
            return [];
        }

        // 2. Determine timeframe param
        const tf = timeframe === 'day' ? 'day' : 'hour';
        const aggregate = 1;

        const url = `${GECKOTERMINAL_API_BASE}/networks/solana/pools/${poolAddress}/ohlcv/${tf}?limit=${limit}&aggregate=${aggregate}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`GeckoTerminal API error: ${response.status}`);
        }

        const data = await response.json();
        const ohlcList = data.data.attributes.ohlcv_list;

        return ohlcList.map((item: number[]) => ({
            time: item[0],
            open: item[1],
            high: item[2],
            low: item[3],
            close: item[4],
            volume: item[5]
        })).reverse();

    } catch (error) {
        console.error('GeckoTerminal OHLC failed:', error);
        return [];
    }
}

export async function fetchTokenMarketData(mint: string): Promise<TokenMarketData | null> {
    try {
        const poolAddress = await fetchTokenPoolAddress(mint);
        if (!poolAddress) return null;

        const url = `${GECKOTERMINAL_API_BASE}/networks/solana/pools/${poolAddress}`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        const attrs = data.data.attributes;

        return {
            priceUsd: parseFloat(attrs.base_token_price_usd),
            marketCap: parseFloat(attrs.fdv_usd || attrs.market_cap_usd || '0'),
            volume24h: parseFloat(attrs.volume_usd.h24),
            priceChange24h: parseFloat(attrs.price_change_percentage.h24)
        };
    } catch (error) {
        console.error('Failed to fetch market data:', error);
        return null;
    }
}
