export interface QuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    priceImpactPct: string;
    routePlan: any[];
    transaction?: string; // Ultra API returns transaction directly in quote/order response
    requestId?: string;
}

const ULTRA_API_BASE = 'https://api.jup.ag/ultra/v1';

// Helper to get API key from env
const getApiKey = () => import.meta.env.VITE_JUPITER_ULTRA_API_KEY;

export async function getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50
): Promise<QuoteResponse> {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('Jupiter Ultra API Key is missing in .env');
    }

    // Ultra API /order endpoint
    // GET https://api.jup.ag/ultra/v1/order?inputMint=...&outputMint=...&amount=...&slippageBps=...
    const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
        // Optional: taker address could be passed if we want a transaction immediately, 
        // but for just a quote display we might not need it?
        // Actually, Ultra API docs say /order returns "Unsigned base-64 encoded transaction".
        // If we want the transaction, we should probably pass the taker if we have it.
        // But getSwapQuote is usually just for display.
        // Let's check the docs again. "Request for a base64-encoded unsigned swap transaction".
        // So /order IS the quote AND the transaction builder.
        // For now, let's just fetch the quote info.
    });

    const url = `${ULTRA_API_BASE}/order?${params.toString()}`;

    console.log(`[Swap] Fetching Ultra quote: ${url}`);

    const response = await fetch(url, {
        headers: {
            'x-api-key': apiKey
        }
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Jupiter Ultra API error: ${response.status} ${err.error || ''}`);
    }

    const data = await response.json();
    return data;
}

export async function getSwapTransaction(
    quoteResponse: QuoteResponse,
    userPublicKey: string
): Promise<{ swapTransaction: string }> {
    // With Ultra API, the /order endpoint (which we mapped to getSwapQuote) 
    // MIGHT have already returned the transaction if we passed the taker.
    // If we didn't pass the taker to getSwapQuote, we need to call it again WITH the taker.

    // Let's check if we have the transaction already
    if (quoteResponse.transaction) {
        return { swapTransaction: quoteResponse.transaction };
    }

    // If not, we need to call /order again with the taker
    const apiKey = getApiKey();
    const params = new URLSearchParams({
        inputMint: quoteResponse.inputMint,
        outputMint: quoteResponse.outputMint,
        amount: quoteResponse.inAmount,
        slippageBps: quoteResponse.slippageBps.toString(),
        taker: userPublicKey
    });

    const url = `${ULTRA_API_BASE}/order?${params.toString()}`;
    console.log(`[Swap] Fetching Ultra transaction: ${url}`);

    const response = await fetch(url, {
        headers: {
            'x-api-key': apiKey
        }
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Jupiter Ultra API error: ${response.status} ${err.error || ''}`);
    }

    const data = await response.json();

    if (!data.transaction) {
        throw new Error('No transaction returned from Jupiter Ultra API');
    }

    return { swapTransaction: data.transaction };
}

// Helper to deserialize transaction (if needed for client-side signing, but we send base64 to background)
// We can keep the existing deserializeTransaction if it's used elsewhere, or remove it if unused.
// For now, we just return the base64 string.
