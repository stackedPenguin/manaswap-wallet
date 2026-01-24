/**
 * Safe environment variable access that works in both Vite and React Native
 *
 * Note: import.meta.env is Vite-specific and causes parse-time errors in React Native.
 * We use indirect evaluation to avoid syntax errors in Metro bundler.
 */

// Cached environment values
let cachedViteEnv: Record<string, string> | null = null;

function getViteEnv(): Record<string, string> | null {
    if (cachedViteEnv !== null) return cachedViteEnv;

    try {
        // Use indirect evaluation to avoid parse-time syntax errors in Metro
        // This only works in Vite where import.meta.env is defined
        const getEnv = new Function('return typeof import.meta !== "undefined" ? import.meta.env : null');
        cachedViteEnv = getEnv() || {};
    } catch {
        cachedViteEnv = {};
    }

    return cachedViteEnv;
}

export function getEnvVar(key: string, fallback: string = ''): string {
    // Try Vite's import.meta.env first (via indirect evaluation)
    const viteEnv = getViteEnv();
    if (viteEnv && viteEnv[key] !== undefined) {
        return viteEnv[key];
    }

    // Try process.env (Node.js / React Native with react-native-config)
    try {
        if (typeof process !== 'undefined' && process.env) {
            const value = process.env[key];
            if (value !== undefined) return value;
        }
    } catch {
        // process.env not available
    }

    return fallback;
}

// Common environment variable getters
export const getSolanaRpcUrl = () => getEnvVar('VITE_SOLANA_RPC_URL', 'https://rpc.ankr.com/solana');
export const getHeliusApiKey = () => getEnvVar('VITE_HELIUS_API_KEY', '');
export const getJupiterApiKey = () => getEnvVar('VITE_JUPITER_ULTRA_API_KEY', '');
export const getTheGraphApiKey = () => getEnvVar('VITE_THEGRAPH_API_KEY', '');
