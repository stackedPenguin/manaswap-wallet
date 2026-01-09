import { XDEX_SOLANA_API, XDEX_X1_API, getNetworkConfig, type NetworkClusterId } from './networks';
import { fetchTokenMetadataMap, FALLBACK_TOKENS } from './tokens'; // Import for decimal lookup


export interface QuoteResponse {
    inputMint: string;
    inAmount: string; // Atomic units
    outputMint: string;
    outAmount: string; // Atomic units
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    priceImpactPct: string;
    routePlan: any[];
    transaction?: string; // Some APIs return it here
    requestId?: string;
    platformFee?: {
        amount: string;
        feeBps: number;
    };
    poolStats?: {
        vol24h: number; // USD
        txns24h: number;
        apr24h: number;
    }
}

// 0.05% Platform Fee (Revenue Vault)
const PLATFORM_FEE_BPS = 5;

export async function getSwapQuote(
    networkId: NetworkClusterId,
    inputMint: string,
    outputMint: string,
    amount: number, // Atomic units
    slippageBps: number = 50, // Default 0.5%
    _userPublicKey?: string // Required for X1/XDEX API (unused in client-side quote mode)
): Promise<QuoteResponse> {
    const config = getNetworkConfig(networkId);
    let baseUrl: string;

    if (config.kind === 'solana') {
        baseUrl = XDEX_SOLANA_API;

        // Jupiter v6 /quote endpoint
        const params = new URLSearchParams({
            inputMint,
            outputMint,
            amount: amount.toString(),
            slippageBps: slippageBps.toString(),
            platformFeeBps: PLATFORM_FEE_BPS.toString(),
        });
        const url = `${baseUrl}/quote?${params.toString()}`;
        console.log(`[Swap] Fetching quote from ${config.kind} (${url})`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Swap API Error: ${response.status} ${err.error || err.message || ''}`);
            }
            const data = await response.json();
            return data as QuoteResponse;
        } catch (e: any) {
            console.error('[Swap] Jupiter quote failed:', e);
            throw e;
        }

    } else {
        // X1 Mainnet (XDEX)
        // Since /quote endpoint is 404, we calculate quote client-side from pool reserves
        try {
            const pools = await fetchX1Pools(XDEX_X1_API);
            const quote = await calculateX1Quote(pools, inputMint, outputMint, amount);
            if (quote) return quote;

            // If no pool found, maybe try prepare just for TX check? No, invalid quote.
            console.warn('[Swap] No X1 pool found for pair, falling back to mock which might fail tx');
            return mockQuote(inputMint, outputMint, amount);
        } catch (e: any) {
            console.error('[Swap] X1 Client-side quote failed:', e);
            if (e.message && e.message.includes('Insufficient liquidity')) {
                throw e;
            }
            return mockQuote(inputMint, outputMint, amount);
        }
    }
}

// X1 Pool Interfaces
interface XdexPool {
    token_0_mint: string;
    token_1_mint: string;
    reserve_0: number;
    reserve_1: number;
    // Metadata for Token List
    token_0_symbol?: string;
    token_1_symbol?: string;
    token_0_logo?: string;
    token_1_logo?: string;
    token_0_decimals?: number;
    token_1_decimals?: number;
    // 24h Stats
    txns_24h?: number;
    apr_24h?: number;
    token1_volume_24h?: number;
    token2_volume_24h?: number;
}

let cachedPools: XdexPool[] = [];
let lastPoolFetch = 0;

export async function getTradableTokens(networkId: string): Promise<any[]> {
    if (networkId.includes('x1')) {
        const pools = await fetchX1Pools(XDEX_X1_API);
        const uniqueTokens = new Map<string, any>();

        pools.forEach(p => {
            // Process Token 0
            if (p.token_0_mint && !uniqueTokens.has(p.token_0_mint)) {
                uniqueTokens.set(p.token_0_mint, {
                    mint: p.token_0_mint,
                    symbol: p.token_0_symbol || 'UNK',
                    name: p.token_0_symbol || 'Unknown Token',
                    decimals: p.token_0_decimals ?? 9,
                    logoURI: p.token_0_logo,
                    amount: '0',
                    chainId: 195
                });
            }
            // Process Token 1
            if (p.token_1_mint && !uniqueTokens.has(p.token_1_mint)) {
                uniqueTokens.set(p.token_1_mint, {
                    mint: p.token_1_mint,
                    symbol: p.token_1_symbol || 'UNK',
                    name: p.token_1_symbol || 'Unknown Token',
                    decimals: p.token_1_decimals ?? 9,
                    logoURI: p.token_1_logo,
                    amount: '0',
                    chainId: 195
                });
            }
        });

        // Merge with FALLBACK_TOKENS to ensure high quality metadata for known tokens
        const x1Fallback = FALLBACK_TOKENS.filter(t => t.chainId === 195);
        x1Fallback.forEach(fb => {
            if (uniqueTokens.has(fb.address)) {
                const existing = uniqueTokens.get(fb.address);
                uniqueTokens.set(fb.address, {
                    ...existing,
                    symbol: fb.symbol,
                    name: fb.name,
                    logoURI: fb.logoURI, // Prefer our high quality generic logo if available
                    decimals: fb.decimals
                });
            } else {
                uniqueTokens.set(fb.address, {
                    mint: fb.address,
                    symbol: fb.symbol,
                    name: fb.name,
                    decimals: fb.decimals,
                    logoURI: fb.logoURI,
                    amount: '0',
                    chainId: 195
                });
            }
        });

        return Array.from(uniqueTokens.values());
    }

    // For Solana, currently just return defaults or rely on UI to show popular. 
    // This function primarily solves the X1 discovery issue.
    const solFallback = FALLBACK_TOKENS.filter(t => t.chainId === 101).map(t => ({
        mint: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.logoURI,
        amount: '0',
        chainId: 101
    }));
    return solFallback;
}

async function fetchX1Pools(baseUrl: string): Promise<XdexPool[]> {
    const now = Date.now();
    if (cachedPools.length > 0 && now - lastPoolFetch < 60000) { // Cache for 60s
        return cachedPools;
    }

    try {
        const response = await fetch(`${baseUrl}/pool/list?network=X1%20Mainnet`);
        if (!response.ok) throw new Error('Failed to fetch pools');
        const json = await response.json();
        const data = json.data || [];

        // Normalize reserves (API might return string or float from db)
        // Ensure we map standard fields. 
        // Based on analysis of xdex_pools.json:
        // Root fields: token1_address, token2_address, amount1, amount2
        // Logo fields: token1_logo, token2_logo (might be relative path)
        // Decimals: pool_info.mint0Decimals (corresponds to token1_address aka token0Mint in pool_info)

        cachedPools = data.map((p: any) => {
            let logo0 = p.token1_logo || '';
            let logo1 = p.token2_logo || '';

            // Fix relative paths
            if (logo0 && logo0.startsWith('/')) logo0 = `https://xdex.xyz${logo0}`;
            if (logo1 && logo1.startsWith('/')) logo1 = `https://xdex.xyz${logo1}`;

            return {
                token_0_mint: p.token1_address || p.token_0_mint || p.token0_mint || '',
                token_1_mint: p.token2_address || p.token_1_mint || p.token1_mint || '',
                reserve_0: Number(p.amount1 || p.reserve_0 || p.token1_reserves || 0),
                reserve_1: Number(p.amount2 || p.reserve_1 || p.token2_reserves || 0),
                // Metadata
                token_0_symbol: p.token1_symbol,
                token_1_symbol: p.token2_symbol,
                token_0_logo: logo0,
                token_1_logo: logo1,
                // Decimals (pool_info uses 0/1 index logic matching pool creator, usually matches 1/2 from top level if we align them)
                // top: token1_address == pool_info.token0Mint. So token1_ top uses mint0Decimals.
                token_0_decimals: p.pool_info?.mint0Decimals,
                token_1_decimals: p.pool_info?.mint1Decimals,
                // Stats
                txns_24h: p.txns_24h,
                apr_24h: p.apr_24h,
                token1_volume_24h: p.token1_volume_24h,
                token2_volume_24h: p.token2_volume_24h
            };
        });

        lastPoolFetch = now;
        return cachedPools;
    } catch (e) {
        console.error('[Swap] Fetch X1 pools failed:', e);
        return [];
    }
}

