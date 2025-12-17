
import { Connection, PublicKey } from '@solana/web3.js';

// Official Jupiter Perps Program ID
// Verified from user activity: PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu
export const JUPITER_PERPS_PROGRAM_ID = new PublicKey('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu');

export interface PerpsPosition {
    publicKey: string;
    owner: string;
    pool: string;
    marketMint: string; // The underlying token mint (e.g. SOL)
    side: 'Long' | 'Short';
    price: number;
    sizeUsd: number;
    collateralUsd: number;
    pnl: number; // Stored PnL (usually 0, calculate dynamically)
    leverage: number;
    cumulativeBorrowRateSnapshot: number;
    borrowFee: number;
    openFee: number;
    closeFee: number;
}

// Mapping from Custody ID (offset 72) to Token Mint
const CUSTODY_TO_MINT: Record<string, string> = {
    '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz': 'So11111111111111111111111111111111111111112', // SOL
    // Add others as discovered (ETH, BTC, etc.)
};

function readBigUInt64LE(buffer: Uint8Array, offset: number): bigint {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return view.getBigUint64(offset, true);
}

function readBigInt64LE(buffer: Uint8Array, offset: number): bigint {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return view.getBigInt64(offset, true);
}

function toHex(buffer: Uint8Array): string {
    return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchJupiterPerpsPositions(connection: Connection, walletAddress: string): Promise<PerpsPosition[]> {
    try {
        // Validate wallet address
        let wallet: PublicKey;
        try {
            wallet = new PublicKey(walletAddress);
        } catch (e) {
            console.error('Invalid wallet address for Perps:', walletAddress);
            return [];
        }

        const programId = JUPITER_PERPS_PROGRAM_ID;

        // Fetch accounts owned by program, filtering by owner field (offset 8)
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                {
                    memcmp: {
                        offset: 8, // Discriminator (8 bytes) -> Owner
                        bytes: wallet.toBase58(),
                    },
                },
            ],
        });

        const positions: PerpsPosition[] = [];
        const custodyPubkeys = new Set<string>();

        // First pass: Decode basic position data and collect custody pubkeys
        const tempPositions: any[] = [];

        for (const { pubkey, account } of accounts) {
            try {
                const data = account.data;
                // Minimum size check (Position struct is 216 bytes)
                if (data.byteLength !== 216) {
                    continue;
                }

                // Discriminator check (Optional but good safety)
                // Discriminator for Position: aabc8fe47a40f7d0
                const discriminator = toHex(data.slice(0, 8));
                if (discriminator !== 'aabc8fe47a40f7d0') {
                    continue;
                }

                const pool = new PublicKey(data.slice(40, 72)).toBase58();
                const custodyId = new PublicKey(data.slice(72, 104)).toBase58();
                const marketMint = CUSTODY_TO_MINT[custodyId] || 'So11111111111111111111111111111111111111112'; // Default to SOL if unknown

                custodyPubkeys.add(custodyId);

                const sideVal = data[152];
                const price = Number(readBigUInt64LE(data, 153)) / 1_000_000;
                const sizeUsd = Number(readBigUInt64LE(data, 161)) / 1_000_000;
                const collateralUsd = Number(readBigUInt64LE(data, 169)) / 1_000_000;
                const pnl = Number(readBigInt64LE(data, 177)) / 1_000_000;
                const cumulativeBorrowRateSnapshot = Number(readBigUInt64LE(data, 185)); // Keep as raw number for calc

                if (sizeUsd > 0) {
                    tempPositions.push({
                        publicKey: pubkey.toBase58(),
                        owner: walletAddress,
                        pool,
                        custodyId, // Temp store for lookup
                        marketMint,
                        side: sideVal === 1 ? 'Long' : 'Short',
                        price,
                        sizeUsd,
                        collateralUsd,
                        pnl,
                        cumulativeBorrowRateSnapshot,
                        leverage: collateralUsd > 0 ? sizeUsd / collateralUsd : 0
                    });
                }
            } catch (err) {
                console.warn(`Failed to decode position ${pubkey.toBase58()}:`, err);
            }
        }

        // Fetch Custody Accounts to get current borrow rates
        const custodyMap = new Map<string, number>();
        if (custodyPubkeys.size > 0) {
            const keys = Array.from(custodyPubkeys).map(k => new PublicKey(k));
            const custodyAccounts = await connection.getMultipleAccountsInfo(keys);

            custodyAccounts.forEach((acc, i) => {
                if (acc) {
                    try {
                        // Cumulative Borrow Rate is at offset 262 (u64)
                        const rate = Number(readBigUInt64LE(acc.data, 262));
                        custodyMap.set(keys[i].toBase58(), rate);
                    } catch (e) {
                        console.warn('Failed to decode custody account:', keys[i].toBase58());
                    }
                }
            });
        }

        // Second pass: Calculate fees and finalize positions
        for (const pos of tempPositions) {
            const currentRate = custodyMap.get(pos.custodyId) || pos.cumulativeBorrowRateSnapshot;

            // Fee Calculation
            // Borrow Fee = (Current Rate - Snapshot Rate) / 1e9 * Size
            // Note: Scaling factor 1e9 is standard for Solana fixed point, verified by debug script
            const rateDiff = Math.max(0, currentRate - pos.cumulativeBorrowRateSnapshot);
            const borrowFee = (rateDiff / 1_000_000_000) * pos.sizeUsd;

            // Open/Close Fee = 0.06% (6 bps) of Size
            const openFee = pos.sizeUsd * 0.0006;
            const closeFee = pos.sizeUsd * 0.0006;

            positions.push({
                publicKey: pos.publicKey,
                owner: pos.owner,
                pool: pos.pool,
                marketMint: pos.marketMint,
                side: pos.side,
                price: pos.price,
                sizeUsd: pos.sizeUsd,
                collateralUsd: pos.collateralUsd,
                pnl: pos.pnl,
                leverage: pos.leverage,
                cumulativeBorrowRateSnapshot: pos.cumulativeBorrowRateSnapshot,
                borrowFee,
                openFee,
                closeFee
            });
        }

        return positions;

    } catch (e) {
        console.error('Failed to fetch Jupiter Perps:', e);
        return [];
    }
}

export function calculatePositionPnl(pos: PerpsPosition, currentPrice: number): number {
    if (!currentPrice) return pos.pnl; // Fallback to stored PnL if no price

    const entryPrice = pos.price;
    const priceChange = (currentPrice - entryPrice) / entryPrice;

    // Long: PnL = Size * % Change
    // Short: PnL = Size * -% Change
    return pos.sizeUsd * priceChange * (pos.side === 'Long' ? 1 : -1);
}
