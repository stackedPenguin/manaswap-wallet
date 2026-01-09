import { useState, useEffect, useRef } from 'react';
import type { NetworkClusterId } from '../../shared/networks';
import type { AccountInfo } from '../../shared/types';
import { NETWORKS } from '../../shared/networks';
import { sendMessage } from '../../shared/messaging';
import { Icons } from '../../shared/ui';
import { resolveX1NS } from '../../shared/x1ns';
import { Connection, Transaction, PublicKey } from '@solana/web3.js';
import { createSolTransferTransaction, createSplTokenTransferTransaction } from '../../shared/transactions';
import { signTransactionTrezor } from '../../extension/trezor';
import { getNetworkConfig } from '../../shared/networks';

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  logoURI?: string;
  decimals: number;
  balance?: number; // Optional balance from unified Asset
  price?: number;   // Optional price from unified Asset
}

interface SendTransactionModalProps {
  accountAddress?: string;
  accounts: AccountInfo[];
  networkId: NetworkClusterId;
  defaultBalance: number; // SOL balance if no token selected
  initialToken?: TokenInfo;
  availableTokens: TokenInfo[]; // List of all available tokens for the current network
  onClose: () => void;
  onSuccess?: (signature?: string) => void;
}

interface TransactionResponse {
  success: boolean;
  signature?: string;
  error?: string;
}

