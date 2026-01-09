import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenMetadata } from '@solana/spl-token';

const X1_RPC = 'https://rpc.mainnet.x1.xyz';
const USDC_X_MINT = new PublicKey('B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq');

async function main() {
    console.log('Connecting to X1 RPC:', X1_RPC);
    const connection = new Connection(X1_RPC, 'confirmed');

    console.log('Fetching Token-2022 Metadata for:', USDC_X_MINT.toBase58());

    try {
        const metadata = await getTokenMetadata(connection, USDC_X_MINT);
        if (metadata) {
            console.log('SUCCESS: Token-2022 Metadata found!');
            console.log('Name:', metadata.name);
            console.log('Symbol:', metadata.symbol);
            console.log('URI:', metadata.uri);

            if (metadata.uri) {
                console.log('Fetching URI content...');
                try {
                    const response = await fetch(metadata.uri);
                    if (response.ok) {
                        const json = await response.json();
                        console.log('Logo URI:', json.image);
                    } else {
                        console.log('Failed to fetch URI:', response.status);
                    }
                } catch (e) {
                    console.log('Error fetching URI:', e);
                }
            }
        } else {
            console.log('FAILURE: No metadata returned by getTokenMetadata.');
        }
    } catch (e) {
        console.error('Error calling getTokenMetadata:', e);
    }
}

main().catch(console.error);
