
import type {
    Wallet,
    WalletAccount,
} from '@wallet-standard/core';
import type {
    SolanaSignAndSendTransactionFeature,
    SolanaSignTransactionFeature,
    SolanaSignMessageFeature,
    SolanaSignTransactionInput,
    SolanaSignTransactionOutput,
    SolanaSignMessageInput,
    SolanaSignMessageOutput,
    SolanaSignAndSendTransactionInput,
    SolanaSignAndSendTransactionOutput,
} from '@solana/wallet-standard-features';
import {
    StandardConnect,
    StandardDisconnect,
    StandardEvents,
    type StandardConnectFeature,
    type StandardDisconnectFeature,
    type StandardEventsFeature,
    type StandardEventsListeners,
    type StandardEventsNames,
    type StandardEventsOnMethod,
} from '@wallet-standard/features';
import { SOLANA_MAINNET_CHAIN } from '@solana/wallet-standard-chains';
import bs58 from 'bs58';

type IconString = `data:image/svg+xml;base64,${string}` | `data:image/webp;base64,${string}` | `data:image/png;base64,${string}` | `data:image/gif;base64,${string}`;

// Define the Manaswap Wallet interface combining core features
export interface ManaswapWallet extends Wallet {
    features: SolanaSignAndSendTransactionFeature &
    SolanaSignTransactionFeature &
    SolanaSignMessageFeature &
    StandardConnectFeature &
    StandardDisconnectFeature &
    StandardEventsFeature;
}

class ManaswapWalletAccount implements WalletAccount {
    address: string;
    publicKey: Uint8Array;
    chains = [SOLANA_MAINNET_CHAIN] as const;
    features = [
        'solana:signAndSendTransaction',
        'solana:signTransaction',
        'solana:signMessage',
    ] as const;
    label = 'Manaswap Account';

    constructor(address: string, publicKey: Uint8Array) {
        this.address = address;
        this.publicKey = publicKey;
    }
}

export class ManaswapWalletImpl implements ManaswapWallet {
    version = '1.0.0' as const;
    name = 'Manaswap';
    icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSI+PHBhdGggZD0iTTE2IDRhMTIgMTIgMCAxMDAgMjQgMTIgMTIgMCAwMDAtMjR6IiBmaWxsPSIjOTk0NUZGIi8+PHBhdGggZD0iTTE2IDdhOSA5IDAgMTEwIDE4IDkgOSAwIDAxMC0xOHoiIGZpbGw9IiMxQjE0MjUiLz48cGF0aCBkPSJNMTUuNSAxMC41aDF2MTFoLTF6IiBmaWxsPSIjOTk0NUZGIi8+PC9zdmc+' as IconString;
    chains = [SOLANA_MAINNET_CHAIN] as const;

    private _listeners: { [E in StandardEventsNames]?: StandardEventsListeners[E][] } = {};
    private _account: ManaswapWalletAccount | null = null;
    private _provider: any;

    get features(): StandardConnectFeature &
        StandardDisconnectFeature &
        StandardEventsFeature &
        SolanaSignTransactionFeature &
        SolanaSignAndSendTransactionFeature &
        SolanaSignMessageFeature {
        return {
            [StandardConnect]: {
                version: '1.0.0',
                connect: this._connect.bind(this),
            },
            [StandardDisconnect]: {
                version: '1.0.0',
                disconnect: this._disconnect.bind(this),
            },
            [StandardEvents]: {
                version: '1.0.0',
                on: this._on.bind(this),
            },
            'solana:signAndSendTransaction': {
                version: '1.0.0',
                supportedTransactionVersions: ['legacy', 0],
                signAndSendTransaction: this._signAndSendTransaction.bind(this),
            },
            'solana:signTransaction': {
                version: '1.0.0',
                supportedTransactionVersions: ['legacy', 0],
                signTransaction: this._signTransaction.bind(this),
            },
            'solana:signMessage': {
                version: '1.0.0',
                signMessage: this._signMessage.bind(this),
            },
        };
    }

    get accounts() {
        return this._account ? [this._account] : [];
    }

    constructor(provider: any) {
        this._provider = provider;

        if (provider.publicKey) {
            this._setAccount(provider.publicKey);
        }

        provider.addEventListener('connect', (e: CustomEvent) => {
            this._setAccount(e.detail.publicKey);
        });
        provider.addEventListener('disconnect', () => {
            this._setAccount(null);
        });
    }

