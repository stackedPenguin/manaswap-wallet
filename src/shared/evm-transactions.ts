/**
 * EVM Transaction Utilities
 * Handles building, signing, and sending transactions on EVM chains
 */

import {
  Wallet,
  Contract,
  parseUnits,
  formatUnits,
  parseEther,
  type TransactionRequest,
  type TransactionResponse,
  type TransactionReceipt,
} from 'ethers';
import { getEvmProvider } from './evm-balances';
import { getEvmNetworkConfig } from './evm-networks';

// ERC-20 ABI for transfers
const ERC20_TRANSFER_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export interface EvmTransactionResult {
  hash: string;
  wait: () => Promise<TransactionReceipt | null>;
}

export interface GasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedCost: string; // In native currency units (ETH, MATIC, etc.)
}

/**
 * Send native currency (ETH, MATIC, etc.)
 */
export async function sendEvmNative(
  wallet: Wallet,
  to: string,
  amount: string, // In ETH/MATIC units (not wei)
  networkId: string
): Promise<EvmTransactionResult> {
  const provider = getEvmProvider(networkId);
  const connectedWallet = wallet.connect(provider);

  const tx: TransactionRequest = {
    to,
    value: parseEther(amount),
  };

  const response = await connectedWallet.sendTransaction(tx);

  return {
    hash: response.hash,
    wait: () => response.wait(),
  };
}

/**
 * Send ERC-20 token
 */
export async function sendEvmToken(
  wallet: Wallet,
  to: string,
  amount: string, // In token units (not smallest denomination)
  tokenAddress: string,
  decimals: number,
  networkId: string
): Promise<EvmTransactionResult> {
  const provider = getEvmProvider(networkId);
  const connectedWallet = wallet.connect(provider);

  const contract = new Contract(tokenAddress, ERC20_TRANSFER_ABI, connectedWallet);
  const amountInSmallestUnit = parseUnits(amount, decimals);

  const response: TransactionResponse = await contract.transfer(to, amountInSmallestUnit);

  return {
    hash: response.hash,
    wait: () => response.wait(),
  };
}

/**
 * Estimate gas for a native transfer
 */
export async function estimateNativeTransferGas(
  from: string,
  to: string,
  amount: string,
  networkId: string
): Promise<GasEstimate> {
  const network = getEvmNetworkConfig(networkId);
  if (!network) {
    throw new Error(`Unknown EVM network: ${networkId}`);
  }

  const provider = getEvmProvider(networkId);

  const tx: TransactionRequest = {
    from,
    to,
    value: parseEther(amount),
  };

  const [gasLimit, feeData] = await Promise.all([
    provider.estimateGas(tx),
    provider.getFeeData(),
  ]);

  // Calculate estimated cost
  const gasPrice = feeData.gasPrice ?? 0n;
  const estimatedCostWei = gasLimit * gasPrice;
  const estimatedCost = formatUnits(estimatedCostWei, network.nativeCurrency.decimals);

  return {
    gasLimit,
    gasPrice,
    maxFeePerGas: feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
    estimatedCost,
  };
}

/**
 * Estimate gas for an ERC-20 transfer
 */
export async function estimateTokenTransferGas(
  from: string,
  to: string,
  amount: string,
  tokenAddress: string,
  decimals: number,
  networkId: string
): Promise<GasEstimate> {
  const network = getEvmNetworkConfig(networkId);
  if (!network) {
    throw new Error(`Unknown EVM network: ${networkId}`);
  }

  const provider = getEvmProvider(networkId);
  const contract = new Contract(tokenAddress, ERC20_TRANSFER_ABI, provider);

  const amountInSmallestUnit = parseUnits(amount, decimals);

  const [gasLimit, feeData] = await Promise.all([
    contract.transfer.estimateGas(to, amountInSmallestUnit, { from }),
    provider.getFeeData(),
  ]);

  const gasPrice = feeData.gasPrice ?? 0n;
  const estimatedCostWei = gasLimit * gasPrice;
  const estimatedCost = formatUnits(estimatedCostWei, network.nativeCurrency.decimals);

  return {
    gasLimit,
    gasPrice,
    maxFeePerGas: feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
    estimatedCost,
  };
}

/**
 * Get current gas price for a network
 */
export async function getGasPrice(networkId: string): Promise<{
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}> {
  const provider = getEvmProvider(networkId);
  const feeData = await provider.getFeeData();

  return {
    gasPrice: feeData.gasPrice ?? 0n,
    maxFeePerGas: feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  };
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  hash: string,
  networkId: string,
  confirmations = 1
): Promise<TransactionReceipt | null> {
  const provider = getEvmProvider(networkId);
  return provider.waitForTransaction(hash, confirmations);
}

/**
 * Get transaction receipt
 */
export async function getTransactionReceipt(
  hash: string,
  networkId: string
): Promise<TransactionReceipt | null> {
  const provider = getEvmProvider(networkId);
  return provider.getTransactionReceipt(hash);
}

/**
 * Get transaction by hash
 */
export async function getTransaction(
  hash: string,
  networkId: string
): Promise<TransactionResponse | null> {
  const provider = getEvmProvider(networkId);
  return provider.getTransaction(hash);
}

/**
 * Get current block number
 */
export async function getBlockNumber(networkId: string): Promise<number> {
  const provider = getEvmProvider(networkId);
  return provider.getBlockNumber();
}

/**
 * Format wei to display units
 */
export function formatWei(wei: bigint, decimals = 18): string {
  return formatUnits(wei, decimals);
}

/**
 * Parse display units to wei
 */
export function parseToWei(amount: string, decimals = 18): bigint {
  return parseUnits(amount, decimals);
}

/**
 * Format gas price to Gwei for display
 */
export function formatGwei(wei: bigint): string {
  return formatUnits(wei, 9);
}
