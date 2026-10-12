import { encodeFunctionData, parseAbi, parseUnits } from "viem";
import { SecurityGate } from "../security-gate-server/src/gate.js";
import type { PolicyConfig, TxRequest } from "../security-gate-server/src/types.js";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
]);

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const UNKNOWN_CONTRACT = "0x0000000000000000000000000000000000000001" as const;
const RECIPIENT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("🧪 RUNNING COMPREHENSIVE SECURITY-GATE TEST SUITE");
  console.log("=======================================================\n");

  const testPolicy: PolicyConfig = {
    version: "1.0.0",
    agentId: "test-agent",
    allowedChains: [8453, 137],
    rateLimits: {
      cooldownSeconds: 2,
      maxRequestsPerMinute: 10,
    },
    tokenPolicies: {
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
        decimals: 6,
        maxPerTx: "100000000", // 100 USDC
        maxDailyLimit: "200000000", // 200 USDC
      },
    },
    contractWhitelist: [
      {
        chainId: 8453,
        address: USDC_BASE,
        allowedSelectors: ["0xa9059cbb", "0x095ea7b3"], // transfer, approve
      },
    ],
  };

  const gate = new SecurityGate(testPolicy);

  // 1. 정상 50 USDC 이체
  console.log("--- Test 1: Valid Transaction Approval ---");
  const validData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [RECIPIENT, parseUnits("50", 6)],
  });
  const res1 = await gate.validateTransaction({
    chainId: 8453,
    to: USDC_BASE,
    data: validData,
  });
  assert(res1.approved === true, "Valid 50 USDC transfer must be approved");
  assert(res1.decodedMethod === "transfer", "Decoded method must be transfer");

  // 2. 쿨다운 검증 (2초 이내 재호출)
  console.log("\n--- Test 2: Cooldown Enforcement ---");
  const res2 = await gate.validateTransaction({
    chainId: 8453,
    to: USDC_BASE,
    data: validData,
  });
  assert(res2.approved === false, "Immediate retry must be rejected by cooldown");
  assert(res2.reason?.includes("Cooldown") === true, "Rejection reason must mention Cooldown");

  // 2초 대기하여 쿨다운 해제
  console.log("Waiting 2.1s for cooldown to elapse...");
  await new Promise((r) => setTimeout(r, 2100));

  // 3. 비인가 체인 (예: Chain 1 Ethereum Mainnet)
  console.log("\n--- Test 3: Unauthorized Chain ID ---");
  const res3 = await gate.validateTransaction({
    chainId: 1,
    to: USDC_BASE,
    data: validData,
  });
  assert(res3.approved === false, "Unauthorized chain 1 must be rejected");

  // 4. 비인가 컨트랙트 주소
  console.log("\n--- Test 4: Unauthorized Contract Target ---");
  const res4 = await gate.validateTransaction({
    chainId: 8453,
    to: UNKNOWN_CONTRACT,
    data: validData,
  });
  assert(res4.approved === false, "Unknown contract must be rejected");

  // 5. 비인가 함수 셀렉터 (transferFrom)
  console.log("\n--- Test 5: Forbidden Function Selector ---");
  const forbiddenData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transferFrom",
    args: [RECIPIENT, RECIPIENT, parseUnits("10", 6)],
  });
  const res5 = await gate.validateTransaction({
    chainId: 8453,
    to: USDC_BASE,
    data: forbiddenData,
  });
  assert(res5.approved === false, "Forbidden selector must be rejected");

  // 6. 단일 건 한도 초과 (150 USDC > 100 USDC)
  console.log("\n--- Test 6: Single Transaction Limit Breach ---");
  const overLimitData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [RECIPIENT, parseUnits("150", 6)],
  });
  const res6 = await gate.validateTransaction({
    chainId: 8453,
    to: USDC_BASE,
    data: overLimitData,
  });
  assert(res6.approved === false, "Over maxPerTx must be rejected");
  assert(res6.reason?.includes("exceeds single-transaction limit") === true, "Must state single-tx limit");

  // 7. 24시간 일일 누적 한도 초과 (누적 50 + 80 + 80 = 210 > 200 USDC)
  console.log("\n--- Test 7: Daily Spend Limit Breach ---");
  // 80 USDC 승인 (현재 누적 50 + 80 = 130 USDC)
  const tx80 = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [RECIPIENT, parseUnits("80", 6)],
  });
  const res7_1 = await gate.validateTransaction({
    chainId: 8453,
    to: USDC_BASE,
    data: tx80,
  });
  assert(res7_1.approved === true, "Second transfer of 80 USDC must be approved (130 / 200)");

  await new Promise((r) => setTimeout(r, 2100)); // 쿨다운 해제

  // 다시 80 USDC 시도 -> 130 + 80 = 210 > 200 USDC
  const res7_2 = await gate.validateTransaction({
    chainId: 8453,
    to: USDC_BASE,
    data: tx80,
  });
  assert(res7_2.approved === false, "Third transfer exceeding 200 USDC daily limit must be rejected");
  assert(res7_2.reason?.includes("Daily spend limit reached") === true, "Must state daily limit");

  // 8. SecurityGateService Safe 스마트 계정 검증 및 실행 테스트
  console.log("\n--- Test 8: SecurityGateService Safe Execution Pipeline ---");
  const { SecurityGateService } = await import("../security-gate-server/src/securityGateService.js");
  const service = new SecurityGateService(testPolicy);
  const safeRes = await service.validateAndExecute({
    agentId: "safe-test-agent",
    chainId: 8453,
    to: USDC_BASE,
    value: "0",
    data: validData,
  });
  assert(safeRes.approved === true, "SecurityGateService must approve valid Safe tx");
  assert(typeof safeRes.txHash === "string" && safeRes.txHash.startsWith("0x"), "Must return valid txHash");

  // 9. DeHedgeVaultManager ERC-4626 지분 및 2 & 20 HWM 정산 테스트
  console.log("\n--- Test 9: DeHedgeVaultManager ERC-4626 & High-Water Mark Fee Settlement ---");
  const { DeHedgeVaultManager } = await import("../security-gate-server/src/fundVault.js");
  const vault = new DeHedgeVaultManager(1000); // 1,000 USDC genesis
  const deposit = vault.deposit("0xInvestorA", 5000);
  assert(Number(deposit.currentNAV) === 1.0, "Genesis NAV must be 1.0");
  assert(vault.getSnapshot().totalAUM === "6000", "Total AUM must reflect deposits");

  // 수익 실현 및 성과보수 배분 (100 USDC 수익)
  const settlement = vault.recordTradeProfit(100);
  assert(settlement.isHighWaterMarkBroken === true, "New all-time high profit must break HWM");
  assert(Number(settlement.newNAV) > 1.0, "NAV must increase with profit");
  assert(Number(settlement.agentTreasuryShare) === 10, "10% of profit must go to Agent Operating Treasury");
  assert(Number(settlement.lpCompoundedYield) === 80, "80% of profit must stay in Vault compounding LP NAV");

  // 10. A.GRID HTTP 402 (x402) 오라클 결제 프로토콜 테스트
  console.log("\n--- Test 10: A.GRID HTTP 402 (x402) Oracle Invoicing & Payment Verification ---");
  const { OracleX402Service } = await import("../security-gate-server/src/oracleService.js");
  const oracle = new OracleX402Service();

  // 지불 증빙 없는 호출 -> 402 Payment Required 반환
  const unpaidReq = oracle.handleMarketIntelligenceRequest();
  assert(unpaidReq.isPaid === false, "Unpaid request must return isPaid=false");
  assert(unpaidReq.invoice?.status === 402, "Must return HTTP 402 status");
  assert(unpaidReq.invoice?.invoice.costUSDC === "0.001", "Must invoice 0.001 USDC");

  // 지불 증빙 동봉 호출 -> 200 데이터 언락 (66자 유효한 온체인 트랜잭션 해시)
  const paidReq = oracle.handleMarketIntelligenceRequest(
    "0x48e0221087371ad597b814830b83564afc222a9c283ee28ca4df83f50e494223"
  );
  assert(paidReq.isPaid === true, "Paid request must return isPaid=true");
  assert(paidReq.data?.status === "paid", "Must return paid status");
  assert(typeof paidReq.data?.marketData.arbitrageSpreadBps === "number", "Must contain verified spread");

  // 11. QuantStrategyEngine 퀀트 전략 계산 테스트
  console.log("\n--- Test 11: QuantStrategyEngine Delta-Neutral Arbitrage Decision Engine ---");
  const { QuantStrategyEngine } = await import("../eliza-agent-bridge/src/quantStrategyEngine.js");
  const quant = new QuantStrategyEngine();

  const decision = quant.evaluate(paidReq.data!.marketData);
  assert(decision.tradeRecommended === true, "Spread >= 25 bps must trigger trade recommendation");
  assert(decision.strategyName === "DELTA_NEUTRAL_DEX_ARBITRAGE", "Strategy must be arbitrage");
  assert(decision.calldata.startsWith("0x"), "Must generate valid calldata");

  console.log("\n=======================================================");
  console.log("🎉 ALL 11 DEHEDGE & SECURITY-GATE TESTS PASSED SUCCESSFULLY!");
  console.log("=======================================================\n");
}

runTestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
