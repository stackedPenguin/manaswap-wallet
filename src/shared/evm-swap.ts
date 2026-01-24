/**
 * EVM Swap via LI.FI API
 * Handles quotes and token approvals for EVM chain swaps
 */

import { Contract, Interface } from 'ethers';
import { getEvmProvider } from './evm-balances';
import { getEvmNetworkConfig, getEvmNetworkByChainId } from './evm-networks';

const LIFI_API = 'https://li.quest/v1';

// Native token address constant (used by LI.FI for native assets)
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

// ERC-20 ABI for allowance checks
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

export interface EvmQuoteRequest {
  fromChain: number;      // Chain ID (1, 42161, 8453, 137, 10)
  toChain: number;        // Same for same-chain swaps
  fromToken: string;      // Token address (0x... or native)
  toToken: string;
  fromAmount: string;     // Amount in wei/smallest unit
  fromAddress: string;    // User's EVM address
  slippage?: number;      // Default 0.5%
}

export interface EvmQuoteResponse {
  // Core quote data
  fromToken: { address: string; symbol: string; decimals: number; logoURI?: string };
  toToken: { address: string; symbol: string; decimals: number; logoURI?: string };
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;

  // Approval info
  approvalAddress: string;
  needsApproval: boolean;

  // Transaction data (ready to sign)
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    gasLimit?: string;
    chainId: number;
  };

  // Display info
  gasCostUSD: string;
  priceImpact: string;
  route: string[];
  estimatedTime: number; // seconds
}

/**
 * Get network ID from chain ID
 */
function getNetworkIdFromChainId(chainId: number): string {
  const network = getEvmNetworkByChainId(chainId);
  return network?.id || 'ethereum-mainnet';
}

/**
 * Check ERC-20 token allowance
 */
export async function checkEvmAllowance(
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  networkId: string
): Promise<bigint> {
  // Native tokens don't need approval
  if (tokenAddress === NATIVE_TOKEN || tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    return BigInt(2) ** BigInt(256) - BigInt(1); // Max uint256
  }

  const provider = getEvmProvider(networkId);
  const contract = new Contract(tokenAddress, ERC20_ABI, provider);
  return contract.allowance(ownerAddress, spenderAddress);
}

/**
 * Build ERC-20 approval transaction
 */
export function buildEvmApprovalTx(
  tokenAddress: string,
  spenderAddress: string
): { to: string; data: string } {
  const iface = new Interface(ERC20_ABI);
  const maxUint256 = BigInt(2) ** BigInt(256) - BigInt(1);
  return {
    to: tokenAddress,
    data: iface.encodeFunctionData('approve', [spenderAddress, maxUint256]),
  };
}

/**
 * Get swap quote from LI.FI
 */
export async function getEvmSwapQuote(req: EvmQuoteRequest): Promise<EvmQuoteResponse> {
  const params = new URLSearchParams({
    fromChain: req.fromChain.toString(),
    toChain: req.toChain.toString(),
    fromToken: req.fromToken,
    toToken: req.toToken,
    fromAmount: req.fromAmount,
    fromAddress: req.fromAddress,
    slippage: (req.slippage || 0.005).toString(), // 0.5% default
  });

  const response = await fetch(`${LIFI_API}/quote?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `LI.FI API error: ${response.status}`);
  }

  const data = await response.json();

  // Check if approval needed
  const networkId = getNetworkIdFromChainId(req.fromChain);
  let needsApproval = false;

  // Only check allowance for non-native tokens
  if (req.fromToken !== NATIVE_TOKEN &&
      req.fromToken.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    try {
      const allowance = await checkEvmAllowance(
        req.fromToken,
        req.fromAddress,
        data.estimate?.approvalAddress || data.transactionRequest?.to || '',
        networkId
      );
      needsApproval = BigInt(req.fromAmount) > allowance;
    } catch (e) {
      console.warn('Failed to check allowance:', e);
      needsApproval = true; // Assume approval needed if check fails
    }
  }

  return {
    fromToken: data.action?.fromToken || { address: req.fromToken, symbol: 'Unknown', decimals: 18 },
    toToken: data.action?.toToken || { address: req.toToken, symbol: 'Unknown', decimals: 18 },
    fromAmount: data.action?.fromAmount || req.fromAmount,
    toAmount: data.estimate?.toAmount || '0',
    toAmountMin: data.estimate?.toAmountMin || '0',
    approvalAddress: data.estimate?.approvalAddress || data.transactionRequest?.to || '',
    needsApproval,
    transactionRequest: {
      to: data.transactionRequest?.to || '',
      data: data.transactionRequest?.data || '',
      value: data.transactionRequest?.value || '0',
      gasLimit: data.transactionRequest?.gasLimit?.toString(),
      chainId: req.fromChain,
    },
    gasCostUSD: data.estimate?.gasCosts?.[0]?.amountUSD || '0',
    priceImpact: data.estimate?.priceImpact || '0',
    route: data.includedSteps?.map((s: any) => s.toolDetails?.name || s.tool) || ['LI.FI'],
    estimatedTime: data.estimate?.executionDuration || 60,
  };
}

/**
 * Get list of supported tokens for a chain from LI.FI
 */
export async function getEvmSwapTokens(chainId: number): Promise<Array<{
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  priceUSD?: string;
}>> {
  try {
    const response = await fetch(`${LIFI_API}/tokens?chains=${chainId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch tokens: ${response.status}`);
    }

    const data = await response.json();
    const tokens = data.tokens?.[chainId] || [];

    return tokens.map((t: any) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      logoURI: t.logoURI,
      priceUSD: t.priceUSD,
    }));
  } catch (e) {
    console.error('Failed to fetch LI.FI tokens:', e);
    return [];
  }
}

/**
 * Get chain ID from network ID
 */
export function getEvmChainId(networkId: string): number {
  const network = getEvmNetworkConfig(networkId);
  return network?.chainId || 1;
}

/**
 * Check if token address represents native token
 */
export function isNativeToken(address: string): boolean {
  return address === NATIVE_TOKEN ||
         address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
}

/**
 * Get native token address for LI.FI
 */
export function getNativeTokenAddress(): string {
  return NATIVE_TOKEN;
}
