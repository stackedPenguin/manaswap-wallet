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
 * Sends SPL tokens (both SPL Token and Token-2022) from one address to another
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

  // Detect which token program this mint uses (SPL Token vs Token-2022)
  const mintAccountInfo = await connection.getAccountInfo(mintPubkey);
  if (!mintAccountInfo) {
    throw new Error('Mint account not found');
  }

  // Token-2022 program ID: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
  // SPL Token program ID: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
  const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  const programId = mintAccountInfo.owner;
  const isToken2022 = programId.equals(TOKEN_2022_PROGRAM_ID);

  console.log(`[sendSplToken] Mint: ${tokenMint}, Program: ${programId.toBase58()}, isToken2022: ${isToken2022}`);

  // Get Associated Token Addresses using the correct program ID
  const fromAta = await getAssociatedTokenAddress(
    mintPubkey,
    fromKeypair.publicKey,
    false, // allowOwnerOffCurve
    programId // Use detected program ID
  );
  const toAta = await getAssociatedTokenAddress(
    mintPubkey,
    toPublicKey,
    false,
    programId
  );

  // Convert amount to raw token units
  const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));

  // Create transaction
  const transaction = new Transaction();

  // Check if recipient's ATA exists, if not create it
  try {
    await getAccount(connection, toAta, 'confirmed', programId);
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      // Create ATA for recipient using correct program ID
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromKeypair.publicKey, // payer
          toAta, // ata address
          toPublicKey, // owner
          mintPubkey, // mint
          programId // Use detected program ID
        )
      );
    } else {
      throw error;
    }
  }

  // Add transfer instruction with correct program ID
  transaction.add(
    createTransferInstruction(
      fromAta, // source
      toAta, // destination
      fromKeypair.publicKey, // owner
      rawAmount, // amount
      [], // multiSigners
      programId // Use detected program ID
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
