import { Connection } from '@solana/web3.js';

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=05dd58ce-888b-4c84-b3c4-afd01eb3fe7c';
const SIGNATURE = '3KmDq5AWvGyEuM7b5xPTiH2DXxHAuJC7UzEvw1N62nm8PFEMFKGuwdgZXPnBaHSQT33wfMZwBtUhJdfpC4pWJymK'; // One of the signatures from previous log

async function run() {
    const connection = new Connection(RPC_URL);
    console.log(`Fetching transaction ${SIGNATURE}...`);

    try {
        const tx = await connection.getParsedTransaction(SIGNATURE, {
            maxSupportedTransactionVersion: 0,
        });

        if (!tx) {
            console.log("Transaction not found");
            return;
        }

        console.log("Instructions:", JSON.stringify(tx.transaction.message.instructions, null, 2));
        console.log("Log Messages:", tx.meta?.logMessages);

        // Simulate the parsing logic
        const userAddress = '3gefd9wqeQitwQ4oAbEUtD9wTVsqTvZFZ2TyCnCn5Wj4';
        let type = 'dapp-interaction';
        const instructions = tx.transaction.message.instructions;

        for (const ix of instructions) {
            if ('program' in ix && ix.program === 'system' && ix.parsed?.type === 'transfer') {
                const info = ix.parsed.info;
                if (info.source === userAddress) {
                    console.log("Found MATCHING transfer source:", info);
                    type = 'send';
                    break;
                }
            }
        }
        console.log("Calculated Type:", type);

    } catch (error) {
        console.error('Error:', error);
    }
}

run();
