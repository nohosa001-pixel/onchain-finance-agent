import { encodeFunctionData, parseAbi, parseUnits, toHex, keccak256, type Hex } from "viem";
import { SecurityGate } from "../security-gate-server/src/gate.js";
import { OracleX402Service } from "../security-gate-server/src/oracleService.js";
import { DeHedgeVaultManager } from "../security-gate-server/src/fundVault.js";
import type { PolicyConfig, TxRequest } from "../security-gate-server/src/types.js";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const ATTACKER_WALLET = "0x6666666666666666666666666666666666666666" as const;
const UNKNOWN_DEX = "0x1111111111111111111111111111111111111111" as const;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [RED-TEAM BREACH] ${message}`);
    throw new Error(`RED-TEAM VULNERABILITY DETECTED: ${message}`);
  }
  console.log(`🛡️ [DEFENSE VERIFIED] ${message}`);
}

async function runRedTeamStressTestSuite() {
  console.log("\n========================================================================");
  console.log("🔥 ADVERSARIAL RED-TEAM STRESS & PENETRATION TEST SUITE");
  console.log("   Testing Security-Gate, x402 Oracle, and Vault under malicious attack");
  console.log("========================================================================\n");

  const strictPolicy: PolicyConfig = {
    version: "1.0.0-hardened",
    agentId: "wallstreet-alpha-01",
    allowedChains: [8453],
    rateLimits: {
      cooldownSeconds: 0, // 속도 한도 및 일일 한도 집중 측정을 위해 쿨다운 0으로 세팅
      maxRequestsPerMinute: 50,
    },
    tokenPolicies: {
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
        decimals: 6,
        maxPerTx: "50000000", // 단일 50 USDC
        maxDailyLimit: "200000000", // 일일 누적 200 USDC
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

  const gate = new SecurityGate(strictPolicy);

  // --------------------------------------------------------------------------
  // Attack 1: Salami Dust Velocity Attack (살라미 쪼개기 누적 드레인 공격)
  // --------------------------------------------------------------------------
  console.log("--- [Attack 1] Salami Slicing Attack: 40 USDC x 10 Repeated Rapid Injections ---");
  console.log("목표: 단일 한도(50 USDC)를 우회하여 40 USDC씩 연속 출금해 일일 한도(200 USDC) 돌파 시도");

  let totalDrained = 0n;
  let rejectedAttempts = 0;

  for (let i = 1; i <= 10; i++) {
    const calldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [ATTACKER_WALLET, parseUnits("40", 6)],
    });

    const tx: TxRequest = {
      chainId: 8453,
      to: USDC_BASE,
      data: calldata,
      value: "0",
    };

    const res = await gate.validateTransaction(tx);
    if (res.approved) {
      totalDrained += parseUnits("40", 6);
      console.log(`   [Attempt ${i}] 40 USDC 승인됨 (누적: ${Number(totalDrained) / 1e6} USDC)`);
    } else {
      rejectedAttempts++;
      console.log(`   [Attempt ${i}] 🚨 방화벽 차단 발동! 사유: ${res.reason?.slice(0, 70)}...`);
    }
  }

  assert(
    totalDrained === parseUnits("200", 6),
    `누적 인출액은 정확히 200 USDC에서 멈춰야 함 (실제: ${Number(totalDrained) / 1e6} USDC)`
  );
  assert(
    rejectedAttempts === 5,
    `200 USDC 도달 이후 5번의 시도는 모두 즉각 차단되어야 함 (차단 횟수: ${rejectedAttempts})`
  );
  console.log("✅ [결과] 살라미 드레인 공격 100% 방어 완료 (일일 한도 초과 인출 0 USDC)\n");

  // --------------------------------------------------------------------------
  // Attack 2: Calldata Smuggling & Garbage Injection (Calldata 위조 및 가비지 주입)
  // --------------------------------------------------------------------------
  console.log("--- [Attack 2] Calldata Smuggling & Malformed Payload Injection ---");
  console.log("목표: 4바이트 셀렉터 뒤에 악의적 오버플로우 바이트 또는 가비지 데이터를 삽입하여 디코더 크래시 유발");

  // (1) 4바이트는 transfer이지만 뒤에 디코딩 불가능한 가비지 바이트 덧붙이기
  const malformedCalldata = "0xa9059cbb1234deadbeef" as Hex;
  const malformedTx: TxRequest = {
    chainId: 8453,
    to: USDC_BASE,
    data: malformedCalldata,
    value: "0",
  };

  const malformedRes = await gate.validateTransaction(malformedTx);
  assert(!malformedRes.approved, "비정상 calldata 주입 시 무조건 거부되어야 함");
  assert(
    malformedRes.reason?.includes("decoding failed") || malformedRes.reason?.includes("Invalid"),
    "Calldata 디코딩 실패 사유가 명시되어야 함"
  );
  console.log(`   └─ 차단 성공 사유: ${malformedRes.reason}`);

  // (2) 4바이트 미만의 잘린 셀렉터 주입 (Truncated 2-byte)
  const truncatedTx: TxRequest = {
    chainId: 8453,
    to: USDC_BASE,
    data: "0xa905" as Hex,
    value: "0",
  };
  const truncatedRes = await gate.validateTransaction(truncatedTx);
  assert(!truncatedRes.approved, "잘린 셀렉터는 차단되어야 함");
  console.log("✅ [결과] Calldata 스머글링 및 가비지 주입 공격 방어 완료 (서버 크래시 0건)\n");

  // --------------------------------------------------------------------------
  // Attack 3: Fake x402 Receipt & Oracle Tampering (x402 영수증 위조 공격)
  // --------------------------------------------------------------------------
  console.log("--- [Attack 3] Counterfeit x402 Oracle Payment Proof Forgery ---");
  console.log("목표: 위조된 0x000... 영수증으로 오라클 인텔리전스 무단 탈취 시도");

  const oracleService = new OracleX402Service();

  // (1) 미결제 요청 -> 402 반환 확인
  const unpaidReq = oracleService.handleMarketIntelligenceRequest();
  assert(!unpaidReq.isPaid, "미결제 시 isPaid는 반드시 false여야 함");
  assert(unpaidReq.invoice?.status === 402, "반드시 HTTP 402 상태코드여야 함");
  console.log("   └─ 미결제 요청 402 Payment Required 반환 확인");

  // (2) 위조된 영수증 (짧거나 형식이 틀린 0x 문자열)
  const fakeReceipt1 = "0xinvalid_short";
  const fakeVerify1 = oracleService.handleMarketIntelligenceRequest(fakeReceipt1);
  assert(!fakeVerify1.isPaid, "형식이 잘못된 0x 해시는 결제 승인되면 안 됨");
  console.log("   └─ 가짜 영수증 1 차단 성공 (규격 미달 0x 해시)");

  // (3) 영수증 헤더 누락 또는 공백
  const fakeReceipt2 = "";
  const fakeVerify2 = oracleService.handleMarketIntelligenceRequest(fakeReceipt2);
  assert(!fakeVerify2.isPaid, "빈 헤더는 오라클 데이터 접근 불가");
  console.log("   └─ 가짜 영수증 2 차단 성공 (빈 헤더)");

  // (4) 정상 규격의 66자 Hex 해시 지불 증빙 -> 승인 확인
  const validPaymentProof = "0x48e0221087371ad597b814830b83564afc222a9c283ee28ca4df83f50e494223";
  const validVerify = oracleService.handleMarketIntelligenceRequest(validPaymentProof);
  assert(validVerify.isPaid, "정상 규격 결제 증빙은 통과되어야 함");
  assert(validVerify.data?.status === "paid", "데이터 상태는 paid여야 함");
  console.log("   └─ 정상 66자 영수증 결제 증빙 승인 확인");
  console.log("✅ [결과] x402 오라클 위조 영수증 방어 완료\n");

  // --------------------------------------------------------------------------
  // Attack 4: High-Concurrency Burst Race Condition (동시성 레이스 컨디션 공격)
  // --------------------------------------------------------------------------
  console.log("--- [Attack 4] High-Concurrency Multi-Threaded Burst Race Condition ---");
  console.log("목표: Promise.all로 20개의 40 USDC 요청을 동시 전송하여 슬라이딩 윈도우 레이스 컨디션 돌파 시도");

  gate.resetState(); // 상태 초기화 후 20개 동시 요청
  const valid40USDCCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [ATTACKER_WALLET, parseUnits("40", 6)],
  });

  const burstRequests = Array.from({ length: 20 }).map((_, idx) => {
    return gate.validateTransaction({
      chainId: 8453,
      to: USDC_BASE,
      data: valid40USDCCalldata,
      value: "0",
    });
  });

  const burstResults = await Promise.all(burstRequests);
  const approvedCount = burstResults.filter((r) => r.approved).length;
  const rejectedCount = burstResults.filter((r) => !r.approved).length;

  console.log(`   └─ 동시 20개 난사 결과: 승인 ${approvedCount}건, 차단 ${rejectedCount}건`);
  assert(
    approvedCount === 5,
    `동시 요청 시에도 일일 한도(200 USDC = 40 USDC x 5건)를 1건이라도 초과 승인하면 안 됨 (실제 승인: ${approvedCount}건)`
  );
  assert(
    rejectedCount === 15,
    `나머지 15건은 모두 완벽히 차단되어야 함 (실제 차단: ${rejectedCount}건)`
  );
  console.log("✅ [결과] 고동시성 레이스 컨디션 한도 돌파 방어 완료\n");

  // --------------------------------------------------------------------------
  // Attack 5: Vault Accounting Distortion & High-Water Mark Attack (수익 정산 왜곡 공격)
  // --------------------------------------------------------------------------
  console.log("--- [Attack 5] Vault Accounting Distortion & Negative Yield Attack ---");
  console.log("목표: 손실(-500 USDC) 발생 시 수수료를 뜯어가거나 High-Water Mark를 속일 수 있는지 검증");

  const vault = new DeHedgeVaultManager();
  vault.deposit("0xHonestLP", 10000); // 10,000 USDC 수탁

  // 손실 발생 (profit = -500)
  const lossSettlement = vault.recordTradeProfit(-500);
  assert(!lossSettlement.isHighWaterMarkBroken, "손실 발생 시 HWM은 절대 갱신되면 안 됨");
  assert(parseFloat(lossSettlement.agentTreasuryShare) === 0, "손실 발생 시 성과 수수료는 $0이어야 함");
  assert(parseFloat(lossSettlement.newNAV) < 1.0, "손실 후 NAV는 1.0 미만으로 정직하게 하락해야 함");
  console.log(`   └─ 손실 반영 NAV: $${lossSettlement.newNAV} (HWM 경신 방지 및 수수료 0원 동결 확인)`);

  // 손실 만회 후 이전 고점 돌파 전까지 수수료 징수 차단 확인
  const recoverySettlement = vault.recordTradeProfit(200); // 아직 원금(10,000) 미회복 (-300)
  assert(!recoverySettlement.isHighWaterMarkBroken, "고점 회복 전에는 여전히 HWM 경신 불가");
  assert(parseFloat(recoverySettlement.agentTreasuryShare) === 0, "고점 회복 전에는 수수료 징수 불가");
  console.log("   └─ 손실 회복 구간(Rebound) 수수료 0원 방어 확인");
  console.log("✅ [결과] High-Water Mark 금융 수학 조작 공격 방어 완료\n");

  console.log("========================================================================");
  console.log("🏆 ALL 5 ADVERSARIAL RED-TEAM ATTACK SCENARIOS SUCCESSFULLY THWARTED!");
  console.log("   Zero Drain | Zero Race-Condition | Zero Crash | Zero Ledger Fraud");
  console.log("========================================================================\n");
}

runRedTeamStressTestSuite().catch((err) => {
  console.error("FATAL RED-TEAM FAILURE:", err);
  process.exit(1);
});
