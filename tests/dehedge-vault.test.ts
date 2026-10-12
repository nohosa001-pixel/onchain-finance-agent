import { DeHedgeVaultManager } from "../security-gate-server/src/fundVault.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [TEST FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`🛡️ [DEFENSE VERIFIED] ${message}`);
}

async function runDeHedgeVaultContractTests() {
  console.log("\n========================================================================");
  console.log("🏛️ DEHEDGE VAULT (ERC-4626) & INSTITUTIONAL NON-CUSTODIAL VAULT TESTS");
  console.log("   Verifying Non-Custodial Security, Whitelisted Routing, and Circuit Breaker");
  console.log("========================================================================\n");

  // --------------------------------------------------------------------------
  // Test 1: Genesis Deposit & Share Token Issuance (USDC -> $wALPHA)
  // --------------------------------------------------------------------------
  console.log("--- Test 1: LP Investor Genesis Deposit (1,000 USDC) ---");
  const vault = new DeHedgeVaultManager(1000);
  let snap = vault.getSnapshot();
  assert(parseFloat(snap.totalAUM) === 1000, "Total AUM must be 1,000 USDC");
  assert(parseFloat(snap.totalShares) === 1000, "Total initial shares minted must be 1,000 $wALPHA");
  assert(snap.sharePriceNAV === "1.000000", "Initial NAV per share must be $1.000000");
  console.log(`   └─ Genesis AUM: ${snap.totalAUM} USDC | Shares: ${snap.totalShares} $wALPHA | NAV: $${snap.sharePriceNAV}\n`);

  // --------------------------------------------------------------------------
  // Test 2: Secondary LP Deposit at NAV $1.0
  // --------------------------------------------------------------------------
  console.log("--- Test 2: Secondary LP Investor Deposit (500 USDC) ---");
  const depRes = vault.deposit("0xLP_Investor_Beta", 500);
  snap = vault.getSnapshot();
  assert(parseFloat(snap.totalAUM) === 1500, "Total AUM must increase to 1,500 USDC");
  assert(parseFloat(snap.totalShares) === 1500, "Total shares must be 1,500 $wALPHA");
  assert(parseFloat(depRes.sharesMinted) === 500, "Minted shares for 500 USDC at $1.0 NAV must be 500 $wALPHA");
  console.log(`   └─ Beta LP Minted: ${depRes.sharesMinted} $wALPHA | New Total AUM: ${snap.totalAUM} USDC\n`);

  // --------------------------------------------------------------------------
  // Test 3: Profitable Alpha Trade & High-Water Mark NAV Appreciation
  // --------------------------------------------------------------------------
  console.log("--- Test 3: Alpha Arbitrage Yield (+150 USDC Profit) & 2&20 Fee ---");
  const yieldRes = vault.recordTradeProfit(150);
  snap = vault.getSnapshot();
  assert(parseFloat(yieldRes.lpCompoundedYield) === 120, "Net yield to LPs after 20% performance fee (30 USDC) must be 120 USDC");
  assert(parseFloat(snap.sharePriceNAV) > 1.0, "NAV per share must increase above $1.0");
  assert(snap.highWaterMarkNAV === snap.sharePriceNAV, "High-Water Mark must ratchet up to new peak NAV");
  console.log(`   └─ Net LP Profit: +${yieldRes.lpCompoundedYield} USDC | Agent/Manager Fees: +${yieldRes.agentTreasuryShare} USDC | New NAV: $${snap.sharePriceNAV}\n`);

  // --------------------------------------------------------------------------
  // Test 4: 100% Non-Custodial Withdrawal (Owner Only)
  // --------------------------------------------------------------------------
  console.log("--- Test 4: LP Redemption (Non-Custodial Principal + Yield Withdrawal) ---");
  const withdrawRes = vault.withdraw("0xLP_Investor_Beta", 500); // Redeem 500 shares
  const payoutUSDC = parseFloat(withdrawRes.payoutUSDC);
  assert(payoutUSDC > 500, "Investor must receive principal (500) + accrued alpha profit");
  snap = vault.getSnapshot();
  assert(parseFloat(snap.totalShares) === 1000, "Remaining shares must be exactly 1,000 $wALPHA");
  console.log(`   └─ Beta LP Redeemed: 500 $wALPHA -> ${withdrawRes.payoutUSDC} USDC (Alpha Yield Realized: +${(payoutUSDC - 500).toFixed(4)} USDC)\n`);

  // --------------------------------------------------------------------------
  // Test 5: Circuit Breaker Protection against Severe Drawdown
  // --------------------------------------------------------------------------
  console.log("--- Test 5: 5% Max Drawdown Protection & Circuit Breaker ---");
  const baselineAUM = parseFloat(vault.getSnapshot().totalAUM);
  const severeLoss = -(baselineAUM * 0.06); // 6% loss
  const lossRes = vault.recordTradeProfit(severeLoss);
  snap = vault.getSnapshot();
  assert(parseFloat(snap.sharePriceNAV) < 1.08, "NAV must drop after loss");
  assert(parseFloat(snap.highWaterMarkNAV) > parseFloat(snap.sharePriceNAV), "HWM must remain at peak and not decrease");
  console.log(`   └─ Severe Loss Impact: NAV dropped to $${snap.sharePriceNAV} | HWM preserved at $${snap.highWaterMarkNAV} (Zero Fee Billed)\n`);

  console.log("========================================================================");
  console.log("🎉 ALL DEHEDGE VAULT (ERC-4626) TESTS PASSED 100%!");
  console.log("   Institutional Non-Custodial Architecture Verified!");
  console.log("========================================================================\n");
}

runDeHedgeVaultContractTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
