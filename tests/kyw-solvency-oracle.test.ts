import assert from "node:assert";
import { checkSanctionsAndMixer } from "../security-gate-server/src/sanctionsAndMixerCheck.js";
import { KywOracleService } from "../security-gate-server/src/kywOracleService.js";

async function runKywTests() {
  console.log("=== A.GRID KYW & Solvency Oracle Tests ===");

  // 1. x402 payment enforcement ($0.02 USDC)
  const svc = new KywOracleService();
  const unpaid = svc.validateX402Payment(undefined, undefined);
  assert.strictEqual(unpaid.isPaid, false);
  assert.strictEqual((unpaid.invoice as any).status, 402);
  assert.strictEqual((unpaid.invoice as any).invoice.costUSDC, "0.02");

  const paid = svc.validateX402Payment(
    "0x48e0221087371ad597b814830b83564afc222a9c283ee28ca4df83f50e494223",
    undefined
  );
  assert.strictEqual(paid.isPaid, true);

  // 2. Sanctioned Tornado Cash address must fail OFAC/mixer check
  const dirty = await checkSanctionsAndMixer(
    "0x722122df12d4e14e13ac3b6895a86e84145b6967",
    8453
  );
  assert.strictEqual(dirty.ofacClean, false);
  assert.strictEqual(dirty.mixerExposed, true);
  assert(dirty.riskFlags.includes("SANCTIONED_OR_MIXER_ADDRESS"));

  // 3. Clean address passes OFAC/mixer check
  const clean = await checkSanctionsAndMixer(
    "0xEbA2821B8E37eb5a231c074345c991Cb1F139920",
    8453
  );
  assert.strictEqual(clean.ofacClean, true);
  assert.strictEqual(clean.mixerExposed, false);

  // 4. Full KYW verification rejects sanctioned counterparty deterministically
  const rejected = await svc.verifyCounterparty({
    counterpartyAddress: "0x722122df12d4e14e13ac3b6895a86e84145b6967",
    chainId: 8453,
    requiredAmountUSDC: 100,
    escrowJobId: 9001,
  });
  assert.strictEqual(rejected.verdict, "REJECTED");
  assert(rejected.proofHash.startsWith("0x"));
  assert.strictEqual(rejected.proofHash.length, 66);

  console.log("ALL KYW & SOLVENCY ORACLE TESTS PASSED!");
}

runKywTests().catch((err) => {
  console.error("KYW test failed:", err);
  process.exit(1);
});