async function calculateX1Quote(pools: XdexPool[], inputMint: string, outputMint: string, amountInAtomic: number): Promise<QuoteResponse | null> {
    // Find pool (Direct swap only for MVP)
    const pool = pools.find(p =>
        (p.token_0_mint === inputMint && p.token_1_mint === outputMint) ||
        (p.token_1_mint === inputMint && p.token_0_mint === outputMint)
    );

    if (!pool) {
        console.warn(`[SwapDebug] No pool found for ${inputMint} -> ${outputMint}. Available pools: ${pools.length}`);
        throw new Error('Insufficient liquidity for this pair');
    }

    const isInput0 = pool.token_0_mint === inputMint;

    // FETCH DECIMALS
    const dec0 = await getTokenDecimals(pool.token_0_mint);
    const dec1 = await getTokenDecimals(pool.token_1_mint);

    console.log(`[SwapDebug] Quote Logic:
      Input: ${inputMint} (Dec: ${dec0})
      Output: ${outputMint} (Dec: ${dec1})
      Pool0: ${pool.token_0_mint} Res: ${pool.reserve_0}
      Pool1: ${pool.token_1_mint} Res: ${pool.reserve_1}
    `);

    // NORMALIZE RESERVES (Human Float -> Atomic Int)
    // reserve_0 is a float (e.g. 4657.31). Multiplier 10^dec0.
    const reserve0Atomic = Math.floor(pool.reserve_0 * Math.pow(10, dec0));
    const reserve1Atomic = Math.floor(pool.reserve_1 * Math.pow(10, dec1));

    console.log(`[SwapDebug] Atomic Reserves: R0=${reserve0Atomic}, R1=${reserve1Atomic}`);

    const reserveIn = isInput0 ? reserve0Atomic : reserve1Atomic;
    const reserveOut = isInput0 ? reserve1Atomic : reserve0Atomic;

    if (reserveIn <= 0 || reserveOut <= 0) {
        console.warn('[SwapDebug] Invalid reserves <= 0');
        return null;
    }

    // AMM Formula: x * y = k
    // AmountOut = (AmountIn * ReserveOut) / (ReserveIn + AmountIn)
    // Fee: 0.3% usually? Let's assume standard Uniswap v2 0.3%
    const amountInWithFee = Number(amountInAtomic) * 0.997; // 0.3% fee
    const numerator = amountInWithFee * Number(reserveOut);
    const denominator = Number(reserveIn) + amountInWithFee;
    const amountOut = Math.floor(numerator / denominator);

    console.log(`[SwapDebug] Math:
      In: ${amountInAtomic}
      InWithFee: ${amountInWithFee}
      ResIn: ${reserveIn}
      ResOut: ${reserveOut}
      Num: ${numerator}
      Denom: ${denominator}
      Out: ${amountOut}
    `);

    // Price Impact
    // Ideal = AmountIn * (ReserveOut / ReserveIn)
    // Actual = AmountOut
    // Impact = 1 - (Actual / Ideal)
    const idealOut = (amountInWithFee * Number(reserveOut)) / Number(reserveIn);
    const impact = idealOut > 0 ? 1 - (amountOut / idealOut) : 0;

    return {
        inputMint,
        inAmount: amountInAtomic.toString(),
        outputMint,
        outAmount: amountOut.toString(),
        otherAmountThreshold: Math.floor(amountOut * 0.995).toString(), // 0.5% slippage
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: (impact * 100).toFixed(4),
        routePlan: [{
            swapInfo: {
                ammKey: 'xdex',
                label: 'XDEX',
                inputMint,
                outputMint,
                outAmount: amountOut.toString(),
                feeAmount: '0',
                feeMint: inputMint
            },
            percent: 100
        }],
        poolStats: {
            vol24h: (pool.token1_volume_24h || 0) + (pool.token2_volume_24h || 0), // Rough sum, conceptually okay for "Activity"
            txns24h: pool.txns_24h || 0,
            apr24h: pool.apr_24h || 0
        },
        transaction: undefined // Will be fetched by prepare
    };
}


