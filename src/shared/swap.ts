import { VersionedTransaction } from '@solana/web3.js';

// Jupiter API Types
export interface QuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: 'ExactIn' | 'ExactOut';
    slippageBps: number;
    platformFee?: {
        amount: string;
        feeBps: number;
    };
    priceImpactPct: string;
    routePlan: {
        swapInfo: {
            ammKey: string;
            label?: string;
            inputMint: string;
            outputMint: string;
            inAmount: string;
            outAmount: string;
            feeAmount: string;
            feeMint: string;
        };
        percent: number;
    }[];
    contextSlot?: number;
    timeTaken?: number;
}

export interface SwapResponse {
    swapTransaction: string;
    lastValidBlockHeight: number;
    prioritizationFeeLamports?: number;
}

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';

/**
 * Get a swap quote from Jupiter
 * @param inputMint Mint address of input token
 * @param outputMint Mint address of output token
 * @param amount Amount in atomic units (lamports/smallest unit)
 * @param slippageBps Slippage in basis points (e.g. 50 = 0.5%). User requested 0.001% -> 0.1 bps? 
 *                    Jupiter might require integer. 0.001% is extremely low and might fail often.
 *                    1 bps = 0.01%. 0.1 bps = 0.001%.
 *                    Let's try to pass 'auto' or a small number.
 */
export async function getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50 // Default 0.5%
): Promise<QuoteResponse> {
    // Jupiter v6 supports 'auto' slippage or explicit bps.
    // API expects amount as string.

    const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
        // 'onlyDirectRoutes': 'false', // Default
        // 'asLegacyTransaction': 'false', // We want versioned tx
    });

    const response = await fetch(`${JUPITER_QUOTE_API}/quote?${params.toString()}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get quote');
    }

    return await response.json();
}

/**
 * Get the serialized swap transaction from Jupiter
 * @param quoteResponse The quote object received from getSwapQuote
 * @param userPublicKey User's public key as string
 */
export async function getSwapTransaction(
    quoteResponse: QuoteResponse,
    userPublicKey: string
): Promise<SwapResponse> {
    const response = await fetch(`${JUPITER_QUOTE_API}/swap`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            quoteResponse,
            userPublicKey,
            wrapAndUnwrapSol: true,
            // prioritizationFeeLamports: 'auto' // Optional: auto dynamic fee
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get swap transaction');
    }

    return await response.json();
}

/**
 * Deserialize and sign the transaction (helper for UI)
 * This just deserializes, signing happens in the wallet via adapter/keypair
 */
export function deserializeTransaction(swapTransaction: string): VersionedTransaction {
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    return VersionedTransaction.deserialize(swapTransactionBuf);
}
