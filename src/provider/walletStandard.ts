
import type {
    Wallet,
    WalletAccount,
} from '@wallet-standard/core';
import type {
    SolanaSignAndSendTransactionFeature,
    SolanaSignTransactionFeature,
    SolanaSignMessageFeature,
    SolanaSignInFeature,
    SolanaSignTransactionInput,
    SolanaSignTransactionOutput,
    SolanaSignMessageInput,
    SolanaSignMessageOutput,
    SolanaSignAndSendTransactionInput,
    SolanaSignAndSendTransactionOutput,
    SolanaSignInInput,
    SolanaSignInOutput,
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
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

type IconString = `data:image/svg+xml;base64,${string}` | `data:image/webp;base64,${string}` | `data:image/png;base64,${string}` | `data:image/gif;base64,${string}`;

// Define the Manaswap Wallet interface combining core features
export interface ManaswapWallet extends Wallet {
    features: SolanaSignAndSendTransactionFeature &
    SolanaSignTransactionFeature &
    SolanaSignMessageFeature &
    SolanaSignInFeature &
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
        SolanaSignMessageFeature &
        SolanaSignInFeature {
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
            'solana:signIn': {
                version: '1.0.0',
                signIn: this._signIn.bind(this),
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

        provider.addEventListener('accountChanged', (e: CustomEvent) => {
            if (e.detail) {
                this._setAccount(e.detail);
            } else {
                this._account = null;
                this._emit('change', { accounts: this.accounts });
            }
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
            // Account validation
            if (input.account && input.account !== this._account) throw new Error('invalid account');
            try {
                const txBytes = input.transaction;

                // Deserialize the transaction bytes into a proper Transaction object
                let transaction: Transaction | VersionedTransaction;
                try {
                    transaction = VersionedTransaction.deserialize(txBytes);
                } catch {
                    transaction = Transaction.from(txBytes);
                }

                // Use the provider's signAndSendTransaction method with the deserialized transaction
                const result = await this._provider.signAndSendTransaction(transaction, input.options);

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

        // Batch optimization: use signAllTransactions when multiple inputs
        if (inputs.length > 1) {
            // Validate all accounts first
            for (const input of inputs) {
                if (input.account && input.account !== this._account) throw new Error('invalid account');
                if (input.chain && input.chain !== SOLANA_MAINNET_CHAIN) throw new Error('invalid chain');
            }

            // Deserialize all transactions
            const transactionData = inputs.map(input => {
                const txBytes = input.transaction;
                let transaction: Transaction | VersionedTransaction;
                let isVersioned = false;
                try {
                    transaction = VersionedTransaction.deserialize(txBytes);
                    isVersioned = true;
                } catch {
                    transaction = Transaction.from(txBytes);
                }
                return { transaction, isVersioned };
            });

            // Batch sign all transactions
            const transactions = transactionData.map(d => d.transaction);
            const signedTxs = await this._provider.signAllTransactions(transactions);

            // Serialize all signed transactions
            for (let i = 0; i < signedTxs.length; i++) {
                const signedTx = signedTxs[i];
                const { isVersioned } = transactionData[i];
                let signedTxBytes: Uint8Array;
                if (isVersioned) {
                    signedTxBytes = (signedTx as VersionedTransaction).serialize();
                } else {
                    signedTxBytes = (signedTx as Transaction).serialize({ requireAllSignatures: false, verifySignatures: false });
                }
                results.push({ signedTransaction: signedTxBytes });
            }
        } else if (inputs.length === 1) {
            const input = inputs[0];
            // Account validation
            if (input.account && input.account !== this._account) throw new Error('invalid account');
            if (input.chain && input.chain !== SOLANA_MAINNET_CHAIN) throw new Error('invalid chain');

            const txBytes = input.transaction;

            try {
                // Deserialize the transaction bytes into a proper Transaction object
                let transaction: Transaction | VersionedTransaction;
                let isVersioned = false;
                try {
                    transaction = VersionedTransaction.deserialize(txBytes);
                    isVersioned = true;
                } catch {
                    transaction = Transaction.from(txBytes);
                }

                // Call the provider with the deserialized transaction object
                const signedTx = await this._provider.signTransaction(transaction);

                // Serialize the signed transaction back to bytes
                let signedTxBytes: Uint8Array;
                if (isVersioned) {
                    signedTxBytes = (signedTx as VersionedTransaction).serialize();
                } else {
                    signedTxBytes = (signedTx as Transaction).serialize({ requireAllSignatures: false, verifySignatures: false });
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
            // Account validation
            if (msg.account && msg.account !== this._account) throw new Error('invalid account');
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

    private async _signIn(...inputs: readonly (SolanaSignInInput | undefined)[]): Promise<readonly SolanaSignInOutput[]> {
        if (!this._account) throw new Error('not connected');

        const results: SolanaSignInOutput[] = [];

        for (const input of inputs) {
            try {
                const result = await this._provider.signIn(input);
                results.push({
                    account: new ManaswapWalletAccount(result.account.address, result.account.publicKey),
                    signedMessage: result.signedMessage,
                    signature: result.signature,
                });
            } catch (e: any) {
                throw new Error(e.message || 'Sign in failed');
            }
        }

        return results;
    }
}
