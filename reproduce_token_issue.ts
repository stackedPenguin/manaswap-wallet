
import { Connection, PublicKey } from '@solana/web3.js';
import { fetchUserTokens, fetchTokenMetadataMap } from './src/shared/tokens.ts';

import { fetchTokenPrices } from './src/shared/prices.ts';

async function run() {
    const connection = new Connection('https://rpc.ankr.com/solana');
    const pubkey = '3gefd9wqeQitwQ4oAbEUtD9wTVsqTvZFZ2TyCnCn5Wj4';

    console.log(`Fetching data for ${pubkey}...`);

    // 1. Fetch Tokens
    const tokens = await fetchUserTokens(connection, pubkey);
    console.log(`Found ${tokens.length} tokens.`);

    // 2. Fetch Prices
    const mints = tokens.map(t => t.mint);
    // Add SOL mint
    mints.push('So11111111111111111111111111111111111111112');

    console.log('Fetching prices...');
    const prices = await fetchTokenPrices(mints);
    console.log('Prices fetched:', prices.size);

    // 3. Calculate Values
    tokens.forEach(t => {
        const price = prices.get(t.mint) || 0;
        const amount = Number(t.amount) / Math.pow(10, t.decimals);
        const value = amount * price;

        console.log(`\nToken: ${t.symbol || 'Unknown'} (${t.mint})`);
        console.log(`  Raw Amount: ${t.amount}`);
        console.log(`  Decimals: ${t.decimals}`);
        console.log(`  UI Amount: ${amount}`);
        console.log(`  Price: $${price}`);
        console.log(`  Value: $${value.toFixed(2)}`);
        console.log(`  Logo: ${t.logoURI}`);
    });
}

run().catch(console.error);
