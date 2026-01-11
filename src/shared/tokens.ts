import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenMetadata } from '@solana/spl-token';
import type { TokenBalance } from './types';
import { getSolanaRpcUrl, getJupiterApiKey } from './env';

// Jupiter Token List API V2 (verified tokens)
const JUPITER_TOKEN_LIST_URL = 'https://api.jup.ag/tokens/v2/tag?query=verified';
// Fallback: Solana Labs Token List
const SOLANA_LABS_TOKEN_LIST_URL = 'https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json';

interface JupiterToken {
    address: string;
    chainId: number;
    decimals: number;
    name: string;
    symbol: string;
    logoURI: string;
    tags: string[];
}

// Simple in-memory cache for token metadata
let tokenMap: Map<string, JupiterToken> | null = null;

// Hardcoded fallback tokens for emergency cases
export const FALLBACK_TOKENS: JupiterToken[] = [
    {
        address: 'So11111111111111111111111111111111111111112',
        chainId: 101,
        decimals: 9,
        name: 'Solana',
        symbol: 'SOL',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        tags: []
    },
    {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        chainId: 101,
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
        tags: []
    },
    {
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        chainId: 101,
        decimals: 6,
        name: 'USDT',
        symbol: 'USDT',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
        tags: []
    },
    // X1 Chain Tokens
    {
        address: 'B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq',
        chainId: 195, // X1 mainnet chain ID
        decimals: 6,
        name: 'USDC.X',
        symbol: 'USDC.X',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png', // Reuse USDC logo
        tags: ['x1']
    },
    {
        address: 'So11111111111111111111111111111111111111112',
        chainId: 195, // X1 Native Reuse of Wrapped SOL Address (standard pattern)
        decimals: 9,
        name: 'X1 Native Token',
        symbol: 'XNT',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', // Reuse SOL logo for now
        tags: ['x1', 'native']
    }
];

// X1 Verified Token Whitelist (only tokens we trust on X1)
export const X1_VERIFIED_TOKENS = new Set([
    'B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq', // USDC.X
]);

// Solana Core Verified Tokens (always verified even if Jupiter API fails)
export const SOLANA_CORE_VERIFIED = new Set([
    'So11111111111111111111111111111111111111112', // SOL (wrapped)
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);
// Jupiter API key - use safe accessor for React Native compatibility
const JUPITER_API_KEY = getJupiterApiKey();

async function fetchWithTimeout(url: string, timeout = 5000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const headers: HeadersInit = {};
        if (JUPITER_API_KEY && url.includes('jup.ag')) {
            headers['x-api-key'] = JUPITER_API_KEY;
        }
        const response = await fetch(url, { signal: controller.signal, headers });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

export async function fetchTokenMetadataMap(): Promise<Map<string, JupiterToken>> {
    if (tokenMap) return tokenMap;

    let tokens: JupiterToken[] = [];

    // 1. Try Jupiter API
    try {
        // console.log('Fetching tokens from Jupiter API...');
        const response = await fetchWithTimeout(JUPITER_TOKEN_LIST_URL);
        if (response.ok) {
            const rawTokens = await response.json();
            // V2 API uses 'id' instead of 'address' and 'icon' instead of 'logoURI'
            tokens = rawTokens.map((t: any) => ({
                address: t.id || t.address,
                chainId: 101, // Solana mainnet
                decimals: t.decimals,
                name: t.name,
                symbol: t.symbol,
                logoURI: t.icon || t.logoURI || '',
                tags: t.tags || []
            }));
            // console.log(`Loaded ${tokens.length} tokens from Jupiter`);
        } else {
            throw new Error(`Jupiter API returned ${response.status}`);
        }
    } catch (error) {
        console.warn('Jupiter API failed, trying Solana Labs fallback:', error);

        // 2. Try Solana Labs Fallback
        try {
            const response = await fetchWithTimeout(SOLANA_LABS_TOKEN_LIST_URL);
            if (response.ok) {
                const data = await response.json();
                // Solana Labs list structure is { tokens: [...] }
                tokens = Array.isArray(data) ? data : (data.tokens || []);
                // console.log(`Loaded ${tokens.length} tokens from Solana Labs`);
            } else {
                throw new Error(`Solana Labs API returned ${response.status}`);
            }
        } catch (fallbackError) {
            console.warn('Solana Labs fallback failed, using hardcoded tokens:', fallbackError);

            // 3. Use Hardcoded Fallback
            tokens = FALLBACK_TOKENS;
        }
    }

    // Ensure we have at least the fallback tokens if the list is empty for some reason
    if (tokens.length === 0) {
        tokens = FALLBACK_TOKENS;
    }

    tokenMap = new Map(tokens.map(t => [t.address, t]));

    // ALWAYS add fallback tokens to ensure custom tokens (like X1 USDC.X) are recognized
    for (const fallback of FALLBACK_TOKENS) {
        if (!tokenMap.has(fallback.address)) {
            tokenMap.set(fallback.address, fallback);
        }
    }

    return tokenMap;
}

// Metaplex Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Helius DAS API response interface
interface HeliusAssetResponse {
    result?: {
        content?: {
            metadata?: {
                name?: string;
                symbol?: string;
            };
            links?: {
                image?: string;
            };
        };
    };
}

async function fetchHeliusMetadata(mint: string): Promise<JupiterToken | null> {
    const rpcUrl = getSolanaRpcUrl();
    if (!rpcUrl || !rpcUrl.includes('helius')) return null;

    try {
        // console.log(`[Tokens] Fetching Helius DAS metadata for ${mint}`);
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'my-id',
                method: 'getAsset',
                params: { id: mint },
            }),
        });

        const data = await response.json() as HeliusAssetResponse;
        if (data.result?.content) {
            const content = data.result.content;
            const name = content.metadata?.name || 'Unknown';
            const symbol = content.metadata?.symbol || 'Unknown';
            const logoURI = content.links?.image || '';

            // console.log(`[Tokens] Helius DAS found: ${symbol} - ${name}`);

            return {
                address: mint,
                chainId: 101,
                decimals: 0,
                name,
                symbol,
                logoURI,
                tags: ['helius-das']
            };
        }
    } catch (e) {
        console.warn(`[Tokens] Helius DAS fetch failed for ${mint}:`, e);
    }
    return null;
}

