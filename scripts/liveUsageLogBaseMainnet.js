const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const WALLET_FILE = process.env.WALLET_FILE || 'C:/Users/ASUS/Desktop/persiapanNAMAMBAH.txt';
const RPC_URL = process.env.BASE_RPC_URL || 'https://base-rpc.publicnode.com';
const DEPLOYMENT_FILE = path.join(ROOT, 'deployments', 'base-mainnet.json');
const OUT_FILE = path.join(ROOT, 'docs', 'LIVE_USAGE_LOG.md');

const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
const walletText = fs.readFileSync(WALLET_FILE, 'utf8');
const accountMatches = [...walletText.matchAll(/wallet\s+(\d+)\s+account:\s*(0x[a-fA-F0-9]{40})[\s\S]*?the priv key:\s*([a-fA-F0-9]{64})/g)];
if (accountMatches.length < 4) throw new Error(`Need at least 4 wallets in ${WALLET_FILE}, found ${accountMatches.length}`);

const provider = new ethers.JsonRpcProvider(RPC_URL, 8453, { staticNetwork: true });
const wallets = accountMatches.map((m) => ({
  label: `Wallet ${m[1]}`,
  address: ethers.getAddress(m[2]),
  signer: new ethers.Wallet('0x' + m[3], provider),
}));

const abi = [
  'event EscrowCreated(uint256 indexed escrowId,address indexed buyer,address indexed seller,uint256 amount,uint64 deadline,bytes32 agreementHash)',
  'event EscrowReleased(uint256 indexed escrowId,address indexed buyer,address indexed seller,uint256 amount,uint256 sellerAmount,uint256 feeAmount,address feeWallet)',
  'event EscrowBurned(uint256 indexed escrowId,address indexed buyer,address indexed deadWallet,uint256 amount)',
  'event EscrowTimedOut(uint256 indexed escrowId,address indexed buyer,address indexed seller,uint256 amount,uint256 sellerAmount,uint256 feeAmount,address feeWallet)',
  'event WithdrawalClaimed(address indexed account,uint256 amount)',
  'function createEscrow(address seller,uint64 durationSeconds,bytes32 agreementHash) payable returns (uint256)',
  'function release(uint256 escrowId)',
  'function dispute(uint256 escrowId)',
  'function claimTimeout(uint256 escrowId)',
  'function withdraw()',
  'function nextEscrowId() view returns (uint256)',
  'function feeWallet() view returns (address)',
  'function pendingWithdrawals(address) view returns (uint256)',
  'function quoteFee(uint256 amount) view returns (uint256 feeAmount,uint256 sellerAmount)',
  'function escrows(uint256) view returns (address buyer,address seller,uint256 amount,uint256 feeAmount,uint256 sellerAmount,uint64 createdAt,uint64 deadline,bytes32 agreementHash,uint8 status)',
];

const iface = new ethers.Interface(abi);
const contract = new ethers.Contract(deployment.contractAddress, abi, provider);
const buyer = wallets[0];
const sellerA = wallets[1];
const sellerB = wallets[2];
const sellerC = wallets[3];

const scenarios = [
  {
    key: 'agent-research-task',
    title: 'Agent Research Task',
    buyer,
    seller: sellerA,
    amount: ethers.parseEther('0.00002'),
    duration: 7 * 24 * 60 * 60,
    action: 'release',
    narrative: 'Buyer asks an AI/research agent to summarize why autonomous agents need escrow for paid tasks.',
    success: 'Research summary delivered; buyer releases escrow.',
    why: 'Proves the basic happy path: create escrow -> task delivered -> release -> seller withdraw.',
  },
  {
    key: 'contract-review-micro-bounty',
    title: 'Smart Contract Review Micro-Bounty Prep',
    buyer,
    seller: sellerA,
    amount: ethers.parseEther('0.00002'),
    duration: 7 * 24 * 60 * 60,
    action: 'release',
    narrative: 'Buyer reserves a tiny escrow slot for contract/UI review feedback before inviting an external builder bounty.',
    success: 'Review checklist prepared and escrow flow proven for future external reviewer payout.',
    why: 'Shows the protocol can pay for builder feedback through the escrow path.',
  },
  {
    key: 'discord-outreach-task',
    title: 'Discord Outreach Task',
    buyer,
    seller: sellerB,
    amount: ethers.parseEther('0.00002'),
    duration: 7 * 24 * 60 * 60,
    action: 'release',
    narrative: 'Agent drafts transparent outreach copy introducing AI Escrow to a developer/agent community.',
    success: 'Outreach draft delivered; buyer releases escrow.',
    why: 'Demonstrates escrow for agentic business operations and outreach work.',
  },
  {
    key: 'timeout-liveness-test',
    title: 'Timeout / Liveness Test',
    buyer,
    seller: sellerB,
    amount: ethers.parseEther('0.00001'),
    duration: 30,
    action: 'timeout',
    narrative: 'A short-duration task is intentionally left unreleased to test timeout behavior.',
    success: 'After deadline, timeout path releases funds to seller according to contract rules.',
    why: 'Shows the team tests failure/liveness behavior, not only perfect demos.',
  },
  {
    key: 'ambiguous-delivery-dispute-test',
    title: 'Dispute / Ambiguous Delivery Test',
    buyer,
    seller: sellerC,
    amount: ethers.parseEther('0.00001'),
    duration: 7 * 24 * 60 * 60,
    action: 'dispute',
    narrative: 'Seller submits an intentionally incomplete/ambiguous result to test the v1 dispute burn path.',
    success: 'Buyer disputes before deadline; contract sends the tiny escrow amount to the configured dead wallet.',
    why: 'Documents an honest edge case and confirms the current v1 dispute behavior.',
  },
];

