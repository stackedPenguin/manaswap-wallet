import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError
} from '@solana/spl-token';
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
 * Sends SPL tokens from one address to another
 */
export async function sendSplToken(
  fromKeypair: Keypair,
  toAddress: string,
  amount: number, // Amount in token units (not raw)
  tokenMint: string,
  decimals: number,
  networkId: NetworkClusterId
): Promise<string> {
  const config = getNetworkConfig(networkId);
  const connection = new Connection(config.rpcUrl, 'confirmed');

  const mintPubkey = new PublicKey(tokenMint);
  const toPublicKey = new PublicKey(toAddress);

  // Get Associated Token Addresses
  const fromAta = await getAssociatedTokenAddress(mintPubkey, fromKeypair.publicKey);
  const toAta = await getAssociatedTokenAddress(mintPubkey, toPublicKey);

  // Convert amount to raw token units
  const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));

  // Create transaction
  const transaction = new Transaction();

  // Check if recipient's ATA exists, if not create it
  try {
    await getAccount(connection, toAta);
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      // Create ATA for recipient
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromKeypair.publicKey, // payer
          toAta, // ata address
          toPublicKey, // owner
          mintPubkey // mint
        )
      );
    } else {
      throw error;
    }
  }

  // Add transfer instruction
  transaction.add(
    createTransferInstruction(
      fromAta, // source
      toAta, // destination
      fromKeypair.publicKey, // owner
      rawAmount // amount
    )
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
