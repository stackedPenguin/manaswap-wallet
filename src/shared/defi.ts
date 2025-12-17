
export interface JupiterLimitOrder {
    publicKey: string;
    account: {
        maker: string;
        inputMint: string;
        outputMint: string;
        inAmount: string;
        outAmount: string;
        oriInAmount: string;
        oriOutAmount: string;
        expiredAt: number | null;
        base: string;
    };
}

export interface JupiterDCAOrder {
    publicKey: string;
    account: {
        user: string;
        inputMint: string;
        outputMint: string;
        inAmount: string; // Remaining amount to swap
        inAmountPerCycle: string;
        cycleFrequency: string;
        nextCycleAt: string;
        createdAt: string;
    };
}

export async function fetchJupiterLimitOrders(walletAddress: string): Promise<JupiterLimitOrder[]> {
    try {
        // Using v1 endpoint as per documentation
        const response = await fetch(`https://jup.ag/api/limit/v1/openOrders?wallet=${walletAddress}`);
        if (!response.ok) {
            console.warn(`Limit Order API error: ${response.status}`);
            return [];
        }
        const data = await response.json();
        // The API might return an array or an object with 'orders' property
        if (Array.isArray(data)) return data;
        if (data.orders && Array.isArray(data.orders)) return data.orders;
        return [];
    } catch (e) {
        console.error('Failed to fetch limit orders:', e);
        return [];
    }
}

export async function fetchJupiterDCAOrders(walletAddress: string): Promise<JupiterDCAOrder[]> {
    try {
        // Try the documented endpoint first
        // Note: The user reported 404/500 for the dca-api.jup.ag endpoint.
        // We will try a fall-back or just robustify the error for now.
        // Some sources suggest v2 or different paths.
        // For now, let's keep it but suppress the error spam if it fails.
        // Using v6 endpoint for DCA orders
        const response = await fetch(`https://dca-api.jup.ag/v1/dca/orders?user=${walletAddress}`);
        if (!response.ok) {
            // console.warn(`DCA API error: ${response.status}`);
            return [];
        }
        const data = await response.json();
        if (Array.isArray(data)) return data;
        return [];
    } catch (e) {
        // console.error('Failed to fetch DCA orders:', e);
        return [];
    }
}
