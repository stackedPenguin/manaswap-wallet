import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import type { NetworkClusterId } from './networks';
import { getNetworkConfig } from './networks';

/**
 * Sends SOL from one address to another
 */
export async function sendSol(
  fromKeypair: Keypair,
  toAddress: string,
  amount: number, // Amount in SOL
  networkId: NetworkClusterId
): Promise<string> {
  const config = getNetworkConfig(networkId);
  const connection = new Connection(config.rpcUrl, 'confirmed');
  
  const toPublicKey = new PublicKey(toAddress);
  
  // Convert SOL to lamports
  const lamports = Math.floor(amount * 1_000_000_000);
  
  // Create transaction
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports,
    })
  );
  
  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromKeypair.publicKey;
  
  // Sign transaction
  transaction.sign(fromKeypair);
  
  // Send and confirm transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [fromKeypair],
    {
      commitment: 'confirmed',
      skipPreflight: false,
    }
  );
  
  return signature;
}

/**
 * Estimates transaction fee
 */
export async function estimateTransactionFee(
  _networkId: NetworkClusterId
): Promise<number> {
  // Standard Solana transaction fee is 5000 lamports
  // This is a constant, but we could also fetch it from the network
  const feeInLamports = 5000;
  return feeInLamports / 1_000_000_000; // Convert to SOL
}

