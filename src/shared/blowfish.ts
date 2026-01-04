// Transaction simulation using Helius/Solana RPC simulateTransaction
// Replaces Blowfish (which requires API key) with Helius RPC

import { useState, useEffect, useCallback } from 'react';

// Simulation result types (compatible with existing UI)
export interface BlowfishEvaluation {
    action: 'BLOCK' | 'WARN' | 'NONE';
    warnings: {
        severity: 'WARNING' | 'CRITICAL';
        kind: string;
        message: string;
    }[];
    errors: string[];
    expectedStateChanges?: {
        [account: string]: {
            humanReadableDiff: string;
            suggestedColor: 'DEBIT' | 'CREDIT' | 'NONE';
            asset?: {
                isNonFungible: boolean;
                imageUrl: string;
                name: string;
                symbol?: string;
            };
        }[];
    };
}

export interface BlowfishResult {
    isLoading: boolean;
    error: Error | null;
    evaluation?: BlowfishEvaluation;
}

// RPC simulation response types
interface TokenBalance {
    accountIndex: number;
    mint: string;
    owner: string;
    programId: string;
    uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
        uiAmountString: string;
    };
}

interface SimulateTransactionResponse {
    jsonrpc: string;
    id: number;
    result?: {
        context: { slot: number };
        value: {
            err: null | object;
            logs: string[];
            accounts?: {
                lamports: number;
                owner: string;
                data: string[];
                executable: boolean;
                rentEpoch: number;
            }[];
            unitsConsumed?: number;
            fee?: number;
            preBalances?: number[];
            postBalances?: number[];
            preTokenBalances?: TokenBalance[];
            postTokenBalances?: TokenBalance[];
        };
    };
    error?: {
        code: number;
        message: string;
    };
}

const REQUEST_TIMEOUT = 10000;

import { getNetworkConfig, type NetworkClusterId } from './networks';

// Get RPC URL for simulation based on network
async function getSimulationRpcUrl(networkId?: NetworkClusterId): Promise<string | null> {
    try {
        // If it's an X1 network, use its specific RPC
        if (networkId && (networkId.toString().startsWith('x1-') || networkId === 'x1-testnet' || networkId === 'x1-mainnet')) {
            const config = getNetworkConfig(networkId);
            console.log('[Simulation] Using X1 RPC for network:', networkId);
            return config.rpcUrl;
        }

        // For Solana networks, prefer Helius if API key is present
        // First try Vite env variable
        const apiKey = (import.meta as any)?.env?.VITE_HELIUS_API_KEY;
        if (apiKey) {
            console.log('[Simulation] Using VITE_HELIUS_API_KEY from env');
            return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
        }

        // Fallback: Try to get from settings (customNetworks)
        const result = await chrome.storage.local.get('manaswap:settings');
        const settings = result['manaswap:settings'] as Record<string, unknown> | undefined;

        if (settings?.customNetworks && Array.isArray(settings.customNetworks)) {
            for (const network of settings.customNetworks as { rpcUrl?: string }[]) {
                if (network.rpcUrl?.includes('helius')) {
                    console.log('[Simulation] Found Helius RPC in customNetworks');
                    return network.rpcUrl;
                }
            }
        }

        // If no Helius key, fall back to standard Solana RPC if it's a Solana network request
        if (networkId && networkId.toString().startsWith('solana-')) {
            const config = getNetworkConfig(networkId);
            return config.rpcUrl;
        }

        return null;
    } catch (e) {
        console.error('[Simulation] Failed to get RPC URL:', e);
        return null;
    }
}

