# Walendria Protocol V3

Base-layer escrow infrastructure for autonomous AI agents and digital work. Walendria Protocol V3 exposes fixed seller/buyer tables, buyer-only funding, buyer release, buyer burn/dispute, multi-asset accounting, and per-table withdrawals.

## First Principles: Release or Burn

The protocol uses a deliberately hard settlement rule:

- Create: a table fixes one seller wallet and one buyer/controller wallet.
- Fund: only the fixed buyer can fund the table, with any amount, after creation.
- Release: if the buyer accepts the result, funds become withdrawable by the seller with an absolute `0%` protocol fee.
- Burn: if the buyer rejects/disputes, the funded value is sent to the dead wallet.
- No timeout: `claimTimeout` intentionally reverts. A silent buyer does not auto-release funds to the seller.

This is a base protocol, not a consumer arbitration product. It does not verify proof, judge work, refund buyers, or resolve disputes. It only enforces the release-or-burn table rules committed on-chain.

## Mainnet Deployment

Zero-fee source status: this repository now compiles with `FEE_BPS = 0`. Existing on-chain deployments cannot be mutated; redeploy from this source before advertising a live Base address as absolute-zero-fee.

Network: Base Mainnet

Contract:

```text
0x0c60Cc8f75Bf2FFC5fF197b7897692603428d59D
```

Verified source:

```text
https://basescan.org/address/0x0c60Cc8f75Bf2FFC5fF197b7897692603428d59D#code
```

Deployment transaction:

```text
0xe1eb3be0cccf20f5b08715ed24f3582c0f791b0d80487ab4c8bc407195811c94
```

Fee wallet:

```text
0x9f87Eae58dDB89281FDF794CD3Bd13D3e2457a99
```

Platform fee: `0%` on `release`. `claimTimeout` is disabled and intentionally reverts.

## Testnet Deployment

Base Sepolia remains available for integration tests:

```text
https://sepolia.basescan.org/address/0x0c60Cc8f75Bf2FFC5fF197b7897692603428d59D
```

## Core Contract Flow

- `createTable(seller, buyer)` / `createEscrow(seller, buyer)` creates an empty table with fixed seller and buyer/controller.
- `fund(tableId)` is payable native ETH funding and can only be called by the fixed buyer.
- `fundToken(tableId, token, amount)` funds ERC20 assets after token approval; do not direct-transfer ERC20 tokens to the contract as normal wallet payments.
- `release(tableId)` snapshots seller withdrawable balances and records zero protocol fee.
- `burn(tableId)` / `dispute(tableId)` burns the table funds to `0x000000000000000000000000000000000000dEaD`.
- `claimTimeout(tableId)` intentionally reverts; timeout release is disabled.
- `withdraw(tableId, token, amount)` lets the seller withdraw released funds per table/asset.
- `withdrawFees(tableId, token, amount)` remains in the ABI for compatibility, but the protocol fee is zero so no fee balance accrues.

Settlement uses per-table pull-payment accounting:

- released seller amount is tracked on the table as `sellerAmount - withdrawnAmount`;
- released protocol fee is tracked as zero (`feeAmount == 0`);
- seller calls `withdraw(tableId, token, amount)`;
- there is no protocol-fee withdrawal in normal zero-fee operation.

Funds are not pushed during release; withdrawal is explicit and partial per table.

## Quick Start

Install and test locally:

```bash
npm install
npm run compile
npm test
npm run simulate:all
```

Deploy to Base Mainnet:

```bash
BASE_MAINNET_RPC_URL=https://mainnet.base.org
DEPLOYER_PRIVATE_KEY=0x...
FEE_WALLET=0x...

npm run deploy:base-mainnet
```

Mainnet deployment metadata is written to:

```text
deployments/base-mainnet.json
```

Run a Base Sepolia live test:

```bash
set LIVE_ESCROW_AMOUNT_ETH=0.000001
npm run live:happy:base-sepolia
```

Withdraw pending balance for the wallet configured in `.env`:

```bash
npm run live:withdraw:base-sepolia
```

## Environment

Create a local environment file:

```bash
copy .env.example .env
```

Required for deploy/live scripts:

```text
BASE_MAINNET_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_PRIVATE_KEY=0x...
FEE_WALLET=0x...
ETHERSCAN_API_KEY=...
```

Never commit `.env`.

## Python SDK Quick Start

Install dependencies:

```bash
cd sdk/python
python -m pip install -r requirements.txt
```

Set environment variables for Base Mainnet:

```bash
set AI_ESCROW_RPC_URL=https://mainnet.base.org
set AI_ESCROW_CONTRACT_ADDRESS=0x0c60Cc8f75Bf2FFC5fF197b7897692603428d59D
set AI_BUYER_PRIVATE_KEY=0x_buyer_agent_private_key
set AI_SELLER_ADDRESS=0x_seller_agent_wallet
set AI_ESCROW_CHAIN_ID=8453
set AI_ESCROW_AMOUNT_ETH=0.000001
set AI_ESCROW_DURATION_SECONDS=3600
```

Create an order and lock funds:

```bash
python ai_agent_escrow.py
```

Minimal Python usage:

```python
from ai_agent_escrow import AIAgentEscrowClient

client = AIAgentEscrowClient.from_env()

order = client.create_order_and_lock_funds(
    seller_address="0xSellerWallet",
    amount_eth="0.000001",
    duration_seconds=3600,
    metadata={"job": "agent-service-demo"},
)

print(order)
```

Withdraw pending balance:

```python
print(client.pending_withdrawal())
print(client.withdraw())
```

## Repository Layout

```text
contracts/                 Solidity contracts
contracts/test/            test helper contracts
deployments/               public deployment metadata
docs/                      API and simple user docs
scripts/                   local, deployment, and live network scripts
sdk/cpp/                   C++ wrapper using Foundry cast
sdk/python/                Python SDK wrapper
test/                      Hardhat test suite
```

## Verification

The Base Mainnet contract is verified on Basescan. To verify again after redeploying:

```bash
set ETHERSCAN_API_KEY=your_etherscan_v2_api_key

npm run hh -- verify --network baseMainnet ^
  <CONTRACT_ADDRESS> ^
  <INITIAL_OWNER> ^
  <FEE_WALLET> ^
  0x000000000000000000000000000000000000dEaD
```

## Security Notes

- Private keys must never be committed. Use local env files only.
- ERC20 funding must use approval + `fundToken`; direct token transfers are unaccounted surplus.
- `claimTimeout` is disabled. Silent buyers do not auto-release funds.
- Protocol fee is absolute zero in this source (`FEE_BPS = 0`); fee withdrawals remain ABI-compatible but normally have no balance.
- The contract is verified on Base Mainnet. Independent audit is still recommended before routing significant value through the protocol.
