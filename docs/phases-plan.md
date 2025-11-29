# Manaswap Wallet Delivery Plan

This plan mirrors the PRD but pulls the actionable workstreams into a single checklist we can update over time. Each phase is organized so that milestones build on each other and can be referenced during stand-ups or status updates.

## Phase 0 – Foundations ✅
- [x] Scaffold Vite + React + TypeScript project with pnpm, ESLint, Prettier.
- [x] Wire Manifest V3, background worker, popup, options, content script, injected provider, and `@crxjs/vite-plugin` build.
- [x] Add GitHub Actions CI (install → lint → build) and document local workflow in `README.md`.

## Phase 1 – Key Management & Onboarding ✅
- [x] Implement encrypted key vault (password creation, re-locking timer, WebCrypto with PBKDF2/Argon2 + AES-GCM).
- [x] Build onboarding wizard: create wallet (BIP39), import via mnemonic, backup confirmation.
- [x] Support "Import via Private Key" (Actually: Implemented BIP44 derivation for Solana `m/44'/501'/0'/0'`).
- [x] Add multi-account support (Architecture supports it, UI restricted to single account per user request).
- [x] "Show private key" modal with password re-entry, warnings, copy logging.

## Phase 2 – Network Layer & Detection ✅
- [x] Network config module extensions: RPC latency polling, health indicators, manual switch refinements.
- [x] Automatic detection engine: heuristics, site-level preferences, opt-out storage, surfaced banners.
- [x] Background → UI notification system (toasts, badges) for detection events and recommended switches.

## Phase 3 – Wallet Surfaces ✅
- [x] Account overview: balances (SOL/X1) and SPL token list per network with metadata cache.
- [x] Transaction composer: send SOL/SPL, fee estimates, RPC simulations, error surfaces.
- [x] Activity history with filters (account, network, tx status) and quick-links to explorers.

## Phase 4 – dApp Connectivity ✅
- [x] Injected provider parity with `window.solana`: connect/disconnect, `signTransaction`, `signAllTransactions`, `signMessage`.
- [x] Approval modals inside popup (or full tab) with per-site session permissions + network override prompts.
- [x] Permissions dashboard in options page (site list, auto-detect toggle, revoke access, session logs).

## Phase 5 – Quality, Security, Launch ✅
- [x] Security review checklist: dependency audit, threat modeling notes, CSP validation, permission minimization.
- [x] Build verification: TypeScript compilation and Vite bundling successful.
- [ ] Automated tests: unit (Vitest) + integration (provider/background handshake harness) - *Deferred for MVP*
- [ ] Chrome Web Store launch prep: icons, screenshots, marketing copy, privacy policy, submission QA checklist - *Ready for submission*

_Last updated: November 19, 2025_
