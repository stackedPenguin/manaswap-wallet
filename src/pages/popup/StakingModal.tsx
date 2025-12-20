/**
 * Staking Modal Component
 * Allows users to stake/unstake XNT on X1 network
 */

import { useState, useEffect, useCallback } from 'react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Icons } from '../../shared/ui';
import {
    getValidators,
    getStakeAccountsForWallet,
    buildStakeTransaction,
    buildDeactivateTransaction,
    buildWithdrawTransaction,
    getX1RpcUrl,
} from '../../shared/staking';
import type { ValidatorInfo, StakeAccountInfo } from '../../shared/staking';

interface StakingModalProps {
    isOpen: boolean;
    onClose: () => void;
    walletAddress: string;
    networkId: string;
    xntBalance: number;
    onSignTransaction: (transaction: any, additionalSigners?: any[]) => Promise<string>;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function StakingModal({
    isOpen,
    onClose,
    walletAddress,
    networkId,
    xntBalance,
    onSignTransaction,
    showToast,
}: StakingModalProps) {
    const [tab, setTab] = useState<'stake' | 'unstake'>('stake');
    const [validators, setValidators] = useState<ValidatorInfo[]>([]);
    const [stakeAccounts, setStakeAccounts] = useState<StakeAccountInfo[]>([]);
    const [selectedValidator, setSelectedValidator] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);

    const connection = new Connection(getX1RpcUrl(networkId), 'confirmed');

