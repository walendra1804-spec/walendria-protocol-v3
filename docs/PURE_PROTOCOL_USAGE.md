# Pure Protocol Usage Guide (Base Sepolia)

This file explains how a new user can try Walendria Protocol V3 directly on-chain, without the Walendria app, CLI, SDK, backend, or any private helper.

"Pure" here means:

- You interact with the deployed smart contract directly.
- The protocol state lives on Base Sepolia.
- No Walendria server decides anything for you.
- No human intermediary holds or judges the money.
- You still need the normal blockchain primitives: a wallet/signer, Base Sepolia ETH for gas, an RPC/explorer, and the contract ABI/function names.

Use testnet first. Do not use real mainnet funds until you understand the flow.

## 1. Current Base Sepolia contract

Network:

```text
Base Sepolia
Chain ID: 84532
RPC: https://sepolia.base.org
Native gas token: testnet ETH on Base Sepolia
```

Current pure-protocol test deployment:

```text
0xb6E0304622C966b888C91D098a9d45c9A1847098
```

Explorer:

```text
https://sepolia.basescan.org/address/0xb6E0304622C966b888C91D098a9d45c9A1847098
```

Native token sentinel used by the contract:

```text
0x0000000000000000000000000000000000000000
```

Dead/burn wallet:

```text
0x000000000000000000000000000000000000dEaD
```

## 2. Roles in one transaction table

A Walendria transaction is a `table` inside the singleton contract.

Each table has:

- seller: the wallet that can withdraw after release.
- buyer: the only wallet allowed to fund, release, or burn before timelock release.
- autoReleaseTime: a Unix timestamp in the future. After this time, anyone can call the timelock release function.
- status:
  - `0` = None
  - `1` = Open
  - `2` = Released
  - `3` = Burned

Important design rule:

- If the buyer accepts the result: buyer calls `release(tableId)`.
- If the buyer rejects/disputes before release: buyer calls `burn(tableId)`.
- If the buyer disappears and the timelock has passed: anyone calls `claimTimeLockRelease(tableId)`.
- After release/timelock release, the seller calls `withdraw(tableId, token, amount)`.

The contract does not judge work quality. It only enforces the table logic.

## 3. Minimal native ETH flow

This is the simplest test flow:

1. Prepare two wallets:
   - buyer wallet
   - seller wallet
2. Fund the buyer wallet with small Base Sepolia test ETH.
3. Create a table.
4. Buyer funds the table.
5. Choose one ending:
   - buyer releases to seller, or
   - buyer burns to dead wallet, or
   - wait until timelock and call public timelock release.
6. If released, seller withdraws.

Do not send ETH directly to the contract address with a normal wallet transfer. Use the payable `fund(tableId)` function so the contract can account the money to the correct table.

## 4. Direct function reference

### Read functions

```text
nextEscrowId() -> uint256
escrows(uint256 tableId) -> seller, buyer, releaseFeeWallet, status, creator, autoReleaseTime
assetBalances(uint256 tableId, address token) -> fundedAmount, sellerAmount, feeAmount, withdrawnAmount, feeWithdrawnAmount, burnedAmount, exists
feeBps() -> uint16
feeWallet() -> address
deadWallet() -> address
```

For native ETH, use token address:

```text
0x0000000000000000000000000000000000000000
```

### Write functions

```text
createTable(address seller, address buyer, uint64 autoReleaseTime) -> tableId
fund(uint256 tableId) payable
release(uint256 tableId)
burn(uint256 tableId)
claimTimeLockRelease(uint256 tableId)
withdraw(uint256 tableId, address token, uint256 amount)
```

Aliases also exist:

```text
createEscrow(address seller, address buyer, uint64 autoReleaseTime)
dispute(uint256 tableId)
claimTimeout(uint256 tableId)
```

## 5. Method A: use Basescan directly

This is the most beginner-friendly pure-contract path if the explorer shows the contract ABI/write interface.

Open:

```text
https://sepolia.basescan.org/address/0xb6E0304622C966b888C91D098a9d45c9A1847098#writeContract
```

