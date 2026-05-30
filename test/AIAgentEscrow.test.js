const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const DEAD_WALLET = "0x000000000000000000000000000000000000dEaD";
const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO_GAS = { gasPrice: 0 };
const FIRST_FUND = ethers.parseEther("1");
const SECOND_FUND = ethers.parseEther("0.125");

async function parseEvent(contract, receipt, name) {
  return receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch (_) {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === name);
}

describe("AIAgentEscrow", function () {
  async function deployFixture() {
    const [owner, buyer, seller, feeWallet, stranger, newFeeWallet] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("AIAgentEscrow");
    const escrow = await Escrow.deploy(
      await owner.getAddress(),
      await feeWallet.getAddress(),
      DEAD_WALLET,
      ZERO_GAS
    );
    await escrow.waitForDeployment();

    const Token = await ethers.getContractFactory("MockERC20");
    const usdc = await Token.deploy("Mock USDC", "mUSDC", ZERO_GAS);
    await usdc.waitForDeployment();
    const dai = await Token.deploy("Mock DAI", "mDAI", ZERO_GAS);
    await dai.waitForDeployment();

    return { escrow, owner, buyer, seller, feeWallet, stranger, newFeeWallet, usdc, dai };
  }

  async function createTable(escrow, seller, buyer) {
    const tx = await escrow.connect(buyer).createTable(await seller.getAddress(), await buyer.getAddress(), ZERO_GAS);
    const receipt = await tx.wait();
    const event = await parseEvent(escrow, receipt, "TableCreated");
    return event.args.tableId;
  }

  async function createAndFund(escrow, buyer, seller, amount = FIRST_FUND) {
    const tableId = await createTable(escrow, seller, buyer);
    await (await escrow.connect(buyer).fund(tableId, { value: amount, ...ZERO_GAS })).wait();
    return tableId;
  }


  it("starts at zero protocol fee and lets owner update fee up to 1%", async function () {
    const { escrow, owner, stranger } = await deployFixture();

    expect(await escrow.MAX_FEE_BPS()).to.equal(100n);
    expect(await escrow.feeBps()).to.equal(0n);
    let quote = await escrow.quoteFee(123456789n);
    expect(quote.feeAmount).to.equal(0n);
    expect(quote.sellerAmount).to.equal(123456789n);

    await expect(escrow.connect(stranger).updateFeeBps(1, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    await expect(escrow.connect(owner).updateFeeBps(101, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "FeeTooHigh")
      .withArgs(101, 100);

    await expect(escrow.connect(owner).updateFeeBps(100, ZERO_GAS))
      .to.emit(escrow, "FeeBpsUpdated")
      .withArgs(0, 100);
    expect(await escrow.feeBps()).to.equal(100n);
    quote = await escrow.quoteFee(10_000n);
    expect(quote.feeAmount).to.equal(100n);
    expect(quote.sellerAmount).to.equal(9_900n);

    await (await escrow.connect(owner).updateFeeBps(0, ZERO_GAS)).wait();
    expect(await escrow.feeBps()).to.equal(0n);
  });

  it("creates an empty asset-agnostic table with fixed seller and buyer", async function () {
    const { escrow, buyer, seller } = await deployFixture();
    const buyerAddress = await buyer.getAddress();
    const sellerAddress = await seller.getAddress();

    const tableId = await createTable(escrow, seller, buyer);
    const table = await escrow.getTable(tableId);
    const details = await escrow.escrows(tableId);
    const assets = await escrow.getTableAssets(tableId);

    expect(table.seller).to.equal(sellerAddress);
    expect(table.buyer).to.equal(buyerAddress);
    expect(table.fundedAmount).to.equal(0n);
    expect(table.balance).to.equal(0n);
    expect(table.withdrawnAmount).to.equal(0n);
    expect(table.status).to.equal(1n);
    expect(details.seller).to.equal(sellerAddress);
    expect(details.buyer).to.equal(buyerAddress);
    expect(details.status).to.equal(1n);
    expect(assets).to.deep.equal([]);
  });

  it("keeps createEscrow as a no-value createTable alias", async function () {
    const { escrow, buyer, seller } = await deployFixture();

    const tx = await escrow.connect(buyer).createEscrow(await seller.getAddress(), await buyer.getAddress(), ZERO_GAS);
    const receipt = await tx.wait();
    const event = await parseEvent(escrow, receipt, "TableCreated");

    const table = await escrow.getEscrow(event.args.tableId);
    expect(table.seller).to.equal(await seller.getAddress());
    expect(table.buyer).to.equal(await buyer.getAddress());
    expect(table.status).to.equal(1n);
  });

  it("allows only the fixed buyer to fund native asset while open", async function () {
    const { escrow, buyer, seller, stranger } = await deployFixture();
    const tableId = await createTable(escrow, seller, buyer);

    await expect(
      escrow.connect(stranger).fund(tableId, { value: FIRST_FUND, ...ZERO_GAS })
    ).to.be.revertedWithCustomError(escrow, "OnlyBuyer");

    await expect(escrow.connect(buyer).fund(tableId, { value: 0n, ...ZERO_GAS }))
      .to.be.revertedWithCustomError(escrow, "ZeroAmount");

    await (await escrow.connect(buyer).fund(tableId, { value: FIRST_FUND, ...ZERO_GAS })).wait();
    await (await escrow.connect(buyer).fund(tableId, { value: SECOND_FUND, ...ZERO_GAS })).wait();

    const total = FIRST_FUND + SECOND_FUND;
    const table = await escrow.getTable(tableId);
    const nativeBalance = await escrow.getAssetBalance(tableId, ZERO);
    expect(table.fundedAmount).to.equal(total);
    expect(table.balance).to.equal(total);
    expect(nativeBalance.fundedAmount).to.equal(total);
    expect(await escrow.totalAccountedByAsset(ZERO)).to.equal(total);
  });

  it("accepts many ERC20 tokens into the same table without preselecting a coin", async function () {
    const { escrow, buyer, seller, feeWallet, usdc, dai } = await deployFixture();
    const tableId = await createTable(escrow, seller, buyer);
    const usdcAmount = 26_000000n;
    const daiAmount = ethers.parseEther("7");

    await (await usdc.mint(await buyer.getAddress(), usdcAmount, ZERO_GAS)).wait();
    await (await dai.mint(await buyer.getAddress(), daiAmount, ZERO_GAS)).wait();
    await (await usdc.connect(buyer).approve(await escrow.getAddress(), usdcAmount, ZERO_GAS)).wait();
    await (await dai.connect(buyer).approve(await escrow.getAddress(), daiAmount, ZERO_GAS)).wait();

    await (await escrow.connect(buyer).fundToken(tableId, await usdc.getAddress(), usdcAmount, ZERO_GAS)).wait();
    await (await escrow.connect(buyer).fundToken(tableId, await dai.getAddress(), daiAmount, ZERO_GAS)).wait();

    const assets = await escrow.getTableAssets(tableId);
    expect(assets).to.deep.equal([await usdc.getAddress(), await dai.getAddress()]);

    await (await escrow.connect(buyer).release(tableId, ZERO_GAS)).wait();
    const usdcFee = 0n;
    const usdcSeller = usdcAmount;
    const daiFee = 0n;
    const daiSeller = daiAmount;
    const usdcAsset = await escrow.getAssetBalance(tableId, await usdc.getAddress());
    const daiAsset = await escrow.getAssetBalance(tableId, await dai.getAddress());
    expect(usdcAsset.feeAmount).to.equal(usdcFee);
    expect(daiAsset.feeAmount).to.equal(daiFee);

    await (await escrow.connect(seller).withdraw(tableId, await usdc.getAddress(), usdcSeller, ZERO_GAS)).wait();
    await (await escrow.connect(seller).withdraw(tableId, await dai.getAddress(), daiSeller, ZERO_GAS)).wait();

    expect(await usdc.balanceOf(await seller.getAddress())).to.equal(usdcSeller);
    expect(await dai.balanceOf(await seller.getAddress())).to.equal(daiSeller);
    expect(await usdc.balanceOf(await feeWallet.getAddress())).to.equal(0n);
    expect(await dai.balanceOf(await feeWallet.getAddress())).to.equal(0n);
    expect(await escrow.totalAccountedByAsset(await usdc.getAddress())).to.equal(0n);
    expect(await escrow.totalAccountedByAsset(await dai.getAddress())).to.equal(0n);
  });

  it("releases native funding with zero protocol fee", async function () {
    const { escrow, buyer, seller, feeWallet, stranger } = await deployFixture();
    const tableId = await createAndFund(escrow, buyer, seller);
    const sellerBefore = await ethers.provider.getBalance(await seller.getAddress());
    const feeBefore = await ethers.provider.getBalance(await feeWallet.getAddress());

    await expect(escrow.connect(stranger).release(tableId, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "OnlyBuyer");

    await (await escrow.connect(buyer).release(tableId, ZERO_GAS)).wait();

    const fee = 0n;
    const sellerAmount = FIRST_FUND;
    let nativeAsset = await escrow.getAssetBalance(tableId, ZERO);
    expect(nativeAsset.sellerAmount).to.equal(sellerAmount);
    expect(nativeAsset.feeAmount).to.equal(fee);

    await expect(
      escrow.connect(stranger).withdraw(tableId, ZERO, 1n, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "OnlySeller");

    await expect(
      escrow.connect(buyer).fund(tableId, { value: 1n, ...ZERO_GAS })
    ).to.be.revertedWithCustomError(escrow, "TableNotOpen");

    const firstWithdraw = sellerAmount / 4n;
    await (await escrow.connect(seller).withdraw(tableId, ZERO, firstWithdraw, ZERO_GAS)).wait();
    expect(await ethers.provider.getBalance(await seller.getAddress())).to.equal(sellerBefore + firstWithdraw);

    nativeAsset = await escrow.getAssetBalance(tableId, ZERO);
    expect(nativeAsset.withdrawnAmount).to.equal(firstWithdraw);

    await expect(
      escrow.connect(seller).withdraw(tableId, ZERO, sellerAmount - firstWithdraw + 1n, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "InsufficientWithdrawable");

    await (await escrow.connect(seller).withdraw(tableId, ZERO, sellerAmount - firstWithdraw, ZERO_GAS)).wait();
    await expect(escrow.connect(feeWallet).withdrawFees(tableId, ZERO, 1n, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "InsufficientWithdrawable")
      .withArgs(0n);

    expect(await ethers.provider.getBalance(await seller.getAddress())).to.equal(sellerBefore + sellerAmount);
    expect(await ethers.provider.getBalance(await feeWallet.getAddress())).to.equal(feeBefore);
    expect(await escrow.totalAccountedByAsset(ZERO)).to.equal(0n);
  });

  it("can charge a mutable release fee up to the 1% cap", async function () {
    const { escrow, owner, buyer, seller, feeWallet } = await deployFixture();
    await (await escrow.connect(owner).updateFeeBps(100, ZERO_GAS)).wait();
    const tableId = await createAndFund(escrow, buyer, seller);
    const sellerBefore = await ethers.provider.getBalance(await seller.getAddress());
    const feeBefore = await ethers.provider.getBalance(await feeWallet.getAddress());

    await (await escrow.connect(buyer).release(tableId, ZERO_GAS)).wait();

    const fee = FIRST_FUND / 100n;
    const sellerAmount = FIRST_FUND - fee;
    const nativeAsset = await escrow.getAssetBalance(tableId, ZERO);
    expect(nativeAsset.sellerAmount).to.equal(sellerAmount);
    expect(nativeAsset.feeAmount).to.equal(fee);

    await (await escrow.connect(seller).withdraw(tableId, ZERO, sellerAmount, ZERO_GAS)).wait();
    await (await escrow.connect(feeWallet).withdrawFees(tableId, ZERO, fee, ZERO_GAS)).wait();

    expect(await ethers.provider.getBalance(await seller.getAddress())).to.equal(sellerBefore + sellerAmount);
    expect(await ethers.provider.getBalance(await feeWallet.getAddress())).to.equal(feeBefore + fee);
    expect(await escrow.totalAccountedByAsset(ZERO)).to.equal(0n);
  });

  it("keeps the release fee wallet fixed even if the owner updates fee wallet later", async function () {
    const { escrow, owner, buyer, seller, feeWallet, newFeeWallet } = await deployFixture();
    const tableId = await createAndFund(escrow, buyer, seller);

    await (await escrow.connect(buyer).release(tableId, ZERO_GAS)).wait();
    await (await escrow.connect(owner).updateFeeWallet(await newFeeWallet.getAddress(), ZERO_GAS)).wait();

    await expect(
      escrow.connect(newFeeWallet).withdrawFees(tableId, ZERO, 1n, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "OnlyReleaseFeeWallet");

    await expect(escrow.connect(feeWallet).withdrawFees(tableId, ZERO, 1n, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "InsufficientWithdrawable")
      .withArgs(0n);
  });

  it("burns all assets on buyer burn and leaves no seller or fee withdrawal", async function () {
    const { escrow, buyer, seller, feeWallet, stranger, usdc } = await deployFixture();
    const tableId = await createAndFund(escrow, buyer, seller);
    const tokenAmount = 5_000000n;
    await (await usdc.mint(await buyer.getAddress(), tokenAmount, ZERO_GAS)).wait();
    await (await usdc.connect(buyer).approve(await escrow.getAddress(), tokenAmount, ZERO_GAS)).wait();
    await (await escrow.connect(buyer).fundToken(tableId, await usdc.getAddress(), tokenAmount, ZERO_GAS)).wait();

    const deadNativeBefore = await ethers.provider.getBalance(DEAD_WALLET);
    const deadTokenBefore = await usdc.balanceOf(DEAD_WALLET);

    await expect(escrow.connect(stranger).burn(tableId, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "OnlyBuyer");

    await (await escrow.connect(buyer).burn(tableId, ZERO_GAS)).wait();

    expect(await ethers.provider.getBalance(DEAD_WALLET)).to.equal(deadNativeBefore + FIRST_FUND);
    expect(await usdc.balanceOf(DEAD_WALLET)).to.equal(deadTokenBefore + tokenAmount);
    expect(await escrow.totalAccountedByAsset(ZERO)).to.equal(0n);
    expect(await escrow.totalAccountedByAsset(await usdc.getAddress())).to.equal(0n);

    await expect(
      escrow.connect(seller).withdraw(tableId, ZERO, 1n, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "TableNotReleased");
    await expect(
      escrow.connect(feeWallet).withdrawFees(tableId, ZERO, 1n, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "TableNotReleased");
  });

  it("keeps dispute as a burn alias", async function () {
    const { escrow, buyer, seller } = await deployFixture();
    const tableId = await createAndFund(escrow, buyer, seller, SECOND_FUND);
    const deadBefore = await ethers.provider.getBalance(DEAD_WALLET);

    await (await escrow.connect(buyer).dispute(tableId, ZERO_GAS)).wait();

    expect(await ethers.provider.getBalance(DEAD_WALLET)).to.equal(deadBefore + SECOND_FUND);
    const details = await escrow.escrows(tableId);
    expect(details.status).to.equal(3n);
  });

  it("does not expose any timeout release path", async function () {
    const { escrow, buyer, seller, stranger } = await deployFixture();
    const tableId = await createAndFund(escrow, buyer, seller);

    await network.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await network.provider.send("evm_mine");

    await expect(escrow.connect(stranger).claimTimeout(tableId, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "TimeoutDisabled");

    await expect(escrow.connect(buyer).dispute(tableId, ZERO_GAS)).to.not.be.reverted;
  });

  it("does not block release when seller rejects native transfers", async function () {
    const { escrow, buyer, feeWallet } = await deployFixture();
    const Receiver = await ethers.getContractFactory("RevertingNativeReceiver");
    const rejectingSeller = await Receiver.deploy(ZERO_GAS);
    await rejectingSeller.waitForDeployment();

    const tableId = await createTable(escrow, rejectingSeller, buyer);
    await (await escrow.connect(buyer).fund(tableId, { value: FIRST_FUND, ...ZERO_GAS })).wait();

    await expect(escrow.connect(buyer).release(tableId, ZERO_GAS)).to.not.be.reverted;

    const nativeAsset = await escrow.getAssetBalance(tableId, ZERO);
    expect(nativeAsset.sellerAmount).to.equal(FIRST_FUND);
    expect(nativeAsset.feeAmount).to.equal(0n);
  });

  it("lets owner rescue only surplus native and ERC20, not accounted escrow funds", async function () {
    const { escrow, owner, buyer, seller, stranger, usdc } = await deployFixture();
    const tableId = await createTable(escrow, seller, buyer);
    const escrowAddr = await escrow.getAddress();
    const ownerAddr = await owner.getAddress();
    const token = await usdc.getAddress();

    await (await escrow.connect(buyer).fund(tableId, { value: FIRST_FUND, ...ZERO_GAS })).wait();
    await (await stranger.sendTransaction({ to: escrowAddr, value: SECOND_FUND, ...ZERO_GAS })).wait();

    await expect(
      escrow.connect(owner).ownerRescueSurplusNative(ownerAddr, FIRST_FUND, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "InsufficientSurplus");
    await (await escrow.connect(owner).ownerRescueSurplusNative(ownerAddr, SECOND_FUND, ZERO_GAS)).wait();

    const accountedToken = 10_000000n;
    const surplusToken = 3_000000n;
    await (await usdc.mint(await buyer.getAddress(), accountedToken, ZERO_GAS)).wait();
    await (await usdc.connect(buyer).approve(escrowAddr, accountedToken, ZERO_GAS)).wait();
    await (await escrow.connect(buyer).fundToken(tableId, token, accountedToken, ZERO_GAS)).wait();
    await (await usdc.mint(escrowAddr, surplusToken, ZERO_GAS)).wait();

    await expect(
      escrow.connect(stranger).ownerRescueSurplusToken(token, await stranger.getAddress(), surplusToken, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    await expect(
      escrow.connect(owner).ownerRescueSurplusToken(token, ownerAddr, accountedToken, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "InsufficientSurplus");

    await (await escrow.connect(owner).ownerRescueSurplusToken(token, ownerAddr, surplusToken, ZERO_GAS)).wait();
    expect(await usdc.balanceOf(ownerAddr)).to.equal(surplusToken);
    expect(await escrow.totalAccountedByAsset(token)).to.equal(accountedToken);
  });

  it("rejects release and burn before there are funds", async function () {
    const { escrow, buyer, seller } = await deployFixture();
    const tableId = await createTable(escrow, seller, buyer);

    await expect(escrow.connect(buyer).release(tableId, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "NoFunds");
    await expect(escrow.connect(buyer).burn(tableId, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "NoFunds");
  });
});
