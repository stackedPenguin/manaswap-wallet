
interface BalanceChange {
    timestamp: number;
    mint: string;
    amount: number;
    signature: string;
}

interface PortfolioDataPoint {
    timestamp: number;
    value: number;
}

// Mock fetchTokenOHLC
async function fetchTokenOHLC(mint: string, timeframe: string, limit: number) {
    // Return constant price for simplicity
    // SOL = $100
    // USDC = $1
    const price = mint.includes('So111') ? 100 : 1;
    // Generate hourly data for last 24h
    const now = Math.floor(Date.now() / 1000);
    return Array(limit).fill(0).map((_, i) => {
        // Simulate missing data for USDC at odd hours
        if (!mint.includes('So111') && i % 2 !== 0) return null;

        return {
            time: now - (i * 3600),
            open: price, high: price, low: price, close: price
        };
    }).filter(x => x !== null) as any[];
}

async function calculateHistoricalPortfolio(
    currentAssets: { mint: string; amount: number; value: number }[],
    balanceChanges: BalanceChange[] = []
): Promise<PortfolioDataPoint[]> {
    // COPIED LOGIC FROM portfolio.ts

    if (currentAssets.length === 0 && balanceChanges.length === 0) return [];

    const significantMints = new Set<string>();
    currentAssets.forEach(a => {
        if (a.value > 1 || a.mint === 'So11111111111111111111111111111111111111112') {
            significantMints.add(a.mint);
        }
    });
    balanceChanges.forEach(c => {
        const mint = c.mint === 'SOL' ? 'So11111111111111111111111111111111111111112' : c.mint;
        significantMints.add(mint);
    });

    if (significantMints.size === 0) return [];

    const priceHistoryMap = new Map<string, { time: number; price: number }[]>();

    const processAsset = async (mint: string) => {
        try {
            const queryMint = mint === 'SOL' ? 'So11111111111111111111111111111111111111112' : mint;
            const ohlc = await fetchTokenOHLC(queryMint, 'hour', 24);
            const prices = ohlc.map(point => ({
                time: point.time * 1000,
                price: point.close
            })).sort((a, b) => a.time - b.time);
            priceHistoryMap.set(mint, prices);
        } catch (e) {
            console.error(`Failed to fetch history for ${mint}`, e);
        }
    };

    await Promise.all(Array.from(significantMints).map(processAsset));

    const timestamps = new Set<number>();
    priceHistoryMap.forEach(prices => {
        prices.forEach(p => timestamps.add(p.time));
    });
    const sortedTimestamps = Array.from(timestamps).sort((a, b) => b - a);

    if (sortedTimestamps.length === 0) return [];

    const portfolioHistory: PortfolioDataPoint[] = [];
    const currentHoldings = new Map<string, number>();
    currentAssets.forEach(a => {
        const mint = a.mint === 'SOL' ? 'So11111111111111111111111111111111111111112' : a.mint;
        currentHoldings.set(mint, a.amount);
    });

    let holdings = new Map(currentHoldings);
    let lastTime = Date.now();

    for (const time of sortedTimestamps) {
        const relevantChanges = balanceChanges.filter(c => c.timestamp >= time && c.timestamp < lastTime);

        relevantChanges.forEach(change => {
            let mint = change.mint;
            if (mint === 'SOL') mint = 'So11111111111111111111111111111111111111112';
            const currentAmount = holdings.get(mint) || 0;
            holdings.set(mint, currentAmount - change.amount);
        });

        let totalValue = 0;
        holdings.forEach((amount, mint) => {
            if (Math.abs(amount) < 0.000001) return;
            const prices = priceHistoryMap.get(mint);
            if (prices && prices.length > 0) {
                let price = 0;
                // Walk backwards from end
                for (let i = prices.length - 1; i >= 0; i--) {
                    if (prices[i].time <= time) {
                        const diff = time - prices[i].time;
                        if (diff < 2 * 3600 * 1000) {
                            price = prices[i].price;
                        } else {
                            // console.log(`Price too old for ${mint} at ${time}. Diff: ${diff/1000}s`);
                        }
                        break;
                    }
                }

                // Fallback: If no past price found, check if the oldest price is close enough (future price)
                if (price === 0 && prices.length > 0) {
                    const oldestPrice = prices[0];
                    if (oldestPrice.time > time) {
                        if (oldestPrice.time - time < 2 * 3600 * 1000) {
                            price = oldestPrice.price;
                        }
                    }
                }

                if (price === 0 && mint !== 'So11111111111111111111111111111111111111112') {
                    console.log(`No price for USDC at ${time} (${new Date(time).toISOString()}). Closest: ${prices[prices.length - 1].time}`);
                }

                if (price > 0) {
                    totalValue += amount * price;
                }
            }
        });

        if (totalValue > 0) {
            portfolioHistory.push({ timestamp: time, value: totalValue });
        }
        lastTime = time;
    }

    return portfolioHistory.reverse();
}

// SCENARIO:
// Current: 10 SOL ($1000), 1000 USDC ($1000). Total $2000.
// History: No changes. Should be flat $2000.
// If it drops to $1000 (SOL only), then USDC is missing.

const currentAssets = [
    { mint: 'So11111111111111111111111111111111111111112', amount: 10, value: 1000 },
    { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: 1000, value: 1000 } // USDC
];

const balanceChanges: BalanceChange[] = [];

calculateHistoricalPortfolio(currentAssets, balanceChanges).then(history => {
    console.log("History Points:", history.length);
    if (history.length > 0) {
        const latest = history[history.length - 1];
        const oldest = history[0];
        console.log("Latest Value:", latest.value);
        console.log("Oldest Value:", oldest.value);

        if (oldest.value < 1500) {
            console.log("FAIL: Value dropped significantly. Likely missing assets.");
        } else {
            console.log("PASS: Value maintained.");
        }
    }
});