Connect the buyer wallet on Base Sepolia.

### Step A1: create a table

Call:

```text
createTable(seller, buyer, autoReleaseTime)
```

Example inputs:

```text
seller = 0xSELLER_WALLET
buyer = 0xBUYER_WALLET
autoReleaseTime = a Unix timestamp in the future, for example current time + 3600 seconds
```

After the transaction confirms, find the `TableCreated` event in the transaction logs. It contains `tableId`.

You can also read:

```text
nextEscrowId()
```

The newest table id is normally the latest value returned by `nextEscrowId()` after your creation transaction.

### Step A2: fund the table

Still connected as buyer, call payable function:

```text
fund(tableId)
```

Set the transaction value to a tiny testnet amount, for example:

```text
0.00001 ETH
```

After confirmation, read:

```text
assetBalances(tableId, 0x0000000000000000000000000000000000000000)
```

Expected:

```text
fundedAmount > 0
exists = true
```

### Step A3 option 1: buyer releases

Connected as buyer, call:

```text
release(tableId)
```

After confirmation, read:

```text
escrows(tableId)
assetBalances(tableId, 0x0000000000000000000000000000000000000000)
```

Expected:

```text
status = 2
sellerAmount > 0
feeAmount = 0 when feeBps is 0
```

### Step A4 option 1: seller withdraws

Switch/connect as seller, call:

```text
withdraw(tableId, 0x0000000000000000000000000000000000000000, amount)
```

`amount` is in wei.

Example:

```text
0.00001 ETH = 10000000000000 wei
```

After confirmation, read `assetBalances` again.

Expected:

```text
withdrawnAmount increased
sellerAmount - withdrawnAmount = remaining withdrawable amount
```

### Step A3 option 2: buyer burns

If the buyer rejects before release, connected as buyer call:

```text
burn(tableId)
```

After confirmation, read:

```text
escrows(tableId)
assetBalances(tableId, 0x0000000000000000000000000000000000000000)
```

Expected:

```text
status = 3
burnedAmount > 0
sellerAmount = 0
```

### Step A3 option 3: timelock release

Wait until the table's `autoReleaseTime` has passed.

Then any wallet can call:

```text
claimTimeLockRelease(tableId)
```

After confirmation, expected:

```text
status = 2
sellerAmount > 0
```

Then the seller withdraws using the same `withdraw` step above.

Important: timelock release is permissionless, not magical. The chain will not submit a transaction by itself. After the timestamp, any wallet/agent must call `claimTimeLockRelease(tableId)`.

## 6. Method B: use raw direct contract calls with Foundry `cast`

This path is still pure protocol because it calls the contract directly. `cast` is only a signer/RPC tool, not a Walendria app.

Set variables:

```bash
export RPC_URL=https://sepolia.base.org
export CONTRACT=0xb6E0304622C966b888C91D098a9d45c9A1847098
export BUYER_PK=0xYOUR_BUYER_TESTNET_PRIVATE_KEY
export SELLER_PK=0xYOUR_SELLER_TESTNET_PRIVATE_KEY
export BUYER=0xBUYER_WALLET
export SELLER=0xSELLER_WALLET
export NATIVE=0x0000000000000000000000000000000000000000
```

Never use a wallet with real funds for testing. Never commit private keys.

Create an auto-release timestamp 1 hour from now:

```bash
export AUTO_RELEASE_TIME=$(($(date +%s) + 3600))
```

Create the table:

```bash
cast send $CONTRACT \
  "createTable(address,address,uint64)" \
  $SELLER \
  $BUYER \
  $AUTO_RELEASE_TIME \
  --rpc-url $RPC_URL \
  --private-key $BUYER_PK
```

Read newest table id:

```bash
cast call $CONTRACT "nextEscrowId()(uint256)" --rpc-url $RPC_URL
```

Set it:

```bash
export TABLE_ID=1
```

Fund with `0.00001` ETH:

```bash
cast send $CONTRACT \
  "fund(uint256)" \
  $TABLE_ID \
  --value 0.00001ether \
  --rpc-url $RPC_URL \
  --private-key $BUYER_PK
```

