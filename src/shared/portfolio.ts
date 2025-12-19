import { fetchTokenOHLC } from './tokenHistory';
import type { BalanceChange } from './history';

export interface PortfolioDataPoint {
    timestamp: number;
    value: number;
}

export const PORTFOLIO_STORAGE_KEY_PREFIX = 'portfolio_history_';

export async function getPortfolioHistory(address: string): Promise<PortfolioDataPoint[]> {
    const key = `${PORTFOLIO_STORAGE_KEY_PREFIX}${address}`;
    const result = await chrome.storage.local.get(key);
    return (result[key] as PortfolioDataPoint[]) || [];
}

export async function savePortfolioHistory(address: string, history: PortfolioDataPoint[]) {
    const key = `${PORTFOLIO_STORAGE_KEY_PREFIX}${address}`;
    await chrome.storage.local.set({ [key]: history });
}

export async function savePortfolioDataPoint(address: string, point: PortfolioDataPoint): Promise<void> {
    const key = `${PORTFOLIO_STORAGE_KEY_PREFIX}${address}`;
    const history = await getPortfolioHistory(address);

    // Add new point
    history.push(point);

    // Optional: Prune old data if needed (e.g., keep last 1000 points)
    // For now, let's keep it simple and store all. 
    // If it gets too large, we can implement pruning later.

    await chrome.storage.local.set({ [key]: history });
}

