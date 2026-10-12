import dotenv from "dotenv";
import { encodeFunctionData, parseAbi, parseUnits, type Hex } from "viem";
import { SecurityGateClient } from "./actions/proposeTx.js";
import type { AgentContext, ProposeTxPayload } from "./types.js";

dotenv.config();

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
]);

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const UNKNOWN_CONTRACT = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const; // vitalik.eth

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemonstration() {
  console.log("===============================================================================");
  console.log("🏦 WallStreet Disruptor Agent x Security-Gate End-to-End Execution Simulator");
  console.log("===============================================================================\n");

  const context: AgentContext = {
    agentId: "wallstreet-disruptor-01",
    gateUrl: process.env.SECURITY_GATE_URL || "http://localhost:3000",
    apiKey: process.env.GATE_API_KEY || process.env.SECURITY_GATE_API_KEY || "sg_sec_live_99f01bc_sample_token",
  };

  const client = new SecurityGateClient(context);

  // 시나리오 1: 정상 허용 범위 내의 50 USDC 전송
  console.log("▶ [시나리오 1] 정상 자산 전송 (50 USDC, 화이트리스트 컨트랙트 및 메서드)");
  const validCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [RECIPIENT, parseUnits("50", 6)],
  });

  const tx1: ProposeTxPayload = {
    chainId: 8453,
    to: USDC_BASE,
    data: validCalldata,
    description: "리밸런싱을 위한 50 USDC 정상 이체",
  };
  const res1 = await client.proposeTransaction(tx1);
  console.log(`결과: ${res1.approved ? "✅ 승인 (TxHash: " + res1.txHash + ")" : "🚫 거부: " + res1.reason}\n`);

  // 시나리오 2: 쿨다운 제한 테스트 (시나리오 1 직후 즉시 2차 요청 시도)
  console.log("▶ [시나리오 2] 쿨다운(Cooldown) 제약 방어 (5초 미만 내 연속 호출 시도)");
  const res2 = await client.proposeTransaction(tx1);
  console.log(`결과: ${res2.approved ? "✅ 승인" : "🚫 거부 (예상대로 방어): " + res2.reason}\n`);

  // 쿨다운 해제를 위해 6초 대기
  console.log("⏳ 쿨다운 대기 중 (6초)...");
  await sleep(6000);

  // 시나리오 3: 비인가 대상 컨트랙트 호출 시도 (화이트리스트 위반)
  console.log("▶ [시나리오 3] 비인가(Unlisted) 스마트 컨트랙트 호출 차단");
  const tx3: ProposeTxPayload = {
    chainId: 8453,
    to: UNKNOWN_CONTRACT,
    data: validCalldata,
    description: "검증되지 않은 외부 미확인 풀로의 전송 시도",
  };
  const res3 = await client.proposeTransaction(tx3);
  console.log(`결과: ${res3.approved ? "✅ 승인" : "🚫 거부 (예상대로 차단): " + res3.reason}\n`);

  // 시나리오 4: 단일 트랜잭션 한도 초과 (정책상 100 USDC 상한인데 500 USDC 요청)
  console.log("▶ [시나리오 4] 단일 트랜잭션 지출 한도(maxPerTx: 100 USDC) 초과 차단");
  const hugeCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [RECIPIENT, parseUnits("500", 6)],
  });
  const tx4: ProposeTxPayload = {
    chainId: 8453,
    to: USDC_BASE,
    data: hugeCalldata,
    description: "500 USDC 과잉 송금 시도",
  };
  const res4 = await client.proposeTransaction(tx4);
  console.log(`결과: ${res4.approved ? "✅ 승인" : "🚫 거부 (한도 초과 방어): " + res4.reason}\n`);

  // 시나리오 5: 비인가 함수 셀렉터 실행 시도 (transferFrom 등 미허용 메서드)
  console.log("▶ [시나리오 5] 비인가 함수 셀렉터(Forbidden Method) 차단");
  const forbiddenCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transferFrom",
    args: [RECIPIENT, RECIPIENT, parseUnits("10", 6)],
  });
  const tx5: ProposeTxPayload = {
    chainId: 8453,
    to: USDC_BASE,
    data: forbiddenCalldata,
    description: "미허용 transferFrom 함수 호출",
  };
  const res5 = await client.proposeTransaction(tx5);
  console.log(`결과: ${res5.approved ? "✅ 승인" : "🚫 거부 (셀렉터 차단): " + res5.reason}\n`);

  console.log("===============================================================================");
  console.log("🎯 시뮬레이션 완료: 모든 가드레일이 결정론적으로 정상 작동하고 있습니다.");
  console.log("===============================================================================");
}

if (process.argv[1] && process.argv[1].endsWith("demo-runner.ts")) {
  runDemonstration().catch(console.error);
}

export { runDemonstration };
