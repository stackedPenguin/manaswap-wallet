
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
    return Array(limit).fill(0).map((_, i) => ({
        time: (Date.now() / 1000) - (i * 3600),
        open: price, high: price, low: price, close: price
    }));
}

async function calculateHistoricalPortfolio(
    currentAssets: { mint: string; amount: number; value: number }[],
    balanceChanges: BalanceChange[] = []
): Promise<PortfolioDataPoint[]> {
    // COPIED LOGIC FROM portfolio.ts (Simplified for reproduction)

    // 1. Filter significant assets (BUG: Only looks at currentAssets)
    const significantAssets = currentAssets.filter(a => a.value > 1 || a.mint === 'So11111111111111111111111111111111111111112');

    // 2. Fetch OHLC
    const priceHistoryMap = new Map<string, Map<number, number>>();

    const processAsset = async (asset: { mint: string; amount: number }) => {
        const mint = asset.mint === 'SOL' ? 'So11111111111111111111111111111111111111112' : asset.mint;
        const ohlc = await fetchTokenOHLC(mint, 'hour', 168);
        const priceMap = new Map<number, number>();
        ohlc.forEach(point => {
            priceMap.set(point.time * 1000, point.close);
        });
        priceHistoryMap.set(asset.mint, priceMap);
    };

    await Promise.all(significantAssets.map(processAsset));

    // 3. Replay
    const timestamps = new Set<number>();
    priceHistoryMap.forEach(map => {
        map.forEach((_, ts) => timestamps.add(ts));
    });
    const sortedTimestamps = Array.from(timestamps).sort((a, b) => b - a);

    const portfolioHistory: PortfolioDataPoint[] = [];
    const currentHoldings = new Map<string, number>();
    currentAssets.forEach(a => currentHoldings.set(a.mint, a.amount));

    let holdings = new Map(currentHoldings);
    let lastTime = Date.now();

    for (const time of sortedTimestamps) {
        // Reverse transactions
        const relevantChanges = balanceChanges.filter(c => c.timestamp >= time && c.timestamp < lastTime);

        relevantChanges.forEach(change => {
            let mint = change.mint;
            if (mint === 'SOL') mint = 'So11111111111111111111111111111111111111112';
            const currentAmount = holdings.get(mint) || 0;
            holdings.set(mint, currentAmount - change.amount);
        });

        // Calculate Value
        let totalValue = 0;
        holdings.forEach((amount, mint) => {
            const priceMap = priceHistoryMap.get(mint);
            if (priceMap) {
                // Find closest price (simplified: exact match)
                // In real code we match exact time from OHLC
                // Here we just grab the first one for simplicity or check existence
                // The mock returns exact times matching the loop if we align them, 
                // but for this test we just want to see if the asset is even considered.

                // If priceMap is missing (because asset wasn't in significantAssets), value is 0.
                const price = 100; // Mock price
                if (mint.includes('USDC')) {
                    // If we are here, it means we ARE tracking USDC.
                    totalValue += amount * 1;
                } else {
                    totalValue += amount * 100;
                }
            }
        });

        if (totalValue > 0) {
            portfolioHistory.push({ timestamp: time, value: totalValue });
        }
        lastTime = time;
    }

    return portfolioHistory;
}

// SCENARIO:
// Current: 10 SOL ($1000), 0 USDC ($0).
// History: 1 hour ago, Swapped 1000 USDC for 10 SOL.
// Expected Past State: 0 SOL, 1000 USDC. Total Value: $1000.
// Actual State (Hypothesis): 0 SOL, 0 USDC (ignored). Total Value: $0.

const currentAssets = [
    { mint: 'So11111111111111111111111111111111111111112', amount: 10, value: 1000 }
];

const balanceChanges: BalanceChange[] = [
    // Received 10 SOL 30 mins ago
    { timestamp: Date.now() - 1800000, mint: 'SOL', amount: 10, signature: 'sig1' },
    // Sent 1000 USDC 30 mins ago
    { timestamp: Date.now() - 1800000, mint: 'USDC_MINT_ADDRESS', amount: -1000, signature: 'sig1' }
];

calculateHistoricalPortfolio(currentAssets, balanceChanges).then(history => {
    console.log("History Points:", history.length);
    // Check the oldest point (should be > 0)
    if (history.length > 0) {
        const oldest = history[history.length - 1];
        console.log("Oldest Value:", oldest.value);
        if (oldest.value < 100) {
            console.log("FAIL: Value dropped to near zero. USDC was ignored.");
        } else {
            console.log("PASS: Value maintained. USDC was tracked.");
        }
    }
});
