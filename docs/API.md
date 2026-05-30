# Walendria Protocol V3 API

Formerly Meridian Protocol.

Network: Base Mainnet
Contract: `0xAa1Ebd8604A209970A5DFa4dF259352D58980120`
Explorer: https://basescan.org/address/0xAa1Ebd8604A209970A5DFa4dF259352D58980120
Fee: starts at 0% on release, owner-adjustable and capped at 1%
Dead wallet: `0x000000000000000000000000000000000000dEaD`

Note: the current preferred V3 deployment starts with `feeBps = 0`. The owner can update `feeBps`, but the contract caps it at `MAX_FEE_BPS = 100` (1%).

## Mental Model

A table is a fixed buyer/seller escrow slot. Creation fixes authority. Funding comes later.

- Seller is fixed at creation.
- Buyer/controller is fixed at creation.
- Only buyer can fund.
- Buyer can release.
- Buyer can burn/dispute.
- Seller withdraws only after release.
- There is no refund, proof verifier, arbitrator, deadline, or timeout release.

## Functions verified from Solidity source

### createTable

```solidity
function createTable(address seller, address buyer) external returns (uint256 tableId)
```

Creates an empty open table.

### createEscrow

```solidity
function createEscrow(address seller, address buyer) external returns (uint256 tableId)
```

Alias for createTable, kept for old integrations.

### fund

```solidity
function fund(uint256 tableId) external payable
```

Only the fixed buyer can call. `msg.value` is added as native Base ETH for that table.

### fundToken

```solidity
function fundToken(uint256 tableId, address token, uint256 amount) external
```

Only the fixed buyer can call. Buyer must approve the WP contract first, then call `fundToken`. Do not direct-transfer ERC20 tokens to the contract as normal payment.

### release

```solidity
function release(uint256 tableId) external
```

Only the fixed buyer can call while the table is open and funded. It marks the table Released and snapshots seller/fee balances per asset. No funds are pushed during release.

### burn / dispute

```solidity
function burn(uint256 tableId) external
function dispute(uint256 tableId) external
```

Only the fixed buyer can call while the table is open and funded. Sends table assets to the dead wallet and marks the table Burned. `dispute` is an alias for burn. This is destructive settlement, not refund.

### claimTimeout

```solidity
function claimTimeout(uint256 tableId) external pure
```

Always reverts with `TimeoutDisabled`. Timeout release is intentionally removed.

### withdraw

```solidity
function withdraw(uint256 tableId, address token, uint256 amount) external
```

Only the fixed seller can call after release. Supports partial withdrawal per table and asset. Native ETH uses `address(0)`.

### withdrawFees

```solidity
function withdrawFees(uint256 tableId, address token, uint256 amount) external
```

Only the release-time fee wallet can call after release. While `feeBps` is 0, no normal fee balance accrues; this function remains for ABI compatibility if fees are later set within the 1% cap.

### getTable

```solidity
function getTable(uint256 tableId) external view returns (
  address seller,
  address buyer,
  uint256 fundedAmount,
  uint256 balance,
  uint256 withdrawnAmount,
  EscrowStatus status
)
```

EscrowStatus: `0=None`, `1=Open`, `2=Released`, `3=Burned`.

### getTableAssets

```solidity
function getTableAssets(uint256 tableId) external view returns (address[] memory assets)
```

Returns asset addresses used by this table. Native ETH is `address(0)`.

### getAssetBalance

```solidity
function getAssetBalance(uint256 tableId, address token) external view returns (
  uint256 fundedAmount,
  uint256 balance,
  uint256 sellerAmount,
  uint256 feeAmount,
  uint256 withdrawnAmount,
  uint256 feeWithdrawnAmount,
  uint256 burnedAmount
)
```

Reads per-table/per-asset accounting.

### quoteFee

```solidity
function quoteFee(uint256 amount) public view returns (uint256 feeAmount, uint256 sellerAmount)
```

Returns the current fee/seller split using live `feeBps`. On the preferred deployment this currently returns 0 fee while `feeBps` remains 0.

## Example Flow

1. Create table: `createTable(seller, buyer)`.
2. Native ETH: buyer calls `fund(tableId)` with ETH value.
3. ERC20: buyer approves WP contract, then calls `fundToken(tableId, token, amount)`.
4. Buyer chooses `release(tableId)` or `burn(tableId)`.
5. If released, seller calls `withdraw(tableId, token, amount)`.
6. If feeBps was nonzero at release, fee wallet calls `withdrawFees(tableId, token, amount)`.