export function SendTransactionModal({
  accountAddress,
  accounts,
  networkId,
  defaultBalance,
  initialToken,
  availableTokens,
  onClose,
  onSuccess,
}: SendTransactionModalProps) {
  const [recipient, setRecipient] = useState('');
  const [showOwnWallets, setShowOwnWallets] = useState(false);
  const ownWalletsRef = useRef<HTMLDivElement>(null);

  // Token selection state
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(initialToken);
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const tokenSelectorRef = useRef<HTMLDivElement>(null);

  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [feeEstimate, setFeeEstimate] = useState<number | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  const network = NETWORKS.find((n) => n.id === networkId);
  const currency = selectedToken?.symbol || (network?.kind === 'x1' ? 'XNT' : 'SOL');
  const nativeCurrency = network?.kind === 'x1' ? 'XNT' : 'SOL';

  // Fix: Use local icons for native currency to ensure XNT logo is correct
  const nativeLogoURI = network?.kind === 'x1' ? '/icons/x1-logo.png' : '/icons/solana-logo.png';

  // Determine balance and decimals based on selection
  const currentBalance = selectedToken ? (selectedToken.balance || 0) : defaultBalance;
  const currentDecimals = selectedToken ? selectedToken.decimals : 9;

  const isValidAddress = (addr: string): boolean => {
    try {
      return addr.length >= 32 && addr.length <= 44 && /^[A-Za-z0-9]+$/.test(addr);
    } catch {
      return false;
    }
  };



  // Handle X1NS Resolution
  useEffect(() => {
    const checkX1NS = async () => {
      // Only resolve if on X1 network and input looks like a domain
      if (network?.kind === 'x1' && recipient.endsWith('.x1') && recipient.length > 3) {
        setIsResolving(true);
        setResolvedAddress(null);
        setError('');

        const result = await resolveX1NS(recipient);

        setIsResolving(false);
        if (result.address) {
          setResolvedAddress(result.address);
        } else if (result.error) {
          // Don't set error on UI immediately while typing, unless it's a specific lookup
          // But here we just leave resolvedAddress null
        }
      } else {
        setResolvedAddress(null);
      }
    };

    const timer = setTimeout(checkX1NS, 500); // Debounce
    return () => clearTimeout(timer);
  }, [recipient, network?.kind]);


  useEffect(() => {
    // Determine effective address: standard address OR resolved X1NS address
    const effectiveAddress = resolvedAddress || recipient;

    if (effectiveAddress && isValidAddress(effectiveAddress) && amount && parseFloat(amount) > 0) {
      setFeeEstimate(0.000005);
    } else {
      setFeeEstimate(null);
    }
  }, [recipient, resolvedAddress, amount]);

  // Close selectors when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ownWalletsRef.current && !ownWalletsRef.current.contains(event.target as Node)) {
        setShowOwnWallets(false);
      }
      if (tokenSelectorRef.current && !tokenSelectorRef.current.contains(event.target as Node)) {
        setShowTokenSelector(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectOwnWallet = (address: string) => {
    setRecipient(address);
    setShowOwnWallets(false);
    setError('');
  };

  const handleContinue = () => {
    setError('');

    // Use resolved address if available
    const effectiveRecipient = resolvedAddress || recipient;

    if (!effectiveRecipient || !isValidAddress(effectiveRecipient)) {
      setError('Invalid recipient address');
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return;
    }
    if (amountNum > currentBalance) {
      setError(`Insufficient balance. You have ${currentBalance.toFixed(selectedToken ? 4 : 6)} ${currency}`);
      return;
    }
    setShowReview(true);
  };

  const handleSend = async () => {
    setIsSending(true);
    setError('');
    try {
      const amountNum = parseFloat(amount);
      const effectiveRecipient = resolvedAddress || recipient;

      // Find sender account to check type
      const senderAccount = accounts.find(a => a.address === accountAddress);

      if (senderAccount?.type === 'trezor') {
        // Hardware Wallet Flow (Trezor)
        if (!senderAccount.derivationPath) {
          throw new Error('Trezor account missing derivation path');
        }

        const config = getNetworkConfig(networkId);
        const connection = new Connection(config.rpcUrl, 'confirmed');
        const senderPubkey = new PublicKey(accountAddress!); // ! safe because senderAccount exists

        let transaction: Transaction;

        if (selectedToken?.mint && selectedToken.mint !== 'So11111111111111111111111111111111111111112') {
          // SPL Token
          transaction = await createSplTokenTransferTransaction(
            senderPubkey,
            effectiveRecipient,
            amountNum,
            selectedToken.mint,
            selectedToken.decimals,
            connection
          );
        } else {
          // Native SOL
          transaction = await createSolTransferTransaction(
            senderPubkey,
            effectiveRecipient,
            amountNum,
            connection
          );
        }

        // Serialize for Trezor (unsigned)
        const serializedForTrezor = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });

        // Sign with Trezor
        const signature = await signTransactionTrezor(senderAccount.derivationPath, serializedForTrezor);

        // Add signature to transaction
        transaction.addSignature(senderPubkey, signature);

        // Verify (optional but good sanity check)
        if (!transaction.verifySignatures()) {
          throw new Error('Signature verification failed');
        }

        // Broadcast
        const res = await sendMessage<TransactionResponse>({
          type: 'manaswap:broadcastTransaction',
          payload: {
            serializedTransaction: transaction.serialize(),
            networkId: networkId
          }
        });

        if (res.success && res.signature) {
          onSuccess?.(res.signature);
          onClose();
        } else {
          setError(res.error || 'Broadcast failed');
          setShowReview(false);
        }

      } else {
        // Standard Flow (Background handles signing for Hot Wallets)
        const res = await sendMessage<TransactionResponse>({
          type: 'manaswap:sendTransaction',
          payload: {
            recipient: effectiveRecipient,
            amount: amountNum,
            networkId,
            tokenMint: selectedToken?.mint,
            tokenDecimals: selectedToken?.decimals,
          },
        });
        if (res.success && res.signature) {
          onSuccess?.(res.signature);
          onClose();
        } else {
          setError(res.error || 'Transaction failed');
          setShowReview(false);
        }
      }

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Transaction failed';
      setError(errorMessage);
      setShowReview(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleMax = () => {
    if (feeEstimate && !selectedToken) {
      // For Native currency, subtract fee
      const maxAmount = Math.max(0, currentBalance - feeEstimate);
      setAmount(maxAmount.toFixed(6));
    } else {
      // For SPL tokens, you can send max balance (fee paid in SOL)
      setAmount(currentBalance.toFixed(currentDecimals > 6 ? 6 : currentDecimals));
    }
  };

  // Common input style
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: '0.95rem',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    color: '#fff',
    outline: 'none',
  };

  const usdValue = (amount && !isNaN(parseFloat(amount)) && selectedToken?.price)
    ? (parseFloat(amount) * selectedToken.price).toFixed(2)
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#09090b', // Force opaque background (Zinc-950 equivalent)
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column', // Column layout
        overflow: 'hidden', // Prevent body scroll
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '600px', // Limit width on larger screens for sanity, but effectively fills popup
          width: '100%',
          margin: '0 auto',
          padding: '0',
          overflowY: 'auto', // Allow internal scrolling
        }}
      >
        {/* Standard Header */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--card-border)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <button
            onClick={showReview ? () => setShowReview(false) : onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4, display: 'flex' }}
          >
            <Icons.ArrowLeft />
          </button>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            {showReview ? 'Confirm' : `Send`}
          </h2>
        </div>



        {/* Content Body */}
        <div style={{ padding: '16px', flex: 1 }}>

          {/* Chain Badge for Clarity */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${network?.kind === 'x1' ? '#f59e0b' : '#22c55e'}`,
              borderRadius: '20px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: network?.kind === 'x1' ? '#f59e0b' : '#22c55e',
                boxShadow: `0 0 8px ${network?.kind === 'x1' ? '#f59e0b' : '#22c55e'}`
              }} />
              <span>Sending on <strong>{network?.label || networkId}</strong></span>
            </div>
          </div>

          {!showReview ? (
            <>
              {/* Recipient Input */}
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Recipient
                  </label>
                  {network?.kind === 'x1' && (
                    <div className="tooltip-container" style={{ position: 'relative', display: 'inline-flex' }}>
                      <div style={{
                        width: '14px', height: '14px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
                        color: 'var(--text-secondary)', cursor: 'help'
                      }} title="X1NS Domains Supported">?</div>
                    </div>
                  )}
                </div>
                {(accounts || []).length > 1 && (
                  <button
                    onClick={() => setShowOwnWallets(!showOwnWallets)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-color)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    Select My Wallet
                  </button>
                )}


                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder={network?.kind === 'x1' ? "Address or .x1 domain" : "Solana address"}
                    value={recipient}
                    onChange={(e) => { setRecipient(e.target.value); setError(''); }}
                    disabled={isSending}
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />

                  {/* Loading / Resolution Status Indicator */}
                  {isResolving && (
                    <div style={{ position: 'absolute', right: '12px', top: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Resolving...
                    </div>
                  )}

                  {/* Own Wallets Dropdown */}
                  {showOwnWallets && (
                    <div
                      ref={ownWalletsRef}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: '#1a1a1a', // Solid dark background to fix transparency issue
                        border: '1px solid var(--card-border)',
                        borderRadius: '10px',
                        zIndex: 100, // Make sure it floats above everything
                        maxHeight: '200px',
                        overflowY: 'auto',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.8)' // Stronger shadow
                      }}
                    >
                      {accounts
                        .filter(a => a.address !== accountAddress) // Don't show current sender
                        .map((acc, idx) => (
                          <div
                            key={acc.address}
                            onClick={() => selectOwnWallet(acc.address)}
                            style={{
                              padding: '10px 12px',
                              borderBottom: idx < accounts.length - 2 ? '1px solid var(--card-border)' : 'none', // -2 because we filtered one out roughly
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              background: 'transparent',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                              {acc.label || `Wallet ${idx + 1}`}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {acc.address.slice(0, 8)}...{acc.address.slice(-8)}
                            </div>
                          </div>
                        ))}
                      {accounts.length <= 1 && (
                        <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
                          No other wallets found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {recipient && !isValidAddress(recipient) && !recipient.endsWith('.x1') && (
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', margin: '4px 0 0 0' }}>
                    Invalid address
                  </p>
                )}

                {resolvedAddress && (
                  <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icons.Check size={12} />
                    <span>Resolved: {resolvedAddress.slice(0, 8)}...{resolvedAddress.slice(-8)}</span>
                  </div>
                )}
              </div>

              {/* Amount Input and Token Selection */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Amount</label>
                  <button
                    onClick={handleMax}
                    disabled={isSending}
                    style={{
                      fontSize: '0.7rem',
                      padding: '4px 10px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    MAX
                  </button>
                </div>

                <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setError(''); }}
                      disabled={isSending}
                      style={{ ...inputStyle }}
                    />
                    {usdValue && (
                      <span style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)'
                      }}>
                        ≈${usdValue}
                      </span>
                    )}
                  </div>

                  {/* Token Selector Button */}
                  <div style={{ position: 'relative' }} ref={tokenSelectorRef}>
                    <button
                      onClick={() => setShowTokenSelector(!showTokenSelector)}
                      style={{
                        height: '100%',
                        padding: '0 16px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '10px',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <img
                        src={selectedToken?.logoURI || nativeLogoURI}
                        style={{ width: 20, height: 20, borderRadius: '50%' }}
                        alt={selectedToken?.symbol || nativeCurrency}
                      />
                      {currency}
                      <Icons.ChevronDown size={14} />
                    </button>

                    {showTokenSelector && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '8px',
                        background: '#1a1a1a',
                        border: '1px solid var(--card-border)',
                        borderRadius: '12px',
                        padding: '8px',
                        minWidth: '240px',
                        zIndex: 100,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}>
                        {/* Default SOL/XNT Option */}
                        <div
                          onClick={() => {
                            setSelectedToken(undefined); // undefined means Native SOL/XNT
                            setShowTokenSelector(false);
                            setAmount('');
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: !selectedToken ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: 'white'
                          }}
                          onMouseEnter={(e) => { if (selectedToken) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                          onMouseLeave={(e) => { if (selectedToken) e.currentTarget.style.background = 'transparent' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <img src={nativeLogoURI} alt={nativeCurrency} style={{ width: 24, height: 24, borderRadius: '50%' }} />
                            <span style={{ fontWeight: 600 }}>{nativeCurrency}</span>
                          </div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {defaultBalance.toFixed(4)}
                          </span>
                        </div>

                        <div style={{ height: 1, background: 'var(--card-border)', margin: '8px 0' }} />

                        {/* SPL Tokens */}
                        {availableTokens.map((t) => (
                          <div
                            key={t.mint}
                            onClick={() => {
                              setSelectedToken(t);
                              setShowTokenSelector(false);
                              setAmount('');
                            }}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: selectedToken?.mint === t.mint ? 'rgba(255,255,255,0.1)' : 'transparent',
                              color: 'white'
                            }}
                            onMouseEnter={(e) => { if (selectedToken?.mint !== t.mint) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                            onMouseLeave={(e) => { if (selectedToken?.mint !== t.mint) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <img src={t.logoURI} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.symbol}</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {(t.balance || 0).toFixed(4)}
                              </span>
                              {t.price && t.balance && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                  ${(t.balance * t.price).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Balance: {currentBalance.toFixed(6)} {currency}
                  </p>
                  {selectedToken?.price && !isNaN(currentBalance) && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                      ≈${(currentBalance * selectedToken.price).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              {/* Fee Info */}
              {feeEstimate && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '20px',
                  padding: '12px',
                  background: 'var(--card-bg)',
                  borderRadius: '12px',
                  border: '1px solid var(--card-border)',
                }}>
                  <span>Network fee</span>
                  <span style={{ color: 'var(--text-primary)' }}>~{feeEstimate.toFixed(6)} {nativeCurrency}</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  padding: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  marginBottom: '12px',
                }}>
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={onClose}
                  disabled={isSending}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  disabled={isSending || !recipient || !amount || (!isValidAddress(recipient) && !resolvedAddress) || parseFloat(amount) <= 0}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    opacity: (isSending || (!recipient || !amount || (!isValidAddress(recipient) && !resolvedAddress) || parseFloat(amount) <= 0)) ? 0.5 : 1,
                  }}
                >
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Review: Token Icon + Amount */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <img
                  src={selectedToken?.logoURI || nativeLogoURI}
                  alt={selectedToken?.symbol || nativeCurrency}
                  style={{ width: '48px', height: '48px', borderRadius: '50%', marginBottom: '12px' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#fff' }}>
                  {parseFloat(amount).toFixed(6)} {currency}
                </div>
                {/* Review USD Value */}
                {usdValue && (
                  <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    ≈${usdValue}
                  </div>
                )}
              </div>

              {/* Compact Details */}
              <div style={{ fontSize: '0.85rem', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--card-border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>To</span>
                  <div style={{ textAlign: 'right' }}>
                    {resolvedAddress ? (
                      <>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{recipient}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace' }}>{resolvedAddress.slice(0, 8)}...{resolvedAddress.slice(-6)}</div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{recipient.slice(0, 8)}...{recipient.slice(-6)}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--card-border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Network</span>
                  <span style={{ color: 'var(--text-primary)' }}>{network?.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Fee</span>
                  <span style={{ color: 'var(--text-primary)' }}>~{(feeEstimate || 0.000005).toFixed(6)} {nativeCurrency}</span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  padding: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  marginBottom: '12px',
                }}>
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowReview(false)}
                  disabled={isSending}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || (!isValidAddress(recipient) && !resolvedAddress)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    opacity: (isSending || (!isValidAddress(recipient) && !resolvedAddress)) ? 0.7 : 1
                  }}
                >
                  {isSending ? (
                    <>
                      <div style={{
                        width: '14px',
                        height: '14px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTop: '2px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      Sending...
                    </>
                  ) : (
                    'Send'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
