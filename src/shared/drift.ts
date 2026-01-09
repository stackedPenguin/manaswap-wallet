
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { DriftClient, User, BN } from '@drift-labs/sdk';
import { AnchorProvider } from '@coral-xyz/anchor';
import type { Wallet } from '@coral-xyz/anchor';
import { sendMessage } from './messaging';

// Custom Wallet Adapter for Drift
export interface DriftPosition {
    marketIndex: number;
    symbol: string;
    side: 'Long' | 'Short';
    sizeBase: string;
    pnl: number;
    leverage: number;
    entryPrice: number;
    markPrice: number;
    sizeUsd: number;
    costBasis: number;
    collateralUsd: number;
    liquidationPrice: number;
}

export class ExtensionWallet implements Wallet {
    public readonly publicKey: PublicKey;
    private readonly accountAddress: string;

    constructor(publicKey: PublicKey, accountAddress: string) {
        this.publicKey = publicKey;
        this.accountAddress = accountAddress;
    }

    get payer(): any {
        throw new Error('ExtensionWallet does not have a payer Keypair');
    }

    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
        let serialized: Uint8Array;
        if (tx instanceof VersionedTransaction) {
            serialized = tx.serialize();
        } else {
            serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        }

        const res = await sendMessage<{ success: boolean; signedTransaction?: number[]; error?: string }>({
            type: 'manaswap:signTransaction',
            payload: {
                transaction: Array.from(serialized),
                accountAddress: this.accountAddress
            }
        });

        if (!res.success || !res.signedTransaction) {
            throw new Error(res.error || 'Failed to sign transaction');
        }

        const signedBytes = new Uint8Array(res.signedTransaction);
        if (tx instanceof VersionedTransaction) {
            return VersionedTransaction.deserialize(signedBytes) as T;
        } else {
            return Transaction.from(signedBytes) as T;
        }
    }

    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
        const result: T[] = [];
        for (const tx of txs) {
            result.push(await this.signTransaction(tx));
        }
        return result;
    }
}

export class DriftService {
    private static instance: DriftService;
    private client: DriftClient | null = null;
    private user: User | null = null;
    private connection: Connection;
    private wallet: Wallet;
    private env: 'mainnet-beta' | 'devnet' = 'mainnet-beta';

    private constructor(connection: Connection, wallet: Wallet) {
        this.connection = connection;
        this.wallet = wallet;
    }

    public static getInstance(connection: Connection, wallet: Wallet): DriftService {
        if (!DriftService.instance) {
            DriftService.instance = new DriftService(connection, wallet);
        }
        if (DriftService.instance.wallet.publicKey.toBase58() !== wallet.publicKey.toBase58()) {
            DriftService.instance = new DriftService(connection, wallet);
        }
        return DriftService.instance;
    }

    public async initialize() {
        if (this.client && this.client.isSubscribed) return;

        const provider = new AnchorProvider(
            this.connection,
            this.wallet,
            { preflightCommitment: 'confirmed' }
        );

        this.client = new DriftClient({
            connection: this.connection,
            wallet: provider.wallet,
            env: this.env as any,
        });

        await this.client.subscribe();

        const userKey = await this.client.getUserAccountPublicKey(0);
        const accountInfo = await this.connection.getAccountInfo(userKey);

        if (!accountInfo) {
            console.warn('Drift User Account not found for:', this.wallet.publicKey.toBase58());
            return;
        }

        this.user = new User({
            driftClient: this.client,
            userAccountPublicKey: userKey,
        });

        await this.user.subscribe();
    }

    public async disconnect() {
        if (this.client) {
            await this.client.unsubscribe();
            this.client = null;
        }
        if (this.user) {
            await this.user.unsubscribe();
            this.user = null;
        }
    }

    public async getDetailedPositions(): Promise<DriftPosition[]> {
        if (!this.user || !this.client) return [];
        if (!this.user.isSubscribed) return [];

        const positions = this.user.getActivePerpPositions();
        const results = [];
        const leverage = this.user.getLeverage().toNumber() / 10000;

        for (const pos of positions) {
            const marketIndex = pos.marketIndex;
            const market = this.client.getPerpMarketAccount(marketIndex);

            if (!market) continue;

            const name = String.fromCharCode(...market.name).trim();
            const oraclePriceData = this.client.getOracleDataForPerpMarket(marketIndex);
            const oraclePrice = oraclePriceData.price.toNumber() / 1000000;

            const baseVal = Number(pos.baseAssetAmount) / 1000000000; // Size with sign
            const sizeUsd = Math.abs(baseVal * oraclePrice);

            // Cost Basis from quoteEntryAmount (Precision 6)
            const quoteEntry = Number(pos.quoteEntryAmount) / 1000000;
            const costBasis = Math.abs(quoteEntry);

            // Entry Price = Cost Basis / Size
            const entryPrice = Math.abs(costBasis / baseVal);

            const positionPnl = pos.baseAssetAmount.gt(new BN(0))
                ? sizeUsd - costBasis
                : costBasis - sizeUsd;

            // Mark Price
            const markPrice = oraclePrice;

            // Liquidation Price
            const liquidationPrice = 0;

            results.push({
                marketIndex,
                symbol: name,
                side: (pos.baseAssetAmount.gt(new BN(0)) ? 'Long' : 'Short') as 'Long' | 'Short',
                sizeBase: pos.baseAssetAmount.toString(),
                pnl: positionPnl, // Correctly using calculated Position PnL
                leverage: leverage,
                entryPrice: entryPrice,
                markPrice: markPrice,
                sizeUsd: sizeUsd,
                costBasis: costBasis,
                collateralUsd: sizeUsd / (leverage || 1),
                liquidationPrice: liquidationPrice
            });
        }
        return results;
    }

    public async getPositions() {
        if (!this.user) throw new Error('Drift User not initialized');
        return this.user.getActivePerpPositions();
    }
}
