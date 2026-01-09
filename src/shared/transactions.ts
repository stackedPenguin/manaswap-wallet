import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
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
 * Send transaction and confirm using polling (no WebSocket - works in service workers)
 */
async function sendAndConfirmWithPolling(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[]
): Promise<string> {
  // Sign the transaction
  transaction.sign(...signers);

  // Serialize and send
  const rawTransaction = transaction.serialize();
  const signature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log(`[Transaction] Sent: ${signature}`);

  // Poll for confirmation instead of using WebSocket
  const startTime = Date.now();
  const timeout = 60000; // 60 second timeout

  while (Date.now() - startTime < timeout) {
    const status = await connection.getSignatureStatus(signature);

    if (status?.value?.confirmationStatus === 'confirmed' ||
      status?.value?.confirmationStatus === 'finalized') {
      console.log(`[Transaction] Confirmed: ${signature}`);
      return signature;
    }

    if (status?.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
    }

    // Wait 1 second before polling again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Transaction confirmation timeout');
}

/**
 * Sends SOL from one address to another
 */
/**
 * Creates a SOL transfer transaction
 */
export async function createSolTransferTransaction(
  fromPubkey: PublicKey,
  toAddress: string,
  amount: number, // Amount in SOL
  connection: Connection
): Promise<Transaction> {
  const toPublicKey = new PublicKey(toAddress);
  const lamports = Math.floor(amount * 1_000_000_000);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey: toPublicKey,
      lamports,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  return transaction;
}

/**
 * Creates an SPL token transfer transaction
 */
export async function createSplTokenTransferTransaction(
  fromPubkey: PublicKey,
  toAddress: string,
  amount: number, // Amount in token units
  tokenMint: string,
  decimals: number,
  connection: Connection
): Promise<Transaction> {
  const mintPubkey = new PublicKey(tokenMint);
  const toPublicKey = new PublicKey(toAddress);

  // Detect which token program this mint uses
  const mintAccountInfo = await connection.getAccountInfo(mintPubkey);
  if (!mintAccountInfo) {
    throw new Error('Mint account not found');
  }


  const programId = mintAccountInfo.owner;

  const fromAta = await getAssociatedTokenAddress(
    mintPubkey,
    fromPubkey,
    false,
    programId
  );
  const toAta = await getAssociatedTokenAddress(
    mintPubkey,
    toPublicKey,
    false,
    programId
  );

  const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));
  const transaction = new Transaction();

  // Check if recipient's ATA exists
  try {
    await getAccount(connection, toAta, 'confirmed', programId);
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromPubkey,
          toAta,
          toPublicKey,
          mintPubkey,
          programId
        )
      );
    } else {
      throw error;
    }
  }

  transaction.add(
    createTransferInstruction(
      fromAta,
      toAta,
      fromPubkey,
      rawAmount,
      [],
      programId
    )
  );

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  return transaction;
}

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

  const transaction = await createSolTransferTransaction(
    fromKeypair.publicKey,
    toAddress,
    amount,
    connection
  );

  return sendAndConfirmWithPolling(connection, transaction, [fromKeypair]);
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

  const transaction = await createSplTokenTransferTransaction(
    fromKeypair.publicKey,
    toAddress,
    amount,
    tokenMint,
    decimals,
    connection
  );

  return sendAndConfirmWithPolling(connection, transaction, [fromKeypair]);
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
