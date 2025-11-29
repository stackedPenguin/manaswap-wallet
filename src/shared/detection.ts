import type { NetworkClusterId } from './networks';

/**
 * Popular dApp hostname mappings to preferred networks.
 * This is a curated list that can be expanded over time.
 */
export const HOSTNAME_ALLOWLIST: Record<string, NetworkClusterId> = {
  // X1-specific dApps (add known X1 dApps here)
  'app.x1.xyz': 'x1-mainnet',
  'testnet.x1.xyz': 'x1-testnet',
  'dex.x1.xyz': 'x1-mainnet',
  
  // Solana-specific dApps (add known Solana dApps here)
  'jup.ag': 'solana-mainnet',
  'raydium.io': 'solana-mainnet',
  'orca.so': 'solana-mainnet',
  'magiceden.io': 'solana-mainnet',
  'phantom.app': 'solana-mainnet',
};

/**
 * Known program IDs that are exclusive to specific networks.
 * Format: programId -> network
 */
export const PROGRAM_ID_MAPPINGS: Record<string, NetworkClusterId> = {
  // X1-specific program IDs (add known X1 programs here)
  // Example: 'X1Program1111111111111111111111111111111111': 'x1-mainnet',
  
  // Solana-specific program IDs
  // Most Solana programs are on Solana mainnet by default
};

/**
 * Detection confidence levels
 */
export type DetectionConfidence = 'high' | 'medium' | 'low';

export interface DetectionResult {
  network: NetworkClusterId;
  confidence: DetectionConfidence;
  reason: string;
}

/**
 * Detects network from hostname using allowlist
 */
export function detectFromHostname(hostname: string): DetectionResult | null {
  const normalized = hostname.toLowerCase();
  
  // Check exact match in allowlist
  if (HOSTNAME_ALLOWLIST[normalized]) {
    return {
      network: HOSTNAME_ALLOWLIST[normalized],
      confidence: 'high',
      reason: 'Known dApp hostname',
    };
  }
  
  // Check subdomain matches
  for (const [pattern, network] of Object.entries(HOSTNAME_ALLOWLIST)) {
    if (normalized.includes(pattern) || normalized.endsWith(`.${pattern}`)) {
      return {
        network,
        confidence: 'high',
        reason: 'Known dApp subdomain',
      };
    }
  }
  
  return null;
}

/**
 * Detects network from URL patterns (heuristic-based)
 */
export function detectFromUrlPattern(url: string): DetectionResult | null {
  const lowerUrl = url.toLowerCase();
  
  // X1 patterns
  if (/x1|xone|x-?one/i.test(lowerUrl)) {
    if (/testnet|devnet|staging/i.test(lowerUrl)) {
      return {
        network: 'x1-testnet',
        confidence: 'medium',
        reason: 'URL pattern suggests X1 testnet',
      };
    }
    return {
      network: 'x1-mainnet',
      confidence: 'medium',
      reason: 'URL pattern suggests X1 mainnet',
    };
  }
  
  // Solana patterns
  if (/solana|sol|raydium|jupiter|orca|magiceden/i.test(lowerUrl)) {
    if (/testnet|devnet|staging/i.test(lowerUrl)) {
      return {
        network: 'solana-testnet',
        confidence: 'medium',
        reason: 'URL pattern suggests Solana testnet',
      };
    }
    return {
      network: 'solana-mainnet',
      confidence: 'medium',
      reason: 'URL pattern suggests Solana mainnet',
    };
  }
  
  return null;
}

/**
 * Detects network from RPC endpoint hints
 */
export function detectFromRpcHint(rpcUrl: string): DetectionResult | null {
  const lowerRpc = rpcUrl.toLowerCase();
  
  if (lowerRpc.includes('x1.xyz')) {
    if (lowerRpc.includes('testnet')) {
      return {
        network: 'x1-testnet',
        confidence: 'high',
        reason: 'RPC endpoint indicates X1 testnet',
      };
    }
    return {
      network: 'x1-mainnet',
      confidence: 'high',
      reason: 'RPC endpoint indicates X1 mainnet',
    };
  }
  
  if (lowerRpc.includes('solana.com') || lowerRpc.includes('solana')) {
    if (lowerRpc.includes('testnet')) {
      return {
        network: 'solana-testnet',
        confidence: 'high',
        reason: 'RPC endpoint indicates Solana testnet',
      };
    }
    return {
      network: 'solana-mainnet',
      confidence: 'high',
      reason: 'RPC endpoint indicates Solana mainnet',
    };
  }
  
  return null;
}

/**
 * Detects network from program ID
 */
export function detectFromProgramId(programId: string): DetectionResult | null {
  if (PROGRAM_ID_MAPPINGS[programId]) {
    return {
      network: PROGRAM_ID_MAPPINGS[programId],
      confidence: 'high',
      reason: 'Known program ID mapping',
    };
  }
  
  return null;
}

/**
 * Main detection function that tries all heuristics
 */
export function detectNetwork(
  hostname: string,
  url?: string,
  rpcHint?: string,
  programIds?: string[]
): DetectionResult | null {
  // Try hostname allowlist first (highest confidence)
  const hostnameResult = detectFromHostname(hostname);
  if (hostnameResult && hostnameResult.confidence === 'high') {
    return hostnameResult;
  }
  
  // Try RPC hint (high confidence)
  if (rpcHint) {
    const rpcResult = detectFromRpcHint(rpcHint);
    if (rpcResult) {
      return rpcResult;
    }
  }
  
  // Try program IDs (high confidence if found)
  if (programIds) {
    for (const programId of programIds) {
      const programResult = detectFromProgramId(programId);
      if (programResult) {
        return programResult;
      }
    }
  }
  
  // Try URL patterns (medium confidence)
  if (url) {
    const urlResult = detectFromUrlPattern(url);
    if (urlResult) {
      return urlResult;
    }
  }
  
  // Fallback to hostname pattern if no allowlist match
  if (url) {
    return detectFromUrlPattern(url);
  }
  
  return null;
}


