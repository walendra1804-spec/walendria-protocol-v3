# Base Mainnet V2 Deployment — Owner-Wallet + ERC20 Support

Network: Base Mainnet
Chain ID: 8453
Contract: `0x8a8153ec1f6F35d9681b80A4eB5d9613CD58a6B8`
Explorer: https://basescan.org/address/0x8a8153ec1f6F35d9681b80A4eB5d9613CD58a6B8
Deployment tx: `0x904b2dd153ec0334f04a7ce38d5f010996ea1a3ef532d43680c41ebf427e588a`
Block: `46233822`
Owner/deployer: `0x9e25e02Cc41c07d7136B50550ea80C48b01E33e2`
Fee wallet: `0x9f87Eae58dDB89281FDF794CD3Bd13D3e2457a99`
Dead wallet: `0x000000000000000000000000000000000000dEaD`
Fee: 0.5%

## Added behavior

- Native Base ETH escrow remains supported through `createTable/createEscrow` + `fund`.
- ERC20/token escrow is supported through `createTokenTable/createTokenEscrow` + `fundToken`.
- Direct native ETH deposits are accepted by `receive()`.
- Owner can withdraw direct/native balance with `ownerWithdrawNative`.
- Owner can rescue any ERC20 balance with `ownerWithdrawToken`.
- Owner can perform arbitrary wallet-like contract calls with `ownerExecute`.

## Verification

- Local test suite: 13 passing.
- Sourcify full-match verified: https://repo.sourcify.dev/contracts/full_match/8453/0x8a8153ec1f6F35d9681b80A4eB5d9613CD58a6B8/
- Basescan API verification not completed because `ETHERSCAN_API_KEY` / Basescan-compatible API key is missing in `.env`.
