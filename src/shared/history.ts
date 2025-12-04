import { Connection } from '@solana/web3.js';
import type { TransactionActivity } from './types';
import type { NetworkClusterId } from './networks';

interface HeliusEnhancedTransaction {
    signature: string;
    type: string;
    source: string;
    description: string;
    fee: number;
    feePayer: string;
    timestamp: number;
    nativeTransfers?: {
        fromUserAccount: string;
        toUserAccount: string;
        amount: number;
    }[];
    tokenTransfers?: {
        fromUserAccount: string;
        toUserAccount: string;
        mint: string;
        tokenAmount: number;
    }[];
    transactionError?: any;
}

export async function fetchTransactionHistory(
    _connection: Connection,
    address: string,
    networkId: NetworkClusterId,
    limit: number = 50
): Promise<TransactionActivity[]> {
    try {
        // Extract API Key from RPC URL
        // VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
        const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || '';
        const apiKeyMatch = rpcUrl.match(/api-key=([^&]+)/);

        if (apiKeyMatch && apiKeyMatch[1]) {
            const apiKey = apiKeyMatch[1];
            // Use Helius Enhanced API
            const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${address}/transactions?api-key=${apiKey}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Helius API error: ${response.statusText}`);
            }

            const data: HeliusEnhancedTransaction[] = await response.json();

            return data.map(tx => {
                let type: TransactionActivity['type'] = 'dapp-interaction';
                let amount = 0;
                let tokenMint: string | undefined = undefined;
                let from = tx.source;
                let to = 'Unknown';

                // Determine type and amount
                // Check for Native SOL Transfers involving the user
                const nativeTransfer = tx.nativeTransfers?.find(t => t.fromUserAccount === address || t.toUserAccount === address);
                if (nativeTransfer) {
                    amount = nativeTransfer.amount / 1_000_000_000; // Lamports to SOL
                    if (nativeTransfer.fromUserAccount === address) {
                        type = 'send';
                        to = nativeTransfer.toUserAccount;
                    } else {
                        type = 'receive';
                        from = nativeTransfer.fromUserAccount;
                    }
                }

                // Check for Token Transfers involving the user (override SOL if present)
                const tokenTransfer = tx.tokenTransfers?.find(t => t.fromUserAccount === address || t.toUserAccount === address);
                if (tokenTransfer) {
                    amount = tokenTransfer.tokenAmount;
                    tokenMint = tokenTransfer.mint;
                    if (tokenTransfer.fromUserAccount === address) {
                        type = 'send';
                        to = tokenTransfer.toUserAccount;
                    } else {
                        type = 'receive';
                        from = tokenTransfer.fromUserAccount;
                    }
                }

                // If no direct transfer, check if it's a swap or interaction
                if (tx.type === 'SWAP') {
                    type = 'dapp-interaction'; // Or 'swap' if we add that type later
                    // For swaps, we might want to show the net change, but Helius gives individual transfers.
                    // For now, let's keep it simple.
                }

                return {
                    id: tx.signature,
                    type,
                    signature: tx.signature,
                    from: from || tx.source,
                    to: to,
                    amount,
                    tokenMint,
                    networkId,
                    timestamp: tx.timestamp * 1000,
                    status: tx.transactionError ? 'failed' : 'confirmed'
                } as TransactionActivity;
            })
                .filter(activity => {
                    // STRICT FILTERING:

                    // 1. Filter out dust/rent (< 0.001 SOL) ONLY for SOL transactions
                    if (!activity.tokenMint) {
                        if ((activity.type === 'send' || activity.type === 'receive') && (activity.amount || 0) < 0.001) {
                            return false;
                        }
                    }

                    // 2. Show if type is 'send' or 'receive'
                    if (activity.type === 'send' || activity.type === 'receive') return true;

                    // 3. Show if amount is significant (for SOL) or present (for tokens)
                    if (activity.amount && activity.amount > 0) {
                        if (activity.tokenMint) return true;
                        if (activity.amount >= 0.001) return true;
                    }

                    // 4. Show if user is fee payer (authorized)
                    // Helius data has feePayer field
                    const originalTx = data.find(t => t.signature === activity.id);
                    if (originalTx && originalTx.feePayer === address) {
                        return true;
                    }

                    return false;
                })
                .slice(0, limit);
        }

        // Fallback to standard RPC if no API key found (shouldn't happen with Helius setup)
        console.warn('No Helius API key found, falling back to standard RPC');
        // ... (We could keep the old logic here as fallback, but for now let's assume Helius works)
        return [];

    } catch (error) {
        console.error('Failed to fetch transaction history:', error);
        return [];
    }
}
