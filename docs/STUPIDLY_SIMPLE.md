# Meridian Protocol / AI Agent Escrow - Stupidly Simple Docs

## Network

Production network: Base Mainnet.

Catatan zero-fee: source ini sekarang `FEE_BPS = 0`. Contract lama di chain tidak bisa diubah; deploy ulang dari source ini sebelum menyebut alamat live sebagai absolute-zero-fee.

- Chain ID: 8453
- RPC: https://mainnet.base.org
- Gas token: ETH
- Explorer: https://basescan.org
- Contract address: 0xf3C5d2C9a110057138329b14c4EB124F24830dD9
- Verified code: https://basescan.org/address/0xf3C5d2C9a110057138329b14c4EB124F24830dD9#code
- Deployment tx: 0x461695bef7fbde8bbbf1c3cdac94b37a7f5b27018ea53c0f8487e4eef8d2d8e5
- Fee wallet: 0x9f87Eae58dDB89281FDF794CD3Bd13D3e2457a99
- Platform fee: 0% on release

## Cara Kerja

1. Seller dan buyer/controller ditentukan saat table dibuat.
2. Table dibuat kosong: tidak ada amount saat create.
3. Hanya buyer yang boleh fund table.
4. Buyer bebas fund amount berapa pun.
5. Kalau buyer menerima hasil kerja, buyer panggil release(tableId).
6. Setelah release, seller bisa withdraw(tableId, amount) per table.
7. Fee wallet tetap ada untuk kompatibilitas ABI, tapi fee WP = 0 jadi normalnya tidak ada saldo fee.
8. Kalau buyer menolak/dispute, buyer panggil burn(tableId) atau dispute(tableId).
9. Burn mengirim dana table ke dead wallet.
10. Tidak ada refund buyer, tidak ada proof verifier, tidak ada arbitrase, tidak ada deadline/timeout release.

Inti protokol: buyer cuma punya dua tombol settlement: release atau burn.

## Create Table

Payload:

{
  "seller": "0xSellerWallet",
  "buyer": "0xBuyerControllerWallet"
}

Call:

createTable(address seller, address buyer)

Alias:

createEscrow(address seller, address buyer)

## Fund

Payload:

{
  "tableId": "1",
  "amountWei": "1000000000000"
}

Call:

fund(uint256 tableId)

Native ETH dikirim sebagai msg.value. Hanya buyer fixed yang boleh fund.

## Release

Payload:

{
  "tableId": "1",
  "action": "release"
}

Call:

release(uint256 tableId)

Hanya buyer fixed yang boleh call. Seller mendapat 100% sebagai withdrawable balance di table itu. Fee wallet mendapat 0% karena fee WP absolut nol.

## Burn / Dispute

Payload:

{
  "tableId": "1",
  "action": "burn"
}

Call:

burn(uint256 tableId)

Alias:

dispute(uint256 tableId)

Hanya buyer fixed yang boleh call. Dana dikirim ke dead wallet.

## Withdraw Seller

Payload:

{
  "tableId": "1",
  "amountWei": "995000000000"
}

Call:

withdraw(uint256 tableId, uint256 amount)

Hanya seller fixed yang boleh withdraw setelah release.

## Withdraw Fee

Payload:

{
  "tableId": "1",
  "amountWei": "5000000000"
}

Call:

withdrawFees(uint256 tableId, uint256 amount)

Hanya fee wallet yang tercatat saat release yang boleh call fungsi ini, tapi pada sumber zero-fee normalnya tidak ada saldo fee untuk di-withdraw.

## Status

Call:

getTable(uint256 tableId)

Return:

seller, buyer, fundedAmount, balance, withdrawnAmount, status

Status enum:

0 = None
1 = Open
2 = Released
3 = Burned

## Yang Sengaja Tidak Ada

- Tidak ada amount saat create.
- Tidak ada proof verification.
- Tidak ada refund buyer.
- Tidak ada arbitrase.
- Tidak ada timeout release.
- Tidak ada largest-funder controller.
- Tidak ada first-funder controller.

## Python SDK

File:

sdk/python/ai_agent_escrow.py

Environment:

AI_ESCROW_RPC_URL=https://mainnet.base.org
AI_ESCROW_CONTRACT_ADDRESS=0xf3C5d2C9a110057138329b14c4EB124F24830dD9
AI_ESCROW_CHAIN_ID=8453
AI_BUYER_PRIVATE_KEY=0x_buyer_private_key
AI_SELLER_ADDRESS=0x_seller_wallet
AI_ESCROW_AMOUNT_ETH=0.000001

Run:

python sdk/python/ai_agent_escrow.py

Default run creates a table for AI_SELLER_ADDRESS with the buyer wallet from AI_BUYER_PRIVATE_KEY. If AI_ESCROW_AMOUNT_ETH is set, it also funds the table.
