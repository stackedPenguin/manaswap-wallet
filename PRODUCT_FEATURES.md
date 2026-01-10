# Manaswap Wallet - Product Features

A high-performance Solana + X1 Chrome extension wallet with smart network detection, multi-account support, and comprehensive DeFi integrations.

---

## Table of Contents

1. [Core Wallet Features](#1-core-wallet-features)
2. [Multi-Network Support](#2-multi-network-support)
3. [Account Management](#3-account-management)
4. [dApp Integration](#4-dapp-integration)
5. [Transaction Features](#5-transaction-features)
6. [Swapping](#6-swapping)
7. [Staking (X1)](#7-staking-x1)
8. [DeFi Integrations](#8-defi-integrations)
9. [Hardware Wallet Support](#9-hardware-wallet-support)
10. [Security Features](#10-security-features)
11. [Portfolio Tracking](#11-portfolio-tracking)
12. [User Interface](#12-user-interface)
13. [Settings & Configuration](#13-settings--configuration)

---

## 1. Core Wallet Features

### 1.1 Wallet Creation & Import

**Create New Wallet**
- Generate secure 12 or 24-word BIP39 mnemonic recovery phrase
- Password-protected vault encryption
- Automatic first account derivation

**Import Existing Wallet**
- Import via mnemonic recovery phrase (12 or 24 words)
- Import via private key (Base58 encoded)
- Support for multiple key sources in a single wallet

**Key Derivation**
- Standard Solana derivation path: `m/44'/501'/{index}'/0'`
- Multiple accounts from single mnemonic
- Account discovery (scan for accounts with activity)

### 1.2 Balance Display

- Real-time SOL/XNT native token balance
- SPL token holdings with USD valuations
- Token logos and metadata from Jupiter token list
- Support for both Token Program and Token-2022 Program tokens
- Unified portfolio view across all networks

### 1.3 Transaction History

- Recent transaction list per account
- Transaction type identification (send, receive, swap, stake)
- Transaction status (confirmed, pending, failed)
- Links to blockchain explorers
- Transaction parsing for human-readable details

---

## 2. Multi-Network Support

### 2.1 Supported Networks

**Solana Networks**
| Network | RPC Endpoint | Chain ID |
|---------|--------------|----------|
| Mainnet | `https://rpc.ankr.com/solana` | 101 |
| Testnet | `https://api.testnet.solana.com` | 102 |
| Devnet | `https://api.devnet.solana.com` | 103 |
| Localnet | `http://127.0.0.1:8899` | 104 |

**X1 Networks**
| Network | RPC Endpoint | Chain ID |
|---------|--------------|----------|
| Mainnet | `https://rpc.mainnet.x1.xyz` | 195 |
| Testnet | `https://rpc.testnet.x1.xyz` | 196 |
| Localnet | `http://127.0.0.1:8901` | 197 |

### 2.2 Custom Network Support

- Add custom RPC endpoints
- Configure network name and explorer URL
- Delete custom networks
- Network persistence across sessions

### 2.3 Smart Network Detection

**Automatic network switching based on:**

1. **Hostname Allowlist** (Highest confidence)
   - Known dApps: jup.ag, raydium.io, orca.so, magiceden.io, tensor.trade
   - X1 dApps: app.x1.xyz, dex.x1.xyz, staking.x1.xyz

2. **RPC Hint Detection**
   - Extracts network from dApp's connection RPC URL
   - Supports mainnet-beta, testnet, devnet patterns

3. **URL Pattern Detection**
   - Keywords: x1, xone, solana, jupiter, etc.
   - Domain patterns and path analysis

4. **Manual Override**
   - Per-site network preferences
   - User can opt-out of auto-detection

### 2.4 Network Health Monitoring

- 5-minute health check intervals
- Latency measurement
- Status indicators: healthy, degraded, down, unknown
- Visual health badge in UI

---

## 3. Account Management

### 3.1 Multi-Account Support

- Multiple accounts from single mnemonic (derived accounts)
- Multiple imported private keys
- Multiple hardware wallet accounts
- Unified account list with type indicators

### 3.2 Account Types

| Type | Icon | Description |
|------|------|-------------|
| Derived | Key | Account derived from mnemonic |
| Imported | Download | Imported via private key |
| Ledger | USB | Ledger hardware wallet account |
| Trezor | Shield | Trezor hardware wallet account |

### 3.3 Account Operations

- **Add Account** - Derive next account from mnemonic
- **Import Account** - Add private key or connect hardware wallet
- **Label Account** - Custom names for easy identification
- **Delete Account** - Remove account (with confirmation)
- **Discover Accounts** - Scan derivation paths for active accounts
- **Copy Address** - One-click address copy
- **View on Explorer** - Quick link to blockchain explorer

### 3.4 Key Recovery

- **Reveal Mnemonic** - Display recovery phrase (password protected)
- **Reveal Private Key** - Export individual account keys (password protected)
- Security warnings before sensitive operations

---

## 4. dApp Integration

### 4.1 Wallet Standard Compliance

Implements Solana Wallet Standard v1 with all required features:

| Feature | Description |
|---------|-------------|
| `standard:connect` | Request wallet connection |
| `standard:disconnect` | Disconnect from dApp |
| `standard:events` | Account/network change events |
| `solana:signTransaction` | Sign single transaction |
| `solana:signAllTransactions` | Sign multiple transactions |
| `solana:signMessage` | Sign arbitrary messages |
| `solana:signAndSendTransaction` | Sign and broadcast |
| `solana:signIn` | Sign-in with Solana (SIWS) |

### 4.2 Provider Injection

- Exposes `window.manaswap` provider object
- Automatic registration with wallet standard
- Event emitter for state changes
- Compatible with all Solana dApps

### 4.3 Connection Management

**Connection Flow:**
1. dApp requests connection
2. Popup opens with approval dialog
3. User selects account and approves
4. Connection established with permissions

**Permission Persistence:**
- Remembered per origin
- Auto-reconnect on page reload
- Manual disconnect available

### 4.4 Request Approval Modal

When a dApp requests a signature:
- Transaction details display
- Balance change preview (simulated)
- Security warnings (if detected)
- Fee estimation
- Approve/Reject buttons
- Hardware wallet signing flow (if applicable)

### 4.5 Network Switching

- dApps can request network switch via `switchChain`
- User confirmation required
- Automatic network detection available

---

## 5. Transaction Features

### 5.1 Send SOL/XNT

- Native token transfers
- Address validation (Base58 + length check)
- Amount validation (balance check)
- Fee estimation display
- Confirmation polling (service worker compatible)

### 5.2 Send SPL Tokens

- Token selection from holdings
- Automatic token account creation (ATA)
- Support for Token Program and Token-2022
- Decimal handling per token
- Associated token account lookup

### 5.3 Transaction Signing

**Signing Methods:**
- In-wallet software signing (Keypair)
- Ledger hardware signing (WebHID)
- Trezor hardware signing (Trezor Connect)

**Transaction Types:**
- Legacy transactions
- Versioned transactions (v0)
- Message signing (off-chain)

### 5.4 Transaction Confirmation

- Polling-based confirmation (no WebSocket dependency)
- 60-second timeout
- Status updates during confirmation
- Error handling with user-friendly messages

### 5.5 Fee Estimation

- Fixed estimate: 5000 lamports (~$0.001)
- Priority fee support (configurable)
- Fee display in native and USD

---

## 6. Swapping

### 6.1 Swap Aggregators

**Solana (Jupiter v6)**
- Best price routing across DEXes
- Quote API integration
- Slippage protection

**X1 (XDEX)**
- Native X1 DEX aggregator
- Pool-based quoting
- Client-side reserve calculations

### 6.2 Swap Features

| Feature | Description |
|---------|-------------|
| Token Selection | Full token list with search |
| Quote Display | Input/output amounts with rates |
| Price Impact | Warning for high impact trades |
| Slippage Setting | Default 0.5%, configurable |
| Platform Fee | 0.05% (5 basis points) |
| Route Display | Shows swap path |

### 6.3 Swap Flow

1. Select input token and amount
2. Select output token
3. Get quote with price impact
4. Review and confirm
5. Sign and broadcast transaction
6. Confirmation with result

### 6.4 Token Discovery

- Jupiter strict token list for Solana
- XDEX tradable tokens for X1
- Manual token addition by mint address
- Token metadata caching

---

## 7. Staking (X1)

### 7.1 Validator Selection

- Validator list with APY and commission
- Known validator metadata (names, icons)
- Custom validator support by vote address
- Validator sorting (APY, stake, commission)

**Known Validators:**
- X1 Foundation (X1SPaMUM1A8E1vKL8XQAB5rxKarJbqtWFFSNFs8f7Av)
- Community validators with verified metadata

### 7.2 Stake Account Management

**Stake States:**
| State | Description |
|-------|-------------|
| Inactive | Newly created, not delegated |
| Activating | Delegation pending (next epoch) |
| Active | Earning rewards |
| Deactivating | Unstake pending (next epoch) |

### 7.3 Staking Operations

- **Create Stake Account** - Allocate funds for staking
- **Delegate** - Assign stake to validator
- **Undelegate** - Begin unstake cooldown
- **Withdraw** - Claim unstaked funds
- **Change Validator** - Requires unstake first (enforced)

### 7.4 Rewards Tracking

- Epoch-based reward calculation
- Historical reward display
- APY estimation per validator
- Total staked balance display

### 7.5 Staking Analytics

- Active stake amount
- Pending rewards
- Validator performance metrics
- Stake distribution visualization

---

## 8. DeFi Integrations

### 8.1 Jupiter Perpetuals

**Position Tracking:**
- Open positions display
- Entry price and current price
- PnL calculation (realized/unrealized)
- Leverage indicator
- Liquidation price

**Supported Markets:**
- SOL-PERP
- BTC-PERP
- ETH-PERP

### 8.2 Drift Protocol

**Full Integration:**
- DriftClient SDK integration
- Market and limit orders
- Cross-margin positions
- Funding rate display
- Collateral management

**Position Details:**
- Base asset amount
- Entry price
- Mark price
- Unrealized PnL
- Margin usage

### 8.3 DeFi Dashboard

- Aggregated position view
- Total DeFi value calculation
- Protocol breakdown
- Risk indicators

---

## 9. Hardware Wallet Support

### 9.1 Ledger Integration

**Connection:**
- WebHID transport (Chrome/Edge)
- Device selection dialog
- Connection status indicator

**Operations:**
- Account enumeration
- Transaction signing
- Message signing
- Multi-account derivation

**Derivation Path:** `44'/501'/n'` (Solana standard)

**Signing Flow:**
1. Transaction prepared in extension
2. Ledger sign modal opens
3. User confirms on device
4. Signature returned to extension

### 9.2 Trezor Integration

**Connection:**
- Trezor Connect Web v9
- Browser popup for authorization
- Device PIN entry

**Operations:**
- Account enumeration
- Transaction signing
- Message signing

**Derivation Path:** `m/44'/501'/0'` (account-based)

### 9.3 Hardware Wallet UI

**Ledger Sign Modal:**
- Device connection instructions
- Transaction preview
- Status updates during signing
- Error handling (device locked, app closed)

**Account Management:**
- Hardware accounts marked with icons
- Cannot export private keys (security)
- Persistent across sessions

---

## 10. Security Features

### 10.1 Vault Encryption

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-256-GCM |
| Key Derivation | PBKDF2-SHA256 |
| Iterations | 100,000 |
| Salt Length | 16 bytes |
| IV Length | 12 bytes |

**Storage:**
- Encrypted vault in Chrome local storage
- Session storage for active keys (service worker safe)
- Password never stored (derived on unlock)

### 10.2 Transaction Simulation

**Before signing, transactions are simulated to detect:**
- Balance changes (gains/losses)
- Token transfers
- Program interactions
- Potential security risks

**Warning Levels:**
| Level | Action | Description |
|-------|--------|-------------|
| NONE | Proceed | Safe transaction |
| WARN | Caution | Unusual patterns detected |
| BLOCK | Stop | High-risk transaction |

### 10.3 Auto-Lock

- Configurable timeout (0 = disabled)
- 1-minute check intervals
- Locks on inactivity
- Clears in-memory keys
- Requires password to unlock

### 10.4 dApp Permissions

**Permission Model:**
- Per-origin permissions
- Stores: origin, account, network, timestamp
- Auto-expires inactive connections
- Manual revocation available

**Security Checks:**
- Origin validation on all requests
- Message integrity verification
- Rate limiting on sensitive operations

### 10.5 Private Key Protection

- Keys never leave service worker (except display)
- Password required for key reveal
- Hardware wallet keys never exported
- Clear warnings before sensitive actions

---

## 11. Portfolio Tracking

### 11.1 Portfolio Value

**Components Tracked:**
- Native token balance (SOL/XNT)
- SPL token holdings
- Staked balance (X1)
- Perpetual positions (Jupiter/Drift)
- DeFi protocol positions

### 11.2 Historical Data

- Data points stored per address/network
- 15-minute tracking intervals
- Visual chart with Lightweight Charts
- Time range selection (1D, 1W, 1M, ALL)

### 11.3 Price Data

**Sources:**
- Jupiter Price API (Solana tokens)
- CoinGecko fallback
- Real-time updates on refresh

### 11.4 Portfolio Chart

- Interactive line chart
- Tooltip with exact values
- Responsive design
- Smooth data interpolation

---

## 12. User Interface

### 12.1 Popup Window

**Dimensions:** 400px x 600px (standard extension popup)

**Main Views:**
| View | Description |
|------|-------------|
| Dashboard | Balance, tokens, quick actions |
| Send | Token transfer form |
| Receive | QR code and address display |
| Swap | Token exchange interface |
| Staking | X1 validator staking |
| DeFi | Position dashboard |
| Settings | Configuration options |

### 12.2 Onboarding Flow

1. Welcome screen
2. Create new / Import existing choice
3. Password setup (8+ characters)
4. Mnemonic display (new) / input (import)
5. Confirmation
6. Dashboard

### 12.3 Account Selector

- Dropdown with all accounts
- Account type icons
- Balance preview
- Quick add account button
- Network indicator

### 12.4 Network Selector

- Modal with network list
- Built-in networks
- Custom networks section
- Add custom network form
- Health status indicators

### 12.5 Modals

| Modal | Purpose |
|-------|---------|
| Send Transaction | Transfer tokens |
| Receive | Show QR and address |
| DApp Approval | Approve/reject requests |
| Account Management | Manage accounts |
| Show Private Key | Reveal keys (protected) |
| Ledger Sign | Hardware signing flow |
| Token Details | Individual token view |

### 12.6 Design System

- Dark theme by default
- CSS variables for theming
- Glass morphism effects
- Consistent spacing and typography
- Lucide React icons
- Responsive layouts

---

## 13. Settings & Configuration

### 13.1 General Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Auto-detect Networks | Smart network switching | Enabled |
| Selected Network | Active blockchain network | Solana Mainnet |
| Auto-lock Timeout | Minutes before auto-lock | 0 (disabled) |

### 13.2 Network Settings

- Custom RPC endpoints
- Network priority order
- Per-site network overrides
- Explorer URL configuration

### 13.3 Account Settings

- Default account selection
- Account labels
- Derivation path display

### 13.4 Options Page

Full-page settings interface with:
- Network management
- Security settings
- Advanced options
- About/version info

---

## Extension Architecture

### Manifest V3 Compliance

- Service worker background script
- Content script isolation
- Declarative permissions
- Chrome storage APIs

### Components

```
Extension
├── Background (Service Worker)
│   ├── Vault management
│   ├── Message routing
│   ├── Network monitoring
│   └── Portfolio tracking
├── Content Script
│   ├── Provider injection
│   ├── Message bridging
│   └── Network detection
├── Popup UI
│   ├── React application
│   ├── State management
│   └── All user interfaces
└── Provider (Injected)
    ├── Wallet Standard
    ├── Event system
    └── dApp API
```

### Message Flow

```
dApp → Provider → Content Script → Background → Popup
                                              ↓
dApp ← Provider ← Content Script ← Background ← User Action
```

---

## Technical Specifications

### Browser Support

- Chrome 88+ (Manifest V3)
- Edge 88+ (Chromium-based)
- Brave (Chromium-based)

### Dependencies

| Category | Key Libraries |
|----------|--------------|
| Blockchain | @solana/web3.js, @solana/spl-token |
| Crypto | @scure/bip39, ed25519-hd-key, tweetnacl |
| Hardware | @ledgerhq/hw-app-solana, @trezor/connect-web |
| DeFi | @drift-labs/sdk, @coral-xyz/anchor |
| UI | React 19, lightweight-charts, lucide-react |
| Build | Vite 7, @crxjs/vite-plugin |

### Performance

- Lazy loading for heavy modules
- Token list caching
- Portfolio data batching
- Optimized re-renders

---

## Version

**Current Version:** 0.1.0

**Last Updated:** January 2025
