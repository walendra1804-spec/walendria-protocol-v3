# Live WP CLI Demo Transactions

Current preferred Base mainnet contract:

```text
0xACA2c8EB39A0999C6e6AEAB72F65623266007eB3
```

Deployment transaction:

```text
https://basescan.org/tx/0x73a3a915411f8b4105ec4982f05f1223036cb2961d69209b95698c734f0bea8e
```

Verification:

```text
https://repo.sourcify.dev/contracts/full_match/8453/0xACA2c8EB39A0999C6e6AEAB72F65623266007eB3/
```

No funded live demo table has been created on this redeployment yet. The current CLI was smoke-tested with read-only calls against the new address and transaction safety checks; creating/funding a real demo table requires a hot wallet with Base ETH and an explicit `WP_YES=1` or interactive confirmation.

Required create shape for this deployment:

```bash
wp 0xSELLER 0xBUYER --timelock 1h
```

The timelock is mandatory and immutable. There is no update/disable command.
