// Imports moved to dynamic imports to avoid top-level side effects in background script
import { PublicKey } from "@solana/web3.js";

export interface LedgerAccount {
    address: string;
    derivationPath: string;
    balance?: number;
}

export async function getLedgerAccounts(pathStart = 0, limit = 5): Promise<LedgerAccount[]> {
    let transport;
    try {
        const TransportWebHID = (await import("@ledgerhq/hw-transport-webhid")).default;
        const Solana = (await import("@ledgerhq/hw-app-solana")).default;

        transport = await TransportWebHID.create();
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
        const TransportWebHID = (await import("@ledgerhq/hw-transport-webhid")).default;
        const Solana = (await import("@ledgerhq/hw-app-solana")).default;

        transport = await TransportWebHID.create();
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
        const TransportWebHID = (await import("@ledgerhq/hw-transport-webhid")).default;
        const Solana = (await import("@ledgerhq/hw-app-solana")).default;

        transport = await TransportWebHID.create();
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
