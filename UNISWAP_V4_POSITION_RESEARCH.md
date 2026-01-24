# Uniswap V4 LP Position Value Calculation - Research Summary

## Overview
This document provides research findings on how to decode Uniswap V4 position information and calculate token amounts from liquidity positions.

**Your Position Data:**
- tokenId: (your tokenId)
- liquidity: 30851
- token0/token1: WBTC/USDC
- fee: 3000 (0.3%)
- positionInfo bytes32: `b98437c7ba28c6590dd4e1cc46aa89eed181f97108e5b622170d89b4f2764c00`
- PositionManager address: `0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e` (Ethereum)

---

## 1. Decoding PositionInfo bytes32

### TypeScript Implementation

The PositionInfo is packed into a bytes32 value with the following layout:
- **Bits 0-7**: hasSubscriber flag (1 byte)
- **Bits 8-31**: tickLower (24 bits / 3 bytes)
- **Bits 32-55**: tickUpper (24 bits / 3 bytes)
- **Bits 56+**: poolId and other data

```typescript
interface PackedPositionInfo {
  getTickUpper(): number
  getTickLower(): number
  hasSubscriber(): boolean
}

function decodePositionInfo(value: bigint): PackedPositionInfo {
  return {
    getTickUpper: () => {
      const raw = Number((value >> 32n) & 0xffffffn)
      return raw >= 0x800000 ? raw - 0x1000000 : raw
    },
    getTickLower: () => {
      const raw = Number((value >> 8n) & 0xffffffn)
      return raw >= 0x800000 ? raw - 0x1000000 : raw
    },
    hasSubscriber: () => (value & 0xffn) !== 0n,
  }
}

// Example usage with your positionInfo:
const positionInfo = 0xb98437c7ba28c6590dd4e1cc46aa89eed181f97108e5b622170d89b4f2764c00n
const decoded = decodePositionInfo(positionInfo)

console.log('tickLower:', decoded.getTickLower())
console.log('tickUpper:', decoded.getTickUpper())
console.log('hasSubscriber:', decoded.hasSubscriber())
```

