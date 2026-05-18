const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const DEAD_WALLET = "0x000000000000000000000000000000000000dEaD";
const ZERO_GAS = { gasPrice: 0 };
const FIRST_FUND = ethers.parseEther("1");
const SECOND_FUND = ethers.parseEther("0.125");

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

    return { escrow, owner, buyer, seller, feeWallet, stranger, newFeeWallet };
  }

  async function createTable(escrow, seller, buyer) {
    const tx = await escrow.connect(buyer).createTable(await seller.getAddress(), await buyer.getAddress(), ZERO_GAS);
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return escrow.interface.parseLog(log);
        } catch (_) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "TableCreated");

    return event.args.tableId;
  }

  async function createAndFund(escrow, buyer, seller, amount = FIRST_FUND) {
    const tableId = await createTable(escrow, seller, buyer);
    await (await escrow.connect(buyer).fund(tableId, { value: amount, ...ZERO_GAS })).wait();
    return tableId;
  }

  it("creates an empty table with fixed seller and buyer and no required ETH", async function () {
    const { escrow, buyer, seller } = await deployFixture();
    const buyerAddress = await buyer.getAddress();
    const sellerAddress = await seller.getAddress();

    const tableId = await createTable(escrow, seller, buyer);
    const table = await escrow.getTable(tableId);
    const details = await escrow.escrows(tableId);

    expect(table.seller).to.equal(sellerAddress);
    expect(table.buyer).to.equal(buyerAddress);
    expect(table.fundedAmount).to.equal(0n);
    expect(table.balance).to.equal(0n);
    expect(table.withdrawnAmount).to.equal(0n);
    expect(table.status).to.equal(1n);

    expect(details.seller).to.equal(sellerAddress);
    expect(details.buyer).to.equal(buyerAddress);
    expect(details.status).to.equal(1n);
  });

  it("keeps createEscrow as a no-value createTable alias", async function () {
    const { escrow, buyer, seller } = await deployFixture();

    const tx = await escrow.connect(buyer).createEscrow(await seller.getAddress(), await buyer.getAddress(), ZERO_GAS);
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return escrow.interface.parseLog(log);
        } catch (_) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "TableCreated");

    const table = await escrow.getEscrow(event.args.tableId);
    expect(table.seller).to.equal(await seller.getAddress());
    expect(table.buyer).to.equal(await buyer.getAddress());
    expect(table.status).to.equal(1n);
  });

  it("allows only the fixed buyer to fund any positive amount while open", async function () {
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
    expect(table.fundedAmount).to.equal(total);
    expect(table.balance).to.equal(total);
  });

  it("rejects direct random native deposits", async function () {
    const { escrow, stranger } = await deployFixture();

    await expect(
      stranger.sendTransaction({ to: await escrow.getAddress(), value: FIRST_FUND, ...ZERO_GAS })
    ).to.be.revertedWithoutReason();
  });

  it("releases by buyer only, snapshots the platform fee, and supports partial seller withdrawal", async function () {
    const { escrow, buyer, seller, feeWallet, stranger } = await deployFixture();
    const tableId = await createAndFund(escrow, buyer, seller);
    const sellerBefore = await ethers.provider.getBalance(await seller.getAddress());
    const feeBefore = await ethers.provider.getBalance(await feeWallet.getAddress());

    await expect(escrow.connect(stranger).release(tableId, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "OnlyBuyer");

    await (await escrow.connect(buyer).release(tableId, ZERO_GAS)).wait();

    const fee = (FIRST_FUND * 50n) / 10000n;
    const sellerAmount = FIRST_FUND - fee;
    let details = await escrow.escrows(tableId);
    expect(details.status).to.equal(2n);
    expect(details.feeAmount).to.equal(fee);
    expect(details.sellerAmount).to.equal(sellerAmount);
    expect(details.releaseFeeWallet).to.equal(await feeWallet.getAddress());

    await expect(
      escrow.connect(stranger).withdraw(tableId, 1n, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "OnlySeller");

    await expect(
      escrow.connect(buyer).fund(tableId, { value: 1n, ...ZERO_GAS })
    ).to.be.revertedWithCustomError(escrow, "TableNotOpen");

    const firstWithdraw = sellerAmount / 4n;
    await (await escrow.connect(seller).withdraw(tableId, firstWithdraw, ZERO_GAS)).wait();
    expect(await ethers.provider.getBalance(await seller.getAddress())).to.equal(sellerBefore + firstWithdraw);

    details = await escrow.escrows(tableId);
    expect(details.withdrawnAmount).to.equal(firstWithdraw);

    await expect(
      escrow.connect(seller).withdraw(tableId, sellerAmount - firstWithdraw + 1n, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "InsufficientWithdrawable");

    await (await escrow.connect(seller).withdraw(tableId, sellerAmount - firstWithdraw, ZERO_GAS)).wait();
    await (await escrow.connect(feeWallet).withdrawFees(tableId, fee, ZERO_GAS)).wait();

    expect(await ethers.provider.getBalance(await seller.getAddress())).to.equal(sellerBefore + sellerAmount);
    expect(await ethers.provider.getBalance(await feeWallet.getAddress())).to.equal(feeBefore + fee);

    const table = await escrow.getTable(tableId);
    expect(table.balance).to.equal(0n);
    expect(table.withdrawnAmount).to.equal(sellerAmount);
  });

  it("keeps the release fee wallet fixed even if the owner updates the fee wallet later", async function () {
    const { escrow, owner, buyer, seller, feeWallet, newFeeWallet } = await deployFixture();
    const tableId = await createAndFund(escrow, buyer, seller);

    await (await escrow.connect(buyer).release(tableId, ZERO_GAS)).wait();
    await (await escrow.connect(owner).updateFeeWallet(await newFeeWallet.getAddress(), ZERO_GAS)).wait();

    const fee = (FIRST_FUND * 50n) / 10000n;
    await expect(
      escrow.connect(newFeeWallet).withdrawFees(tableId, fee, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "OnlyReleaseFeeWallet");

    await expect(escrow.connect(feeWallet).withdrawFees(tableId, fee, ZERO_GAS)).to.not.be.reverted;
  });

  it("burns all table funds on buyer burn and leaves no seller or fee withdrawal", async function () {
    const { escrow, buyer, seller, feeWallet, stranger } = await deployFixture();
    const tableId = await createAndFund(escrow, buyer, seller);
    const sellerBefore = await ethers.provider.getBalance(await seller.getAddress());
    const feeBefore = await ethers.provider.getBalance(await feeWallet.getAddress());
    const deadBefore = await ethers.provider.getBalance(DEAD_WALLET);

    await expect(escrow.connect(stranger).burn(tableId, ZERO_GAS))
      .to.be.revertedWithCustomError(escrow, "OnlyBuyer");

    await (await escrow.connect(buyer).burn(tableId, ZERO_GAS)).wait();

    expect(await ethers.provider.getBalance(await seller.getAddress())).to.equal(sellerBefore);
    expect(await ethers.provider.getBalance(await feeWallet.getAddress())).to.equal(feeBefore);
    expect(await ethers.provider.getBalance(DEAD_WALLET)).to.equal(deadBefore + FIRST_FUND);

    const details = await escrow.escrows(tableId);
    expect(details.status).to.equal(3n);
    expect(details.burnedAmount).to.equal(FIRST_FUND);
    expect(details.feeAmount).to.equal(0n);
    expect(details.sellerAmount).to.equal(0n);

    await expect(
      escrow.connect(seller).withdraw(tableId, 1n, ZERO_GAS)
    ).to.be.revertedWithCustomError(escrow, "TableNotReleased");
    await expect(
      escrow.connect(feeWallet).withdrawFees(tableId, 1n, ZERO_GAS)
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

  it("does not block release when seller rejects native token transfers", async function () {
    const { escrow, buyer, feeWallet } = await deployFixture();
    const Receiver = await ethers.getContractFactory("RevertingNativeReceiver");
    const rejectingSeller = await Receiver.deploy(ZERO_GAS);
    await rejectingSeller.waitForDeployment();

    const tableId = await createTable(escrow, rejectingSeller, buyer);
    await (await escrow.connect(buyer).fund(tableId, { value: FIRST_FUND, ...ZERO_GAS })).wait();

    await expect(escrow.connect(buyer).release(tableId, ZERO_GAS)).to.not.be.reverted;

    const fee = (FIRST_FUND * 50n) / 10000n;
    const sellerAmount = FIRST_FUND - fee;
    const details = await escrow.escrows(tableId);
    expect(details.sellerAmount).to.equal(sellerAmount);
    expect(details.feeAmount).to.equal(fee);

    await expect(
      escrow.connect(feeWallet).withdrawFees(tableId, fee, ZERO_GAS)
    ).to.not.be.reverted;
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
