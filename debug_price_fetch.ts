
const JUPITER_PRICE_API_V2_URL = 'https://api.jup.ag/price/v2';
const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex/tokens';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

async function fetchJupiterV4() {
    const url = `https://price.jup.ag/v4/price?ids=${SOL_MINT}`;
    console.log(`Fetching Jupiter V4: ${url}`);
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log('Jupiter V4 Data:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Jupiter V4 Error:', e);
    }
}

async function fetchJupiter() {
    const url = `${JUPITER_PRICE_API_V2_URL}?ids=${SOL_MINT}`;
    console.log(`Fetching Jupiter: ${url}`);
    try {
        const res = await fetch(url, {
            headers: {
                'Origin': 'https://jup.ag'
            }
        });
        const data = await res.json();
        console.log('Jupiter Data:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Jupiter Error:', e);
    }
}

async function fetchDexScreener() {
    const url = `${DEXSCREENER_API_URL}/${SOL_MINT}`;
    console.log(`Fetching DexScreener: ${url}`);
    try {
        const res = await fetch(url);
        const data = await res.json();
        // Log first pair price
        if (data.pairs && data.pairs.length > 0) {
            const bestPair = data.pairs[0];
            console.log('DexScreener Best Pair Price:', bestPair.priceUsd);
            console.log('DexScreener Best Pair:', bestPair.pairAddress, bestPair.dexId);
        } else {
            console.log('DexScreener: No pairs found');
        }
    } catch (e) {
        console.error('DexScreener Error:', e);
    }
}

async function main() {
    await fetchJupiterV4();
    await fetchJupiter();
    await fetchDexScreener();
}

main();
