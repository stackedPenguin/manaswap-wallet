
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
    name = 'X1 Wallet';
    icon = 'data:image/png;base64,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' as IconString;
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
