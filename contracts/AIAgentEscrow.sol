// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AIAgentEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant FEE_BPS = 50;
    uint16 public constant BPS_DENOMINATOR = 10_000;
    address public constant NATIVE_TOKEN = address(0);

    enum EscrowStatus {
        None,
        Open,
        Released,
        Burned
    }

    struct AssetBalance {
        uint256 fundedAmount;
        uint256 sellerAmount;
        uint256 feeAmount;
        uint256 withdrawnAmount;
        uint256 feeWithdrawnAmount;
        uint256 burnedAmount;
        bool exists;
    }

    struct Escrow {
        address seller;
        address buyer;
        address releaseFeeWallet;
        EscrowStatus status;
    }

    uint256 public nextEscrowId;
    address public feeWallet;
    address public immutable deadWallet;

    mapping(uint256 => Escrow) public escrows;
    mapping(uint256 => address[]) private tableAssets;
    mapping(uint256 => mapping(address => AssetBalance)) public assetBalances;
    mapping(address => uint256) public totalAccountedByAsset;

    event TableCreated(uint256 indexed tableId, address indexed seller, address indexed buyer);
    event TableFunded(uint256 indexed tableId, address indexed buyer, address indexed token, uint256 amount, uint256 fundedAmount);
    event TableReleased(uint256 indexed tableId, address indexed buyer, address indexed seller, address feeWallet);
    event AssetReleased(uint256 indexed tableId, address indexed token, uint256 fundedAmount, uint256 sellerAmount, uint256 feeAmount);
    event TableBurned(uint256 indexed tableId, address indexed buyer, address indexed deadWallet);
    event AssetBurned(uint256 indexed tableId, address indexed token, address deadWallet, uint256 amount);
    event SellerWithdrawal(uint256 indexed tableId, address indexed seller, address indexed token, uint256 amount, uint256 remainingAmount);
    event FeeWithdrawal(uint256 indexed tableId, address indexed feeWallet, address indexed token, uint256 amount, uint256 remainingAmount);
    event FeeWalletUpdated(address indexed oldFeeWallet, address indexed newFeeWallet);
    event OwnerSurplusNativeRescue(address indexed to, uint256 amount);
    event OwnerSurplusTokenRescue(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error TableNotOpen();
    error TableNotReleased();
    error OnlyBuyer();
    error OnlySeller();
    error OnlyReleaseFeeWallet();
    error NoFunds();
    error InsufficientWithdrawable(uint256 availableAmount);
    error InsufficientSurplus(uint256 availableSurplus);
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

    receive() external payable {}

    function createTable(address seller, address buyer) external returns (uint256 tableId) {
        if (seller == address(0) || buyer == address(0)) {
            revert ZeroAddress();
        }

        tableId = ++nextEscrowId;
        escrows[tableId] = Escrow({
            seller: seller,
            buyer: buyer,
            releaseFeeWallet: address(0),
            status: EscrowStatus.Open
        });

        emit TableCreated(tableId, seller, buyer);
    }

    function createEscrow(address seller, address buyer) external returns (uint256 tableId) {
        tableId = this.createTable(seller, buyer);
    }

    function fund(uint256 tableId) external payable nonReentrant {
        Escrow storage escrow = _requireOpenTable(tableId);
        _requireBuyer(escrow);
        if (msg.value == 0) {
            revert ZeroAmount();
        }

        _accountFunding(tableId, NATIVE_TOKEN, msg.value);
    }

    function fundToken(uint256 tableId, address token, uint256 amount) external nonReentrant {
        Escrow storage escrow = _requireOpenTable(tableId);
        _requireBuyer(escrow);
        if (token == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _accountFunding(tableId, token, amount);
    }

    function release(uint256 tableId) external nonReentrant {
        Escrow storage escrow = _requireOpenTable(tableId);
        _requireBuyer(escrow);
        address[] storage assets = tableAssets[tableId];
        if (assets.length == 0) {
            revert NoFunds();
        }

        address currentFeeWallet = feeWallet;
        escrow.status = EscrowStatus.Released;
        escrow.releaseFeeWallet = currentFeeWallet;

        emit TableReleased(tableId, escrow.buyer, escrow.seller, currentFeeWallet);

        for (uint256 i = 0; i < assets.length; i++) {
            address token = assets[i];
            AssetBalance storage asset = assetBalances[tableId][token];
            if (asset.fundedAmount == 0) {
                continue;
            }
            (uint256 feeAmount, uint256 sellerAmount) = quoteFee(asset.fundedAmount);
            asset.feeAmount = feeAmount;
            asset.sellerAmount = sellerAmount;
            emit AssetReleased(tableId, token, asset.fundedAmount, sellerAmount, feeAmount);
        }
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

    function withdraw(uint256 tableId, address token, uint256 amount) external nonReentrant {
        Escrow storage escrow = _requireReleasedTable(tableId);
        if (msg.sender != escrow.seller) {
            revert OnlySeller();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        AssetBalance storage asset = assetBalances[tableId][token];
        uint256 availableAmount = asset.sellerAmount - asset.withdrawnAmount;
        if (amount > availableAmount) {
            revert InsufficientWithdrawable(availableAmount);
        }

        asset.withdrawnAmount += amount;
        totalAccountedByAsset[token] -= amount;
        _sendAsset(token, escrow.seller, amount);

        emit SellerWithdrawal(tableId, escrow.seller, token, amount, availableAmount - amount);
    }

    function withdrawFees(uint256 tableId, address token, uint256 amount) external nonReentrant {
        Escrow storage escrow = _requireReleasedTable(tableId);
        if (msg.sender != escrow.releaseFeeWallet) {
            revert OnlyReleaseFeeWallet();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        AssetBalance storage asset = assetBalances[tableId][token];
        uint256 availableAmount = asset.feeAmount - asset.feeWithdrawnAmount;
        if (amount > availableAmount) {
            revert InsufficientWithdrawable(availableAmount);
        }

        asset.feeWithdrawnAmount += amount;
        totalAccountedByAsset[token] -= amount;
        _sendAsset(token, escrow.releaseFeeWallet, amount);

        emit FeeWithdrawal(tableId, escrow.releaseFeeWallet, token, amount, availableAmount - amount);
    }

    function updateFeeWallet(address newFeeWallet) external onlyOwner {
        if (newFeeWallet == address(0)) {
            revert ZeroAddress();
        }

        address oldFeeWallet = feeWallet;
        feeWallet = newFeeWallet;

        emit FeeWalletUpdated(oldFeeWallet, newFeeWallet);
    }

    function ownerRescueSurplusNative(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }
        uint256 availableSurplus = address(this).balance - totalAccountedByAsset[NATIVE_TOKEN];
        if (amount > availableSurplus) {
            revert InsufficientSurplus(availableSurplus);
        }

        _sendNative(to, amount);
        emit OwnerSurplusNativeRescue(to, amount);
    }

    function ownerRescueSurplusToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 availableSurplus = balance - totalAccountedByAsset[token];
        if (amount > availableSurplus) {
            revert InsufficientSurplus(availableSurplus);
        }

        IERC20(token).safeTransfer(to, amount);
        emit OwnerSurplusTokenRescue(token, to, amount);
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
            _tableFundedAmount(tableId),
            _tableBalance(tableId),
            _tableWithdrawnAmount(tableId),
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
        return this.getTable(tableId);
    }

    function getTableAssets(uint256 tableId) external view returns (address[] memory assets) {
        return tableAssets[tableId];
    }

    function getAssetBalance(
        uint256 tableId,
        address token
    )
        external
        view
        returns (
            uint256 fundedAmount,
            uint256 balance,
            uint256 sellerAmount,
            uint256 feeAmount,
            uint256 withdrawnAmount,
            uint256 feeWithdrawnAmount,
            uint256 burnedAmount
        )
    {
        AssetBalance storage asset = assetBalances[tableId][token];
        return (
            asset.fundedAmount,
            _assetBalance(asset),
            asset.sellerAmount,
            asset.feeAmount,
            asset.withdrawnAmount,
            asset.feeWithdrawnAmount,
            asset.burnedAmount
        );
    }

    function quoteFee(uint256 amount) public pure returns (uint256 feeAmount, uint256 sellerAmount) {
        feeAmount = (amount * FEE_BPS) / BPS_DENOMINATOR;
        sellerAmount = amount - feeAmount;
    }

    function _accountFunding(uint256 tableId, address token, uint256 amount) internal {
        AssetBalance storage asset = assetBalances[tableId][token];
        if (!asset.exists) {
            asset.exists = true;
            tableAssets[tableId].push(token);
        }
        asset.fundedAmount += amount;
        totalAccountedByAsset[token] += amount;

        emit TableFunded(tableId, msg.sender, token, amount, asset.fundedAmount);
    }

    function _burn(uint256 tableId) internal {
        Escrow storage escrow = _requireOpenTable(tableId);
        _requireBuyer(escrow);
        address[] storage assets = tableAssets[tableId];
        if (assets.length == 0) {
            revert NoFunds();
        }

        escrow.status = EscrowStatus.Burned;
        emit TableBurned(tableId, msg.sender, deadWallet);

        for (uint256 i = 0; i < assets.length; i++) {
            address token = assets[i];
            AssetBalance storage asset = assetBalances[tableId][token];
            uint256 amount = asset.fundedAmount;
            if (amount == 0) {
                continue;
            }
            asset.burnedAmount = amount;
            totalAccountedByAsset[token] -= amount;
            _sendAsset(token, deadWallet, amount);
            emit AssetBurned(tableId, token, deadWallet, amount);
        }
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

    function _tableFundedAmount(uint256 tableId) internal view returns (uint256 total) {
        address[] storage assets = tableAssets[tableId];
        for (uint256 i = 0; i < assets.length; i++) {
            total += assetBalances[tableId][assets[i]].fundedAmount;
        }
    }

    function _tableBalance(uint256 tableId) internal view returns (uint256 total) {
        if (escrows[tableId].status == EscrowStatus.Burned) {
            return 0;
        }
        address[] storage assets = tableAssets[tableId];
        for (uint256 i = 0; i < assets.length; i++) {
            total += _assetBalance(assetBalances[tableId][assets[i]]);
        }
    }

    function _tableWithdrawnAmount(uint256 tableId) internal view returns (uint256 total) {
        address[] storage assets = tableAssets[tableId];
        for (uint256 i = 0; i < assets.length; i++) {
            AssetBalance storage asset = assetBalances[tableId][assets[i]];
            total += asset.withdrawnAmount;
        }
    }

    function _assetBalance(AssetBalance storage asset) internal view returns (uint256) {
        return asset.fundedAmount - asset.withdrawnAmount - asset.feeWithdrawnAmount - asset.burnedAmount;
    }

    function _sendAsset(address token, address recipient, uint256 amount) internal {
        if (token == NATIVE_TOKEN) {
            _sendNative(recipient, amount);
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    function _sendNative(address recipient, uint256 amount) internal {
        (bool sent, ) = recipient.call{value: amount}("");
        if (!sent) {
            revert NativeTransferFailed(recipient, amount);
        }
    }
}
