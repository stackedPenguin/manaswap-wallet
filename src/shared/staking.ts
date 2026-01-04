/**
 * X1 Staking Library
 * 
 * X1 is a Solana-fork, so staking uses Solana's native StakeProgram.
 * Stake accounts are created, delegated to validators, and earn rewards.
 */

import {
    Connection,
    PublicKey,
    Transaction,
    StakeProgram,
    SystemProgram,
    Keypair,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const STAKE_ACCOUNT_SIZE = 200; // bytes

// =============================================================================
// Types
// =============================================================================

export interface ValidatorInfo {
    voteAccount: string;
    identity: string;
    commission: number;
    activatedStake: number;
    lastVote: number;
    credits: number;
    name?: string;
    imageUrl?: string;
}

export interface StakeAccountInfo {
    address: string;
    balance: number;
    state: 'inactive' | 'activating' | 'active' | 'deactivating';
    activeStake: number;
    delegatedVoteAccount: string | null;
    stakeAuthority: string;
    withdrawAuthority: string;
    activationEpoch: number | null;
    deactivationEpoch: number | null;
    lastEpochReward: number; // in XNT
}

// =============================================================================
// Validator Operations
// =============================================================================

// Known validators metadata
const VALIDATOR_METADATA: Record<string, { name: string; imageUrl: string }> = {
    'X1SPaMUM1A8E1vKL8XQAB5rxKarJbqtWFFSNFs8f7Av': {
        name: 'X1 Foundation',
        imageUrl: '/icons/x1-logo.png'
    }
};

/**
 * Fetch all active validators from the X1 network
 */
export async function getValidators(connection: Connection): Promise<ValidatorInfo[]> {
    const voteAccounts = await connection.getVoteAccounts();

    const validators: ValidatorInfo[] = voteAccounts.current.map(v => ({
        voteAccount: v.votePubkey,
        identity: v.nodePubkey,
        commission: v.commission,
        activatedStake: v.activatedStake,
        lastVote: v.lastVote,
        credits: v.epochCredits.length > 0
            ? v.epochCredits[v.epochCredits.length - 1][1]
            : 0,
        ...VALIDATOR_METADATA[v.votePubkey]
    }));

    // Sort by activated stake descending
    return validators.sort((a, b) => b.activatedStake - a.activatedStake);
}

// =============================================================================
// Stake Account Operations
// =============================================================================

/**
 * Get all stake accounts for a wallet address
 */
export async function getStakeAccountsForWallet(
    connection: Connection,
    walletAddress: string
): Promise<StakeAccountInfo[]> {
    const wallet = new PublicKey(walletAddress);

    // Get all stake accounts where wallet is the stake authority
    const stakeAccounts = await connection.getParsedProgramAccounts(
        StakeProgram.programId,
        {
            filters: [
                { dataSize: 200 },
                {
                    memcmp: {
                        offset: 12, // Offset for stake authority
                        bytes: wallet.toBase58(),
                    },
                },
            ],
        }
    );

    const results: StakeAccountInfo[] = [];
    const epochInfo = await connection.getEpochInfo();
    const currentEpoch = epochInfo.epoch;
    const lastEpoch = currentEpoch > 0 ? currentEpoch - 1 : 0;

    // Fetch rewards for last epoch
    // Using import() for type safety if needed, but here simple usage
    let rewards: (import('@solana/web3.js').InflationReward | null)[] = [];
    try {
        const stakePubkeys = stakeAccounts.map(a => a.pubkey);
        if (stakePubkeys.length > 0) {
            rewards = await connection.getInflationReward(stakePubkeys, lastEpoch);
        }
    } catch (e) {
        console.warn('[Staking] Failed to fetch rewards:', e);
        // Fallback to empty rewards
        rewards = new Array(stakeAccounts.length).fill(null);
    }

    for (let i = 0; i < stakeAccounts.length; i++) {
        const account = stakeAccounts[i];
        const reward = rewards[i];
        const lastEpochReward = reward ? reward.amount / LAMPORTS_PER_SOL : 0;

        try {
            const parsed = await connection.getParsedAccountInfo(account.pubkey);
            if (!parsed.value || !('parsed' in parsed.value.data)) continue;

            const data = (parsed.value.data as { parsed: { info: any } }).parsed;
            const info = data.info;
            const stake = info.stake;

            let state: StakeAccountInfo['state'] = 'inactive';
            let activeStake = 0;
            let delegatedVoteAccount = null;
            let activationEpoch = null;
            let deactivationEpoch = null;

            if (stake) {
                delegatedVoteAccount = stake.delegation.voter;
                activationEpoch = parseInt(stake.delegation.activationEpoch);
                deactivationEpoch = parseInt(stake.delegation.deactivationEpoch);

                // Max epoch means not deactivating
                const maxEpoch = 18446744073709551615n;
                const isDeactivating = BigInt(deactivationEpoch) < maxEpoch;

                if (isDeactivating) {
                    if (BigInt(deactivationEpoch) <= BigInt(currentEpoch)) {
                        state = 'inactive';
                    } else {
                        state = 'deactivating';
                        activeStake = parseInt(stake.delegation.stake);
                    }
                } else if (activationEpoch < currentEpoch) {
                    // Fully active if past activation epoch
                    state = 'active';
                    activeStake = parseInt(stake.delegation.stake);
                } else {
                    // Activating if current epoch is activation epoch (warmup)
                    state = 'activating';
                    activeStake = parseInt(stake.delegation.stake);
                }
            }

            results.push({
                address: account.pubkey.toBase58(),
                balance: parsed.value.lamports / LAMPORTS_PER_SOL,
                state,
                activeStake: activeStake / LAMPORTS_PER_SOL,
                delegatedVoteAccount,
                stakeAuthority: info.meta.authorized.staker,
                withdrawAuthority: info.meta.authorized.withdrawer,
                activationEpoch,
                deactivationEpoch,
                lastEpochReward,
            });
        } catch (e) {
            console.warn('[Staking] Failed to parse stake account:', account.pubkey.toBase58(), e);
        }
    }

    return results;
}

// =============================================================================
// Transaction Builders (for signing via wallet)
// =============================================================================

/**
 * Build transaction to create a new stake account and delegate to validator
 * Returns: { transaction, stakeAccountKeypair }
 */
export async function buildStakeTransaction(
    connection: Connection,
    walletAddress: string,
    amountInXNT: number,
    voteAccountAddress: string
): Promise<{ transaction: Transaction; stakeAccountKeypair: Keypair }> {
    const wallet = new PublicKey(walletAddress);
    const voteAccount = new PublicKey(voteAccountAddress);
    const stakeAccount = Keypair.generate();
    const lamports = Math.floor(amountInXNT * LAMPORTS_PER_SOL);

    // Get minimum rent exemption
    const rentExemption = await connection.getMinimumBalanceForRentExemption(STAKE_ACCOUNT_SIZE);

    if (lamports < rentExemption) {
        throw new Error(`Minimum stake amount is ${(rentExemption / LAMPORTS_PER_SOL).toFixed(4)} XNT`);
    }

    const transaction = new Transaction();

    // Create stake account
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: wallet,
            newAccountPubkey: stakeAccount.publicKey,
            lamports,
            space: STAKE_ACCOUNT_SIZE,
            programId: StakeProgram.programId,
        })
    );

    // Initialize stake account
    transaction.add(
        StakeProgram.initialize({
            stakePubkey: stakeAccount.publicKey,
            authorized: {
                staker: wallet,
                withdrawer: wallet,
            },
        })
    );

    // Delegate stake to validator
    transaction.add(
        StakeProgram.delegate({
            stakePubkey: stakeAccount.publicKey,
            authorizedPubkey: wallet,
            votePubkey: voteAccount,
        })
    );

    // Set recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet;

    return { transaction, stakeAccountKeypair: stakeAccount };
}

