# Manaswap Wallet

Chrome extension wallet focused on fast, transparent interactions across Solana and the X1 fork (custom RPC). The project is built with Vite + React + TypeScript + Manifest V3 using the `@crxjs/vite-plugin` pipeline.

## Features (WIP)
- Single codebase for popup UI, full options page, background worker, content script, and injected provider shim (`window.manaswap`).
- Manual network switcher covering Solana Mainnet/Testnet and X1 Mainnet/Testnet, with automatic detection heuristics wired through the background service worker.
- Secure settings persistence via `chrome.storage` with default badge indicators for the active cluster.
- React-based surfaces with shared design tokens to keep the popup lightweight and performant.

## Getting Started

```bash
pnpm install
pnpm dev
```

The dev server watches all extension entry points and produces an unpacked build in `dist/`. Load the extension in Chrome via `chrome://extensions` → “Load unpacked” → select the `dist` folder.

To create a production build:

```bash
pnpm build
```

This runs TypeScript type-checking (`tsc -b`) before bundling.

## Project Structure

```
src/
├─ extension/        # Background worker + content script bootstrap
├─ pages/
│  ├─ popup/         # Popup React app (action UI)
│  └─ options/       # Options page React app
├─ provider/         # Injected provider shim exposed to websites
├─ shared/           # Network config, messaging contracts, settings helpers
├─ styles/           # Global style tokens
└─ manifest.ts       # Manifest V3 definition consumed by @crxjs/vite-plugin
```

`public/icons` contains the MV3 icon set used during packaging.

## Network Switching Cheat Sheet

```bash
# X1 Mainnet
solana config set --url https://rpc.mainnet.x1.xyz

# X1 Testnet
solana config set --url https://rpc.testnet.x1.xyz

# Solana Mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Solana Testnet
solana config set --url https://api.testnet.solana.com
```

Keep these commands handy when verifying RPC behavior outside of the extension (e.g., during CLI testing or integration test authoring).

## Tooling Notes
- Uses `pnpm` for dependency management. Local cache directories (`.pnpm-home`, `.pnpm-store`, `.npm-cache`) are ignored via `.gitignore`.
- ESLint flat config with React/Vite presets; run `pnpm lint` to lint all TypeScript/TSX sources.
- The CI workflow (see `.github/workflows/ci.yml`) installs dependencies with pnpm, runs lint, type-check, and build to ensure extension packaging remains deterministic.