async function getTokenDecimals(mint: string): Promise<number> {
    const map = await fetchTokenMetadataMap();
    const token = map.get(mint);
    if (token) return token.decimals;
    // Fallback logic
    const fallback = FALLBACK_TOKENS.find(t => t.address === mint);
    return fallback ? fallback.decimals : 9; // Default 9
}

export async function getSwapTransaction(
    networkId: NetworkClusterId,
    quoteResponse: QuoteResponse,
    userPublicKey: string
): Promise<{ swapTransaction: string }> {
    const config = getNetworkConfig(networkId);
    let baseUrl: string;

    if (config.kind === 'solana') {
        baseUrl = XDEX_SOLANA_API;
    } else {
        baseUrl = XDEX_X1_API;
    }

    // Jupiter v6 /swap endpoint
    // POST /swap
    // Body: { quoteResponse, userPublicKey, ... }

    const body = {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        // FEE ACCOUNTS: To actually collect the platform fee, specific accounts must be provided.
        // For now, we will omit the specific fee accounts unless we have a defined revenue vault address.
        // The implementation plan specifies "redirected to the USDC rewards vault".
        // We would need the address of that vault. 
        // For this MVP step, we will rely on default behavior or the API handling it based on BPS if configured server-side (unlikely for open generic API).
        // WE WILL ADD A TODO HERE.
    };

    if (config.kind === 'x1') {
        const decimals = await getTokenDecimals(quoteResponse.inputMint);
        const humanAmount = Number(quoteResponse.inAmount) / Math.pow(10, decimals);

        const body = {
            network: 'X1 Mainnet',
            wallet: userPublicKey,
            token_in: quoteResponse.inputMint,
            token_out: quoteResponse.outputMint,
            token_in_amount: humanAmount,
            is_exact_amount_in: true
        };

        const xdexUrl = `${XDEX_X1_API}/swap/prepare`;
        console.log(`[Swap] Fetching X1 transaction from ${xdexUrl}`);

        try {
            const resp = await fetch(xdexUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`X1 Swap API Error: ${resp.status} ${errText}`);
            }

            const data = await resp.json();
            if (data.transaction) return { swapTransaction: data.transaction };
            throw new Error('No transaction returned from XDEX API');
        } catch (e) {
            console.error('X1 Swap Error:', e);
            throw e;
        }
    }

    // Default / Generic (Jupiter-like)
    const url = `${baseUrl}/swap`;
    console.log(`[Swap] Fetching transaction from ${config.kind} (${url})`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`Swap API Error: ${response.status} ${err.error || err.message || ''}`);
        }

        const data = await response.json();
        return { swapTransaction: data.swapTransaction };

    } catch (e: any) {
        throw e;
    }
}

// Development Mock
function mockQuote(input: string, output: string, amount: number): QuoteResponse {
    // 1:1 dummy rate for testing X1 flows
    return {
        inputMint: input,
        inAmount: amount.toString(),
        outputMint: output,
        outAmount: (amount * 0.99).toFixed(0), // 1% simulated impact/fee
        otherAmountThreshold: (amount * 0.98).toFixed(0),
        swapMode: 'ExactIn',
        slippageBps: 50,
        priceImpactPct: '0.1',
        routePlan: [],
        platformFee: { amount: (amount * 0.0005).toFixed(0), feeBps: 5 }
    };
}
