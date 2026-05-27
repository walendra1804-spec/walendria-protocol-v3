from __future__ import annotations

import json
import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware


ESCROW_ABI: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "createEscrow",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "seller", "type": "address"},
            {"name": "buyer", "type": "address"},
        ],
        "outputs": [{"name": "tableId", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "createTable",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "seller", "type": "address"},
            {"name": "buyer", "type": "address"},
        ],
        "outputs": [{"name": "tableId", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "fund",
        "stateMutability": "payable",
        "inputs": [{"name": "tableId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "fundToken",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "tableId", "type": "uint256"},
            {"name": "token", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "release",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "tableId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "burn",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "tableId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "dispute",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "tableId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "claimTimeout",
        "stateMutability": "pure",
        "inputs": [{"name": "tableId", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "withdraw",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "tableId", "type": "uint256"},
            {"name": "token", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "withdrawFees",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "tableId", "type": "uint256"},
            {"name": "token", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "getTable",
        "stateMutability": "view",
        "inputs": [{"name": "tableId", "type": "uint256"}],
        "outputs": [
            {"name": "seller", "type": "address"},
            {"name": "buyer", "type": "address"},
            {"name": "fundedAmount", "type": "uint256"},
            {"name": "balance", "type": "uint256"},
            {"name": "withdrawnAmount", "type": "uint256"},
            {"name": "status", "type": "uint8"},
        ],
    },
    {
        "type": "function",
        "name": "quoteFee",
        "stateMutability": "pure",
        "inputs": [{"name": "amount", "type": "uint256"}],
        "outputs": [
            {"name": "feeAmount", "type": "uint256"},
            {"name": "sellerAmount", "type": "uint256"},
        ],
    },
    {
        "type": "event",
        "name": "TableCreated",
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "tableId", "type": "uint256"},
            {"indexed": True, "name": "seller", "type": "address"},
            {"indexed": True, "name": "buyer", "type": "address"},
        ],
    },
]


STATUS = {0: "None", 1: "Open", 2: "Released", 3: "Burned"}


@dataclass(frozen=True)
class EscrowTable:
    table_id: int
    seller: str
    buyer: str
    tx_hash: str


@dataclass(frozen=True)
class TxResult:
    tx_hash: str
    status: int


def _env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or value == "":
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


def eth_to_wei(amount_eth: str | Decimal) -> int:
    return int(Decimal(str(amount_eth)) * Decimal(10) ** 18)


class AIAgentEscrowClient:
    def __init__(
        self,
        rpc_url: str,
        contract_address: str,
        private_key: str,
        chain_id: int = 8453,
    ) -> None:
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        if not self.w3.is_connected():
            raise RuntimeError(f"Cannot connect to RPC: {rpc_url}")

        self.chain_id = chain_id
        self.account = self.w3.eth.account.from_key(private_key)
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(contract_address),
            abi=ESCROW_ABI,
        )

    @classmethod
    def from_env(cls) -> "AIAgentEscrowClient":
        return cls(
            rpc_url=_env("AI_ESCROW_RPC_URL", "https://mainnet.base.org"),
            contract_address=_env("AI_ESCROW_CONTRACT_ADDRESS"),
            private_key=_env("AI_BUYER_PRIVATE_KEY"),
            chain_id=int(_env("AI_ESCROW_CHAIN_ID", "8453")),
        )

    def _send(self, fn: Any, value_wei: int = 0) -> TxResult:
        tx = fn.build_transaction(
            {
                "from": self.account.address,
                "value": value_wei,
                "nonce": self.w3.eth.get_transaction_count(self.account.address),
                "chainId": self.chain_id,
                "gasPrice": self.w3.eth.gas_price,
            }
        )
        tx["gas"] = int(self.w3.eth.estimate_gas(tx) * 1.2)
        signed = self.account.sign_transaction(tx)
        raw_tx = getattr(signed, "rawTransaction", None) or signed.raw_transaction
        tx_hash = self.w3.eth.send_raw_transaction(raw_tx)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
        if receipt.status != 1:
            raise RuntimeError(f"transaction reverted: {tx_hash.hex()}")
        return TxResult(tx_hash=tx_hash.hex(), status=int(receipt.status))

    def _send_receipt(self, fn: Any, value_wei: int = 0) -> Any:
        tx = fn.build_transaction(
            {
                "from": self.account.address,
                "value": value_wei,
                "nonce": self.w3.eth.get_transaction_count(self.account.address),
                "chainId": self.chain_id,
                "gasPrice": self.w3.eth.gas_price,
            }
        )
        tx["gas"] = int(self.w3.eth.estimate_gas(tx) * 1.2)
        signed = self.account.sign_transaction(tx)
        raw_tx = getattr(signed, "rawTransaction", None) or signed.raw_transaction
        tx_hash = self.w3.eth.send_raw_transaction(raw_tx)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
        if receipt.status != 1:
            raise RuntimeError(f"transaction reverted: {tx_hash.hex()}")
        return receipt

    def create_table(self, seller_address: str, buyer_address: str | None = None) -> EscrowTable:
        seller = Web3.to_checksum_address(seller_address)
        buyer = Web3.to_checksum_address(buyer_address or self.account.address)
        receipt = self._send_receipt(self.contract.functions.createTable(seller, buyer))
        events = self.contract.events.TableCreated().process_receipt(receipt)
        if not events:
            raise RuntimeError("TableCreated event not found")
        table_id = int(events[0]["args"]["tableId"])
        return EscrowTable(table_id=table_id, seller=seller, buyer=buyer, tx_hash=receipt.transactionHash.hex())

    def fund(self, table_id: int, amount_eth: str | Decimal) -> TxResult:
        return self._send(self.contract.functions.fund(table_id), value_wei=eth_to_wei(amount_eth))

    def release(self, table_id: int) -> TxResult:
        return self._send(self.contract.functions.release(table_id))

    def burn(self, table_id: int) -> TxResult:
        return self._send(self.contract.functions.burn(table_id))

    def dispute(self, table_id: int) -> TxResult:
        return self._send(self.contract.functions.dispute(table_id))

    def fund_token(self, table_id: int, token_address: str, amount_units: int) -> TxResult:
        token = Web3.to_checksum_address(token_address)
        return self._send(self.contract.functions.fundToken(table_id, token, int(amount_units)))

    def withdraw(self, table_id: int, token_address: str, amount_units: int) -> TxResult:
        token = Web3.to_checksum_address(token_address)
        return self._send(self.contract.functions.withdraw(table_id, token, int(amount_units)))

    def withdraw_fees(self, table_id: int, token_address: str, amount_units: int) -> TxResult:
        token = Web3.to_checksum_address(token_address)
        return self._send(self.contract.functions.withdrawFees(table_id, token, int(amount_units)))

    def get_table(self, table_id: int) -> dict[str, Any]:
        seller, buyer, funded, balance, withdrawn, status = self.contract.functions.getTable(table_id).call()
        return {
            "tableId": int(table_id),
            "seller": seller,
            "buyer": buyer,
            "fundedAmount": int(funded),
            "balance": int(balance),
            "withdrawnAmount": int(withdrawn),
            "status": STATUS.get(int(status), str(status)),
        }

    def quote_fee(self, amount_eth: str | Decimal) -> dict[str, int]:
        fee, seller = self.contract.functions.quoteFee(eth_to_wei(amount_eth)).call()
        return {"feeAmount": int(fee), "sellerAmount": int(seller)}

    # Backward-compatible helper for old demo scripts: now this creates an empty table, then funds it.
    def create_order_and_lock_funds(
        self,
        seller_address: str,
        amount_eth: str,
        duration_seconds: int = 0,  # Ignored in MP v2; no timeout/deadline path.
        metadata: dict[str, Any] | None = None,  # Off-chain only.
    ) -> dict[str, Any]:
        table = self.create_table(seller_address=seller_address, buyer_address=self.account.address)
        fund_tx = self.fund(table.table_id, amount_eth)
        return {
            "table_id": table.table_id,
            "buyer": table.buyer,
            "seller": table.seller,
            "amount_wei": eth_to_wei(amount_eth),
            "create_tx_hash": table.tx_hash,
            "fund_tx_hash": fund_tx.tx_hash,
            "metadata": metadata or {},
            "note": "MP v2 has no deadline/timeout; buyer controls release or burn.",
        }


if __name__ == "__main__":
    client = AIAgentEscrowClient.from_env()
    table = client.create_table(seller_address=_env("AI_SELLER_ADDRESS"))
    if os.getenv("AI_ESCROW_AMOUNT_ETH"):
        funding = client.fund(table.table_id, _env("AI_ESCROW_AMOUNT_ETH"))
        print(json.dumps({"table": table.__dict__, "funding": funding.__dict__}, indent=2))
    else:
        print(json.dumps(table.__dict__, indent=2))
