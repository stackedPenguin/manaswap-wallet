// Imports moved to dynamic imports to avoid top-level side effects in background script
import { PublicKey } from "@solana/web3.js";

export interface LedgerAccount {
    address: string;
    derivationPath: string;
    balance?: number;
}

const RETRY_DELAY = 1000;
const MAX_RETRIES = 10;

// Simple retry helper
async function retry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
    try {
        return await fn();
    } catch (e: any) {
        if (retries <= 0) throw e;

        // Check for specific transient errors to retry
        const msg = e.message || '';
        const shouldRetry = msg.includes('Access denied') ||
            msg.includes('claimed') ||
            msg.includes('cannot be opened') ||
            msg.includes('Device is locked');

        if (shouldRetry) {
            console.log(`[Ledger] Retrying connection (${retries} left)... Error: ${msg}`);
            await new Promise(r => setTimeout(r, RETRY_DELAY));
            return retry(fn, retries - 1);
        }
        throw e;
    }
}

async function createTransportWithRetry() {
    const TransportWebHID = (await import("@ledgerhq/hw-transport-webhid")).default;
    // Use retry wrapper for transport creation
    return retry(async () => {
        // First try to open already connected devices to avoid picker if possible
        const devices = await TransportWebHID.list();
        if (devices.length > 0 && devices[0].opened) {
            return TransportWebHID.open(devices[0]);
        }
        return TransportWebHID.create();
    });
}

export async function getLedgerAccounts(pathStart = 0, limit = 5): Promise<LedgerAccount[]> {
    let transport;
    try {
        transport = await createTransportWithRetry();
        const Solana = (await import("@ledgerhq/hw-app-solana")).default;
        const solana = new Solana(transport);

        const accounts: LedgerAccount[] = [];

        for (let i = pathStart; i < pathStart + limit; i++) {
            const path = `44'/501'/${i}'`; // Ledger standard path
            const { address } = await solana.getAddress(path);

            accounts.push({
                address: new PublicKey(address).toBase58(),
                derivationPath: path,
            });
        }

        return accounts;
    } catch (e) {
        console.error("Ledger error:", e);
        throw e;
    } finally {
        if (transport) {
            await transport.close();
        }
    }
}

export async function signTransactionLedger(derivationPath: string, transaction: Buffer): Promise<Buffer> {
    let transport;
    try {
        transport = await createTransportWithRetry();
        const Solana = (await import("@ledgerhq/hw-app-solana")).default;
        const solana = new Solana(transport);

        const { signature } = await solana.signTransaction(derivationPath, transaction);
        return signature;
    } catch (e) {
        console.error("Ledger sign error:", e);
        throw e;
    } finally {
        if (transport) {
            await transport.close();
        }
    }
}

export async function signMessageLedger(derivationPath: string, message: Buffer): Promise<Buffer> {
    let transport;
    try {
        transport = await createTransportWithRetry();
        const Solana = (await import("@ledgerhq/hw-app-solana")).default;
        const solana = new Solana(transport);

        // Use signOffchainMessage for message signing
        const { signature } = await solana.signOffchainMessage(derivationPath, message);
        return signature;
    } catch (e) {
        console.error("Ledger sign message error:", e);
        throw e;
    } finally {
        if (transport) {
            await transport.close();
        }
    }
}
