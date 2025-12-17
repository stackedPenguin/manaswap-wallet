import { VersionedTransaction, Transaction, PublicKey } from '@solana/web3.js';

// Known program IDs mapped to human-readable names
const KNOWN_PROGRAMS: Record<string, string> = {
    '11111111111111111111111111111111': 'System Program',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'Jupiter v4',
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
    'ComputeBudget111111111111111111111111111111': 'Compute Budget',
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo',
    'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo': 'Memo (v1)',
};

export interface ParsedInstruction {
    programId: string;
    programName: string;
    accounts: string[];
    dataHex: string;
    /** Human-readable summary if we can parse it */
    summary?: string;
}

export interface ParsedTransaction {
    version: 'legacy' | 0;
    feePayer: string;
    recentBlockhash: string;
    instructions: ParsedInstruction[];
    signatures: string[];
    error?: string;
}

/**
 * Shorten a public key for display
 */
export function shortenAddress(address: string, chars = 4): string {
    if (address.length <= chars * 2 + 3) return address;
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Get program name from ID, or shortened ID if unknown
 */
function getProgramName(programId: string): string {
    return KNOWN_PROGRAMS[programId] || shortenAddress(programId, 4);
}

/**
 * Try to parse System Program instructions
 */
function parseSystemInstruction(data: Uint8Array, accounts: PublicKey[]): string | undefined {
    if (data.length < 4) return undefined;

    const instructionType = new DataView(data.buffer, data.byteOffset).getUint32(0, true);

    // CreateAccount = 0, Assign = 1, Transfer = 2
    if (instructionType === 2 && data.length >= 12 && accounts.length >= 2) {
        // Transfer instruction: 4 bytes type + 8 bytes lamports
        const lamports = new DataView(data.buffer, data.byteOffset + 4).getBigUint64(0, true);
        const sol = Number(lamports) / 1e9;
        return `Transfer ${sol.toFixed(4)} SOL to ${shortenAddress(accounts[1].toBase58())}`;
    }

    switch (instructionType) {
        case 0: return 'Create Account';
        case 1: return 'Assign';
        case 2: return 'Transfer';
        case 3: return 'Create Account with Seed';
        case 4: return 'Advance Nonce';
        case 5: return 'Withdraw from Nonce';
        case 6: return 'Initialize Nonce';
        case 7: return 'Authorize Nonce';
        case 8: return 'Allocate';
        case 9: return 'Allocate with Seed';
        case 10: return 'Assign with Seed';
        case 11: return 'Transfer with Seed';
        default: return undefined;
    }
}

/**
 * Try to parse Token Program instructions
 */
function parseTokenInstruction(data: Uint8Array, _accounts: PublicKey[]): string | undefined {
    if (data.length < 1) return undefined;

    const instructionType = data[0];

    switch (instructionType) {
        case 0: return 'Initialize Mint';
        case 1: return 'Initialize Account';
        case 2: return 'Initialize Multisig';
        case 3: {
            if (data.length >= 9) {
                const amount = new DataView(data.buffer, data.byteOffset + 1).getBigUint64(0, true);
                return `Transfer ${amount.toString()} tokens`;
            }
            return 'Transfer';
        }
        case 4: return 'Approve';
        case 5: return 'Revoke';
        case 6: return 'Set Authority';
        case 7: return 'Mint To';
        case 8: return 'Burn';
        case 9: return 'Close Account';
        case 10: return 'Freeze Account';
        case 11: return 'Thaw Account';
        case 12: return 'Transfer Checked';
        case 13: return 'Approve Checked';
        case 14: return 'Mint To Checked';
        case 15: return 'Burn Checked';
        default: return `Token Instruction (${instructionType})`;
    }
}

/**
 * Parse a serialized transaction into human-readable format
 */
export function parseTransaction(serializedTx: number[] | Uint8Array): ParsedTransaction {
    try {
        const bytes = serializedTx instanceof Uint8Array
            ? serializedTx
            : new Uint8Array(serializedTx);

        // Try to parse as VersionedTransaction first
        let tx: VersionedTransaction | Transaction;
        let isVersioned = false;

        try {
            tx = VersionedTransaction.deserialize(bytes);
            isVersioned = true;
        } catch {
            // Fallback to legacy Transaction
            tx = Transaction.from(bytes);
        }

        const instructions: ParsedInstruction[] = [];
        let feePayer: string;
        let recentBlockhash: string;
        let signatures: string[];

        if (isVersioned) {
            const vTx = tx as VersionedTransaction;
            feePayer = vTx.message.staticAccountKeys[0]?.toBase58() || 'Unknown';
            recentBlockhash = vTx.message.recentBlockhash;
            signatures = vTx.signatures.map(sig =>
                Buffer.from(sig).toString('base64').slice(0, 16) + '...'
            );

            // Parse compiled instructions
            const compiledIxs = vTx.message.compiledInstructions;
            const accountKeys = vTx.message.staticAccountKeys;

            for (const ix of compiledIxs) {
                const programId = accountKeys[ix.programIdIndex]?.toBase58() || 'Unknown';
                const ixAccounts = ix.accountKeyIndexes.map(idx =>
                    accountKeys[idx]?.toBase58() || 'Unknown'
                );

                let summary: string | undefined;


                // Try to parse known instructions
                if (programId === '11111111111111111111111111111111') {
                    summary = parseSystemInstruction(ix.data, ix.accountKeyIndexes.map(idx => accountKeys[idx]));
                } else if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
                    programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
                    summary = parseTokenInstruction(ix.data, ix.accountKeyIndexes.map(idx => accountKeys[idx]));
                } else if (programId === 'ComputeBudget111111111111111111111111111111') {
                    if (ix.data[0] === 0) summary = 'Request Heap Frame';
                    else if (ix.data[0] === 2) summary = 'Set Compute Unit Limit';
                    else if (ix.data[0] === 3) summary = 'Set Compute Unit Price';
                }

                instructions.push({
                    programId,
                    programName: getProgramName(programId),
                    accounts: ixAccounts,
                    dataHex: Buffer.from(ix.data).toString('hex').slice(0, 32) + (ix.data.length > 16 ? '...' : ''),
                    summary,
                });
            }

            return {
                version: 0,
                feePayer,
                recentBlockhash,
                instructions,
                signatures,
            };
        } else {
            const legacyTx = tx as Transaction;
            feePayer = legacyTx.feePayer?.toBase58() || legacyTx.instructions[0]?.keys[0]?.pubkey.toBase58() || 'Unknown';
            recentBlockhash = legacyTx.recentBlockhash || 'Unknown';
            signatures = legacyTx.signatures.map(sig =>
                sig.signature ? Buffer.from(sig.signature).toString('base64').slice(0, 16) + '...' : 'unsigned'
            );

            for (const ix of legacyTx.instructions) {
                const programId = ix.programId.toBase58();
                const ixAccounts = ix.keys.map(k => k.pubkey.toBase58());

                let summary: string | undefined;

                if (programId === '11111111111111111111111111111111') {
                    summary = parseSystemInstruction(ix.data, ix.keys.map(k => k.pubkey));
                } else if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
                    programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
                    summary = parseTokenInstruction(ix.data, ix.keys.map(k => k.pubkey));
                }

                instructions.push({
                    programId,
                    programName: getProgramName(programId),
                    accounts: ixAccounts,
                    dataHex: Buffer.from(ix.data).toString('hex').slice(0, 32) + (ix.data.length > 16 ? '...' : ''),
                    summary,
                });
            }

            return {
                version: 'legacy',
                feePayer,
                recentBlockhash,
                instructions,
                signatures,
            };
        }
    } catch (error) {
        return {
            version: 'legacy',
            feePayer: 'Error',
            recentBlockhash: 'Error',
            instructions: [],
            signatures: [],
            error: error instanceof Error ? error.message : 'Failed to parse transaction',
        };
    }
}
