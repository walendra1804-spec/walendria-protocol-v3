// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AIAgentEscrow is Ownable, ReentrancyGuard {
    uint16 public constant FEE_BPS = 50;
    uint16 public constant BPS_DENOMINATOR = 10_000;

    enum EscrowStatus {
        None,
        Open,
        Released,
        Burned
    }

    struct Escrow {
        address seller;
        address buyer;
        uint256 fundedAmount;
        uint256 sellerAmount;
        uint256 feeAmount;
        uint256 withdrawnAmount;
        uint256 feeWithdrawnAmount;
        uint256 burnedAmount;
        address releaseFeeWallet;
        EscrowStatus status;
    }

    uint256 public nextEscrowId;
    address public feeWallet;
    address public immutable deadWallet;

    mapping(uint256 => Escrow) public escrows;

    event TableCreated(uint256 indexed tableId, address indexed seller, address indexed buyer);
    event TableFunded(uint256 indexed tableId, address indexed buyer, uint256 amount, uint256 fundedAmount);
    event TableReleased(
        uint256 indexed tableId,
        address indexed buyer,
        address indexed seller,
        uint256 fundedAmount,
        uint256 sellerAmount,
        uint256 feeAmount,
        address feeWallet
    );
    event TableBurned(uint256 indexed tableId, address indexed buyer, address indexed deadWallet, uint256 amount);
    event SellerWithdrawal(uint256 indexed tableId, address indexed seller, uint256 amount, uint256 remainingAmount);
    event FeeWithdrawal(uint256 indexed tableId, address indexed feeWallet, uint256 amount, uint256 remainingAmount);
    event FeeWalletUpdated(address indexed oldFeeWallet, address indexed newFeeWallet);

    error ZeroAddress();
    error ZeroAmount();
    error TableNotOpen();
    error TableNotReleased();
    error OnlyBuyer();
    error OnlySeller();
    error OnlyReleaseFeeWallet();
    error NoFunds();
    error InsufficientWithdrawable(uint256 availableAmount);
    error TimeoutDisabled();
    error NativeTransferFailed(address recipient, uint256 amount);

    constructor(
        address initialOwner,
        address initialFeeWallet,
        address deadWallet_
    ) Ownable(initialOwner) {
        if (initialOwner == address(0) || initialFeeWallet == address(0) || deadWallet_ == address(0)) {
            revert ZeroAddress();
        }

        feeWallet = initialFeeWallet;
        deadWallet = deadWallet_;
    }

    function createTable(address seller, address buyer) external returns (uint256 tableId) {
        tableId = _createTable(seller, buyer);
    }

    function createEscrow(address seller, address buyer) external returns (uint256 tableId) {
        tableId = _createTable(seller, buyer);
    }

    function fund(uint256 tableId) external payable nonReentrant {
        Escrow storage escrow = _requireOpenTable(tableId);
        _requireBuyer(escrow);
        if (msg.value == 0) {
            revert ZeroAmount();
        }

        escrow.fundedAmount += msg.value;

        emit TableFunded(tableId, msg.sender, msg.value, escrow.fundedAmount);
    }

    function release(uint256 tableId) external nonReentrant {
        Escrow storage escrow = _requireOpenTable(tableId);
        _requireBuyer(escrow);
        if (escrow.fundedAmount == 0) {
            revert NoFunds();
        }

        address currentFeeWallet = feeWallet;
        (uint256 feeAmount, uint256 sellerAmount) = quoteFee(escrow.fundedAmount);

        escrow.status = EscrowStatus.Released;
        escrow.feeAmount = feeAmount;
        escrow.sellerAmount = sellerAmount;
        escrow.releaseFeeWallet = currentFeeWallet;

        emit TableReleased(
            tableId,
            escrow.buyer,
            escrow.seller,
            escrow.fundedAmount,
            sellerAmount,
            feeAmount,
            currentFeeWallet
        );
    }

    function burn(uint256 tableId) external nonReentrant {
        _burn(tableId);
    }

    function dispute(uint256 tableId) external nonReentrant {
        _burn(tableId);
    }

    function claimTimeout(uint256) external pure {
        revert TimeoutDisabled();
    }

    function withdraw(uint256 tableId, uint256 amount) external nonReentrant {
        Escrow storage escrow = _requireReleasedTable(tableId);
        if (msg.sender != escrow.seller) {
            revert OnlySeller();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 availableAmount = escrow.sellerAmount - escrow.withdrawnAmount;
        if (amount > availableAmount) {
            revert InsufficientWithdrawable(availableAmount);
        }

        escrow.withdrawnAmount += amount;

        _sendNative(escrow.seller, amount);

        emit SellerWithdrawal(tableId, escrow.seller, amount, availableAmount - amount);
    }

    function withdrawFees(uint256 tableId, uint256 amount) external nonReentrant {
        Escrow storage escrow = _requireReleasedTable(tableId);
        if (msg.sender != escrow.releaseFeeWallet) {
            revert OnlyReleaseFeeWallet();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 availableAmount = escrow.feeAmount - escrow.feeWithdrawnAmount;
        if (amount > availableAmount) {
            revert InsufficientWithdrawable(availableAmount);
        }

        escrow.feeWithdrawnAmount += amount;

        _sendNative(escrow.releaseFeeWallet, amount);

        emit FeeWithdrawal(tableId, escrow.releaseFeeWallet, amount, availableAmount - amount);
    }

    function updateFeeWallet(address newFeeWallet) external onlyOwner {
        if (newFeeWallet == address(0)) {
            revert ZeroAddress();
        }

        address oldFeeWallet = feeWallet;
        feeWallet = newFeeWallet;

        emit FeeWalletUpdated(oldFeeWallet, newFeeWallet);
    }

    function getTable(
        uint256 tableId
    )
        external
        view
        returns (
            address seller,
            address buyer,
            uint256 fundedAmount,
            uint256 balance,
            uint256 withdrawnAmount,
            EscrowStatus status
        )
    {
        Escrow storage escrow = escrows[tableId];
        return (
            escrow.seller,
            escrow.buyer,
            escrow.fundedAmount,
            _tableBalance(escrow),
            escrow.withdrawnAmount,
            escrow.status
        );
    }

    function getEscrow(
        uint256 tableId
    )
        external
        view
        returns (
            address seller,
            address buyer,
            uint256 fundedAmount,
            uint256 balance,
            uint256 withdrawnAmount,
            EscrowStatus status
        )
    {
        Escrow storage escrow = escrows[tableId];
        return (
            escrow.seller,
            escrow.buyer,
            escrow.fundedAmount,
            _tableBalance(escrow),
            escrow.withdrawnAmount,
            escrow.status
        );
    }

    function quoteFee(uint256 amount) public pure returns (uint256 feeAmount, uint256 sellerAmount) {
        feeAmount = (amount * FEE_BPS) / BPS_DENOMINATOR;
        sellerAmount = amount - feeAmount;
    }

    function _createTable(address seller, address buyer) internal returns (uint256 tableId) {
        if (seller == address(0) || buyer == address(0)) {
            revert ZeroAddress();
        }

        tableId = ++nextEscrowId;
        escrows[tableId] = Escrow({
            seller: seller,
            buyer: buyer,
            fundedAmount: 0,
            sellerAmount: 0,
            feeAmount: 0,
            withdrawnAmount: 0,
            feeWithdrawnAmount: 0,
            burnedAmount: 0,
            releaseFeeWallet: address(0),
            status: EscrowStatus.Open
        });

        emit TableCreated(tableId, seller, buyer);
    }

    function _burn(uint256 tableId) internal {
        Escrow storage escrow = _requireOpenTable(tableId);
        _requireBuyer(escrow);
        uint256 amount = escrow.fundedAmount;
        if (amount == 0) {
            revert NoFunds();
        }

        escrow.status = EscrowStatus.Burned;
        escrow.burnedAmount = amount;

        _sendNative(deadWallet, amount);

        emit TableBurned(tableId, msg.sender, deadWallet, amount);
    }

    function _requireOpenTable(uint256 tableId) internal view returns (Escrow storage escrow) {
        escrow = escrows[tableId];
        if (escrow.status != EscrowStatus.Open) {
            revert TableNotOpen();
        }
    }

    function _requireReleasedTable(uint256 tableId) internal view returns (Escrow storage escrow) {
        escrow = escrows[tableId];
        if (escrow.status != EscrowStatus.Released) {
            revert TableNotReleased();
        }
    }

    function _requireBuyer(Escrow storage escrow) internal view {
        if (msg.sender != escrow.buyer) {
            revert OnlyBuyer();
        }
    }

    function _tableBalance(Escrow storage escrow) internal view returns (uint256) {
        if (escrow.status == EscrowStatus.Burned) {
            return 0;
        }

        return escrow.fundedAmount - escrow.withdrawnAmount - escrow.feeWithdrawnAmount - escrow.burnedAmount;
    }

    function _sendNative(address recipient, uint256 amount) internal {
        (bool sent, ) = recipient.call{value: amount}("");
        if (!sent) {
            revert NativeTransferFailed(recipient, amount);
        }
    }
}
