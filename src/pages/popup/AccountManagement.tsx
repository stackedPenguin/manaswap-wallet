import { useState, useEffect } from 'react';
import { Icons } from '../../shared/ui';
import { sendMessage } from '../../shared/messaging';
import { getLedgerAccounts } from './ledger';
import type { AccountInfo } from '../../shared/types';

interface ModalProps {
    onClose: () => void;
    onSuccess: (newAccountAddress?: string) => void;
}

import { RestoreWalletModal } from './RestoreWalletModal';

export function AddWalletModal({ onClose, onSuccess, onConnectLedger, onConnectTrezor }: ModalProps & { onConnectLedger?: () => void, onConnectTrezor?: () => void }) {
    const [mode, setMode] = useState<'select' | 'create' | 'import-seed' | 'import-pk'>('select');
    const [value, setValue] = useState('');
    const [label, setLabel] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [mnemonicLength, setMnemonicLength] = useState<12 | 24>(12);
    const [mnemonicWords, setMnemonicWords] = useState<string[]>(Array(12).fill(''));

    useEffect(() => {
        setMnemonicWords(Array(mnemonicLength).fill(''));
    }, [mnemonicLength]);

    const handlePaste = (e: React.ClipboardEvent, index: number) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text');
        const words = pastedData.trim().split(/\s+/);

        if (words.length > 1) {
            const newWords = [...mnemonicWords];
            words.forEach((word, i) => {
                if (index + i < newWords.length) {
                    newWords[index + i] = word;
                }
            });
            setMnemonicWords(newWords);
        } else {
            const newWords = [...mnemonicWords];
            newWords[index] = pastedData.trim();
            setMnemonicWords(newWords);
        }
    };

    const handleWordChange = (index: number, value: string) => {
        const newWords = [...mnemonicWords];
        newWords[index] = value;
        setMnemonicWords(newWords);
    };

    const handleAdd = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let type: 'mnemonic' | 'privateKey';
            let payloadValue = value;

            if (mode === 'create') {
                type = 'mnemonic';
                payloadValue = ''; // Generate new
            } else if (mode === 'import-seed') {
                type = 'mnemonic';
                payloadValue = mnemonicWords.join(' ');
                if (payloadValue.trim().split(/\s+/).length !== mnemonicLength) {
                    throw new Error(`Please enter all ${mnemonicLength} words`);
                }
            } else {
                type = 'privateKey';
            }

            const res = await sendMessage<{ success: boolean; accounts?: AccountInfo[]; error?: string }>({
                type: 'manaswap:addKeySource',
                payload: { type, value: payloadValue, label: label || undefined },
            });

            if (res.success) {
                // Auto-select the new account (or the first one if multiple returned, though usually one for these recursive add types)
                const newAddress = res.accounts && res.accounts.length > 0 ? res.accounts[0].address : undefined;
                onSuccess(newAddress);
                onClose();
            } else {
                setError(res.error || 'Failed to add wallet');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const renderSelect = () => (
        <>
            <h3 style={{ margin: '0 0 16px', textAlign: 'center' }}>Add Wallet</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button className="btn-secondary" onClick={() => setMode('create')} style={{ justifyContent: 'flex-start', padding: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: '600' }}>Create New Wallet</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Generate a new recovery phrase</span>
                    </div>
                </button>
                <button className="btn-secondary" onClick={() => setMode('import-seed')} style={{ justifyContent: 'flex-start', padding: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: '600' }}>Import Recovery Phrase</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Restore from 12 or 24 words</span>
                    </div>
                </button>
                <button className="btn-secondary" onClick={() => setMode('import-pk')} style={{ justifyContent: 'flex-start', padding: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: '600' }}>Import Private Key</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Import a single account</span>
                    </div>
                </button>
                {onConnectLedger && (
                    <button className="btn-secondary" onClick={onConnectLedger} style={{ justifyContent: 'flex-start', padding: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <span style={{ fontWeight: '600' }}>Connect Ledger</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Connect hardware wallet</span>
                        </div>
                    </button>
                )}
                {onConnectTrezor && (
                    <button className="btn-secondary" onClick={onConnectTrezor} style={{ justifyContent: 'flex-start', padding: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <span style={{ fontWeight: '600' }}>Connect Trezor</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Connect hardware wallet</span>
                        </div>
                    </button>
                )}
            </div>
            <button className="btn-secondary" onClick={onClose} style={{ marginTop: '16px', width: '100%' }}>Cancel</button>
        </>
    );

    const renderForm = () => (
        <>
            <h3 style={{ margin: '0 0 16px', textAlign: 'center' }}>
                {mode === 'create' ? 'Create Wallet' : mode === 'import-seed' ? 'Import Recovery Phrase' : 'Import Private Key'}
            </h3>

            <input
                type="text"
                placeholder="Wallet Name (Optional)"
                value={label}
                onChange={e => setLabel(e.target.value)}
                style={{ marginBottom: '16px' }}
            />

            {mode === 'import-seed' ? (
                <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', gap: '8px' }}>
                        <button
                            onClick={() => setMnemonicLength(12)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: mnemonicLength === 12 ? 'var(--text-primary)' : 'var(--card-bg)',
                                color: mnemonicLength === 12 ? 'black' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.85rem',
                                transition: 'all 0.2s',
                            }}
                        >
                            12 Words
                        </button>
                        <button
                            onClick={() => setMnemonicLength(24)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: mnemonicLength === 24 ? 'var(--text-primary)' : 'var(--card-bg)',
                                color: mnemonicLength === 24 ? 'black' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.85rem',
                                transition: 'all 0.2s',
                            }}
                        >
                            24 Words
                        </button>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                        marginBottom: '16px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        paddingRight: '4px'
                    }}>
                        {mnemonicWords.map((word, index) => (
                            <div key={index} style={{ position: 'relative' }}>
                                <span style={{
                                    position: 'absolute',
                                    left: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '0.7rem',
                                    color: 'var(--text-secondary)',
                                    pointerEvents: 'none'
                                }}>
                                    {index + 1}.
                                </span>
                                <input
                                    type="text"
                                    value={word}
                                    onChange={(e) => handleWordChange(index, e.target.value)}
                                    onPaste={(e) => handlePaste(e, index)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 8px 8px 24px',
                                        fontSize: '0.85rem',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--card-border)',
                                        borderRadius: '8px',
                                        color: 'var(--text-primary)',
                                        marginBottom: 0
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </>
            ) : mode === 'import-pk' && (
                <>
                    <textarea
                        className="mnemonic-input"
                        placeholder="Enter Private Key..."
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        style={{ marginBottom: '8px', height: '80px' }}
                    />
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 16px', textAlign: 'center' }}>
                        Supports Base58 or JSON array format [x,x,x,...]
                    </p>
                </>
            )}

            {error && <div className="error-msg" style={{ marginBottom: '16px' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-secondary" onClick={() => setMode('select')}>Back</button>
                <button className="btn-primary" onClick={handleAdd} disabled={isLoading}>
                    {isLoading ? 'Adding...' : 'Add Wallet'}
                </button>
            </div>
        </>
    );

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-secondary)', width: '100%', maxWidth: '320px',
                borderRadius: '24px', padding: '24px', border: '1px solid var(--card-border)'
            }} onClick={e => e.stopPropagation()}>
                {mode === 'select' ? renderSelect() : renderForm()}
            </div>
        </div>
    );
}

export function LedgerConnectModal({ onClose, onSuccess }: ModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [step, setStep] = useState<'connect' | 'select'>('connect');

    const handleConnect = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Call Ledger directly from popup (WebHID requires DOM context)
            const retrievedAccounts = await getLedgerAccounts(0, 5);
            setAccounts(retrievedAccounts);
            setStep('select');
        } catch (e: any) {
            console.error('Ledger connect error:', e);
            let msg = e.message || 'Failed to connect.';

            if (msg.includes('Access denied') || msg.includes('claimed') || msg.includes('cannot be opened')) {
                msg = 'Access denied. Please CLOSE Ledger Live and other wallet apps, then try again.';
            } else if (msg.includes('No device selected')) {
                msg = 'No device selected. Please select your Ledger from the popup.';
            } else {
                msg += ' Ensure Ledger is unlocked and Solana app is open.';
            }

            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = async (account: { address: string; derivationPath: string }) => {
        setIsLoading(true);
        try {
            // Add the Ledger account to the vault using addKeySource
            const ledgerData = JSON.stringify({
                accounts: [{ address: account.address, derivationPath: account.derivationPath }]
            });

            const res = await sendMessage<{ success: boolean; accounts?: AccountInfo[]; error?: string }>({
                type: 'manaswap:addKeySource',
                payload: { type: 'ledger', value: ledgerData, label: 'Ledger Account' }
            });

            if (res.success) {
                // Auto-select
                const newAddress = res.accounts && res.accounts.length > 0 ? res.accounts[0].address : undefined;
                onSuccess(newAddress);
                onClose();
            } else {
                setError(res.error || 'Failed to add Ledger account');
            }
        } catch (e: any) {
            console.error('Ledger add account error:', e);
            let msg = e.message || 'Failed to add account';
            if (msg.includes('Access denied') || msg.includes('claimed')) {
                msg = 'Access denied. Close Ledger Live and try again.';
            }
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-secondary)', width: '100%', maxWidth: '360px',
                borderRadius: '24px', padding: '24px', border: '1px solid var(--card-border)'
            }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 16px', textAlign: 'center' }}>Connect Ledger</h3>

                {step === 'connect' ? (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '20px', color: 'var(--text-secondary)' }}>
                            <p>1. Connect your Ledger Nano S/X</p>
                            <p>2. Unlock it with your PIN</p>
                            <p>3. Open the Solana App</p>
                        </div>
                        {error && <div className="error-msg" style={{ marginBottom: '16px' }}>{error}</div>}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button className="btn-secondary" onClick={onClose}>Cancel</button>
                            <button className="btn-primary" onClick={handleConnect} disabled={isLoading}>
                                {isLoading ? 'Connecting...' : 'Connect'}
                            </button>
                        </div>
                        <div style={{ marginTop: '16px', textAlign: 'center' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/popup/index.html') })}
                                style={{ fontSize: '0.75rem', padding: '8px 12px', width: '100%' }}
                            >
                                Trouble connecting? Open Expanded View
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h4 style={{ margin: '0 0 12px' }}>Select Account</h4>
                        <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {accounts.map((acc, i) => (
                                <div
                                    key={acc.address}
                                    onClick={() => handleSelect(acc)}
                                    style={{
                                        padding: '12px',
                                        background: 'var(--card-bg)',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        border: '1px solid var(--card-border)'
                                    }}
                                >
                                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Account {i + 1}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{acc.address}</div>
                                </div>
                            ))}
                        </div>
                        <button className="btn-secondary" onClick={() => setStep('connect')} style={{ width: '100%' }}>Back</button>
                    </>
                )}
            </div>
        </div>
    );
}

import { getTrezorAccounts } from '../../extension/trezor';

export function TrezorConnectModal({ onClose, onSuccess }: ModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [step, setStep] = useState<'connect' | 'select'>('connect');

    const handleConnect = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Direct call to Trezor Connect (WebHID/WebUSB requires UI context)
            const retrievedAccounts = await getTrezorAccounts(0, 5);
            setAccounts(retrievedAccounts);
            setStep('select');
        } catch (e: any) {
            setError(e.message || 'Failed to connect. Make sure Trezor Bridge is running if needed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = async (account: { address: string; derivationPath: string }) => {
        setIsLoading(true);
        try {
            // Add the Trezor account to the vault using addKeySource
            const trezorData = JSON.stringify({
                accounts: [{ address: account.address, derivationPath: account.derivationPath }]
            });

            const res = await sendMessage<{ success: boolean; accounts?: AccountInfo[]; error?: string }>({
                type: 'manaswap:addKeySource',
                payload: { type: 'trezor', value: trezorData, label: 'Trezor Account' }
            });

            if (res.success) {
                // Auto-select
                const newAddress = res.accounts && res.accounts.length > 0 ? res.accounts[0].address : undefined;
                onSuccess(newAddress);
                onClose();
            } else {
                setError(res.error || 'Failed to add Trezor account');
            }
        } catch (e: any) {
            setError(e.message || 'Failed to add account');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-secondary)', width: '100%', maxWidth: '360px',
                borderRadius: '24px', padding: '24px', border: '1px solid var(--card-border)'
            }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 16px', textAlign: 'center' }}>Connect Trezor</h3>

                {step === 'connect' ? (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '20px', color: 'var(--text-secondary)' }}>
                            <p>1. Connect your Trezor device</p>
                            <p>2. Follow instructions on the popup</p>
                        </div>
                        {error && <div className="error-msg" style={{ marginBottom: '16px' }}>{error}</div>}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button className="btn-secondary" onClick={onClose}>Cancel</button>
                            <button className="btn-primary" onClick={handleConnect} disabled={isLoading}>
                                {isLoading ? 'Connecting...' : 'Connect'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h4 style={{ margin: '0 0 12px' }}>Select Account</h4>
                        <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {accounts.map((acc, i) => (
                                <div
                                    key={acc.address}
                                    onClick={() => handleSelect(acc)}
                                    style={{
                                        padding: '12px',
                                        background: 'var(--card-bg)',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        border: '1px solid var(--card-border)'
                                    }}
                                >
                                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Account {i + 1}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{acc.address}</div>
                                </div>
                            ))}
                        </div>
                        <button className="btn-secondary" onClick={() => setStep('connect')} style={{ width: '100%' }}>Back</button>
                    </>
                )}
            </div>
        </div>
    );
}

