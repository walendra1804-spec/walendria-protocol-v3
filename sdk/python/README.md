# Python SDK Quick Start

This SDK targets Meridian Protocol / AI Agent Escrow v2 on Base Mainnet.

Contract: 0xf3C5d2C9a110057138329b14c4EB124F24830dD9

## Install

python -m pip install -r requirements.txt

## Environment

AI_ESCROW_RPC_URL=https://mainnet.base.org
AI_ESCROW_CONTRACT_ADDRESS=0xf3C5d2C9a110057138329b14c4EB124F24830dD9
AI_ESCROW_CHAIN_ID=8453
AI_BUYER_PRIVATE_KEY=0x_buyer_private_key
AI_SELLER_ADDRESS=0x_seller_wallet
AI_ESCROW_AMOUNT_ETH=0.000001

## Default Demo

python ai_agent_escrow.py

Default behavior:

1. Creates an empty table with seller = AI_SELLER_ADDRESS and buyer = wallet from AI_BUYER_PRIVATE_KEY.
2. If AI_ESCROW_AMOUNT_ETH is set, funds that table.
3. Prints tx hashes and table id.

## Minimal Usage

from ai_agent_escrow import AIAgentEscrowClient

client = AIAgentEscrowClient.from_env()

table = client.create_table(
    seller_address="0xSellerWallet",
    buyer_address="0xBuyerWallet",
)

client.fund(table.table_id, "0.000001")

# Buyer accepts:
client.release(table.table_id)

# Or buyer rejects/burns:
# client.burn(table.table_id)

print(client.get_table(table.table_id))

## Withdraw

Seller withdraws after release:

client.withdraw(table_id=1, amount_wei=995000000000)

Fee wallet withdraws after release:

client.withdraw_fees(table_id=1, amount_wei=5000000000)

## Important Semantics

- Table creation has no amount.
- Only fixed buyer can fund.
- Buyer controls release or burn.
- claimTimeout is disabled.
- There is no refund/proof/arbitration layer.
