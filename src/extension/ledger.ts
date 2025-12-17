import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import Solana from "@ledgerhq/hw-app-solana";
import { PublicKey } from "@solana/web3.js";

export interface LedgerAccount {
    address: string;
    derivationPath: string;
    balance?: number;
}

export async function getLedgerAccounts(pathStart = 0, limit = 5): Promise<LedgerAccount[]> {
    let transport;
    try {
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
