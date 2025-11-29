# Manaswap Wallet Chrome Extension PRD

## 1. Product Overview
Manaswap Wallet is a Manifest V3 Chrome extension that gives Solana and X1 (a Solana fork with custom RPC endpoints) users a fast, documented, and secure wallet experience. It must offer account onboarding (create/import via seed phrase or private key), transaction management, network awareness, and dApp interoperability comparable to leading wallets while remaining lightweight and performant.

## 2. Goals & Non-Goals
- **Goals**
  - Ship a high-performance, well-documented wallet that works reliably on Solana Mainnet/Testnet and X1 Mainnet/Testnet.
  - Provide seamless onboarding, key visibility (with explicit confirmation flow), and dApp connectivity for swaps, mints, and signature approvals.
  - Enable both manual and automatic network switching so the wallet uses the correct RPC without user confusion.
  - Maintain strong security hygiene (encryption at rest, permission prompts, content script hardening).
- **Non-Goals**
  - Building a mobile wallet or native desktop app.
  - Implementing hardware wallet support in v1 (leave as stretch goal).
  - Supporting non-Solana-family chains.

## 3. Target Users & Personas
- **Web3 power users** needing a performant Solana-compatible wallet that also speaks X1.
- **Developers/dApp teams** who need an easy way to test on both Solana and X1 networks with automatic detection.
- **Newcomers to Solana** who need guided onboarding with clear warnings before revealing private keys.

## 4. Success Metrics
- Time-to-first-transaction under 3 minutes from install.
- < 1s perceived load when opening the popup on mid-tier hardware.
- ≥ 95% successful RPC calls across supported networks in telemetry.
- Fewer than 5% of users disable automatic detection after first week (indicates trust).

## 5. User Journeys & Scenarios
1. Install extension → onboarding wizard → create wallet → backup seed → fund via Solana faucet → sign first dApp transaction.
2. Import existing wallet via mnemonic/private key → toggle between Solana Mainnet and X1 Mainnet manually.
3. Visit an X1-specific dApp → extension auto-detects requested cluster → prompts to switch network automatically.
4. Advanced user opens settings → views encrypted private key (after password re-entry) to import into CLI.

## 6. Functional Requirements
- **Wallet lifecycle**: create wallet (ed25519), import via mnemonic, import via raw private key, derive addresses, allow multiple accounts.
- **Key management & security**: encrypt secrets with user password (PBKDF2/Argon2 + AES-GCM), persist in `chrome.storage.local`, lock after inactivity, confirm password before showing private keys.
- **Private key visibility**: gated modal requiring password + explicit warning, with copy-to-clipboard logging.
- **Balances & tokens**: fetch SOL/X1 balances, detect SPL tokens, refresh states per network.
- **Transactions**: send SOL, send SPL tokens, show fees, simulate via RPC, support dApp signature prompts (message + transaction).
- **dApp integration**: inject provider compatible with `window.solana`, support connect/disconnect events, `signTransaction`, `signAllTransactions`, `signMessage`.
- **Network support**:
  - Manual toggles for Solana Mainnet/Testnet and X1 Mainnet/Testnet.
  - Automatic detection: monitor dApp provider requests, site metadata, and stored connection history to recommend or auto-switch networks with user confirmation by default.
  - Ability to override or disable auto detection per site.
- **Settings & info**: activity log, network status indicator, RPC latency display, in-app documentation links.

## 7. Network Switching & Detection Details
- **Manual switching**: dropdown exposing four clusters with URLs:
  - `https://rpc.mainnet.x1.xyz`
  - `https://rpc.testnet.x1.xyz`
  - `https://api.mainnet-beta.solana.com`
  - `https://api.testnet.solana.com`
- **Automatic detection heuristics**:
  1. Inspect incoming dApp `connect` requests for custom cluster identifiers or RPC hints.
  2. Maintain allowlist mapping popular dApp hostnames → preferred network.
  3. Listen for program IDs known to deploy only on X1 vs Solana to suggest network switch before signing.
  4. Provide toast + popup banner when an automatic switch occurs; user can opt out per site.