**Key Points:**
- Both ticks use two's complement for negative values (>= 0x800000 indicates negative)
- The encoding uses efficient bitwise operations to pack data into a single storage slot
- Source: [Uniswap PositionInfo Documentation](https://docs.uniswap.org/contracts/v4/reference/periphery/libraries/PositionInfoLibrary)

---

## 2. Getting Current Pool Price/Tick

### Using StateView Contract (Recommended for Off-chain Reads)

The StateView contract provides a convenient way to read pool state without needing to interact directly with PoolManager storage.

**StateView Contract Address:** `0x7ffe42c4a5deea5b0fec41c94c136cf115597227` (Ethereum)

```typescript
import { ethers } from 'ethers'

// StateView ABI - getSlot0 function
const stateViewAbi = [
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)"
]

async function getPoolState(poolId: string) {
  const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL')
  const stateView = new ethers.Contract(
    '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
    stateViewAbi,
    provider
  )

  const { sqrtPriceX96, tick, protocolFee, lpFee } = await stateView.getSlot0(poolId)

  return {
    sqrtPriceX96,
    tick,
    protocolFee,
    lpFee
  }
}
```

### Understanding Slot0 Returns

The `getSlot0` function returns:
- **sqrtPriceX96** (uint160): The square root of the price ratio (token1/token0) in Q96 fixed-point format
- **tick** (int24): The current tick of the pool
- **protocolFee** (uint24): The protocol fee of the pool
- **lpFee** (uint24): The swap fee of the pool

**sqrtPriceX96 Explanation:**
- Represents sqrt(price) multiplied by 2^96
- Price = (sqrtPriceX96 / 2^96)^2
- This is the ratio of token1 to token0

**Source:** [Uniswap StateView Documentation](https://docs.uniswap.org/contracts/v4/reference/periphery/lens/StateView)

### Getting PoolId from PoolKey

You need the PoolKey to generate the PoolId:

```typescript
import { PoolKey } from '@uniswap/v4-core'

// You can get PoolKey from getPoolAndPositionInfo
// or construct it manually:
const poolKey = {
  currency0: '0x...',  // WBTC address
  currency1: '0x...',  // USDC address
  fee: 3000,
  tickSpacing: 60,
  hooks: '0x0000000000000000000000000000000000000000'
}

// Generate PoolId (keccak256 hash of key components)
const poolId = ethers.keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint24', 'int24', 'address'],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  )
)
```

**Source:** [Uniswap Reading Pool State Guide](https://docs.uniswap.org/contracts/v4/guides/read-pool-state)

---

## 3. Calculating Token Amounts from Liquidity

### Using @uniswap/v4-sdk (Recommended)

**Installation:**
```bash
npm install @uniswap/v4-sdk
```

### Method 1: Create Position from Existing Liquidity

```typescript
import { Position, Pool } from '@uniswap/v4-sdk'
import { Token } from '@uniswap/sdk-core'

// 1. Create Token objects
const WBTC = new Token(
  1, // chainId (Ethereum mainnet)
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC address
  8, // decimals
  'WBTC',
  'Wrapped Bitcoin'
)

const USDC = new Token(
  1,
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC address
  6, // decimals
  'USDC',
  'USD Coin'
)

// 2. Get pool state from StateView
const { sqrtPriceX96, tick } = await getPoolState(poolId)

// 3. Create Pool instance
const pool = new Pool(
  WBTC,
  USDC,
  3000, // fee
  60, // tickSpacing
  '0x0000000000000000000000000000000000000000', // hooks (if any)
  sqrtPriceX96.toString(),
  0, // pool liquidity (can be 0 for calculations)
  tick
)

// 4. Create Position from your existing liquidity
const position = new Position({
  pool,
  liquidity: '30851', // Your liquidity amount
  tickLower: -887220, // Decoded from positionInfo
  tickUpper: 887220   // Decoded from positionInfo
})

// 5. Get token amounts
console.log('Token0 (WBTC) amount:', position.amount0.toExact())
console.log('Token1 (USDC) amount:', position.amount1.toExact())
```

**Source:** [Uniswap V4 SDK Position Reference](https://docs.uniswap.org/sdk/v4/reference/classes/Position)

### Method 2: Using Position.fromAmounts (Alternative)

If you want to create a position from desired amounts:

```typescript
import { Position, Pool, CurrencyAmount } from '@uniswap/v4-sdk'

const position = Position.fromAmounts({
  pool,
  tickLower,
  tickUpper,
  amount0: amount0Desired,
  amount1: amount1Desired,
  useFullPrecision: true, // Use full precision for maximum accuracy
})

// Access calculated values
console.log('Position liquidity:', position.liquidity.toString())
console.log('Token0 amount:', position.amount0.toExact())
console.log('Token1 amount:', position.amount1.toExact())
console.log('Mint amounts:', position.mintAmounts)
```

**Source:** [Uniswap V4 SDK Position Minting Guide](https://docs.uniswap.org/sdk/v4/guides/liquidity/position-minting)

---

## 4. Low-Level Calculation (Without SDK)

If you need to calculate without the SDK, you can use the LiquidityAmounts library math:

### Understanding the Math

The formulas are the same as Uniswap V3:

**When current price is below the range (currentTick < tickLower):**
- amount0 = liquidity * (sqrt(P_upper) - sqrt(P_lower)) / (sqrt(P_upper) * sqrt(P_lower))
- amount1 = 0

**When current price is in the range (tickLower <= currentTick <= tickUpper):**
- amount0 = liquidity * (sqrt(P_upper) - sqrt(P_current)) / (sqrt(P_upper) * sqrt(P_current))
- amount1 = liquidity * (sqrt(P_current) - sqrt(P_lower))

**When current price is above the range (currentTick > tickUpper):**
- amount0 = 0
- amount1 = liquidity * (sqrt(P_upper) - sqrt(P_lower))

Where P = price in sqrtPriceX96 format (divided by 2^96 and squared for actual price)

### Reference Implementation

The Solidity implementation is available in:
- [LiquidityAmounts.sol](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/LiquidityAmounts.sol)

**Source:** [Uniswap V4 LiquidityAmounts Documentation](https://docs.uniswap.org/contracts/v4/reference/core/libraries/liquidity-amounts)

---

## 5. Complete Example Workflow

Here's a complete example putting it all together:

```typescript
import { ethers } from 'ethers'
import { Position, Pool } from '@uniswap/v4-sdk'
import { Token } from '@uniswap/sdk-core'

// Step 1: Decode your positionInfo bytes32
const positionInfoBytes32 = '0xb98437c7ba28c6590dd4e1cc46aa89eed181f97108e5b622170d89b4f2764c00'
const positionInfo = BigInt(positionInfoBytes32)

const tickLower = (() => {
  const raw = Number((positionInfo >> 8n) & 0xffffffn)
  return raw >= 0x800000 ? raw - 0x1000000 : raw
})()

const tickUpper = (() => {
  const raw = Number((positionInfo >> 32n) & 0xffffffn)
  return raw >= 0x800000 ? raw - 0x1000000 : raw
})()

console.log('tickLower:', tickLower)
console.log('tickUpper:', tickUpper)

// Step 2: Get PoolId from PositionManager
const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL')
const positionManager = new ethers.Contract(
  '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
  ['function getPoolAndPositionInfo(uint256 tokenId) external view returns (tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bytes32 positionInfo)'],
  provider
)

const { poolKey } = await positionManager.getPoolAndPositionInfo(YOUR_TOKEN_ID)

// Generate poolId
const poolId = ethers.keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint24', 'int24', 'address'],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  )
)

// Step 3: Get current pool state
const stateView = new ethers.Contract(
  '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
  ['function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)'],
  provider
)

const { sqrtPriceX96, tick } = await stateView.getSlot0(poolId)

// Step 4: Create Token objects
const WBTC = new Token(1, poolKey.currency0, 8, 'WBTC', 'Wrapped Bitcoin')
const USDC = new Token(1, poolKey.currency1, 6, 'USDC', 'USD Coin')

// Step 5: Create Pool
const pool = new Pool(
  WBTC,
  USDC,
  poolKey.fee,
  poolKey.tickSpacing,
  poolKey.hooks,
  sqrtPriceX96.toString(),
  0,
  tick
)

// Step 6: Create Position with your liquidity
const position = new Position({
  pool,
  liquidity: '30851',
  tickLower,
  tickUpper
})

// Step 7: Get token amounts
const wbtcAmount = position.amount0.toExact()
const usdcAmount = position.amount1.toExact()

console.log('WBTC amount:', wbtcAmount)
console.log('USDC amount:', usdcAmount)
console.log('Position value in USD:', calculateUSD(wbtcAmount, usdcAmount))
```

---

## 6. Key Resources & Documentation

### Official Uniswap V4 Documentation
- [PositionInfo Library](https://docs.uniswap.org/contracts/v4/reference/periphery/libraries/PositionInfoLibrary)
- [Position Manager](https://docs.uniswap.org/contracts/v4/reference/periphery/PositionManager)
- [StateView Contract](https://docs.uniswap.org/contracts/v4/reference/periphery/lens/StateView)
- [Reading Pool State Guide](https://docs.uniswap.org/contracts/v4/guides/read-pool-state)
- [LiquidityAmounts Library](https://docs.uniswap.org/contracts/v4/reference/core/libraries/liquidity-amounts)
- [Slot0 Documentation](https://docs.uniswap.org/contracts/v4/reference/core/types/Slot0)

### SDK Documentation
- [Uniswap V4 SDK Overview](https://docs.uniswap.org/sdk/v4/overview)
- [Position Class Reference](https://docs.uniswap.org/sdk/v4/reference/classes/Position)
- [Position Minting Guide](https://docs.uniswap.org/sdk/v4/guides/liquidity/position-minting)
- [Fetching Positions Guide](https://docs.uniswap.org/sdk/v4/guides/liquidity/position-fetching)
- [Adding/Removing Liquidity Guide](https://docs.uniswap.org/sdk/v4/guides/liquidity/add-remove-liquidity)
- [Fetching Pool Data Guide](https://docs.uniswap.org/sdk/v4/guides/advanced/pool-data)

### GitHub Repositories
- [v4-core](https://github.com/Uniswap/v4-core) - Core smart contracts
- [v4-periphery](https://github.com/Uniswap/v4-periphery) - Periphery contracts including PositionManager
- [StateLibrary.sol](https://github.com/Uniswap/v4-core/blob/main/src/libraries/StateLibrary.sol)
- [Pool.sol](https://github.com/Uniswap/v4-core/blob/main/src/libraries/Pool.sol)
- [LiquidityAmounts.sol](https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/LiquidityAmounts.sol)
- [TickMath.sol](https://github.com/Uniswap/v4-core/blob/main/src/libraries/TickMath.sol)

### NPM Packages
- [@uniswap/v4-sdk](https://www.npmjs.com/package/@uniswap/v4-sdk) - Latest: v1.24.0
- [@uniswap/sdk-core](https://www.npmjs.com/package/@uniswap/sdk-core) - Core utilities (Token, CurrencyAmount, etc.)

### Math Primers
- [Uniswap V3 Math Primer](https://blog.uniswap.org/uniswap-v3-math-primer) - Math is the same for V4
- [Uniswap V3 Math Primer Part 2](https://blog.uniswap.org/uniswap-v3-math-primer-2)
- [Square Root Price Explanation](https://rareskills.io/post/uniswap-v3-sqrtpricex96)
- [Liquidity Math Technical Note](https://atiselsts.github.io/pdfs/uniswap-v3-liquidity-math.pdf)

### Contract Addresses (Ethereum Mainnet)
- **PositionManager**: `0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e`
- **StateView**: `0x7ffe42c4a5deea5b0fec41c94c136cf115597227`

---

## 7. Important Notes

1. **Liquidity Math**: The liquidity math in Uniswap V4 is identical to V3, so V3 resources and math explanations are still applicable.

2. **Price Precision**: sqrtPriceX96 uses Q64.96 fixed-point format for high precision. To get the actual price ratio:
   ```
   price = (sqrtPriceX96 / 2^96)^2
   ```

3. **Tick Spacing**: The tick spacing (60 for 0.3% fee tier) determines which ticks are valid for position boundaries.

4. **Token Ordering**: In Uniswap, token0 is always the lower address, token1 is the higher address. Make sure to respect this ordering.

5. **Position Value**: To get the USD value, you need to:
   - Calculate token amounts using the methods above
   - Fetch current prices for WBTC and USDC
   - Multiply: `value = (amount0 * wbtcPrice) + (amount1 * usdcPrice)`

6. **Hooks**: V4 introduces hooks which can modify pool behavior. Check if your pool has hooks enabled (non-zero hooks address).

7. **Reading State On-chain vs Off-chain**:
   - **Off-chain**: Use StateView contract (gas efficient for reading)
   - **On-chain (in contracts)**: Use StateLibrary.sol directly

---

## Summary

To calculate your Uniswap V4 LP position value:

1. **Decode positionInfo** bytes32 to get tickLower and tickUpper using bitwise operations
2. **Get current pool state** (sqrtPriceX96 and tick) using StateView.getSlot0(poolId)
3. **Use @uniswap/v4-sdk** Position class with your liquidity amount to calculate token0 and token1 amounts
4. **Convert to USD** by multiplying token amounts by their respective prices

The SDK handles all the complex math internally, making it the easiest approach for most use cases.
