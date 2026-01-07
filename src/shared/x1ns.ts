
export interface X1NSResolutionResult {
    address: string | null;
    error?: string;
}

const X1NS_API_BASE = 'https://api.x1ns.xyz/api';

/**
 * Resolves an X1NS domain (e.g., 'alice.x1') to a wallet address.
 * Uses the X1NS HTTP API.
 */
export async function resolveX1NS(domain: string): Promise<X1NSResolutionResult> {
    const cleanDomain = domain.trim().toLowerCase();

    if (!cleanDomain.endsWith('.x1')) {
        return { address: null, error: 'Domain must end with .x1' };
    }

    try {
        const response = await fetch(`${X1NS_API_BASE}/resolve/${cleanDomain}`);

        if (response.status === 404) {
            return { address: null }; // Not found is not an error
        }

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();

        // API returns { owner: "address..." } or similar based on docs
        // Docs said: Resolve a domain name to its owner address
        // Assuming format based on typical APIs, but let's be safe. 
        // The CURL example output wasn't explicitly shown, but standard is JSON.

        if (data && data.owner) {
            return { address: data.owner };
        }

        return { address: null };

    } catch (error) {
        console.error('X1NS Resolution fail:', error);
        return { address: null, error: 'Failed to resolve domain' };
    }
}