    // Load validators and stake accounts
    const loadData = useCallback(async () => {
        setLoadingData(true);
        try {
            const [vals, stakes] = await Promise.all([
                getValidators(connection),
                getStakeAccountsForWallet(connection, walletAddress),
            ]);
            setValidators(vals);
            setStakeAccounts(stakes);
            if (vals.length > 0 && !selectedValidator) {
                setSelectedValidator(vals[0].voteAccount);
            }
        } catch (e) {
            console.error('[Staking] Failed to load data:', e);
            showToast('Failed to load staking data', 'error');
        } finally {
            setLoadingData(false);
        }
    }, [connection, walletAddress, selectedValidator, showToast]);

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, loadData]);

    // Format stake for display
    const formatStake = (lamports: number) => {
        const xnt = lamports / LAMPORTS_PER_SOL;
        if (xnt >= 1000000) return `${(xnt / 1000000).toFixed(1)}M`;
        if (xnt >= 1000) return `${(xnt / 1000).toFixed(1)}K`;
        return xnt.toFixed(2);
    };

    // Handle stake action
    const handleStake = async () => {
        if (!selectedValidator || !amount) return;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            showToast('Please enter a valid amount', 'error');
            return;
        }

        if (amountNum > xntBalance) {
            showToast('Insufficient balance', 'error');
            return;
        }

        setLoading(true);
        try {
            const { transaction, stakeAccountKeypair } = await buildStakeTransaction(
                connection,
                walletAddress,
                amountNum,
                selectedValidator
            );

            await onSignTransaction(transaction, [stakeAccountKeypair]);
            showToast(`Successfully staked ${amountNum} XNT`, 'success');
            setAmount('');
            loadData(); // Refresh data
        } catch (e) {
            console.error('[Staking] Stake failed:', e);
            showToast(e instanceof Error ? e.message : 'Staking failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Handle deactivate (unstake) action
    const handleDeactivate = async (stakeAddress: string) => {
        setLoading(true);
        try {
            const transaction = await buildDeactivateTransaction(connection, walletAddress, stakeAddress);
            await onSignTransaction(transaction);
            showToast('Stake deactivation initiated. Wait for epoch to withdraw.', 'success');
            loadData();
        } catch (e) {
            console.error('[Staking] Deactivate failed:', e);
            showToast(e instanceof Error ? e.message : 'Deactivation failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Handle withdraw action
    const handleWithdraw = async (stakeAddress: string) => {
        setLoading(true);
        try {
            const transaction = await buildWithdrawTransaction(connection, walletAddress, stakeAddress);
            await onSignTransaction(transaction);
            showToast('Successfully withdrawn stake', 'success');
            loadData();
        } catch (e) {
            console.error('[Staking] Withdraw failed:', e);
            showToast(e instanceof Error ? e.message : 'Withdrawal failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content staking-modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'hidden' }}>
                {/* Header */}
                <div className="modal-header">
                    <h2 style={{ margin: 0 }}>Stake XNT</h2>
                    <button onClick={onClose} className="close-button">
                        <Icons.Close />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', padding: '0 16px 16px' }}>
                    <button
                        onClick={() => setTab('stake')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: tab === 'stake' ? 'var(--primary)' : 'var(--surface-light)',
                            color: tab === 'stake' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Stake
                    </button>
                    <button
                        onClick={() => setTab('unstake')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: tab === 'unstake' ? 'var(--primary)' : 'var(--surface-light)',
                            color: tab === 'unstake' ? '#fff' : 'var(--text-secondary)',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Unstake ({stakeAccounts.length})
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '0 16px 16px', overflowY: 'auto', maxHeight: 'calc(85vh - 150px)' }}>
                    {loadingData ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                            Loading...
                        </div>
                    ) : tab === 'stake' ? (
                        <>
                            {/* Amount Input */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                    Amount (XNT)
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            background: 'var(--surface-light)',
                                            border: '1px solid var(--card-border)',
                                            borderRadius: '8px',
                                            color: 'var(--text-primary)',
                                            fontSize: '16px',
                                        }}
                                    />
                                    <button
                                        onClick={() => setAmount(Math.max(0, xntBalance - 0.01).toFixed(4))}
                                        style={{
                                            padding: '12px 16px',
                                            background: 'var(--surface-light)',
                                            border: '1px solid var(--card-border)',
                                            borderRadius: '8px',
                                            color: 'var(--primary)',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                        }}
                                    >
                                        MAX
                                    </button>
                                </div>
                                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    Available: {xntBalance.toFixed(4)} XNT
                                </div>
                            </div>

                            {/* Validator Selector */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                    Select Validator
                                </label>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--card-border)', borderRadius: '8px' }}>
                                    {validators.slice(0, 20).map(v => (
                                        <div
                                            key={v.voteAccount}
                                            onClick={() => setSelectedValidator(v.voteAccount)}
                                            style={{
                                                padding: '12px',
                                                cursor: 'pointer',
                                                background: selectedValidator === v.voteAccount ? 'var(--primary-dim)' : 'transparent',
                                                borderBottom: '1px solid var(--card-border)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '13px' }}>
                                                    {v.voteAccount.slice(0, 8)}...{v.voteAccount.slice(-6)}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                    Commission: {v.commission}% | Stake: {formatStake(v.activatedStake)}
                                                </div>
                                            </div>
                                            {selectedValidator === v.voteAccount && (
                                                <Icons.Check style={{ color: 'var(--primary)' }} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Stake Button */}
                            <button
                                onClick={handleStake}
                                disabled={loading || !amount || !selectedValidator}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    background: loading || !amount ? 'var(--surface-light)' : 'var(--primary)',
                                    color: loading || !amount ? 'var(--text-secondary)' : '#fff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: loading || !amount ? 'not-allowed' : 'pointer',
                                    fontWeight: 600,
                                    fontSize: '16px',
                                }}
                            >
                                {loading ? 'Staking...' : 'Stake XNT'}
                            </button>

                            <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                Stake activates at the next epoch boundary (~22 hours)
                            </div>
                        </>
                    ) : (
                        /* Unstake Tab */
                        <>
                            {stakeAccounts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                                    No active stakes found
                                </div>
                            ) : (
                                stakeAccounts.map(stake => (
                                    <div
                                        key={stake.address}
                                        style={{
                                            padding: '14px',
                                            background: 'var(--surface-light)',
                                            borderRadius: '10px',
                                            marginBottom: '12px',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{ fontWeight: 600, fontSize: '15px' }}>{stake.balance.toFixed(4)} XNT</span>
                                            <span style={{
                                                fontSize: '12px',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                background: stake.state === 'active' ? 'rgba(34,197,94,0.2)' :
                                                    stake.state === 'activating' ? 'rgba(234,179,8,0.2)' :
                                                        stake.state === 'deactivating' ? 'rgba(249,115,22,0.2)' : 'var(--card-bg)',
                                                color: stake.state === 'active' ? '#22c55e' :
                                                    stake.state === 'activating' ? '#eab308' :
                                                        stake.state === 'deactivating' ? '#f97316' : 'var(--text-secondary)',
                                            }}>
                                                {stake.state}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                            Validator: {stake.delegatedVoteAccount?.slice(0, 8)}...{stake.delegatedVoteAccount?.slice(-6)}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {(stake.state === 'active' || stake.state === 'activating') && (
                                                <button
                                                    onClick={() => handleDeactivate(stake.address)}
                                                    disabled={loading}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        background: 'rgba(249,115,22,0.1)',
                                                        color: '#f97316',
                                                        border: '1px solid #f97316',
                                                        borderRadius: '8px',
                                                        cursor: loading ? 'not-allowed' : 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Unstake
                                                </button>
                                            )}
                                            {stake.state === 'inactive' && (
                                                <button
                                                    onClick={() => handleWithdraw(stake.address)}
                                                    disabled={loading}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        background: 'rgba(34,197,94,0.1)',
                                                        color: '#22c55e',
                                                        border: '1px solid #22c55e',
                                                        borderRadius: '8px',
                                                        cursor: loading ? 'not-allowed' : 'pointer',
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    Withdraw
                                                </button>
                                            )}
                                            {stake.state === 'deactivating' && (
                                                <div style={{ flex: 1, padding: '10px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                                                    Waiting for epoch...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
