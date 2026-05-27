# Meridian Protocol Receipt — RileyCraig 26 USDC

Status: received on Base Mainnet

## Payment

- Sender smart wallet: `0xc91cE6291eDC0713ec753BAFBA002506ffb2b95c`
- Recipient: `0xf3C5d2C9a110057138329b14c4EB124F24830dD9`
- Token: USDC on Base
- Amount: 26.000000 USDC
- Transaction: `0xaf45cdeeeeed815f2e4c481ab98883094d30ffaef9769b7cd633403ffa3b51a6`
- Block: `46217233`
- Timestamp: `2026-05-19T20:50:13Z`
- Explorer: https://basescan.org/tx/0xaf45cdeeeeed815f2e4c481ab98883094d30ffaef9769b7cd633403ffa3b51a6

## Confirmation

The USDC transfer is confirmed on Base and the current USDC balance at the Meridian contract address is 26.000000 USDC.

## Operational note

This payment was sent as a direct USDC transfer to the Meridian contract address. The currently deployed MP v2 escrow lifecycle tracks native Base ETH funding via `fund(tableId)`, so this payment is being acknowledged as a manual Base/USDC pilot deposit rather than an automatically releasable MP table balance.

## Next action

ReaWorks / Meridian should immediately give RileyCraig a concrete buyer-facing response, confirm the exact deliverable/scope, and execute the first pilot deliverable off-chain if needed while preserving the transaction as public proof of payment.
