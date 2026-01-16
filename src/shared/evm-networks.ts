/**
 * EVM Network Configuration
 * Supports Ethereum mainnet, testnets, and popular L2s
 */

export interface EvmNetworkConfig {
  id: string;
  chainId: number;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isTestnet: boolean;
  iconColor?: string;
  iconUrl?: string;
}

// Public RPC endpoints (consider using environment variables for production)
export const EVM_NETWORKS: EvmNetworkConfig[] = [
  // Ethereum - Using publicnode RPC
  {
    id: 'ethereum-mainnet',
    chainId: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: false,
    iconColor: '#627EEA',
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    id: 'ethereum-sepolia',
    chainId: 11155111,
    name: 'Sepolia',
    shortName: 'SEP',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: true,
    iconColor: '#627EEA',
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },

  // Arbitrum - Using official RPC
  {
    id: 'arbitrum-mainnet',
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: false,
    iconColor: '#28A0F0',
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  },

  // Optimism - Using official RPC
  {
    id: 'optimism-mainnet',
    chainId: 10,
    name: 'Optimism',
    shortName: 'OP',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: false,
    iconColor: '#FF0420',
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  },

  // Base - Using faster public RPC (official mainnet.base.org is very slow)
  {
    id: 'base-mainnet',
    chainId: 8453,
    name: 'Base',
    shortName: 'BASE',
    rpcUrl: 'https://base.llamarpc.com',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    isTestnet: false,
    iconColor: '#0052FF',
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  },

  // Polygon - Using official RPC
  {
    id: 'polygon-mainnet',
    chainId: 137,
    name: 'Polygon',
    shortName: 'MATIC',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    isTestnet: false,
    iconColor: '#8247E5',
    iconUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  },
];

/**
 * Get EVM network config by ID
 */
export function getEvmNetworkConfig(networkId: string): EvmNetworkConfig | undefined {
  return EVM_NETWORKS.find(n => n.id === networkId);
}

/**
 * Get EVM network config by chain ID
 */
export function getEvmNetworkByChainId(chainId: number): EvmNetworkConfig | undefined {
  return EVM_NETWORKS.find(n => n.chainId === chainId);
}

/**
 * Check if a network ID is an EVM network
 */
export function isEvmNetworkId(networkId: string): boolean {
  return EVM_NETWORKS.some(n => n.id === networkId);
}

/**
 * Get all mainnet EVM networks
 */
export function getEvmMainnets(): EvmNetworkConfig[] {
  return EVM_NETWORKS.filter(n => !n.isTestnet);
}

/**
 * Get all testnet EVM networks
 */
export function getEvmTestnets(): EvmNetworkConfig[] {
  return EVM_NETWORKS.filter(n => n.isTestnet);
}

/**
 * Convert chain ID to hex string (used in EIP-1193)
 */
export function chainIdToHex(chainId: number): string {
  return '0x' + chainId.toString(16);
}

/**
 * Parse hex chain ID to number
 */
export function hexToChainId(hex: string): number {
  return parseInt(hex, 16);
}