export function useBlowfishEvaluation(
    transactionBase64: string | null,
    userAccount: string | null,
    origin: string | null,
    networkId?: NetworkClusterId
): BlowfishResult {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [evaluation, setEvaluation] = useState<BlowfishEvaluation | undefined>(undefined);

    const fetchEvaluation = useCallback(async () => {
        console.log('[Simulation] fetchEvaluation called', {
            hasTransaction: !!transactionBase64,
            hasUserAccount: !!userAccount,
            origin,
            networkId
        });

        if (!transactionBase64 || !userAccount) {
            console.log('[Simulation] Missing required params, skipping');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const rpcUrl = await getSimulationRpcUrl(networkId);

            if (!rpcUrl) {
                // If it's X1, we should have found an RPC. If not, maybe just no Helius for Solana.
                // But for X1 we *need* an RPC.
                if (networkId && networkId.toString().startsWith('x1-')) {
                    throw new Error(`No RPC URL found for network: ${networkId}`);
                }
                throw new Error('Helius API key not configured. Add VITE_HELIUS_API_KEY to .env');
            }

            console.log('[Simulation] Using RPC:', rpcUrl.substring(0, 50) + '...');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

            // Call simulateTransaction RPC
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'simulateTransaction',
                    params: [
                        transactionBase64,
                        {
                            encoding: 'base64',
                            commitment: 'confirmed',
                            replaceRecentBlockhash: true,
                            accounts: {
                                encoding: 'base64',
                                addresses: [userAccount]
                            }
                        }
                    ]
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`RPC error: ${response.status}`);
            }

            const data: SimulateTransactionResponse = await response.json();
            console.log('[Simulation] RPC response:', JSON.stringify(data, null, 2));

            if (data.error) {
                throw new Error(`Simulation failed: ${data.error.message}`);
            }

            if (data.result?.value?.err) {
                // Transaction would fail
                const errStr = JSON.stringify(data.result.value.err);
                console.log('[Simulation] Transaction would fail:', errStr);

                setEvaluation({
                    action: 'WARN',
                    warnings: [{
                        severity: 'WARNING',
                        kind: 'TRANSACTION_ERROR',
                        message: `Transaction may fail: ${errStr}`
                    }],
                    errors: [errStr],
                    expectedStateChanges: undefined
                });
            } else {
                // Transaction would succeed
                // Parse token balance changes
                const preTokenBalances = data.result?.value?.preTokenBalances || [];
                const postTokenBalances = data.result?.value?.postTokenBalances || [];
                const fee = data.result?.value?.fee || 0;

                const changes = parseTokenBalanceChanges(
                    preTokenBalances,
                    postTokenBalances,
                    fee,
                    userAccount
                );

                console.log('[Simulation] Parsed changes:', changes);

                setEvaluation({
                    action: 'NONE',
                    warnings: [],
                    errors: [],
                    expectedStateChanges: changes
                });
            }
        } catch (err) {
            console.error('[Simulation] Error:', err);
            if (err instanceof Error && err.name === 'AbortError') {
                setError(new Error('Transaction simulation timed out'));
            } else {
                setError(err instanceof Error ? err : new Error('Unknown error'));
            }
        }
        finally {
            setIsLoading(false);
        }
    }, [transactionBase64, userAccount, origin, networkId]);

    useEffect(() => {
        fetchEvaluation();
    }, [fetchEvaluation]);

    return { isLoading, error, evaluation };
}

// Known token mints for display names
const TOKEN_NAMES: Record<string, { name: string; symbol: string }> = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { name: 'USD Coin', symbol: 'USDC' },
    'So11111111111111111111111111111111111111112': { name: 'Wrapped SOL', symbol: 'SOL' },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name: 'Tether USD', symbol: 'USDT' },
};

// Parse token balance changes from simulation results
function parseTokenBalanceChanges(
    preTokenBalances: TokenBalance[],
    postTokenBalances: TokenBalance[],
    fee: number,
    userAccount: string
): BlowfishEvaluation['expectedStateChanges'] {
    const changes: BlowfishEvaluation['expectedStateChanges'] = {};
    changes[userAccount] = [];

    // Build map of pre-balances by owner + mint
    const preBalanceMap = new Map<string, TokenBalance>();
    for (const bal of preTokenBalances) {
        const key = `${bal.owner}-${bal.mint}`;
        preBalanceMap.set(key, bal);
    }

    // Find changes by comparing with post-balances
    const processedKeys = new Set<string>();

    for (const postBal of postTokenBalances) {
        const key = `${postBal.owner}-${postBal.mint}`;
        processedKeys.add(key);

        const preBal = preBalanceMap.get(key);
        const preAmount = preBal?.uiTokenAmount.uiAmount || 0;
        const postAmount = postBal.uiTokenAmount.uiAmount;
        const diff = postAmount - preAmount;

        // Only show changes for user's accounts or significant changes
        if (postBal.owner === userAccount && Math.abs(diff) > 0.000001) {
            const tokenInfo = TOKEN_NAMES[postBal.mint] || { name: 'Token', symbol: '???' };
            const sign = diff > 0 ? '+' : '';
            const formattedAmount = diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

            changes[userAccount]!.push({
                humanReadableDiff: `${sign}${formattedAmount} ${tokenInfo.symbol}`,
                suggestedColor: diff > 0 ? 'CREDIT' : 'DEBIT'
            });
        }
    }

    // Check for tokens that existed before but not after (fully spent)
    for (const [key, preBal] of preBalanceMap) {
        if (!processedKeys.has(key) && preBal.owner === userAccount) {
            const tokenInfo = TOKEN_NAMES[preBal.mint] || { name: 'Token', symbol: '???' };
            const amount = preBal.uiTokenAmount.uiAmount;
            if (amount > 0.000001) {
                changes[userAccount]!.push({
                    humanReadableDiff: `-${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${tokenInfo.symbol}`,
                    suggestedColor: 'DEBIT'
                });
            }
        }
    }

    // Add fee if significant
    if (fee > 0) {
        const solFee = fee / 1e9;
        changes[userAccount]!.push({
            humanReadableDiff: `Network fee: ${solFee.toFixed(6)} SOL`,
            suggestedColor: 'DEBIT'
        });
    }

    // Fallback if no specific changes found
    if (changes[userAccount]!.length === 0) {
        changes[userAccount]!.push({
            humanReadableDiff: 'Transaction simulated successfully',
            suggestedColor: 'NONE'
        });
    }

    return changes;
}

// Convert transaction bytes to base64
export function transactionBytesToBase64(txBytes: number[] | Uint8Array): string {
    const bytes = txBytes instanceof Uint8Array ? txBytes : new Uint8Array(txBytes);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
