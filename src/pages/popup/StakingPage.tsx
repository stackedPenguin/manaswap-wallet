/**
 * Staking Page Component
 * Allows users to stake/unstake XNT on X1 network
 * Compact View Implementation
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Icons, Identicon } from '../../shared/ui';
import {
    getValidators,
    getStakeAccountsForWallet,
    buildStakeTransaction,
    buildDeactivateTransaction,
    buildWithdrawTransaction,
    getX1RpcUrl,
} from '../../shared/staking';
import type { ValidatorInfo, StakeAccountInfo } from '../../shared/staking';

interface StakingPageProps {
    onBack: () => void;
    walletAddress: string;
    networkId: string;
    xntBalance: number;
    onSignTransaction: (transaction: any, additionalSigners?: any[]) => Promise<string>;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const DEFAULT_VALIDATOR_ADDRESS = 'X1SPaMUM1A8E1vKL8XQAB5rxKarJbqtWFFSNFs8f7Av';

export function StakingPage({
    onBack,
    walletAddress,
    networkId,
    xntBalance,
    onSignTransaction,
    showToast,
}: StakingPageProps) {
    const [validators, setValidators] = useState<ValidatorInfo[]>([]);
    const [stakeAccounts, setStakeAccounts] = useState<StakeAccountInfo[]>([]);
    const [selectedValidator, setSelectedValidator] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [showValidatorList, setShowValidatorList] = useState(false); // Expanded/Collapsed Validator View
    const [searchQuery, setSearchQuery] = useState('');
    const [remainingEpochTime, setRemainingEpochTime] = useState<string | null>(null);
    const [epochProgress, setEpochProgress] = useState<{ current: number, total: number, percent: number, epoch: number } | null>(null);
    const [expandedStakeId, setExpandedStakeId] = useState<string | null>(null); // For accordion

    const connection = useMemo(() => new Connection(getX1RpcUrl(networkId), 'confirmed'), [networkId]);

    // Load validators and stake accounts
    const loadData = useCallback(async () => {
        setLoadingData(true);
        try {
            const [vals, stakes, epochInfo] = await Promise.all([
                getValidators(connection),
                getStakeAccountsForWallet(connection, walletAddress),
                connection.getEpochInfo(),
            ]);
            setValidators(vals);
            setStakeAccounts(stakes);

            const remainingSlots = epochInfo.slotsInEpoch - epochInfo.slotIndex;
            const seconds = remainingSlots * 0.4; // ~400ms per slot
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            setRemainingEpochTime(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);

            setEpochProgress({
                current: epochInfo.slotIndex,
                total: epochInfo.slotsInEpoch,
                percent: (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100,
                epoch: epochInfo.epoch
            });
        } catch (e) {
            console.error('[Staking] Failed to load data:', e);
            showToast('Failed to load staking data', 'error');
        } finally {
            setLoadingData(false);
        }
    }, [connection, walletAddress, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredValidators = useMemo(() => {
        if (!searchQuery) return validators;
        const lower = searchQuery.toLowerCase();
        return validators.filter(v =>
            (v.name && v.name.toLowerCase().includes(lower)) ||
            v.voteAccount.toLowerCase().includes(lower)
        );
    }, [validators, searchQuery]);

    // Check for existing active stakes to enforce "Unstake to Change" policy
    const activeStake = useMemo(() => {
        return stakeAccounts.find(s => ['active', 'activating'].includes(s.state));
    }, [stakeAccounts]);

    const lockedValidator = activeStake?.delegatedVoteAccount;

    // Default Validator Selection & Locking
    useEffect(() => {
        if (lockedValidator) {
            if (selectedValidator !== lockedValidator) {
                setSelectedValidator(lockedValidator);
            }
            return;
        }

        if (!loadingData && validators.length > 0 && !selectedValidator) {
            const defaultVal = validators.find(v => v.voteAccount === DEFAULT_VALIDATOR_ADDRESS);
            setSelectedValidator(defaultVal ? defaultVal.voteAccount : validators[0].voteAccount);
        }
    }, [loadingData, validators, selectedValidator, lockedValidator]);

    // Format stake for display
    const formatStake = (lamports: number) => {
        const xnt = lamports / LAMPORTS_PER_SOL;
        if (xnt >= 1000000) return `${(xnt / 1000000).toFixed(1)}M`;
        if (xnt >= 1000) return `${(xnt / 1000).toFixed(1)}K`;
        return xnt.toFixed(2);
    };

    const getValidatorName = (address: string) => {
        if (address === DEFAULT_VALIDATOR_ADDRESS) return 'X1 Foundation';
        const val = validators.find(v => v.voteAccount === address);
        return val?.name || `${address.slice(0, 8)}...`;
    };

    const getValidatorImage = (address: string) => {
        if (address === DEFAULT_VALIDATOR_ADDRESS) return '/icons/x1-logo.png';
        const val = validators.find(v => v.voteAccount === address);
        return val?.imageUrl;
    };

    // Actions
    const handleStake = async () => {
        if (!selectedValidator || !amount) return;
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) return showToast('Invalid amount', 'error');
        if (amountNum > xntBalance) return showToast('Insufficient balance', 'error');

        setLoading(true);
        try {
            const { transaction, stakeAccountKeypair } = await buildStakeTransaction(connection, walletAddress, amountNum, selectedValidator);
            await onSignTransaction(transaction, [stakeAccountKeypair]);
            showToast(`Staked ${amountNum} XNT`, 'success');
            setAmount('');
            loadData();
        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Staking failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeactivate = async (stakeAddress: string) => {
        setLoading(true);
        try {
            const transaction = await buildDeactivateTransaction(connection, walletAddress, stakeAddress);
            await onSignTransaction(transaction);
            showToast('Deactivation initiated', 'success');
            loadData();
        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Deactivation failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleWithdraw = async (stakeAddress: string) => {
        setLoading(true);
        try {
            const transaction = await buildWithdrawTransaction(connection, walletAddress, stakeAddress);
            await onSignTransaction(transaction);
            showToast('Withdrawn successfully', 'success');
            loadData();
        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Withdrawal failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="staking-page" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', overflow: 'hidden' }}>
            {/* Header with Epoch Progress */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--card-border)',
                position: 'relative'
            }}>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4 }}>
                            <Icons.ArrowLeft />
                        </button>
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Stake XNT</h2>
                    </div>
                    {/* Compact Epoch Info */}
                    {epochProgress && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Icons.Clock size={12} />
                            <span>Epoch {epochProgress.epoch} · {remainingEpochTime}</span>
                        </div>
                    )}
                </div>
                {/* Slim Progress Bar */}
                {epochProgress && (
                    <div style={{ height: '2px', width: '100%', background: 'var(--card-bg)' }}>
                        <div style={{
                            width: `${epochProgress.percent}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                            transition: 'width 1s ease'
                        }} />
                    </div>
                )}
            </div>

            {/* Main Content Area - Split into Top (Fixed/Sticky) and Bottom (Scroll) */}

            {/* Top Section: Action Area (Compact) */}
            <div style={{ padding: '16px', borderBottom: '1px solid var(--card-border)', background: 'var(--bg-primary)', zIndex: 10 }}>
                {/* Input & Max Button */}
                <div style={{
                    background: 'var(--surface-light)',
                    borderRadius: '12px',
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    border: '1px solid var(--card-border)'
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                            Amount (Bal: {xntBalance.toFixed(2)})
                        </div>
                        <input
                            type="number"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="0.00"
                            style={{
                                width: '100%',
                                background: 'transparent',
                                border: 'none',
                                fontSize: '18px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <button
                        onClick={() => setAmount(Math.max(0, xntBalance - 0.01).toFixed(4))}
                        style={{
                            padding: '6px 10px',
                            background: 'var(--primary-dim)',
                            color: 'var(--primary)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '11px'
                        }}
                    >
                        MAX
                    </button>
                </div>

                {/* Compact Validator Selector */}
                <div style={{ marginTop: '12px' }}>
                    {/* Collapsed View */}
                    {!showValidatorList ? (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px', // Compact padding
                                background: 'var(--surface-light)',
                                border: '1px solid var(--card-border)',
                                borderRadius: '10px',
                                cursor: lockedValidator ? 'default' : 'pointer',
                                opacity: lockedValidator ? 0.8 : 1
                            }}
                            onClick={() => {
                                if (lockedValidator) {
                                    showToast('Unstake current validator to switch', 'info');
                                    return;
                                }
                                setShowValidatorList(true);
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {selectedValidator ? (
                                    <Identicon address={selectedValidator} size={24} imageUrl={getValidatorImage(selectedValidator)} />
                                ) : (
                                    <div style={{
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        background: 'var(--primary-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Icons.Zap size={14} style={{ color: 'var(--primary)' }} />
                                    </div>
                                )}
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 500 }}>
                                        {selectedValidator ? getValidatorName(selectedValidator) : 'Select Validator'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                        {loadingData ? 'Loading...' : `10% Commission`}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: lockedValidator ? 'var(--text-secondary)' : 'var(--primary)' }}>
                                {lockedValidator ? (
                                    <>Locked <Icons.Lock size={12} /></>
                                ) : (
                                    <>Change <Icons.ChevronDown size={12} /></>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Expanded List - show inline or modal-like */
                        <div style={{
                            background: 'var(--surface-light)',
                            border: '1px solid var(--card-border)',
                            borderRadius: '10px',
                            overflow: 'hidden'
                        }}>
                            <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Select Validator</span>
                                    <button onClick={() => setShowValidatorList(false)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                                        <Icons.X size={14} />
                                    </button>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <Icons.Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search validator..."
                                        style={{
                                            width: '100%',
                                            padding: '6px 8px 6px 28px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--card-border)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)',
                                            fontSize: '11px',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>
                            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {filteredValidators.map(v => (
                                    <div
                                        key={v.voteAccount}
                                        onClick={() => { setSelectedValidator(v.voteAccount); setShowValidatorList(false); }}
                                        style={{
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            background: selectedValidator === v.voteAccount ? 'var(--primary-dim)' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <Identicon address={v.voteAccount} size={24} imageUrl={v.imageUrl} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '13px' }}>{v.name || `${v.voteAccount.slice(0, 6)}...`}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                {v.commission}% Comm · {formatStake(v.activatedStake)}
                                            </div>
                                        </div>
                                        {selectedValidator === v.voteAccount && <Icons.Check size={14} style={{ color: 'var(--primary)' }} />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Stake Button */}
                <button
                    onClick={handleStake}
                    disabled={loading || !amount || !selectedValidator}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: loading || !amount ? 'var(--surface-light)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                        color: loading || !amount ? 'var(--text-secondary)' : '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: loading || !amount ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '14px',
                        marginTop: '12px',
                        boxShadow: loading || !amount ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.3)'
                    }}
                >
                    {loading ? 'Staking...' : 'Stake'}
                </button>
            </div>

            {/* Bottom Section: Stakes List (Scrollable) */}
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-primary)' }}>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                        Active Stakes ({stakeAccounts.length})
                    </h3>
                </div>

                {stakeAccounts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-secondary)' }}>
                        <div style={{ opacity: 0.3, marginBottom: '8px' }}><Icons.Zap size={24} /></div>
                        <div style={{ fontSize: '13px' }}>No active stakes</div>
                    </div>
                ) : (
                    <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {stakeAccounts.map(stake => {
                            const isExpanded = expandedStakeId === stake.address;
                            return (
                                <div
                                    key={stake.address}
                                    style={{
                                        background: 'var(--surface-light)',
                                        border: '1px solid var(--card-border)',
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {/* Summary Row (Always Visible) */}
                                    <div
                                        onClick={() => setExpandedStakeId(isExpanded ? null : stake.address)}
                                        style={{
                                            padding: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {/* Status Dot */}
                                            <div style={{
                                                width: '8px', height: '8px', borderRadius: '50%',
                                                background: stake.state === 'active' ? '#22c55e' :
                                                    stake.state === 'activating' ? '#eab308' : '#f97316'
                                            }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>
                                                    {stake.balance.toFixed(2)} XNT
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                    {stake.lastEpochReward > 0
                                                        ? `+${stake.lastEpochReward.toFixed(2)} Reward`
                                                        : stake.state.charAt(0).toUpperCase() + stake.state.slice(1)}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ color: 'var(--text-secondary)' }}>
                                            {isExpanded ? <Icons.ChevronDown size={14} style={{ transform: 'rotate(180deg)' }} /> : <Icons.ChevronDown size={14} />}
                                        </div>
                                    </div>

                                    {/* Expanded Actions */}
                                    {isExpanded && (
                                        <div style={{
                                            padding: '0 12px 12px',
                                            borderTop: '1px solid var(--card-border)',
                                            background: 'var(--bg-secondary)',
                                            marginTop: '-1px'
                                        }}>
                                            <div style={{ padding: '10px 0', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Validator:</span>
                                                <span>{getValidatorName(stake.delegatedVoteAccount || '')}</span>
                                            </div>

                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {(stake.state === 'active' || stake.state === 'activating') && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeactivate(stake.address); }}
                                                        disabled={loading}
                                                        style={{
                                                            flex: 1, padding: '8px',
                                                            background: 'rgba(249,115,22,0.1)', color: '#f97316',
                                                            border: '1px solid #f97316', borderRadius: '6px',
                                                            fontSize: '12px', fontWeight: 500, cursor: 'pointer'
                                                        }}
                                                    >
                                                        Unstake
                                                    </button>
                                                )}
                                                {stake.state === 'inactive' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleWithdraw(stake.address); }}
                                                        disabled={loading}
                                                        style={{
                                                            flex: 1, padding: '8px',
                                                            background: 'rgba(34,197,94,0.1)', color: '#22c55e',
                                                            border: '1px solid #22c55e', borderRadius: '6px',
                                                            fontSize: '12px', fontWeight: 500, cursor: 'pointer'
                                                        }}
                                                    >
                                                        Withdraw
                                                    </button>
                                                )}
                                                {stake.state === 'deactivating' && (
                                                    <div style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', padding: '6px' }}>
                                                        Cooldown (~{remainingEpochTime})
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
