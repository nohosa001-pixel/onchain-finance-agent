import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { keccak256, toHex, encodeFunctionData, parseAbi } from "viem";
import { SecurityGate } from "../security-gate-server/src/gate.js";
import { SecurityGateService } from "../security-gate-server/src/securityGateService.js";
import {
  UniversalEscrowClient,
  UNIVERSAL_ESCROW_ABI,
  UNIVERSAL_ESCROW_ADDRESSES,
} from "../eliza-agent-bridge/src/universalEscrowClient.js";
import type { PolicyConfig, TxRequest } from "../security-gate-server/src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ESCROW INTEROP FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function runUniversalEscrowInteropTest() {
  console.log("\n========================================================================");
  console.log("🔗 UNIVERSAL ESCROW HUB x SECURITY-GATE INTEROPERABILITY TEST SUITE");
  console.log("   Verifying Multichain Conditional Escrow Settlements (Base & Polygon)");
  console.log("========================================================================\n");

  const policyPath = path.resolve(__dirname, "../security-gate-server/config/policy.config.json");
  const rawPolicy = JSON.parse(fs.readFileSync(policyPath, "utf-8")) as PolicyConfig;

  const gate = new SecurityGate(rawPolicy);
  const gateService = new SecurityGateService(rawPolicy);

  // --------------------------------------------------------------------------
  // Test 1: Base Mainnet (8453) UniversalEscrowCore depositEscrow 승인 검증
  // --------------------------------------------------------------------------
  console.log("--- Test 1: Base Mainnet UniversalEscrowCore depositEscrow Approval ---");
  const baseJobId = keccak256(toHex(`otc_trade_base_${Date.now()}`));
  const baseDeposit = UniversalEscrowClient.createDepositPayload({
    chainId: 8453,
    jobId: baseJobId,
    tokenAddress: USDC_BASE,
    amountUSDC: 75,
    domain: 1, // Finance
    durationSec: 1800,
    description: "OTC 대량 거래를 위한 Universal Escrow 75 USDC 조건부 예치",
  });

  const baseTxRequest: TxRequest = {
    chainId: 8453,
    to: baseDeposit.targetContract,
    data: baseDeposit.calldata,
    value: "0",
  };

  const baseRes = await gate.validateTransaction(baseTxRequest);
  assert(baseRes.approved, "Base UniversalEscrowCore depositEscrow 요청은 화이트리스트 승인되어야 함");
  assert(
    baseDeposit.targetContract.toLowerCase() === UNIVERSAL_ESCROW_ADDRESSES[8453].toLowerCase(),
    "Base 대상 컨트랙트 주소가 일치해야 함"
  );
  console.log(`   └─ 검증 통과: Target=${baseDeposit.targetContract}, Method=depositEscrow (0xfbee5480)\n`);

  // --------------------------------------------------------------------------
  // Test 2: Polygon Mainnet (137) UniversalEscrowCore 멀티체인 라우팅 검증
  // --------------------------------------------------------------------------
  console.log("--- Test 2: Polygon Mainnet (137) Multichain Escrow Routing ---");
  gate.resetState();

  const polyDeposit = UniversalEscrowClient.createDepositPayload({
    chainId: 137,
    tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as `0x${string}`, // Polygon USDC
    amountUSDC: 50,
    domain: 1,
    description: "Polygon 체인 에스크로 조건부 예치",
  });

  const polyTxRequest: TxRequest = {
    chainId: 137,
    to: polyDeposit.targetContract,
    data: polyDeposit.calldata,
    value: "0",
  };

  const polyRes = await gate.validateTransaction(polyTxRequest);
  assert(polyRes.approved, "Polygon UniversalEscrowCore depositEscrow 요청도 정상 승인되어야 함");
  assert(
    polyDeposit.targetContract.toLowerCase() === UNIVERSAL_ESCROW_ADDRESSES[137].toLowerCase(),
    "Polygon 대상 컨트랙트 주소가 일치해야 함"
  );
  console.log(`   └─ Polygon 멀티체인 라우팅 통과: Target=${polyDeposit.targetContract}\n`);

  // --------------------------------------------------------------------------
  // Test 3: 미인가 메서드 (Forbidden Selector) 차단 검증
  // --------------------------------------------------------------------------
  console.log("--- Test 3: Unauthorized Selector on UniversalEscrowCore Rejection ---");
  gate.resetState();

  // executeSettlementWithProof는 관리자/오라클 전용이므로 정책 화이트리스트에 없음 -> 에이전트 호출 시 차단되어야 함
  const forbiddenCalldata = encodeFunctionData({
    abi: UNIVERSAL_ESCROW_ABI,
    functionName: "executeSettlementWithProof",
    args: [
      baseJobId,
      [{ recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", amount: 1000000n }],
      "0x1234",
      BigInt(Date.now() + 10000),
      27,
      keccak256(toHex("r")),
      keccak256(toHex("s")),
    ],
  });

  const forbiddenTx: TxRequest = {
    chainId: 8453,
    to: UNIVERSAL_ESCROW_ADDRESSES[8453],
    data: forbiddenCalldata,
    value: "0",
  };

  const forbiddenRes = await gate.validateTransaction(forbiddenTx);
  assert(!forbiddenRes.approved, "허용되지 않은 에스크로 메서드는 반드시 차단되어야 함");
  assert(
    forbiddenRes.reason?.includes("Function selector") && forbiddenRes.reason?.includes("forbidden"),
    "셀렉터 거부 사유가 명시되어야 함"
  );
  console.log(`   └─ 미인가 메서드 차단 성공: ${forbiddenRes.reason}\n`);

  // --------------------------------------------------------------------------
  // Test 4: 조건 미충족 시 환불 (refundEscrow) 파이프라인 검증
  // --------------------------------------------------------------------------
  console.log("--- Test 4: Safe Refund Pipeline (refundEscrow) ---");
  gate.resetState();

  const refundPayload = UniversalEscrowClient.createRefundPayload(8453, baseJobId);
  const refundTxRequest: TxRequest = {
    chainId: 8453,
    to: refundPayload.targetContract,
    data: refundPayload.calldata,
    value: "0",
  };

  const refundRes = await gate.validateTransaction(refundTxRequest);
  assert(refundRes.approved, "타임아웃 또는 조건 미충족 시 refundEscrow는 안전하게 승인되어야 함");
  console.log(`   └─ 환불 파이프라인 검증 통과: Method=refundEscrow (0x47aed508)\n`);

  // --------------------------------------------------------------------------
  // Test 5: SecurityGateService Safe 트랜잭션 브로드캐스트 E2E 검증
  // --------------------------------------------------------------------------
  console.log("--- Test 5: End-to-End Safe Execution Pipeline Integration ---");
  gateService.resetState();

  const liveRes = await gateService.validateAndExecute({
    agentId: "wallstreet-disruptor-01",
    chainId: 8453,
    to: baseDeposit.targetContract,
    data: baseDeposit.calldata,
    value: "0",
  });

  assert(liveRes.approved, "SecurityGateService에서 에스크로 트랜잭션이 최종 승인되어야 함");
  assert(typeof liveRes.txHash === "string" && liveRes.txHash.startsWith("0x"), "유효한 TxHash 반환 확인");
  console.log(`   └─ Safe Session Key 서명 및 온체인 브로드캐스트 완료! (TxHash: ${liveRes.txHash})\n`);

  console.log("========================================================================");
  console.log("🎉 ALL 5 UNIVERSAL ESCROW INTEROPERABILITY TESTS PASSED SUCCESSFULLY!");
  console.log("   Institutional Grade Conditional Escrow + Security-Gate Gatekeeper Verified!");
  console.log("========================================================================\n");
}

runUniversalEscrowInteropTest().catch((err) => {
  console.error("FATAL ESCROW INTEROP ERROR:", err);
  process.exit(1);
});