export function AccountManagement({ onClose, onAccountsChanged }: { onClose: () => void; onAccountsChanged?: () => void }) {
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddWallet, setShowAddWallet] = useState(false);
    const [showLedger, setShowLedger] = useState(false);
    const [showTrezor, setShowTrezor] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<AccountInfo | null>(null);

    const loadAccounts = async () => {
        setIsLoading(true);
        try {
            const res = await sendMessage<{ accounts: AccountInfo[] }>({ type: 'manaswap:getAccounts' });
            if (res.accounts) {
                setAccounts(res.accounts);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadAccounts();
    }, []);

    const handleSwitch = async (address: string) => {
        // Select the wallet and persist the selection
        const res = await sendMessage<{ settings: any }>({ type: 'manaswap:getSettings' });
        await sendMessage({
            type: 'manaswap:setSettings',
            payload: { ...res.settings, selectedAccountAddress: address }
        });
        onAccountsChanged?.();
        onClose(); // Close modal after selection
    };

    const handleConnectLedger = () => {
        // Force expanded view for Ledger connection if in popup
        // Chrome closes popups when generic HID picker opens
        if (window.innerWidth < 600) {
            chrome.tabs.create({ url: chrome.runtime.getURL('index.html?connectLedger=true') });
            window.close();
            return;
        }
        setShowLedger(true);
    };

    return (
        <div className="account-management-modal">
            <div className="modal-header">
                <h3>Wallets</h3>
                <button onClick={onClose}><Icons.Close /></button>
            </div>

            <div className="accounts-list">
                {isLoading ? (
                    <div className="loading-spinner" />
                ) : (
                    accounts.map(acc => (
                        <div key={acc.address} className="account-item" onClick={() => handleSwitch(acc.address)}>
                            <div className="account-icon">
                                {(acc.type === 'ledger' || acc.type === 'trezor') ? <Icons.Hardware size={16} /> : <Icons.Wallet size={16} />}
                            </div>
                            <div className="account-info">
                                <div className="account-label">{acc.label || 'Wallet'}</div>
                                <div className="account-address">
                                    {acc.address.slice(0, 4)}...{acc.address.slice(-4)}
                                </div>
                            </div>
                            <div className="account-actions">
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAccount(acc);
                                }}>
                                    <Icons.Settings size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowAddWallet(true)}>
                    <Icons.Plus /> Add / Import Wallet
                </button>
                <button className="btn-secondary" onClick={handleConnectLedger}>
                    <Icons.Hardware /> Connect Ledger
                </button>
                <button className="btn-secondary" onClick={() => setShowTrezor(true)}>
                    <Icons.Hardware /> Connect Trezor
                </button>
            </div>

            {showAddWallet && (
                <AddWalletModal
                    onClose={() => setShowAddWallet(false)}
                    onSuccess={(newAccountAddress) => {
                        setShowAddWallet(false);
                        loadAccounts();
                        if (newAccountAddress) {
                            handleSwitch(newAccountAddress);
                        } else {
                            onAccountsChanged?.();
                        }
                    }}
                    onConnectLedger={() => {
                        setShowAddWallet(false);
                        setShowLedger(true);
                    }}
                    onConnectTrezor={() => {
                        setShowAddWallet(false);
                        setShowTrezor(true);
                    }}
                />
            )}

            {showLedger && (
                <LedgerConnectModal
                    onClose={() => setShowLedger(false)}
                    onSuccess={(newAccountAddress) => {
                        setShowLedger(false);
                        loadAccounts();
                        if (newAccountAddress) {
                            handleSwitch(newAccountAddress);
                        } else {
                            onAccountsChanged?.();
                        }
                    }}
                />
            )}

            {showTrezor && (
                <TrezorConnectModal
                    onClose={() => setShowTrezor(false)}
                    onSuccess={(newAccountAddress) => {
                        setShowTrezor(false);
                        loadAccounts();
                        if (newAccountAddress) {
                            handleSwitch(newAccountAddress);
                        } else {
                            onAccountsChanged?.();
                        }
                    }}
                />
            )}

            {selectedAccount && (
                <AccountDetailsModal
                    account={selectedAccount}
                    onClose={() => setSelectedAccount(null)}
                    onSuccess={loadAccounts}
                    onAccountsChanged={() => {
                        loadAccounts();
                        onAccountsChanged?.();
                    }}
                />
            )}
        </div>
    );
}

export function AccountDetailsModal({ account, onClose, onSuccess, onAccountsChanged }: { account: AccountInfo; onClose: () => void; onSuccess?: () => void; onAccountsChanged?: () => void }) {
    const [password, setPassword] = useState('');
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showRestoreModal, setShowRestoreModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editLabel, setEditLabel] = useState(account.label || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveLabel = async () => {
        if (!editLabel.trim()) return;
        setIsSaving(true);
        try {
            const res = await sendMessage<{ success: boolean; error?: string }>({
                type: 'manaswap:setAccountLabel',
                payload: { address: account.address, label: editLabel.trim() }
            });

            if (res.success) {
                account.label = editLabel.trim(); // Optimistic update
                setIsEditing(false);
                if (onSuccess) onSuccess();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReveal = async () => {
        if (!password) return;
        setIsLoading(true);
        setError(null);
        try {
            const res = await sendMessage<{ success: boolean; privateKey?: string; error?: string }>({
                type: 'manaswap:revealPrivateKey',
                payload: { password, accountAddress: account.address },
            });
            if (res.success && res.privateKey) {
                setPrivateKey(res.privateKey);
            } else {
                setError(res.error || 'Failed to reveal key');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-secondary)', width: '100%', maxWidth: '320px',
                borderRadius: '24px', padding: '24px', border: '1px solid var(--card-border)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0 }}>Account Details</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <Icons.Close />
                    </button>
                </div>

                <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                    {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
                            <input
                                type="text"
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                style={{
                                    background: 'var(--card-bg)',
                                    border: '1px solid var(--card-border)',
                                    borderRadius: '8px',
                                    padding: '4px 8px',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    textAlign: 'center',
                                    width: '160px',
                                    marginBottom: 0
                                }}
                                autoFocus
                            />
                            <button
                                onClick={handleSaveLabel}
                                disabled={isSaving}
                                style={{
                                    background: 'var(--text-primary)',
                                    color: 'black',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <Icons.Check size={14} />
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{account.label || 'Account'}</div>
                            <button
                                onClick={() => setIsEditing(true)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <Icons.Settings size={12} />
                            </button>
                        </div>
                    )}
                    <div style={{
                        fontSize: '0.75rem', color: 'var(--text-secondary)',
                        background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px',
                        wordBreak: 'break-all'
                    }}>
                        {account.address}
                    </div>
                </div>

                {!privateKey ? (
                    <>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            Enter password to reveal private key
                        </p>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            style={{ marginBottom: '16px' }}
                        />
                        {error && <div className="error-msg" style={{ marginBottom: '16px' }}>{error}</div>}
                        <button className="btn-primary" onClick={handleReveal} disabled={isLoading || !password}>
                            {isLoading ? 'Revealing...' : 'Show Private Key'}
                        </button>
                    </>
                ) : (
                    <>
                        <p style={{ fontSize: '0.85rem', color: 'var(--warning-color)', marginBottom: '8px' }}>
                            DO NOT share this key with anyone!
                        </p>
                        <textarea
                            readOnly
                            value={privateKey}
                            className="mnemonic-input"
                            style={{ height: '100px', marginBottom: '16px', color: 'var(--danger-color)' }}
                        />
                        <button
                            className="btn-secondary"
                            onClick={() => {
                                navigator.clipboard.writeText(privateKey);
                                // toast?
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <Icons.Copy /> Copy Private Key
                            </div>
                        </button>
                    </>
                )}

                <div style={{ height: '1px', background: 'var(--card-border)', margin: '20px 0' }} />

                {!showDeleteConfirm ? (
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="btn-secondary"
                        style={{ width: '100%', padding: '12px', justifyContent: 'flex-start', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icons.Close size={16} /> Delete Wallet
                        </div>
                    </button>
                ) : (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '12px' }}>
                        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#ef4444' }}>
                            Are you sure? This cannot be undone. Make sure you have backed up your private key.
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="btn-secondary"
                                style={{ flex: 1, padding: '8px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    setIsDeleting(true);
                                    try {
                                        const res = await sendMessage<{ success: boolean; error?: string }>({
                                            type: 'manaswap:deleteAccount',
                                            payload: { address: account.address }
                                        });
                                        if (res.success) {
                                            onAccountsChanged?.();
                                            onClose();
                                        } else {
                                            setError(res.error || 'Failed to delete');
                                            setShowDeleteConfirm(false);
                                        }
                                    } catch (e: any) {
                                        setError(e.message);
                                        setShowDeleteConfirm(false);
                                    } finally {
                                        setIsDeleting(false);
                                    }
                                }}
                                disabled={isDeleting}
                                style={{ flex: 1, padding: '8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                )}

                <button
                    onClick={() => setShowRestoreModal(true)}
                    className="btn-secondary"
                    style={{ width: '100%', padding: '12px', justifyContent: 'flex-start', marginTop: '8px', color: 'var(--text-secondary)' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icons.Refresh size={16} /> Reset / Import Recovery Phrase
                    </div>
                </button>

                {showRestoreModal && (
                    <RestoreWalletModal
                        onClose={() => setShowRestoreModal(false)}
                        onSuccess={() => {
                            setShowRestoreModal(false);
                            onAccountsChanged?.(); // Notify parent to refresh and select new account
                            onClose();
                        }}
                    />
                )}
            </div>
        </div>
    );
}