async function fetchOnChainMetadata(connection: Connection, mint: string): Promise<JupiterToken | null> {
    // Try Helius first if available
    const heliusMetadata = await fetchHeliusMetadata(mint);
    if (heliusMetadata) return heliusMetadata;

    // 1. Try Token-2022 Metadata (Extension)
    try {
        const metadata = await getTokenMetadata(connection, new PublicKey(mint));
        if (metadata) {
            // console.log(`[Tokens] Found Token-2022 metadata for ${mint}:`, metadata);
            let logoURI = '';
            if (metadata.uri) {
                try {
                    const response = await fetchWithTimeout(metadata.uri);
                    if (response.ok) {
                        const json = await response.json();
                        logoURI = json.image || '';
                    }
                } catch (e) {
                    // console.warn(`[Tokens] Failed to fetch Token-2022 URI ${metadata.uri}:`, e);
                }
            }

            return {
                address: mint,
                chainId: 101, // Default or infer?
                decimals: 0, // We don't get decimals from metadata, usually from account info. caller handles it?
                // Actually fetchUserTokens gets decimals from account info. 
                // JupiterToken interface has decimals, but here we might default to 0 and let caller override if merging.
                // But usually this function is called when we don't know the token.
                // For display, name/symbol/logo are key.
                name: metadata.name,
                symbol: metadata.symbol,
                logoURI,
                tags: ['token-2022']
            };
        }
    } catch (e) {
        // Ignore error, might not be a Token-2022 mint or metadata not initialized
        // console.debug(`[Tokens] Token-2022 metadata check failed for ${mint}`, e);
    }

    // 2. Try Legacy Metaplex (PDA)
    try {
        const mintPubkey = new PublicKey(mint);
        const [pda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                METADATA_PROGRAM_ID.toBuffer(),
                mintPubkey.toBuffer(),
            ],
            METADATA_PROGRAM_ID
        );

        // console.log(`[Tokens] Fetching on-chain metadata for ${mint} at PDA ${pda.toBase58()}`);
        const accountInfo = await connection.getAccountInfo(pda);
        if (!accountInfo) {
            // console.log(`[Tokens] No metadata account found for ${mint}`);
            return null;
        }

        // Basic parsing of Metaplex Metadata (DataV2)
        const data = accountInfo.data;
        let offset = 1 + 32 + 32; // Skip key, update_auth, mint

        const readString = () => {
            const len = data.readUInt32LE(offset);
            offset += 4;
            const str = data.toString('utf8', offset, offset + len).replace(/\0/g, '');
            offset += len;
            return str;
        };

        const name = readString();
        const symbol = readString();
        const uri = readString();

        // console.log(`[Tokens] Parsed on-chain metadata for ${mint}: Symbol=${symbol}, Name=${name}, URI=${uri}`);

        let logoURI = '';
        if (uri) {
            try {
                // console.log(`[Tokens] Fetching metadata JSON from ${uri}`);
                const response = await fetchWithTimeout(uri);
                if (response.ok) {
                    const json = await response.json();
                    logoURI = json.image || '';
                    // console.log(`[Tokens] Found logo URI for ${mint}: ${logoURI}`);
                } else {
                    console.warn(`[Tokens] Failed to fetch URI ${uri}: ${response.status}`);
                }
            } catch (e) {
                console.warn(`[Tokens] Failed to fetch metadata JSON for ${mint}:`, e);
            }
        }

        return {
            address: mint,
            chainId: 101,
            decimals: 0,
            name,
            symbol,
            logoURI,
            tags: ['on-chain']
        };

    } catch (e) {
        console.warn(`[Tokens] Failed to fetch on-chain metadata for ${mint}:`, e);
        return null;
    }
}

