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

// RPC-based transaction history for non-Helius chains (X1, testnet, etc.)
async function fetchRpcBasedHistory(
    connection: Connection,
    address: string,
    networkId: NetworkClusterId,
    limit: number
): Promise<TransactionActivity[]> {
    try {
        const { PublicKey } = await import('@solana/web3.js');
        const pubkey = new PublicKey(address);

        // Get confirmed signatures
        const signatures = await connection.getSignaturesForAddress(pubkey, { limit });

        const activities: TransactionActivity[] = [];

        for (const sig of signatures) {
            try {
                const tx = await connection.getTransaction(sig.signature, {
                    maxSupportedTransactionVersion: 0
                });

                if (!tx || !tx.meta) continue;

                // Check if this is a SOL transfer
                const preBalances = tx.meta.preBalances;
                const postBalances = tx.meta.postBalances;

                // Get account keys from versioned or legacy transaction
                const accountKeys = 'staticAccountKeys' in tx.transaction.message
                    ? tx.transaction.message.staticAccountKeys.map(k => k.toBase58())
                    : (tx.transaction.message as any).accountKeys?.map((k: any) => k.toBase58()) || [];

                const userIndex = accountKeys.indexOf(address);

                if (userIndex !== -1 && preBalances && postBalances) {
                    const preBal = preBalances[userIndex] || 0;
                    const postBal = postBalances[userIndex] || 0;
                    const diff = (postBal - preBal) / 1_000_000_000;

                    // Skip dust transactions
                    if (Math.abs(diff) < 0.001) continue;

                    activities.push({
                        id: sig.signature,
                        type: diff > 0 ? 'receive' : 'send',
                        signature: sig.signature,
                        from: diff < 0 ? address : 'Unknown',
                        to: diff > 0 ? address : 'Unknown',
                        amount: Math.abs(diff),
                        networkId,
                        timestamp: (sig.blockTime || 0) * 1000,
                        status: sig.err ? 'failed' : 'confirmed'
                    });
                }
            } catch (e) {
                // Skip failed transaction parsing
                continue;
            }
        }

        return activities;
    } catch (error) {
        console.error('Failed to fetch RPC-based history:', error);
        return [];
    }
}

