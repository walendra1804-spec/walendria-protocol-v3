# Live Usage Log

Current production deployment:

Network: Base Mainnet
Contract: 0xf3C5d2C9a110057138329b14c4EB124F24830dD9
Explorer: https://basescan.org/address/0xf3C5d2C9a110057138329b14c4EB124F24830dD9
Deployment tx: 0x461695bef7fbde8bbbf1c3cdac94b37a7f5b27018ea53c0f8487e4eef8d2d8e5
Fee wallet: 0x9f87Eae58dDB89281FDF794CD3Bd13D3e2457a99

Protocol version: MP v2 minimal release-or-burn.

Use Basescan events/transactions as the live usage log for production activity. The old v1 timeout/pending-withdrawal demo log was removed from this document because it no longer describes the current deployed contract.

Current proof checklist for any public demo:

1. TableCreated event: fixed seller and buyer.
2. TableFunded event: buyer-funded amount.
3. TableReleased or TableBurned event: buyer settlement choice.
4. SellerWithdrawal and/or FeeWithdrawal event if released.

Do not claim proof, refund, arbitration, or deadline behavior. The protocol only proves the release-or-burn settlement path.