Read table:

```bash
cast call $CONTRACT \
  "escrows(uint256)(address,address,address,uint8,address,uint64)" \
  $TABLE_ID \
  --rpc-url $RPC_URL
```

Read native ETH accounting:

```bash
cast call $CONTRACT \
  "assetBalances(uint256,address)(uint256,uint256,uint256,uint256,uint256,uint256,bool)" \
  $TABLE_ID \
  $NATIVE \
  --rpc-url $RPC_URL
```

Release path:

```bash
cast send $CONTRACT \
  "release(uint256)" \
  $TABLE_ID \
  --rpc-url $RPC_URL \
  --private-key $BUYER_PK
```

Seller withdraws `0.00001` ETH:

```bash
cast send $CONTRACT \
  "withdraw(uint256,address,uint256)" \
  $TABLE_ID \
  $NATIVE \
  10000000000000 \
  --rpc-url $RPC_URL \
  --private-key $SELLER_PK
```

Burn path instead of release:

```bash
cast send $CONTRACT \
  "burn(uint256)" \
  $TABLE_ID \
  --rpc-url $RPC_URL \
  --private-key $BUYER_PK
```

Timelock path instead of manual buyer release:

```bash
cast send $CONTRACT \
  "claimTimeLockRelease(uint256)" \
  $TABLE_ID \
  --rpc-url $RPC_URL \
  --private-key $BUYER_PK
```

Any wallet can call the timelock release after the timestamp, not only the buyer.

## 7. Method C: raw JSON-RPC reads with `curl`

Reads can be done without a wallet. The examples below use raw JSON-RPC `eth_call`.

Function selectors:

```text
nextEscrowId() = 0x89cb29dd
feeBps() = 0x24a9d853
feeWallet() = 0xf25f4b56
deadWallet() = 0x85141a77
escrows(uint256) = 0x012f52ee
assetBalances(uint256,address) = 0xb6a4c798
```

Read `nextEscrowId()`:

```bash
curl -s https://sepolia.base.org \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0xb6E0304622C966b888C91D098a9d45c9A1847098","data":"0x89cb29dd"},"latest"]}'
```

For write transactions with pure JSON-RPC, you must locally sign a transaction and submit it through `eth_sendRawTransaction`. That is possible, but it is intentionally not shown as the beginner path because manual signing is easy to get wrong. Use a wallet, Basescan, or `cast` as the signer while still calling the contract directly.

## 8. Common mistakes

1. Using the wrong network. The test guide is Base Sepolia, chain id `84532`, not Ethereum Sepolia and not Base Mainnet.
2. Sending normal ETH transfer directly to the contract. Use `fund(tableId)` with transaction value.
3. Creating a table with an auto-release timestamp in the past. The contract will revert with `InvalidTimeLock()`.
4. Funding from a wallet that is not the fixed buyer. The contract will revert with `OnlyBuyer()`.
5. Trying to withdraw before release. The contract will revert with `TableNotReleased()`.
6. Expecting the chain to auto-submit the timelock transaction. Someone must call `claimTimeLockRelease(tableId)` after the timestamp.
7. Treating `release()` as a direct push payment. Release only accounts the seller balance; the seller still calls `withdraw()`.
8. Mixing wei and ETH. Contract amounts are integers in wei.

## 9. What to show as proof that the protocol worked

For a clean test report, save these links/data:

- create table transaction hash
- table id
- fund transaction hash
- release/burn/timelock transaction hash
- withdraw transaction hash if released
- `escrows(tableId)` read result
- `assetBalances(tableId, 0x0000000000000000000000000000000000000000)` read result

A successful release test should show:

```text
status = 2
fundedAmount > 0
sellerAmount > 0
withdrawnAmount increases after seller withdraws
burnedAmount = 0
```

A successful burn test should show:

```text
status = 3
burnedAmount > 0
sellerAmount = 0
```

That is the pure protocol: no mediator, no private backend, no subjective decision layer; only the table state and contract logic on Base Sepolia.