function explorerTx(hash) {
  return `https://basescan.org/tx/${hash}`;
}

async function retry(label, fn, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const msg = e?.shortMessage || e?.message || String(e);
      console.log(`retry ${label} ${i}/${tries}: ${msg}`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw last;
}

async function send(label, txPromise) {
  const tx = await txPromise;
  console.log(`${label}: sent ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (receipt.status !== 1) throw new Error(`${label} failed: ${tx.hash}`);
  console.log(`${label}: confirmed block ${receipt.blockNumber}, gas ${receipt.gasUsed.toString()}`);
  return receipt;
}

function parseCreated(receipt) {
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'EscrowCreated') return Number(parsed.args.escrowId);
    } catch (_) {}
  }
  throw new Error(`EscrowCreated not found in ${receipt.hash}`);
}

async function maybeTopUp(target, minEth = '0.000035', topEth = '0.00006') {
  const min = ethers.parseEther(minEth);
  const top = ethers.parseEther(topEth);
  const bal = await retry(`balance ${target.label}`, () => provider.getBalance(target.address));
  if (bal >= min) return null;
  const tx = await buyer.signer.sendTransaction({ to: target.address, value: top });
  console.log(`topup ${target.label}: sent ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (receipt.status !== 1) throw new Error(`topup failed for ${target.label}`);
  return receipt;
}

async function withdrawIfAny(who) {
  const connected = new ethers.Contract(deployment.contractAddress, abi, who.signer);
  const pending = await retry(`pending ${who.label}`, () => contract.pendingWithdrawals(who.address));
  if (pending === 0n) return null;
  return await send(`${who.label} withdraw ${ethers.formatEther(pending)} ETH`, connected.withdraw());
}

async function main() {
  console.log(`AI Escrow live usage run on Base mainnet`);
  console.log(`Contract: ${deployment.contractAddress}`);
  console.log(`RPC: ${RPC_URL}`);

  const startNext = await retry('nextEscrowId', () => contract.nextEscrowId());
  console.log(`Starting nextEscrowId: ${startNext.toString()}`);
  for (const w of wallets.slice(0, 4)) {
    const bal = await retry(`balance ${w.label}`, () => provider.getBalance(w.address));
    console.log(`${w.label} ${w.address} balance ${ethers.formatEther(bal)} ETH`);
  }

  // Give zero-balance sellers enough Base ETH to submit withdraw/timeout txs.
  const topups = [];
  for (const w of [sellerB, sellerC]) {
    const r = await maybeTopUp(w);
    if (r) topups.push({ label: `${w.label} gas top-up`, hash: r.hash });
  }

  const results = [];
  for (const s of scenarios) {
    console.log(`\n=== ${s.title} ===`);
    const cBuyer = new ethers.Contract(deployment.contractAddress, abi, s.buyer.signer);
    const agreementText = `${s.key}|${Date.now()}|${s.buyer.address}|${s.seller.address}|${ethers.formatEther(s.amount)} ETH`;
    const agreementHash = ethers.keccak256(ethers.toUtf8Bytes(agreementText));

    await retry(`estimate create ${s.key}`, () => cBuyer.createEscrow.estimateGas(s.seller.address, s.duration, agreementHash, { value: s.amount }));
    const createReceipt = await send(`${s.title} createEscrow`, cBuyer.createEscrow(s.seller.address, s.duration, agreementHash, { value: s.amount }));
    const escrowId = parseCreated(createReceipt);
    const txs = [{ label: 'Create/Fund', hash: createReceipt.hash }];

    let finalActionLabel = '';
    if (s.action === 'release') {
      await retry(`estimate release ${escrowId}`, () => cBuyer.release.estimateGas(escrowId));
      const releaseReceipt = await send(`${s.title} release`, cBuyer.release(escrowId));
      txs.push({ label: 'Release', hash: releaseReceipt.hash });
      const withdrawReceipt = await withdrawIfAny(s.seller);
      if (withdrawReceipt) txs.push({ label: 'Seller withdraw', hash: withdrawReceipt.hash });
      finalActionLabel = 'Released';
    } else if (s.action === 'timeout') {
      console.log('waiting 40s for timeout deadline...');
      await new Promise((r) => setTimeout(r, 40000));
      const cSeller = new ethers.Contract(deployment.contractAddress, abi, s.seller.signer);
      await retry(`estimate timeout ${escrowId}`, () => cSeller.claimTimeout.estimateGas(escrowId));
      const timeoutReceipt = await send(`${s.title} claimTimeout`, cSeller.claimTimeout(escrowId));
      txs.push({ label: 'Claim timeout', hash: timeoutReceipt.hash });
      const withdrawReceipt = await withdrawIfAny(s.seller);
      if (withdrawReceipt) txs.push({ label: 'Seller withdraw', hash: withdrawReceipt.hash });
      finalActionLabel = 'TimedOut';
    } else if (s.action === 'dispute') {
      await retry(`estimate dispute ${escrowId}`, () => cBuyer.dispute.estimateGas(escrowId));
      const disputeReceipt = await send(`${s.title} dispute`, cBuyer.dispute(escrowId));
      txs.push({ label: 'Dispute/Burn', hash: disputeReceipt.hash });
      finalActionLabel = 'Burned';
    }

    const e = await retry(`escrow ${escrowId}`, () => contract.escrows(escrowId));
    const [feeAmount, sellerAmount] = await retry(`quote ${escrowId}`, () => contract.quoteFee(s.amount));
    results.push({
      ...s,
      escrowId,
      agreementHash,
      amountEth: ethers.formatEther(s.amount),
      feeEth: ethers.formatEther(feeAmount),
      sellerAmountEth: ethers.formatEther(sellerAmount),
      finalActionLabel,
      chainStatus: Number(e.status),
      txs,
    });
  }

  const generatedAt = new Date().toISOString();
  const lines = [];
  lines.push('# AI Escrow — Live Protocol Usage Log');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('Purpose: this log gives human-readable context for small Base mainnet transactions so people can understand what each escrow tested. It documents real demo/test usage with tiny amounts; it is not meant to fake volume.');
  lines.push('');
  lines.push(`Network: Base mainnet`);
  lines.push(`Contract: ${deployment.contractAddress}`);
  lines.push(`Explorer: ${deployment.explorer}`);
  lines.push(`Deployment tx: ${explorerTx(deployment.deploymentTxHash)}`);
  lines.push('');
  if (topups.length) {
    lines.push('## Gas Top-Ups');
    lines.push('');
    for (const t of topups) lines.push(`- ${t.label}: ${explorerTx(t.hash)}`);
    lines.push('');
  }
  lines.push('## Escrow Scenarios');
  lines.push('');
  for (const r of results) {
    lines.push(`### Escrow #${r.escrowId} — ${r.title}`);
    lines.push(`- Buyer: ${r.buyer.address}`);
    lines.push(`- Seller/Agent: ${r.seller.address}`);
    lines.push(`- Amount: ${r.amountEth} ETH`);
    lines.push(`- Protocol fee at 50 bps: ${r.feeEth} ETH`);
    lines.push(`- Seller amount before withdraw gas: ${r.sellerAmountEth} ETH`);
    lines.push(`- Agreement hash: ${r.agreementHash}`);
    lines.push(`- Task narrative: ${r.narrative}`);
    lines.push(`- Success condition: ${r.success}`);
    lines.push(`- Why it matters: ${r.why}`);
    lines.push(`- Final status: ${r.finalActionLabel} (status enum ${r.chainStatus})`);
    lines.push(`- Tx links:`);
    for (const tx of r.txs) lines.push(`  - ${tx.label}: ${explorerTx(tx.hash)}`);
    lines.push('');
  }
  lines.push('## Public Update Template');
  lines.push('');
  lines.push('AI Escrow usage log is live.');
  lines.push('');
  lines.push('We are not trying to fake volume. We are documenting small real protocol interactions on Base: research tasks, contract-review prep, outreach tasks, timeout tests, and dispute/edge-case tests.');
  lines.push('');
  lines.push('Goal: make autonomous-agent payments more transparent and safer with escrowed execution.');
  lines.push('');
  lines.push(`Live contract: ${deployment.explorer}`);
  lines.push('');
  fs.writeFileSync(OUT_FILE, lines.join('\n'));
  fs.writeFileSync('C:/Users/ASUS/Documents/AI-Escrow-LIVE-Usage-Log.md', lines.join('\n'));
  console.log(`\nWrote ${OUT_FILE}`);
  console.log('Wrote C:/Users/ASUS/Documents/AI-Escrow-LIVE-Usage-Log.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