export async function fetchTransactionHistory(
    _connection: Connection,
    address: string,
    networkId: NetworkClusterId,
    limit: number = 50
): Promise<TransactionActivity[]> {
    try {
        // Helius API is only available for Solana networks
        // For X1 or other chains, we need to use RPC-based history
        const isSolanaNetwork = networkId.startsWith('solana-');

        if (!isSolanaNetwork) {
            // For X1 and other non-Solana networks, use RPC-based approach
            return await fetchRpcBasedHistory(_connection, address, networkId, limit);
        }

        // Extract API Key from RPC URL
        const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || '';
        const apiKeyMatch = rpcUrl.match(/api-key=([^&]+)/);

        if (apiKeyMatch && apiKeyMatch[1]) {
            const apiKey = apiKeyMatch[1];

            // Determine correct Helius API endpoint based on network
            let heliusBase = 'https://api-mainnet.helius-rpc.com';
            if (networkId === 'solana-devnet') {
                heliusBase = 'https://api-devnet.helius-rpc.com';
            } else if (networkId === 'solana-testnet') {
                // Helius doesn't support testnet, fallback to RPC
                return await fetchRpcBasedHistory(_connection, address, networkId, limit);
            }

            const url = `${heliusBase}/v0/addresses/${address}/transactions?api-key=${apiKey}`;

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

        // Fallback to RPC-based approach if no Helius API key found
        console.warn('No Helius API key found, falling back to RPC-based history');
        return await fetchRpcBasedHistory(_connection, address, networkId, limit);

    } catch (error) {
        console.error('Failed to fetch transaction history:', error);
        return [];
    }
}

export interface BalanceChange {
    timestamp: number;
    mint: string; // 'SOL' for native
    amount: number; // Positive for receive, negative for send
    signature: string;
}

export async function fetchBalanceChanges(
    address: string,
    networkId?: string
): Promise<BalanceChange[]> {
    // Route to x1 fetcher if x1 network
    if (networkId?.includes('x1')) {
        return fetchX1BalanceChanges(address, networkId);
    }

    // Default: Solana via Helius
    try {
        const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || '';
        const apiKeyMatch = rpcUrl.match(/api-key=([^&]+)/);

        if (!apiKeyMatch || !apiKeyMatch[1]) {
            return [];
        }

        const apiKey = apiKeyMatch[1];
        const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${address}/transactions?api-key=${apiKey}`; // Helius default limit is 100?

        const response = await fetch(url);
        if (!response.ok) return [];

        const data: HeliusEnhancedTransaction[] = await response.json();
        const changes: BalanceChange[] = [];

        data.forEach(tx => {
            if (tx.transactionError) return;

            const timestamp = tx.timestamp * 1000;

            // 1. Native SOL Changes
            if (tx.nativeTransfers) {
                tx.nativeTransfers.forEach(t => {
                    const amount = t.amount / 1_000_000_000;
                    if (t.toUserAccount === address) {
                        changes.push({ timestamp, mint: 'SOL', amount: amount, signature: tx.signature });
                    }
                    if (t.fromUserAccount === address) {
                        changes.push({ timestamp, mint: 'SOL', amount: -amount, signature: tx.signature });
                    }
                });
            }

            // 2. Token Changes
            if (tx.tokenTransfers) {
                tx.tokenTransfers.forEach(t => {
                    if (t.toUserAccount === address) {
                        changes.push({ timestamp, mint: t.mint, amount: t.tokenAmount, signature: tx.signature });
                    }
                    if (t.fromUserAccount === address) {
                        changes.push({ timestamp, mint: t.mint, amount: -t.tokenAmount, signature: tx.signature });
                    }
                });
            }

            // 3. Fee (if payer)
            if (tx.feePayer === address) {
                changes.push({ timestamp, mint: 'SOL', amount: -(tx.fee / 1_000_000_000), signature: tx.signature });
            }
        });

        return changes.sort((a, b) => b.timestamp - a.timestamp); // Newest first

    } catch (error) {
        console.error('Failed to fetch balance changes:', error);
        return [];
    }
}

// Fetch balance changes for x1 networks via RPC (with pagination for validator wallets)
async function fetchX1BalanceChanges(
    address: string,
    networkId: string
): Promise<BalanceChange[]> {
    try {
        const rpcUrl = networkId === 'x1-mainnet'
            ? 'https://rpc.mainnet.x1.xyz'
            : 'https://rpc.testnet.x1.xyz';

        console.log(`[X1History] Fetching balance changes for ${address} on ${networkId}`);

        const changes: BalanceChange[] = [];
        let beforeSig: string | null = null;
        let pagesChecked = 0;
        const maxPages = 10;
        const targetChanges = 20;

        while (changes.length < targetChanges && pagesChecked < maxPages) {
            const params: { limit: number; before?: string } = { limit: 100 };
            if (beforeSig) params.before = beforeSig;

            const sigResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getSignaturesForAddress',
                    params: [address, params]
                })
            });

            if (!sigResponse.ok) break;
            const sigData = await sigResponse.json();
            const signatures = sigData.result || [];

            if (signatures.length === 0) break;

            console.log(`[X1History] Page ${pagesChecked + 1}: Checking ${signatures.length} signatures...`);
            beforeSig = signatures[signatures.length - 1]?.signature;
            pagesChecked++;

            for (const sig of signatures) {
                if (changes.length >= targetChanges) break;

                try {
                    const txResponse = await fetch(rpcUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'getTransaction',
                            params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
                        })
                    });

                    if (!txResponse.ok) continue;
                    const txData = await txResponse.json();
                    const tx = txData.result;

                    if (!tx?.meta || tx.meta.err) continue;

                    const timestamp = (sig.blockTime || tx.blockTime || 0) * 1000;
                    if (timestamp === 0) continue;

                    const accountKeys = tx.transaction?.message?.accountKeys || [];
                    const preBalances = tx.meta.preBalances || [];
                    const postBalances = tx.meta.postBalances || [];

                    for (let i = 0; i < accountKeys.length; i++) {
                        const key = typeof accountKeys[i] === 'string' ? accountKeys[i] : accountKeys[i]?.pubkey;
                        if (key === address) {
                            const preLamports = preBalances[i] || 0;
                            const postLamports = postBalances[i] || 0;
                            const diff = (postLamports - preLamports) / 1_000_000_000;

                            if (Math.abs(diff) > 0.000001) {
                                changes.push({
                                    timestamp,
                                    mint: 'XNT',
                                    amount: diff,
                                    signature: sig.signature
                                });
                                console.log(`[X1History] Found: ${diff > 0 ? '+' : ''}${diff.toFixed(4)} XNT`);
                            }
                            break;
                        }
                    }
                } catch (e) {
                    // Skip tx errors
                }
            }
        }

        console.log(`[X1History] Found ${changes.length} balance changes after ${pagesChecked} pages`);
        return changes.sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
        console.error('[X1History] Failed to fetch balance changes:', error);
        return [];
    }
}
