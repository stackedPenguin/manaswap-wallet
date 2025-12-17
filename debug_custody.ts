
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://api.mainnet-beta.solana.com'; // Or use the one from env if available
const CUSTODY_ID = '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz';

async function main() {
    const connection = new Connection(RPC_URL);
    const pubkey = new PublicKey(CUSTODY_ID);

    console.log(`Fetching Custody Account: ${pubkey.toBase58()}`);

    try {
        const account = await connection.getAccountInfo(pubkey);
        if (!account) {
            console.log('Account not found');
            return;
        }

        console.log(`Data Length: ${account.data.length}`);
        console.log('Full Account Data Hex:');
        console.log(account.data.toString('hex'));

        // We are looking for a value larger than 937416379 (the snapshot in position)
        // If the fee is $338.84 on $15272 size, the rate diff is ~0.02218
        // So current rate should be ~937416379 + (0.02218 * scaling_factor)
        // If scaling factor is 1e9 (likely for rates), then 0.022 * 1e9 = 22,000,000
        // So looking for ~960,000,000 range.

        // Let's dump all u64s
        const view = new DataView(account.data.buffer, account.data.byteOffset, account.data.byteLength);
        for (let i = 0; i < account.data.length - 8; i += 8) {
            const val = view.getBigUint64(i, true);
            if (val > 900_000_000n && val < 1_000_000_000n) {
                console.log(`Found candidate at Offset ${i}: ${val.toString()} (0x${val.toString(16)})`);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

main().catch(console.error);