export async function fetchUserTokens(connection: Connection, publicKey: string, isX1: boolean = false): Promise<TokenBalance[]> {
    try {
        const [splAccounts, token2022Accounts] = await Promise.all([
            connection.getParsedTokenAccountsByOwner(
                new PublicKey(publicKey),
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') } // SPL Token Program
            ),
            connection.getParsedTokenAccountsByOwner(
                new PublicKey(publicKey),
                { programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') } // Token-2022 Program
            )
        ]);

        // console.log(`[Tokens] Found ${splAccounts.value.length} SPL accounts and ${token2022Accounts.value.length} Token-2022 accounts`);

        const allAccounts = [...splAccounts.value, ...token2022Accounts.value];

        // 2. Ensure metadata is loaded
        let metadataMap = new Map<string, JupiterToken>();
        try {
            metadataMap = await fetchTokenMetadataMap();
        } catch (e) {
            console.error('[Tokens] Failed to load metadata map, continuing without metadata', e);
        }

        // 3. Process accounts
        const rawTokens = await Promise.all(allAccounts.map(async item => {
            const info = item.account.data.parsed.info;
            const mint = info.mint;
            const amount = info.tokenAmount.amount; // Raw string amount
            const decimals = info.tokenAmount.decimals;

            // Filter out zero balance tokens if desired, but for now keep them or filter later
            if (amount === '0') return null;

            let metadata = metadataMap.get(mint);
            // For X1: only verified if in X1 whitelist
            // For Solana: verified if in Jupiter list OR in core verified set (fallback)
            const isVerified = isX1
                ? X1_VERIFIED_TOKENS.has(mint)
                : (!!metadata || SOLANA_CORE_VERIFIED.has(mint));

            // Fallback: Fetch on-chain metadata if missing
            if (!metadata) {
                // Check if we already cached it in the map (from previous calls in this session)
                // If not, fetch it
                const onChain = await fetchOnChainMetadata(connection, mint);
                if (onChain) {
                    metadata = onChain;
                    // Cache it for future use in this session
                    if (tokenMap) {
                        tokenMap.set(mint, onChain);
                    }
                }
            }

            // Check for URL in name/symbol (common spam pattern)
            const hasUrlInName = metadata?.name && /https?:\/\/|\.com|\.io|\.xyz|\.net/.test(metadata.name);
            const hasUrlInSymbol = metadata?.symbol && /https?:\/\/|\.com|\.io|\.xyz|\.net/.test(metadata.symbol);
            const isSpamByUrl = hasUrlInName || hasUrlInSymbol;

            return {
                mint,
                amount,
                decimals,
                symbol: metadata?.symbol,
                name: metadata?.name,
                logoURI: metadata?.logoURI,
                isVerified: isVerified && !isSpamByUrl, // Only verified if on strict list AND no URL spam
            } as TokenBalance;
        }));

        const tokens = rawTokens.filter((t): t is TokenBalance => t !== null);

        // console.log(`[Tokens] Returning ${tokens.length} tokens with non-zero balance`);
        return tokens;
    } catch (error) {
        console.error('Error fetching user tokens:', error);
        // Return tokens without metadata if metadata fetch fails?
        // But we need to know if it was the metadata fetch or the account fetch that failed.
        return [];
    }
}
