# Manaswap Wallet v0.1.1 - Pre-Production Testing Checklist

## Core Views
- [x] **Receive** - QR code displays correctly ✅
- [x] **Swap** - Token selector and quote fetching work ✅ (Jupiter Ultra API)
- [x] **Send** - Transaction modal opens and submits ✅

## Wallet Management
- [ ] Create new wallet (onboarding flow)
- [ ] Import wallet via seed phrase
- [x] Switch between accounts ✅
- [x] Copy address to clipboard ✅
- [ ] View private key (with password confirmation)

## Network Switching
- [x] Switch to Solana Mainnet ✅
- [x] Switch to Solana Devnet ✅
- [x] Switch to X1 Testnet ✅
- [ ] Add custom RPC

## Token & Balance
- [x] Native SOL balance displays ✅ (0.0366 SOL)
- [x] Native XNT balance displays (X1) ✅
- [x] SPL token balances display ✅ (USDC verified)
- [x] Token prices load from API ✅ (Jupiter Price V3)
- [x] Refresh balances works ✅
- [x] **Spam filter toggle** ✅ (1 hidden token)
- [x] **Unverified tokens hidden by default** ✅

## Transactions
- [x] Send SOL ✅ (0.001 SOL sent successfully)
- [ ] Send SPL token
- [x] Transaction history loads ✅
- [ ] Transaction links to explorer ❌ (not implemented)

## DeFi Features (Solana Mainnet)
- [x] Jupiter perps positions display ✅
- [x] Drift positions display ✅
- [x] DeFi tab shows positions ✅

## Staking (X1 Network)
- [ ] Staking page loads on X1
- [ ] Stake/unstake functionality

## dApp Connection
- [x] Connect to a dApp (e.g., Jupiter, Raydium) ✅
- [x] Approve transaction request from dApp ✅
- [x] Reject transaction request ✅ (button visible)

## UI/UX
- [x] Portfolio chart displays ✅
- [ ] Toast notifications appear
- [x] Loading skeletons show appropriately ✅
- [x] Back navigation works on all screens ✅

---
**Version:** 0.1.1  
**Last Tested:** 2026-01-11 08:33 CST  
**Coverage:** 35/44 items (80%)

**Notes:** 
- Fixed Jupiter API migration (V2/V3) and env var build-time inlining
- Transaction send verified working (0.001 SOL)
- dApp connection to Jupiter verified working
- Explorer links from tx history not yet implemented
- X1 wallet naming shown in Jupiter (minor issue)
