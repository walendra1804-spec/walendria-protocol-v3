const ZERO_GAS = { gasPrice: 0 };

class BuyerAgent {
  constructor(signer, escrowContract) {
    this.signer = signer;
    this.escrowContract = escrowContract;
  }

  async address() {
    return this.signer.getAddress();
  }

  async lockFunds({ seller, amount, durationSeconds }) {
    const latest = await this.escrowContract.runner.provider.getBlock("latest");
    const buyer = await this.signer.getAddress();
    const releaseTime = BigInt(latest.timestamp + durationSeconds);
    const createTx = await this.escrowContract
      .connect(this.signer)
      .createEscrow(seller, buyer, releaseTime, ZERO_GAS);
    const receipt = await createTx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return this.escrowContract.interface.parseLog(log);
        } catch (_) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "TableCreated");

    const tableId = event.args.tableId;
    await (await this.escrowContract.connect(this.signer).fund(tableId, { value: amount, ...ZERO_GAS })).wait();
    return tableId;
  }

  async release(escrowId) {
    const tx = await this.escrowContract.connect(this.signer).release(escrowId, ZERO_GAS);
    await tx.wait();
  }

  async dispute(escrowId) {
    const tx = await this.escrowContract.connect(this.signer).dispute(escrowId, ZERO_GAS);
    await tx.wait();
  }
}

module.exports = { BuyerAgent };
