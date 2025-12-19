// Blowfish transaction simulation hook for Solana
// Based on Backpack's implementation

import { useState, useEffect, useCallback } from 'react';

// Blowfish API response types
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

interface BlowfishRawResponse {
    aggregated: {
        action: 'BLOCK' | 'WARN' | 'NONE';
        warnings: {
            severity: 'WARNING' | 'CRITICAL';
            kind: string;
            message: string;
        }[];
        error?: {
            humanReadableError: string;
        };
        expectedStateChanges?: {
            [account: string]: {
                humanReadableDiff: string;
                suggestedColor: 'DEBIT' | 'CREDIT' | 'NONE';
                rawInfo: {
                    data: {
                        asset?: {
                            imageUrl?: string;
                            name?: string;
                            symbol?: string;
                            metaplexTokenStandard?: string;
                        };
                    };
                };
            }[];
        };
    };
    perTransaction: {
        error?: {
            humanReadableError: string;
        };
    }[];
}

export interface BlowfishResult {
    isLoading: boolean;
    error: Error | null;
    evaluation?: BlowfishEvaluation;
}

const BLOWFISH_API_URL = 'https://api.blowfish.xyz/solana/v0/mainnet/scan/transactions';
const REQUEST_TIMEOUT = 10000;

function normalizeEvaluation(response: BlowfishRawResponse): BlowfishEvaluation {
    const simulationError = response.aggregated.error?.humanReadableError;

    return {
        action: response.aggregated.action,
        warnings: response.aggregated.warnings || [],
        errors: [
            ...(simulationError ? [simulationError] : []),
            ...response.perTransaction
                .map((tx) => tx.error?.humanReadableError)
                .filter((err): err is string => Boolean(err)),
        ],
        expectedStateChanges: response.aggregated.expectedStateChanges
            ? Object.fromEntries(
                Object.entries(response.aggregated.expectedStateChanges).map(
                    ([address, changes]) => [
                        address,
                        changes.map((change) => ({
                            humanReadableDiff: change.humanReadableDiff,
                            suggestedColor: change.suggestedColor,
                            asset: change.rawInfo?.data?.asset?.imageUrl
                                ? {
                                    isNonFungible:
                                        change.rawInfo.data.asset.metaplexTokenStandard?.includes('non_fungible') || false,
                                    imageUrl: change.rawInfo.data.asset.imageUrl,
                                    name: change.rawInfo.data.asset.name || 'Unknown',
                                    symbol: change.rawInfo.data.asset.symbol,
                                }
                                : undefined,
                        })),
                    ]
                )
            )
            : undefined,
    };
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
        console.log('[Blowfish] fetchEvaluation called', {
            hasTransaction: !!transactionBase64,
            hasUserAccount: !!userAccount,
            origin
        });

        if (!transactionBase64 || !userAccount) {
            console.log('[Blowfish] Missing required params, skipping');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

            console.log('[Blowfish] Making API request...', {
                txLength: transactionBase64.length,
                userAccount: userAccount.slice(0, 8) + '...'
            });

            const response = await fetch(`${BLOWFISH_API_URL}?language=en`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-VERSION': '2023-06-05',
                },
                body: JSON.stringify({
                    transactions: [transactionBase64],
                    userAccount,
                    metadata: {
                        origin: origin || 'unknown',
                    },
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('[Blowfish] API error', response.status, errorData);
                throw new Error(`Blowfish API error: ${response.status} ${JSON.stringify(errorData)}`);
            }

            const data: BlowfishRawResponse = await response.json();
            console.log('[Blowfish] API response:', JSON.stringify(data, null, 2));

            const normalized = normalizeEvaluation(data);
            console.log('[Blowfish] Normalized evaluation:', JSON.stringify(normalized, null, 2));

            setEvaluation(normalized);
        } catch (err) {
            console.error('[Blowfish] Error:', err);
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

// Convert transaction bytes to base64 for Blowfish API
export function transactionBytesToBase64(txBytes: number[] | Uint8Array): string {
    const bytes = txBytes instanceof Uint8Array ? txBytes : new Uint8Array(txBytes);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