/**
 * Build transaction to deactivate (unstake) a stake account
 * After deactivation, wait for epoch boundary then withdraw
 */
export async function buildDeactivateTransaction(
    connection: Connection,
    walletAddress: string,
    stakeAccountAddress: string
): Promise<Transaction> {
    const wallet = new PublicKey(walletAddress);
    const stakeAccount = new PublicKey(stakeAccountAddress);

    const transaction = new Transaction().add(
        StakeProgram.deactivate({
            stakePubkey: stakeAccount,
            authorizedPubkey: wallet,
        })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet;

    return transaction;
}

/**
 * Build transaction to withdraw from a deactivated stake account
 */
export async function buildWithdrawTransaction(
    connection: Connection,
    walletAddress: string,
    stakeAccountAddress: string,
    amountInXNT?: number // If undefined, withdraws all
): Promise<Transaction> {
    const wallet = new PublicKey(walletAddress);
    const stakeAccount = new PublicKey(stakeAccountAddress);

    let lamports: number;
    if (amountInXNT === undefined) {
        const accountInfo = await connection.getAccountInfo(stakeAccount);
        lamports = accountInfo?.lamports || 0;
    } else {
        lamports = Math.floor(amountInXNT * LAMPORTS_PER_SOL);
    }

    const transaction = new Transaction().add(
        StakeProgram.withdraw({
            stakePubkey: stakeAccount,
            authorizedPubkey: wallet,
            toPubkey: wallet,
            lamports,
        })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet;

    return transaction;
}

/**
 * Get RPC URL for network
 */
export function getX1RpcUrl(networkId: string): string {
    if (networkId === 'x1-mainnet') {
        return 'https://rpc.mainnet.x1.xyz';
    } else if (networkId === 'x1-testnet') {
        return 'https://rpc.testnet.x1.xyz';
    }
    throw new Error(`Unknown X1 network: ${networkId}`);
}
