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
        };
    };
    error?: {
        code: number;
        message: string;
    };
}

const REQUEST_TIMEOUT = 10000;

// Get Helius RPC URL from stored settings or env
async function getHeliusRpcUrl(): Promise<string | null> {
    try {
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

        return null;
    } catch (e) {
        console.error('[Simulation] Failed to get Helius RPC URL:', e);
        return null;
    }
}

export function useBlowfishEvaluation(
    transactionBase64: string | null,
    userAccount: string | null,
    origin: string | null
): BlowfishResult {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [evaluation, setEvaluation] = useState<BlowfishEvaluation | undefined>(undefined);

    const fetchEvaluation = useCallback(async () => {
        console.log('[Simulation] fetchEvaluation called', {
            hasTransaction: !!transactionBase64,
            hasUserAccount: !!userAccount,
            origin
        });

        if (!transactionBase64 || !userAccount) {
            console.log('[Simulation] Missing required params, skipping');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const rpcUrl = await getHeliusRpcUrl();

            if (!rpcUrl) {
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
                // Parse logs to extract transfer information
                const logs = data.result?.value?.logs || [];
                const changes = parseLogsForBalanceChanges(logs, userAccount);

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
        } finally {
            setIsLoading(false);
        }
    }, [transactionBase64, userAccount, origin]);

    useEffect(() => {
        fetchEvaluation();
    }, [fetchEvaluation]);

    return { isLoading, error, evaluation };
}

// Parse transaction logs to extract balance change information
function parseLogsForBalanceChanges(
    logs: string[],
    userAccount: string
): BlowfishEvaluation['expectedStateChanges'] {
    const changes: BlowfishEvaluation['expectedStateChanges'] = {};

    // Look for common patterns in logs
    for (const log of logs) {
        // SPL Token Transfer pattern
        if (log.includes('Transfer') || log.includes('transfer')) {
            // Extract amount if present
            const amountMatch = log.match(/(\d+\.?\d*)/);
            if (amountMatch) {
                const amount = amountMatch[1];
                if (!changes[userAccount]) {
                    changes[userAccount] = [];
                }
                changes[userAccount].push({
                    humanReadableDiff: `Transfer: ${amount}`,
                    suggestedColor: 'DEBIT'
                });
            }
        }

        // Program invoke patterns
        if (log.includes('invoke [1]')) {
            const programMatch = log.match(/Program (\w+) invoke/);
            if (programMatch && !changes[userAccount]) {
                changes[userAccount] = [];
            }
        }
    }

    // If we couldn't parse specific changes, show a generic success message
    if (Object.keys(changes).length === 0) {
        changes[userAccount] = [{
            humanReadableDiff: 'Transaction simulated successfully',
            suggestedColor: 'NONE'
        }];
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
