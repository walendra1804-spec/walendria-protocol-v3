# Walendria Protocol V3

Base-layer escrow infrastructure for autonomous AI agents and digital work. Walendria Protocol V3 exposes fixed seller/buyer tables, buyer-only funding, buyer release, mandatory immutable timelock auto-release, buyer burn/dispute, multi-asset accounting, and per-table withdrawals.

## First Principles: Release or Burn

The protocol uses a deliberately hard settlement rule:

- Create: a table fixes one seller wallet and one buyer/controller wallet.
- Fund: only the fixed buyer can fund the table, with any amount, after creation.
- Release: if the buyer accepts the result, funds become withdrawable by the seller with an absolute `0%` starting protocol fee.
- Timelock auto-release: every table must be created with a public future auto-release timestamp; it cannot be changed after creation. After that timestamp, anyone can call `claimTimeLockRelease(tableId)` / `claimTimeout(tableId)` to release funded assets to seller accounting.
- Burn: if the buyer rejects/disputes before release, the funded value is sent to the dead wallet.
- No hidden keeper: “auto-release” is enforceable on-chain but still needs any wallet/agent to submit the claim transaction after the public timestamp is reached.

This is a base protocol, not a consumer arbitration product. It does not verify proof, judge work, refund buyers, or resolve disputes. It only enforces the release-or-burn table rules committed on-chain.

## Notes from Creator

### Original Indonesian note

> model transaksi jarak jauh yang lama adalah model yang bagus namun ada 1 masalah yaitu bahwa penengah(penahan dana) adalah manusia, yang bisa kolusi, bisa menipu, dan subjektif. kini masalah itu hilang semenjak kita memakai protokol ini untuk transaksi jarak jauh, penengah bukan lagi manusia, melainkan fungsi logika yang konsisten, dan tentunya tidak bisa disuap.
>
> secara desain game theory, protokol ini berhasil membuktikan bahwa ia menghilangkan seluruh potensi masalah dalam model transaksi jarak jauh dengan cara menghapus keuntungan apapun bagi pihak yang licik
>
> perlu diingat, protokol ini tidak dapat mencegah pihak irasional(yang tidak punya otak untuk menghitung apakah biaya resiko < potensi keuntungan atau tidak nya) serta pihak yang salah memutuskan sesuatu(beda dari niat)
>
> protokol ini adalah smart contract yang dideploy sekali (singleton). setiap transaksi baru hanya membuat 'table' baru di dalamnya, bukan kontrak baru. Ini membuat gas fee tetap rendah.
>
> untuk lengkapnya, bisa di cek ke walendria-protocol-v3/docs/whitepaper/

### English translation

The old long-distance transaction model was a good model, but it had one problem: the intermediary, the party holding the funds, was human. A human intermediary can collude, deceive, and act subjectively. That problem disappears when we use this protocol for long-distance transactions. The intermediary is no longer a human; it is a consistent logic function, and of course it cannot be bribed.

From a game-theory design perspective, this protocol proves that it removes the potential problems in the long-distance transaction model by removing any possible advantage for a dishonest party.

It should be remembered that this protocol cannot prevent irrational parties, meaning parties that do not think through whether the cost of risk is lower than the potential gain, nor can it prevent parties from making the wrong decision by mistake, which is different from malicious intent.

This protocol is a smart contract deployed once as a singleton. Every new transaction only creates a new “table” inside it, not a new contract. This keeps gas fees low.

For the full explanation, see `walendria-protocol-v3/docs/whitepaper/`.

## Whitepaper

The project includes two whitepaper versions under `docs/whitepaper/`:

- `WALENDRIA_PROTOCOL_ORIGINAL.pdf` — original raw Indonesian draft by Panca Walendra Putra.
- `WALENDRIA_PROTOCOL_ENGLISH.pdf` — refined English version for public readers and protocol review.

## Mainnet Deployment

Network: Base Mainnet

Current preferred contract:

```text
0xACA2c8EB39A0999C6e6AEAB72F65623266007eB3
```

Verified source:

```text
https://basescan.org/address/0xACA2c8EB39A0999C6e6AEAB72F65623266007eB3#code
```

Deployment transaction:

```text
0x73a3a915411f8b4105ec4982f05f1223036cb2961d69209b95698c734f0bea8e
```

