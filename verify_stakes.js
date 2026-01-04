import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://rpc.mainnet.x1.xyz';
const WALLET = 'E95PaZhsPU5fBp6B4kg239BFjN6PgGkhChMBiidXG8Vn';

async function main() {
    console.log(`Connecting to ${RPC_URL}...`);
    const connection = new Connection(RPC_URL, 'confirmed');

    console.log(`Fetching epoch info...`);
    const epochInfo = await connection.getEpochInfo();
    console.log('Current Epoch:', epochInfo.epoch);

    const wallet = new PublicKey(WALLET);
    const stakeAccounts = await connection.getParsedProgramAccounts(
        new PublicKey('Stake11111111111111111111111111111111111111'),
        {
            filters: [
                { dataSize: 200 },
                {
                    memcmp: {
                        offset: 12,
                        bytes: wallet.toBase58(),
                    },
                },
            ],
        }
    );

    console.log(`Found ${stakeAccounts.length} stake accounts.`);

    // Check rewards for last epoch
    const lastEpoch = epochInfo.epoch > 0 ? epochInfo.epoch - 1 : 0;
    console.log(`Fetching rewards for epoch ${lastEpoch}...`);

    // getInflationReward expects array of PublicKeys
    const stakePubkeys = stakeAccounts.map(a => a.pubkey);
    // Note: getInflationReward returns (InflationReward | null)[]
    const rewards = await connection.getInflationReward(stakePubkeys, lastEpoch);
    console.log('Rewards raw:', JSON.stringify(rewards, null, 2));

    for (let i = 0; i < stakeAccounts.length; i++) {
        const acc = stakeAccounts[i];
        const pubkey = acc.pubkey.toBase58();
        const data = acc.account.data.parsed.info;
        const stake = data.stake;
        const balance = acc.account.lamports / 1_000_000_000;
        const reward = rewards[i];

        console.log(`\nStake Account: ${pubkey}`);
        console.log(`Balance: ${balance} XNT`);
        if (reward) {
            console.log(`Last Epoch Reward: ${reward.amount} lamports (${reward.amount / 1_000_000_000} XNT)`);
        } else {
            console.log(`Last Epoch Reward: None`);
        }

        if (stake) {
            const delegation = stake.delegation;
            const activationEpoch = delegation.activationEpoch;
            console.log(`  Activation: ${activationEpoch}`);
            console.log(`  Current: ${epochInfo.epoch}`);

            // Test "Activating" logic
            if (parseInt(activationEpoch) < epochInfo.epoch) {
                console.log('  Logic says: Active');
            } else {
                console.log('  Logic says: Activating (since activation >= current)');
            }
        }
    }
}

main().catch(console.error);
