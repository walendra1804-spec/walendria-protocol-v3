# Base Mainnet V3 Deployment — Surplus Rescue + Multi-Asset Tables

Network: Base Mainnet
Chain ID: 8453
Contract: `0x0c60Cc8f75Bf2FFC5fF197b7897692603428d59D`
Explorer: https://basescan.org/address/0x0c60Cc8f75Bf2FFC5fF197b7897692603428d59D
Deployment tx: `0xe1eb3be0cccf20f5b08715ed24f3582c0f791b0d80487ab4c8bc407195811c94`
Block: `46241136`
Owner/deployer: `0x9e25e02Cc41c07d7136B50550ea80C48b01E33e2`
Fee wallet: `0x9f87Eae58dDB89281FDF794CD3Bd13D3e2457a99`
Dead wallet: `0x000000000000000000000000000000000000dEaD`
Fee: 0.5%
Deploy fee: `0.00001208857921875 ETH`

## V3 behavior

- Tables no longer preselect one coin.
- A buyer can fund the same table with native Base ETH and/or any ERC20 token.
- Native funding: `fund(tableId)` with msg.value.
- ERC20 funding: approve token to contract, then `fundToken(tableId, token, amount)`.
- `release(tableId)` snapshots seller/fee amounts for every asset in the table.
- `burn(tableId)` / `dispute(tableId)` burns every asset in the table.
- Seller withdraws per asset: `withdraw(tableId, token, amount)`. Native token is address(0).
- Fee wallet withdraws per asset: `withdrawFees(tableId, token, amount)`. Native token is address(0).
- Owner no longer has arbitrary `ownerExecute` or full wallet-mode sweep.
- Owner can only rescue surplus/unaccounted deposits:
  - `ownerRescueSurplusNative(to, amount)`
  - `ownerRescueSurplusToken(token, to, amount)`
- Rescue functions cannot withdraw accounted escrow funds because they compare live contract balance against `totalAccountedByAsset[token]`.

## Verification

- Local test suite: 12 passing.
- On-chain readback confirmed owner, fee wallet, dead wallet, code size, nextEscrowId=0, nativeAccounted=0.
- Sourcify full-match verified: https://repo.sourcify.dev/contracts/full_match/8453/0x0c60Cc8f75Bf2FFC5fF197b7897692603428d59D/
- Basescan native verification completed: https://basescan.org/address/0x0c60Cc8f75Bf2FFC5fF197b7897692603428d59D#code