export async function calculateHistoricalPortfolio(
    currentAssets: { mint: string; amount: number; value: number }[],
    balanceChanges: BalanceChange[] = [],
    currentPrices: Map<string, number> = new Map() // Fallback prices for tokens without OHLC data
): Promise<PortfolioDataPoint[]> {
    // We need to track history even if current assets are empty, provided we have balance changes.
    // But if both are empty, return empty.
    console.log('[PortfolioDebug] === Starting calculateHistoricalPortfolio ===');
    console.log('[PortfolioDebug] Current Assets:', JSON.stringify(currentAssets.map(a => ({ mint: a.mint.slice(0, 8), amount: a.amount, value: a.value }))));
    console.log('[PortfolioDebug] Balance Changes:', balanceChanges.length);

    if (currentAssets.length === 0 && balanceChanges.length === 0) return [];

    // 1. Identify ALL significant assets (Current + Historical)
    const significantMints = new Set<string>();

    // Add current significant assets
    currentAssets.forEach(a => {
        if (a.value > 1 || a.mint === 'So11111111111111111111111111111111111111112') {
            significantMints.add(a.mint);
        }
    });

    // Add historical assets from balance changes
    // We don't know the value of historical assets without price, so we add ALL mints from history?
    // Or maybe we filter by some heuristic? 
    // For now, let's add all mints found in history. 
    // Note: 'SOL' in balanceChanges needs to be mapped to mint.
    balanceChanges.forEach(c => {
        const mint = c.mint === 'SOL' ? 'So11111111111111111111111111111111111111112' : c.mint;
        significantMints.add(mint);
    });

    if (significantMints.size === 0) return [];

    console.log('[PortfolioDebug] Significant Mints:', Array.from(significantMints).map(m => m.slice(0, 8)));

    // 2. Fetch OHLC for each asset
    // GeckoTerminal rate limit is ~30/min. 
    // If we have too many historical tokens (e.g. spam tokens), this might be slow or fail.
    // TODO: Implement better filtering or batching.
    const priceHistoryMap = new Map<string, { time: number; price: number }[]>(); // mint -> sorted array of {time, price}

    // Known stablecoins - their price is always $1
    const STABLECOINS: Record<string, number> = {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1.0, // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 1.0, // USDT
    };

    // Tokens with reliable GeckoTerminal OHLC (pool prices are in USD)
    const RELIABLE_OHLC_TOKENS = new Set([
        'So11111111111111111111111111111111111111112', // SOL
    ]);

    // Helper to process one asset
    const processAsset = async (mint: string) => {
        try {
            // Map 'SOL' to Wrapped SOL mint for price fetching if needed
            const queryMint = mint === 'SOL' ? 'So11111111111111111111111111111111111111112' : mint;

            // For stablecoins, generate synthetic price history at $1
            if (STABLECOINS[queryMint]) {
                const now = Date.now();
                const syntheticPrices = [];
                for (let i = 0; i < 168; i++) {
                    syntheticPrices.push({
                        time: now - (i * 3600 * 1000),
                        price: STABLECOINS[queryMint]
                    });
                }
                priceHistoryMap.set(mint, syntheticPrices.reverse());
                return;
            }

            // Only fetch OHLC for tokens with reliable data
            if (!RELIABLE_OHLC_TOKENS.has(queryMint)) {
                // For other tokens, use current price as flat history (if available)
                const currentPrice = currentPrices.get(mint);
                if (currentPrice && currentPrice > 0) {
                    const now = Date.now();
                    const flatPrices = [];
                    for (let i = 0; i < 168; i++) {
                        flatPrices.push({
                            time: now - (i * 3600 * 1000),
                            price: currentPrice
                        });
                    }
                    priceHistoryMap.set(mint, flatPrices.reverse());
                }
                return;
            }

            const ohlc = await fetchTokenOHLC(queryMint, 'hour', 168); // 7 days * 24h = 168
            const prices = ohlc.map(point => ({
                time: point.time * 1000,
                price: point.close
            })).sort((a, b) => a.time - b.time); // Ensure sorted Oldest -> Newest

            priceHistoryMap.set(mint, prices);
        } catch (e) {
            console.error(`Failed to fetch history for ${mint}`, e);
        }
    };

    // Run in parallel
    // Convert Set to Array
    await Promise.all(Array.from(significantMints).map(processAsset));

    console.log('[PortfolioDebug] Price History Map:');
    priceHistoryMap.forEach((prices, mint) => {
        const latestPrice = prices[prices.length - 1]?.price;
        const fallbackPrice = currentPrices.get(mint);
        console.log(`  ${mint.slice(0, 8)}: ${prices.length} prices, latest: $${latestPrice?.toFixed(2) || 'N/A'}${latestPrice === 0 && fallbackPrice ? ` (fallback: $${fallbackPrice.toFixed(4)})` : ''}`);
    });

    // 3. Replay History
    // We start from NOW and go BACKWARDS

    // Get all unique timestamps from price history to define our buckets
    const timestamps = new Set<number>();
    priceHistoryMap.forEach(prices => {
        prices.forEach(p => timestamps.add(p.time));
    });
    const sortedTimestamps = Array.from(timestamps).sort((a, b) => b - a); // Newest first

    if (sortedTimestamps.length === 0) return [];

    const portfolioHistory: PortfolioDataPoint[] = [];

    // Current holdings map
    const currentHoldings = new Map<string, number>();
    currentAssets.forEach(a => {
        const mint = a.mint === 'SOL' ? 'So11111111111111111111111111111111111111112' : a.mint;
        let amount = a.amount;

        // If amount is 0 but value is significant (e.g., DeFi positions with unavailable price),
        // estimate the amount using the latest OHLC price or fallback price
        if (amount === 0 && a.value > 0) {
            const prices = priceHistoryMap.get(mint);
            const latestOhlcPrice = prices && prices.length > 0 ? prices[prices.length - 1].price : 0;
            const fallbackPrice = currentPrices.get(mint) || 0;
            const priceToUse = latestOhlcPrice > 0 ? latestOhlcPrice : fallbackPrice;

            if (priceToUse > 0) {
                amount = a.value / priceToUse;
                console.log(`[PortfolioDebug] Estimated amount for ${mint.slice(0, 8)}: ${amount.toFixed(4)} (value: $${a.value.toFixed(2)}, price: $${priceToUse.toFixed(2)})`);
            }
        }

        const currentAmount = currentHoldings.get(mint) || 0;
        currentHoldings.set(mint, currentAmount + amount);
    });

    console.log('[PortfolioDebug] Initial Holdings (from currentAssets):');
    currentHoldings.forEach((amount, mint) => {
        console.log(`  ${mint.slice(0, 8)}: ${amount}`);
    });

    // Helper to get holdings at time T
    // We iterate backwards. 
    // At T_now, holdings are currentHoldings.
    // To go to T_prev, we REVERSE the transactions that happened between T_prev and T_now.

    // CRITICAL FIX: Find the earliest transaction timestamp
    // If a wallet was empty before, we should show $0 for times before the first transaction
    const earliestTransactionTime = balanceChanges.length > 0
        ? Math.min(...balanceChanges.map(c => c.timestamp))
        : Date.now(); // If no balance changes, assume wallet just started now

    console.log(`[PortfolioDebug] Earliest transaction time: ${new Date(earliestTransactionTime).toISOString()}`);

    let holdings = new Map(currentHoldings);
    let lastTime = Date.now();

    for (const time of sortedTimestamps) {
        // 1. Reverse transactions between lastTime and time
        // Find changes where: time <= change.timestamp < lastTime
        const relevantChanges = balanceChanges.filter(c => c.timestamp >= time && c.timestamp < lastTime);

        relevantChanges.forEach(change => {
            // Reverse the change: if we received amount, we subtract it to go back in time.
            // If we sent amount (negative), we add it back.
            // So: prevBalance = currentBalance - changeAmount

            // Handle 'SOL' mint mapping
            let mint = change.mint;
            if (mint === 'SOL') mint = 'So11111111111111111111111111111111111111112'; // Default SOL mint

            const currentAmount = holdings.get(mint) || 0;
            const newAmount = currentAmount - change.amount;
            holdings.set(mint, newAmount);
            // console.log(`[PortfolioDebug] Reverted ${change.amount} of ${mint}. New Balance: ${newAmount}`);
        });

        // CRITICAL FIX: If this timestamp is BEFORE the earliest transaction, 
        // the wallet was empty - show $0
        if (time < earliestTransactionTime) {
            portfolioHistory.push({ timestamp: time, value: 0 });
            console.log(`[PortfolioDebug] Time: ${new Date(time).toISOString()} | Value: $0.00 (before first transaction)`);
            lastTime = time;
            continue;
        }

        // 2. Calculate Value at 'time'
        let totalValue = 0;
        holdings.forEach((amount, mint) => {
            // Ignore dust
            if (Math.abs(amount) < 0.000001) return;

            const prices = priceHistoryMap.get(mint);
            if (prices && prices.length > 0) {
                // Find price at or before 'time'
                // Since prices are sorted Oldest -> Newest, we want the last price where p.time <= time
                // We can use binary search or simple findLast/reverse find
                // Given the array size is small (168), simple reverse search is fine.

                // Optimization: We could cache the index, but let's keep it simple first.
                // We want the closest price in the past (or present).
                // If the gap is too large (e.g. > 2 hours), maybe we shouldn't use it?
                // For now, let's just take the most recent valid price.

                let price = 0;
                // Walk backwards from end
                for (let i = prices.length - 1; i >= 0; i--) {
                    if (prices[i].time <= time) {
                        // Found a price in the past (or exact match)
                        if (time - prices[i].time < 2 * 3600 * 1000) {
                            price = prices[i].price;
                        }
                        break;
                    }
                }

                // Fallback: If no past price found, check if the oldest price is close enough (future price)
                // This handles cases where 'time' is slightly older than our oldest data point due to misalignment
                if (price === 0 && prices.length > 0) {
                    const oldestPrice = prices[0];
                    if (oldestPrice.time > time) {
                        if (oldestPrice.time - time < 2 * 3600 * 1000) {
                            price = oldestPrice.price;
                        }
                    }
                }

                // Fallback to current price ONLY for recent timestamps (within 2 hours of now)
                // This prevents inflating historical values with current prices for tokens without OHLC data
                const now = Date.now();
                const isRecentTimestamp = (now - time) < 2 * 3600 * 1000;
                if (price === 0 && isRecentTimestamp) {
                    const fallbackPrice = currentPrices.get(mint);
                    if (fallbackPrice && fallbackPrice > 0) {
                        price = fallbackPrice;
                    }
                }

                if (price > 0) {
                    totalValue += amount * price;
                }
            }
        });

        if (totalValue > 0) {
            portfolioHistory.push({ timestamp: time, value: totalValue });
        }

        // Log first few and last few data points
        if (portfolioHistory.length <= 3 || sortedTimestamps.indexOf(time) >= sortedTimestamps.length - 3) {
            console.log(`[PortfolioDebug] Time: ${new Date(time).toISOString()} | Value: $${totalValue.toFixed(2)}`);
        }

        lastTime = time;
    }

    return portfolioHistory.reverse(); // Return oldest first
}


