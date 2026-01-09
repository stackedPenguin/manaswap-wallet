// Imports moved to dynamic imports to avoid top-level side effects (TrezorConnect needs window)
// Imports moved to dynamic imports to avoid top-level side effects (TrezorConnect needs window)
import TrezorConnect from '@trezor/connect-web';
import bs58 from 'bs58';

export interface TrezorAccount {
    address: string;
    derivationPath: string;
    balance?: number;
}

let isInitialized = false;

async function ensureInitialized() {
    if (isInitialized) return;

    try {
        await TrezorConnect.init({
            lazyLoad: true, // Wait for user interaction
            manifest: {
                email: 'support@manaswap.app', // Placeholder
                appUrl: 'https://manaswap.app', // Placeholder
                appName: 'Manaswap Wallet',
            },
        });
        isInitialized = true;
    } catch (err) {
        console.error("Trezor init error", err);
        throw err;
    }
}

export async function getTrezorAccounts(pathStart = 0, limit = 5): Promise<TrezorAccount[]> {
    await ensureInitialized();

    const accounts: TrezorAccount[] = [];
    const bundle: { path: string; showOnTrezor: boolean }[] = [];

    for (let i = pathStart; i < pathStart + limit; i++) {
        // Path 1: Trezor Suite / Standard (m/44'/501'/i')
        bundle.push({ path: `m/44'/501'/${i}'`, showOnTrezor: false });
        // Path 2: BIP-44 / CLI (m/44'/501'/i'/0')
        bundle.push({ path: `m/44'/501'/${i}'/0'`, showOnTrezor: false });
    }

    const response = await TrezorConnect.solanaGetPublicKey({
        bundle
    });

    if (response.success) {
        response.payload.forEach((keyInfo, index) => {
            // response.payload is array corresponding to bundle
            accounts.push({
                address: bs58.encode(Buffer.from(keyInfo.publicKey, 'hex')),
                derivationPath: bundle[index].path,
            });
        });
    } else {
        console.error('Trezor getPublicKey error:', response.payload);
        throw new Error(response.payload.error);
    }

    return accounts;
}

export async function signTransactionTrezor(derivationPath: string, transaction: Buffer): Promise<Buffer> {
    await ensureInitialized();

    const response = await TrezorConnect.solanaSignTransaction({
        path: derivationPath,
        serializedTx: transaction.toString('hex'),
    });

    if (response.success) {
        return Buffer.from(response.payload.signature, 'hex');
    } else {
        console.error('Trezor signTransaction error:', response.payload);
        throw new Error(response.payload.error);
    }
}

// Note: Trezor does not support off-chain message signing for Solana in the same standard way as Ledger yet
// (or at least documentation is sparse/inconsistent). 
// For now, we will omit signMessageTrezor or throw not implemented if called.
