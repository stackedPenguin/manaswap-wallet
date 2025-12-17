# X1 vs Solana: Token Balance Fetching

## Core Similarity

X1 is **Solana-compatible** - same RPC methods, same account structure, same token programs. The only difference is the RPC endpoint.

## How to Fetch Balances

### 1. Native Token Balance (XNT on X1, SOL on Solana)

```typescript
const response = await fetch(RPC_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getBalance',
    params: [walletAddress]
  })
});
// Returns: { result: { value: lamports } }
// Convert: balance = lamports / 1e9
```

### 2. SPL Token Balances (both chains)

```typescript
const tokenResponse = await fetch(RPC_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenAccountsByOwner',
    params: [
      walletAddress,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },  // SPL Token
      { encoding: 'jsonParsed' }
    ]
  })
});
// Also fetch Token-2022:
// { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' }
```

## Key Differences

| Aspect         | Solana                              | X1                         |
|----------------|-------------------------------------|----------------------------|
| RPC Endpoint   | https://api.mainnet-beta.solana.com | https://rpc.mainnet.x1.xyz |
| Native Token   | SOL                                 | XNT                        |
| Decimals       | 9                                   | 9                          |
| Price APIs     | Jupiter, Birdeye, CoinGecko         | ❌ **Not supported**       |
| Token Registry | Solana Token List, Jupiter          | None/Custom                |

## The Price Problem

This is the **main difference**. On Solana you can:

```typescript
// Jupiter price API
fetch(`https://price.jup.ag/v4/price?ids=${mintAddress}`)

// Birdeye
fetch(`https://public-api.birdeye.so/public/price?address=${mint}`)
```

**On X1**: Jupiter, Birdeye, CoinGecko, etc. **do NOT index X1 tokens**. Solutions:

1. **Hardcode prices** (like Backpack does with XNT = $1.00) ✅ *We use this*
2. Build your own price oracle
3. Use X1-specific DEX APIs (if any exist)
4. Run your own indexer tracking DEX swaps

## Our Implementation

In `MainWallet.tsx`, we:

1. **Filter by selected network** - Only show assets from the currently selected network
2. **Hardcode XNT = $1.00** - Since no price APIs support X1 tokens
3. **Skip Jupiter Perps** on X1 networks - Perps only exist on Solana mainnet

```typescript
// X1 networks: use hardcoded $1 price for XNT
const price = selectedNetwork.kind === 'x1' 
  ? 1.0  // XNT hardcoded to $1
  : (prices.get('So11111111111111111111111111111111111111112') || 0);
```

## Minimal Implementation

```typescript
const X1_RPC = 'https://rpc.mainnet.x1.xyz';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

async function getWalletBalances(address: string, chain: 'x1' | 'solana') {
  const rpc = chain === 'x1' ? X1_RPC : SOLANA_RPC;

  // Native balance
  const native = await rpcCall(rpc, 'getBalance', [address]);

  // SPL tokens (both Token Program and Token-2022)
  const spl = await rpcCall(rpc, 'getTokenAccountsByOwner', [
    address,
    { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
    { encoding: 'jsonParsed' }
  ]);

  const token2022 = await rpcCall(rpc, 'getTokenAccountsByOwner', [
    address,
    { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' },
    { encoding: 'jsonParsed' }
  ]);

  return {
    native: native.value / 1e9,
    tokens: [...spl.value, ...token2022.value].map(acc => ({
      mint: acc.account.data.parsed.info.mint,
      balance: acc.account.data.parsed.info.tokenAmount.uiAmount,
      decimals: acc.account.data.parsed.info.tokenAmount.decimals
    }))
  };
}
```

## TL;DR

- **Fetching balances**: Identical to Solana, just swap RPC URL
- **Fetching prices**: You're on your own - no Jupiter/Birdeye/CoinGecko support for X1 tokens
- **We use $1.00 for XNT** as the hardcoded price