Fee wallet:

```text
0x9f87Eae58dDB89281FDF794CD3Bd13D3e2457a99
```

Platform fee: starts at `0%` on `release`; owner-adjustable but capped by `MAX_FEE_BPS = 100` (1%). Timelock auto-release is mandatory at creation, immutable after creation, and publicly readable.

## Testnet Deployment

Base Sepolia latest pure-protocol test deployment:

```text
0xb6E0304622C966b888C91D098a9d45c9A1847098
```

Explorer:

```text
https://sepolia.basescan.org/address/0xb6E0304622C966b888C91D098a9d45c9A1847098
```

This deployment was used for direct buyer/seller adversarial testing with the current V3 ABI: create table, fund, release, burn, timelock claim, and seller withdraw. It is a testnet deployment only.

## Core Contract Flow

- `createTable(seller, buyer, autoReleaseTime)` / `createEscrow(seller, buyer, autoReleaseTime)` creates an empty table with fixed seller, fixed buyer/controller, and a mandatory future auto-release timestamp.
- `fund(tableId)` is payable native ETH funding and can only be called by the fixed buyer.
- `fundToken(tableId, token, amount)` funds ERC20 assets after token approval; do not direct-transfer ERC20 tokens to the contract as normal wallet payments.
- `release(tableId)` snapshots seller withdrawable balances and records zero protocol fee.
- `burn(tableId)` / `dispute(tableId)` burns the table funds to `0x000000000000000000000000000000000000dEaD`.
- `claimTimeLockRelease(tableId)` / `claimTimeout(tableId)` can be called by anyone after the timelock timestamp to release funded assets to seller accounting.
- `withdraw(tableId, token, amount)` lets the seller withdraw released funds per table/asset.
- `withdrawFees(tableId, token, amount)` remains in the ABI for compatibility, but the protocol fee is zero so no fee balance accrues.

Settlement uses per-table pull-payment accounting:

- released seller amount is tracked on the table as `sellerAmount - withdrawnAmount`;
- released protocol fee is tracked as zero (`feeAmount == 0`);
- seller calls `withdraw(tableId, token, amount)`;
- there is no protocol-fee withdrawal in normal zero-fee operation.

Funds are not pushed during release; withdrawal is explicit and partial per table.

## Public CLI Quick Start

Landing page / installer:

```text
http://203.175.125.140:22054/wp
```

Install:

```bash
curl -fsSL http://203.175.125.140:22054/wpinstall.sh | sh
```

Use a hot-wallet key for actions that write to Base. `WP_YES=1` is useful for AI agents and scripts that cannot answer interactive prompts.

```bash
export WP_PRIVATE_KEY=0xYOUR_HOT_WALLET_PRIVATE_KEY
export WP_YES=1

wp 0xSELLER 0xBUYER --timelock 1h
wp 0xCONTRACT:42
wp 0xCONTRACT:42 timelock
wp 0xCONTRACT:42 auto-release
wp 0xCONTRACT:42 +0.05:ETH
wp 0xCONTRACT:42 release
wp 0xCONTRACT:42 -0.05:ETH
```

No funded live demo table has been created on the current redeployment yet. See `docs/LIVE_CLI_DEMO.md` for the deployment and verification links.

## Pure Protocol Usage

For people who want to try the protocol directly on Base Sepolia without the Walendria app, CLI, SDK, backend, or a human mediator, read:

```text
docs/PURE_PROTOCOL_USAGE.md
```

It shows the exact on-chain table flow: create table, fund, release, burn, timelock release, withdraw, and raw read verification.

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
set AI_ESCROW_CONTRACT_ADDRESS=0xACA2c8EB39A0999C6e6AEAB72F65623266007eB3
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
cli/wp                     Public WP CLI source used by the landing installer
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
- Timelock auto-release is mandatory per table. It is fixed at creation; after expiry, any wallet can call the release claim transaction.
- Current preferred deployment starts at 0% fee, but `feeBps` is owner-adjustable and capped at 1% (`MAX_FEE_BPS = 100`). Fee withdrawals remain ABI-compatible and normally have no balance while fee is 0.
- The contract is verified on Base Mainnet. Independent audit is still recommended before routing significant value through the protocol.