- **Fallback logic**: if detection is inconclusive, stay on the user’s current network and show a subtle prompt so they can manually switch.

## 8. UX & UI Principles
- React + Vite + TypeScript + Tailwind CSS for a highly-performant, well-documented stack.
- Popup flows optimized for <360px width, with skeleton loaders to mask RPC latency.
- Options page for advanced settings (network lists, developer toggles, export logs).
- Clear warning screens before sensitive actions (view private key, auto network switch, signing message from unknown origin).

## 9. Technical Architecture
- **Manifest V3** with service worker background handling alarms, network polling, and message routing.
- **React/Vite** frontends for popup, onboarding full-page, and options.
- **State management**: Redux Toolkit or Zustand with persistence layer bridging background + UI via message passing.
- **RPC clients**: use `@solana/web3.js`; abstract RPC endpoints to swap between Solana and X1 URLs.
- **Key storage**: WebCrypto (SubtleCrypto) for encrypt/decrypt, secrets stored in `chrome.storage.local`.
- **Automatic detection service**: background listener maintaining site metadata and heuristics, exposing actions to popup UI.
- **Testing**: unit tests via Vitest + React Testing Library; integration tests for background/provider using Jest + puppeteer runner when needed.
- **Documentation**: Storybook (optional) for UI components; inline developer docs (`docs/architecture.md`).

## 10. Security & Compliance
- Password strength checks and lockouts after N failed attempts.
- Optional biometric unlock via Chrome WebAuthn (stretch goal).
- CSP restricting external scripts, limited permissions in manifest (`storage`, `activeTab`, `scripting`, `tabs`).
- Regular dependency audits via `pnpm audit` or `npm audit` in CI.

## 11. Analytics & Telemetry
- Anonymous event tracking (opt-in) for network switch actions, transaction outcomes, RPC latency.
- No sensitive data leaves device.

## 12. Open Questions
1. Should we support Ledger/Trezor passthrough post-MVP?
2. Any fiat on-ramp integrations planned?
3. Is automatic network switching allowed to happen without confirmation for trusted sites, or must it always prompt?

## 13. Work Plan & Task List
**Phase 0 – Foundations**
- [x] Initialize repo with Vite + React + TypeScript, pnpm, ESLint, Prettier.
- [x] Configure Manifest V3, background service worker, popup, options, content scripts, and build pipeline (Vite + `@crxjs/vite-plugin`).
- [x] Set up CI (GitHub Actions) for lint/test/build.
- [x] Document development workflow in `README.md`.

**Phase 1 – Key Management & Onboarding**
- [ ] Implement secure key vault (encryption, password, lock timer).
- [ ] Build onboarding wizard for create/import via mnemonic + private key.
- [ ] Add multi-account support and account switcher UI.
- [ ] Implement “show private key” gated flow with password confirmation + copy logging.

**Phase 2 – Network Layer & Detection**
- [ ] Create network config module with Solana + X1 RPC endpoints, latency monitor, manual switch UI.
- [ ] Build automatic detection engine with heuristics + opt-out storage per site.
- [ ] Surface detection events in UI (banner/toast) and allow user confirmation/override.

**Phase 3 – Wallet Surface**
- [ ] Balance + token list fetching per network, including SPL metadata caching.
- [ ] Transaction composer (send SOL/SPL) with fee estimation and simulation.
- [ ] Activity history view with filters per network/account.

**Phase 4 – dApp Connectivity**
- [ ] Inject `window.manaswap` provider shim compatible with `window.solana` spec.
- [ ] Support connect/disconnect, `signTransaction`, `signAllTransactions`, `signMessage` flows with approval UI.
- [ ] Add per-site permissions dashboard, including auto network switch preferences.

**Phase 5 – Quality, Security, Launch**
- [ ] Write unit/integration tests for key modules and provider handshake.
- [ ] Conduct security review (dependency audit, threat modeling checklist).
- [ ] Prepare marketing copy, store listing assets, and submission checklist for Chrome Web Store Beta.

Progress will be tracked by checking off tasks above as we complete each item.