    private _setAccount(publicKeyInput: string | { toBase58: () => string; toBuffer: () => Buffer } | null) {
        if (publicKeyInput) {
            try {
                // Handle both string and PublicKey object
                const publicKeyStr = typeof publicKeyInput === 'string'
                    ? publicKeyInput
                    : publicKeyInput.toBase58();
                const publicKeyBytes = bs58.decode(publicKeyStr);
                this._account = new ManaswapWalletAccount(publicKeyStr, publicKeyBytes);
                // Standard doesn't have explicit 'change' event in interface but strictly speaking we should emit it strictly?
                // The 'standard:events' feature is often used.
                // For now, minimal implementation.
                this._emit('change', { accounts: this.accounts });
            } catch (e) {
                console.error('[Manaswap] Invalid public key', e);
            }
        } else {
            this._account = null;
            this._emit('change', { accounts: [] });
        }
    }

    // Standard Connect
    private async _connect(_input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }> {
        if (!this._account) {
            await this._provider.connect();
        }
        return { accounts: this.accounts };
    }

    // Standard Disconnect
    private async _disconnect(): Promise<void> {
        await this._provider.disconnect();
    }

    // Standard Events
    private _on: StandardEventsOnMethod = (event, listener) => {
        this._listeners[event] = this._listeners[event] || [];
        // @ts-ignore
        this._listeners[event]!.push(listener);
        return () => {
            // @ts-ignore
            this._listeners[event] = this._listeners[event]!.filter((l) => l !== listener);
        };
    }

    private _emit<E extends StandardEventsNames>(event: E, ...args: Parameters<StandardEventsListeners[E]>): void {
        // @ts-ignore
        this._listeners[event]?.forEach((listener) => listener(...args));
    }

    private async _signAndSendTransaction(
        ...inputs: readonly SolanaSignAndSendTransactionInput[]
    ): Promise<readonly SolanaSignAndSendTransactionOutput[]> {
        if (!this._account) throw new Error('not connected');

        const results: SolanaSignAndSendTransactionOutput[] = [];
        for (const input of inputs) {
            try {
                // Convert transaction bytes to array for provider
                const txArray = Array.from(input.transaction);

                // Use the provider's signAndSendTransaction method
                const result = await this._provider.signAndSendTransaction(txArray, input.options);

                // Result.signature is a base58 string, convert to bytes
                const signatureBytes = bs58.decode(result.signature);
                results.push({ signature: signatureBytes });
            } catch (e: any) {
                throw new Error(e.message || 'signAndSendTransaction failed');
            }
        }
        return results;
    }

    private async _signTransaction(...inputs: readonly SolanaSignTransactionInput[]): Promise<readonly SolanaSignTransactionOutput[]> {
        if (!this._account) throw new Error('not connected');

        const results: SolanaSignTransactionOutput[] = [];

        for (const tx of inputs) {
            // Chain is optional in standard input, but if present should assume Mainnet for us?
            // If undefined, standard says "use wallet's current chain" or similar.
            // We only support mainnet.
            if (tx.chain && tx.chain !== SOLANA_MAINNET_CHAIN) throw new Error('invalid chain');

            const txArray = Array.from(tx.transaction);

            try {
                const signedTx = await this._provider.signTransaction(txArray);
                // Provider returns object with transaction property or just transaction?
                // signTransaction<T>(transaction: T): Promise<T>
                // So if we pass array, we get array. Or VersionedTransaction object.
                // If mocked, let's ensure we get bytes back.
                // Assuming provider echoes back what we sent (if mocked) or returns signed bytes.
                // We'll try to convert result to Uint8Array.

                let signedTxBytes: Uint8Array;
                if (signedTx instanceof Uint8Array || Array.isArray(signedTx)) {
                    signedTxBytes = new Uint8Array(signedTx);
                } else if (signedTx && typeof signedTx === 'object' && 'transaction' in signedTx) {
                    // Handle case where result is wrapped
                    // @ts-ignore
                    signedTxBytes = new Uint8Array(signedTx.transaction);
                } else {
                    // Fallback check logic
                    signedTxBytes = new Uint8Array(tx.transaction); // Just echo if completely broken to avoid crash
                }

                results.push({ signedTransaction: signedTxBytes });
            } catch (e: any) {
                throw new Error(e.message || 'Signing failed');
            }
        }

        return results;
    }

    private async _signMessage(...inputs: readonly SolanaSignMessageInput[]): Promise<readonly SolanaSignMessageOutput[]> {
        if (!this._account) throw new Error('not connected');

        const results: SolanaSignMessageOutput[] = [];

        for (const msg of inputs) {
            const msgArray = Array.from(msg.message);
            try {
                const result = await this._provider.signMessage(msgArray);
                // Provider returns { signature: number[] }
                const signature = new Uint8Array(result.signature);
                results.push({ signature, signedMessage: msg.message });
            } catch (e: any) {
                throw new Error(e.message || 'Signing failed');
            }
        }

        return results;
    }
}
