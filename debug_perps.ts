
import { Connection, PublicKey } from '@solana/web3.js';

const JUPITER_PERPS_PROGRAM_ID = new PublicKey('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu');
const WALLET_ADDRESS = '3gefd9wqeQitwQ4oAbEUtD9wTVsqTvZFZ2TyCnCn5Wj4';
const RPC_URL = 'https://api.mainnet-beta.solana.com'; // Or use a better one if available

async function main() {
    const connection = new Connection(RPC_URL);
    const wallet = new PublicKey(WALLET_ADDRESS);

    console.log(`Fetching accounts for wallet: ${WALLET_ADDRESS}`);
    console.log(`Program ID: ${JUPITER_PERPS_PROGRAM_ID.toBase58()}`);

    const accounts = await connection.getProgramAccounts(JUPITER_PERPS_PROGRAM_ID, {
        filters: [
            {
                memcmp: {
                    offset: 8,
                    bytes: wallet.toBase58(),
                },
            },
        ],
    });

    console.log(`Found ${accounts.length} accounts`);

    for (const { pubkey, account } of accounts) {
        console.log(`\nAccount: ${pubkey.toBase58()}`);
        console.log(`Data Length: ${account.data.length}`);

        if (account.data.length !== 216) {
            console.log('Skipping non-position account');
            continue;
        }

        const data = account.data;
        const discriminator = Buffer.from(data.slice(0, 8)).toString('hex');
        console.log(`Discriminator: ${discriminator}`);

        if (discriminator !== 'aabc8fe47a40f7d0') {
            console.log('Invalid discriminator');
            continue;
        }

        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

        function readBigUInt64LE(offset: number) {
            return Number(view.getBigUint64(offset, true)) / 1_000_000;
        }
        function readBigInt64LE(offset: number) {
            return Number(view.getBigInt64(offset, true)) / 1_000_000;
        }

        const pool = new PublicKey(data.slice(40, 72)).toBase58();
        const field72 = new PublicKey(data.slice(72, 104)).toBase58();
        const field104 = new PublicKey(data.slice(104, 136)).toBase58();
        const sideVal = data[152];
        const price = readBigUInt64LE(153);
        const sizeUsd = readBigUInt64LE(161);
        const collateralUsd = readBigUInt64LE(169);
        const pnl = readBigInt64LE(177);

        console.log('--- Decoded Values ---');
        console.log(`Pool: ${pool}`);
        try {
            console.log(`\nAccount: ${pubkey.toBase58()}`);
            console.log(`Data Length: ${account.data.length}`);

            if (account.data.length !== 216) {
                console.log('Skipping non-position account');
                continue;
            }

            const data = account.data;
            const discriminator = Buffer.from(data.slice(0, 8)).toString('hex');
            console.log(`Discriminator: ${discriminator}`);

            if (discriminator !== 'aabc8fe47a40f7d0') {
                console.log('Invalid discriminator');
                continue;
            }

            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

            function readBigUInt64LE(offset: number) {
                return Number(view.getBigUint64(offset, true)) / 1_000_000;
            }
            function readBigInt64LE(offset: number) {
                return Number(view.getBigInt64(offset, true)) / 1_000_000;
            }

            const pool = new PublicKey(data.slice(40, 72)).toBase58();
            const field72 = new PublicKey(data.slice(72, 104)).toBase58();
            const field104 = new PublicKey(data.slice(104, 136)).toBase58();
            const sideVal = data[152];
            const price = readBigUInt64LE(153);
            const sizeUsd = readBigUInt64LE(161);
            const collateralUsd = readBigUInt64LE(169);
            const pnl = readBigInt64LE(177);

            console.log('--- Decoded Values ---');
            console.log(`Pool: ${pool}`);
            console.log(`Field 72: ${field72}`);
            console.log(`Field 104: ${field104}`);
            console.log(`Side: ${sideVal} (${sideVal === 1 ? 'Long' : 'Short'})`);
            console.log(`Price: ${price}`);
            console.log(`Size USD: ${sizeUsd}`);
            console.log(`Collateral USD: ${collateralUsd}`);
            console.log(`PnL (stored): ${pnl}`);
            // Dump full account data
            console.log('Full Account Data Hex:');
            console.log(account.data.toString('hex'));

            // Try to find the fee values in the buffer
            // Borrow Fee: 338.84 -> ~338840000 (if 6 decimals) or similar
            // Open/Close Fee: 9.16 -> ~9160000

            // Search for these values in the buffer
            const borrowFee = 338.84;
            const openFee = 9.16;

            // Check for 6 decimals (USDC)
            const borrowFee6 = Math.round(borrowFee * 1e6);
            const openFee6 = Math.round(openFee * 1e6);

            console.log(`Searching for Borrow Fee: ${borrowFee6} (0x${borrowFee6.toString(16)})`);
            console.log(`Searching for Open Fee: ${openFee6} (0x${openFee6.toString(16)})`);

            // Helper to find value in buffer
            const findInBuf = (val: number, name: string) => {
                for (let i = 0; i < account.data.length - 8; i++) {
                    try {
                        const u64 = account.data.readBigUInt64LE(i);
                        if (u64 === BigInt(val)) {
                            console.log(`Found ${name} (u64) at offset ${i}`);
                        }
                    } catch (e) { }
                }
            };

            findInBuf(borrowFee6, 'Borrow Fee');
            findInBuf(openFee6, 'Open Fee');

            // Fetch Custody Account
            console.log(`\nFetching Custody Account: ${field72}`);
            const custodyAcc = await connection.getAccountInfo(new PublicKey(field72));
            if (custodyAcc) {
                console.log('Custody Data Length:', custodyAcc.data.length);
                const cView = new DataView(custodyAcc.data.buffer, custodyAcc.data.byteOffset, custodyAcc.data.byteLength);

                const snapshot = Number(view.getBigUint64(185, true));
                console.log(`Snapshot Rate (offset 185): ${snapshot}`);

                // Search for a candidate Current Rate
                // Expected Fee ~$343 -> Current ~ 959,918,743
                const target = 959918743;
                console.log(`Searching for candidate rate around ${target} (0x${target.toString(16)})`);

                for (let i = 0; i < custodyAcc.data.length - 8; i++) {
                    try {
                        const val = Number(cView.getBigUint64(i, true));
                        if (val > snapshot && val < snapshot + 100_000_000) { // Reasonable growth
                            console.log(`Found candidate u64 at offset ${i}: ${val} (Diff: ${val - snapshot})`);
                            const fee = ((val - snapshot) / 1_000_000_000) * sizeUsd;
                            console.log(`  -> Implied Fee: ${fee}`);
                        }
                    } catch (e) { }
                }

                console.log('Custody Hex Dump (first 300 bytes):');
                console.log(custodyAcc.data.slice(0, 300).toString('hex').match(/../g)?.join(' '));
            } else {
                console.log('Custody account not found');
            }

        } catch (e) {
            console.error('Error:', e);
        }
    }
}

main().catch(console.error);
