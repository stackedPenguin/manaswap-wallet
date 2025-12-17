import { Connection, PublicKey } from '@solana/web3.js';
import { JUPITER_PERPS_PROGRAM_ID } from './src/shared/perps';

async function main() {
    const rpcUrl = 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl);

    // We need to find the user's position first. 
    // Since I don't have the user's address hardcoded, I'll use the one from the previous debug session or ask the user.
    // Wait, I can't ask the user easily. I'll search for positions for the known address if I have it, 
    // or I'll just fetch ALL positions for the program and find one that looks like the user's (Size ~$15k).
    // Actually, the previous debug logs might have the address.
    // Let's try to find a position with size around $15,272.

    // User's address from previous logs (if available). 
    // Looking at previous logs... I don't see the full address explicitly in the summary.
    // But I can try to fetch for the connected wallet if I could run this in the browser context, but this is a node script.

    // Let's try to fetch a few positions and see if we can find a non-zero borrow fee to validate the logic.
    // Or better, let's just fetch the top positions and inspect their borrow fields.

    // Target Size: $15,272.41
    // Raw value = 15272.41 * 1e6 = 15272410000 (approx)
    // Let's try to find it. Since exact float match is hard, maybe we can just fetch a smaller subset or try to find by owner if we can guess it.
    // Actually, let's just try to fetch the specific position if we can find the pubkey from previous logs.
    // Looking at previous logs... I don't see the pubkey.

    // Let's try to fetch by a range of size? No, memcmp is exact.
    // Let's try to fetch just 100 accounts and see if we get lucky, or better, use a known custody ID to filter.
    // Custody ID for SOL: 7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz

    console.log('Fetching program accounts (filtered by SOL custody)...');
    const accounts = await connection.getProgramAccounts(new PublicKey(JUPITER_PERPS_PROGRAM_ID), {
        filters: [
            { dataSize: 216 },
            {
                memcmp: {
                    offset: 72, // Custody ID
                    bytes: '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz'
                }
            }
        ],
        dataSlice: { offset: 0, length: 216 }
    });

    console.log(`Found ${accounts.length} positions.`);

    // Helper to read u64
    const readu64 = (buffer: Buffer, offset: number) => {
        return Number(buffer.readBigUInt64LE(offset));
    };

    let found = false;
    for (const acc of accounts) {
        const data = acc.account.data;
        const sizeUsd = readu64(data, 161) / 1e6;

        // Look for the user's specific position size to be sure
        if (Math.abs(sizeUsd - 15272.41) < 10) {
            console.log('\n--- FOUND CANDIDATE POSITION ---');
            console.log('Pubkey:', acc.pubkey.toBase58());
            console.log('Size USD:', sizeUsd);

            const snapshot = readu64(data, 185);
            console.log('Snapshot Borrow Rate (offset 185):', snapshot);

            const custodyId = new PublicKey(data.slice(72, 104));
            console.log('Custody ID:', custodyId.toBase58());

            // Fetch Custody
            const custodyAcc = await connection.getAccountInfo(custodyId);
            if (custodyAcc) {
                const currentRate = Number(custodyAcc.data.readBigUInt64LE(136));
                console.log('Current Borrow Rate (Custody offset 136):', currentRate);

                const diff = currentRate - snapshot;
                console.log('Rate Diff:', diff);

                const fee = (diff / 1e9) * sizeUsd;
                console.log('Calculated Fee:', fee);

                // Dump Custody Data around 136 to see if we missed it
                console.log('Custody Data around 136:', custodyAcc.data.slice(120, 160).toString('hex'));
            }
            found = true;
            break;
        }
    }

    if (!found) {
        console.log('Could not find the specific position. Dumping a random one with high borrow fee potential...');
        // ... logic to find another one if needed
    }
}

main().catch(console.error);
