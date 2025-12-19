
const JUPITER_PRICE_API_V2_URL = 'https://api.jup.ag/price/v2';
const IDS = 'So11111111111111111111111111111111111111112'; // SOL
const API_KEY = process.env.VITE_JUPITER_ULTRA_API_KEY || ''; // Set via environment variable

async function testJupiterV2() {
    const url = `${JUPITER_PRICE_API_V2_URL}?ids=${IDS}`; // Removed vsToken
    console.log(`Testing V2 URL (no vsToken): ${url}`);
    try {
        const response = await fetch(url, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log(`V2 Status: ${response.status}`);
        if (response.ok) {
            const data = await response.json();
            console.log('V2 Data:', JSON.stringify(data, null, 2));
        } else {
            console.log('V2 Error:', await response.text());
        }
    } catch (e) {
        console.error('V2 Exception:', e);
    }
}

async function testJupiterV3() {
    // V3 Endpoint: https://api.jup.ag/price/v2 is 404, so trying V2 GET or V3
    // Actually, documentation says https://api.jup.ag/price/v2?ids=... SHOULD work if not deprecated.
    // But let's try the specific GET path if it exists, or V2 specific path.
    // Wait, maybe it's https://price.jup.ag/v6/price?ids=... (Standard API)
    // OR https://api.jup.ag/price/v2/get?ids=...

    // V3 Endpoint: https://api.jup.ag/price/v3
    // Documentation says "GET /price/v3/get"
    const url = `https://api.jup.ag/price/v3/get?ids=${IDS}&vsToken=USDC`;
    console.log(`Testing V3 URL: ${url}`);
    try {
        const response = await fetch(url, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log(`V2 GET Status: ${response.status}`);
        if (response.ok) {
            const data = await response.json();
            console.log('V2 GET Data:', JSON.stringify(data, null, 2));
        } else {
            console.log('V2 GET Error:', await response.text());
        }
    } catch (e) { console.error(e); }
}

testJupiterV2();
testJupiterV3();
