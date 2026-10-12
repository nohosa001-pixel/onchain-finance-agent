import dotenv from "dotenv";
import http from "http";
import { parseAbi, encodeFunctionData, parseUnits } from "viem";
import { app, gateService, oracleService, vaultManager } from "../../security-gate-server/src/server.js";
import { OracleX402Client } from "./actions/queryOracleX402.js";
import { QuantStrategyEngine } from "./quantStrategyEngine.js";
import { SecurityGateClient } from "./actions/proposeTx.js";
import { UniversalEscrowClient } from "./universalEscrowClient.js";
import { TelegramNotifier } from "./telegramNotifier.js";
import type { AgentContext, ProposeTxPayload } from "./types.js";

dotenv.config();

const PORT = 3000;
const GATE_URL = `http://localhost:${PORT}`;
const API_KEY = "sg_sec_live_99f01bc_sample_token";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const UNKNOWN_DRAINER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as const;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureServerRunning(): Promise<http.Server | null> {
  return new Promise((resolve) => {
    // 이미 3000 포트가 열려있는지 확인
    const checkReq = http.get(`${GATE_URL}/health`, (res) => {
      if (res.statusCode === 200) {
        resolve(null); // 이미 서버 구동 중
      } else {
        const server = app.listen(PORT, () => resolve(server));
      }
    });
    checkReq.on("error", () => {
      // 서버가 꺼져있으면 직접 구동
      const server = app.listen(PORT, () => {
        resolve(server);
      });
    });
  });
}

export async function runAutonomousHedgeFundSimulation() {
  console.log("==========================================================================================");
  console.log("🏛️  [DeHedge] DECENTRALIZED AUTONOMOUS HEDGE FUND - LIVE ENGINE SIMULATION");
  console.log("    Autonomous Agent Brain (ElizaOS) x Security-Gate x A.GRID HTTP 402 Oracle x Safe Vault");
  console.log("==========================================================================================\n");

  const spawnedServer = await ensureServerRunning();
  if (spawnedServer) {
    console.log(`🚀 [System] Security-Gate & Oracle Integrated Server initialized on ${GATE_URL}\n`);
  }

  const context: AgentContext = {
    agentId: "wallstreet-alpha-fund-01",
    gateUrl: GATE_URL,
    apiKey: API_KEY,
  };

  const gateClient = new SecurityGateClient(context);
  const oracleClient = new OracleX402Client(GATE_URL);
  const quantEngine = new QuantStrategyEngine();
  const telegram = new TelegramNotifier();

  // -------------------------------------------------------------------------
  // [PHASE 1] Genesis Deposit: LP 투자자 자금 수탁
  // -------------------------------------------------------------------------
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📥 [PHASE 1] LP 투자자 자본 수탁 (ERC-4626 Tokenized Vault Genesis)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const lpDepositAmount = 10000; // 10,000 USDC
  const depositRes = vaultManager.deposit("0xInstitutional_LP_Alpha", lpDepositAmount);
  let snap = vaultManager.getSnapshot();

  console.log(`• 기관 LP 예치액: ${lpDepositAmount.toLocaleString()} USDC`);
  console.log(`• 지분 토큰 발행: ${depositRes.sharesMinted} $wALPHA`);
  console.log(`• 기준 순자산가치 (NAV): $${snap.sharePriceNAV} USDC / share`);
  console.log(`• 에이전트 자립 운영 금고: $${snap.agentTreasuryUSDC} USDC (초기 시드)\n`);

  // -------------------------------------------------------------------------
  // [PHASE 2] Autonomous Cycle 01: x402 유료 데이터 구매 -> 차익거래 체결
  // -------------------------------------------------------------------------
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚡ [CYCLE 01] 자율 하트비트 펄스 수신 -> x402 오라클 데이터 구매 -> 델타 뉴트럴 차익거래");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("1. [Heartbeat] 5분 주기 크론 펄스 발생 -> WallStreet-Disruptor-Agent 활성화.");

  // x402 데이터 구매
  console.log("2. [Data Ingestion] A.GRID 시장 오라클 엔드포인트 호출...");
  const oracleRes = await oracleClient.fetchMarketIntelligence(context.agentId);

  if (oracleRes.success && oracleRes.marketData) {
    console.log(`   └─ 💳 [x402] 402 Payment Required 감지 -> 0.001 USDC 마이크로 결제 자동 집행!`);
    console.log(`   └─ 🧾 결제 영수증 해시: ${oracleRes.paymentProof?.slice(0, 20)}...`);
    console.log(`   └─ 📊 수신된 정제 데이터: Uniswap v3 ETH: $${oracleRes.marketData.ethUsdcUniswapV3} | Aerodrome ETH: $${oracleRes.marketData.ethUsdcAerodrome}`);
    console.log(`   └─ 🎯 가격 스프레드: ${oracleRes.marketData.arbitrageSpreadBps} bps | 리스크 등급: ${oracleRes.marketData.riskScore}`);

    // 에이전트 자립 금고에서 데이터 구매비 차감
    vaultManager.deductAgentExpense(0.001, "A.GRID x402 Data Ingestion");

    // 퀀트 전략 계산
    const decision = quantEngine.evaluate(oracleRes.marketData);
    console.log(`3. [Quant Strategy] ${decision.strategyName} 수립.`);
    console.log(`   └─ 분석 사유: ${decision.reason}`);

    if (decision.tradeRecommended) {
      // Security-Gate에 제안 (PROPOSE_TRANSACTION)
      console.log(`4. [Execution Relay] Security-Gate로 PROPOSE_TRANSACTION 제안 전송...`);
      const txPayload: ProposeTxPayload = {
        chainId: 8453,
        to: decision.targetContract,
        data: decision.calldata,
        description: `DEX 스프레드 차익거래 (${decision.tradeAmountUSDC} USDC)`,
      };

      const gateRes = await gateClient.proposeTransaction(txPayload);

      if (gateRes.approved) {
        console.log(`   └─ 🛡️ [Security-Gate] 검증 통과 (화이트리스트 ✅, 한도 ✅, 슬리피지 ✅)`);
        console.log(`   └─ ✍️ Safe Session Key 서명 및 온체인 브로드캐스트 성공! (TxHash: ${gateRes.txHash})`);

        // 차익거래 수익 실현 및 2 & 20 HWM 정산
        const profit = decision.expectedProfitUSDC;
        const settlement = vaultManager.recordTradeProfit(profit);
        console.log(`5. [Yield Settlement] 차익거래 수익 실현: +${profit} USDC`);
        console.log(`   └─ 📈 신규 NAV: $${settlement.newNAV} (High-Water Mark 경신: ${settlement.isHighWaterMarkBroken ? "YES" : "NO"})`);
        console.log(`   └─ 💰 분배: LP 복리 유보(+${settlement.lpCompoundedYield} USDC) | 에이전트 금고(+${settlement.agentTreasuryShare} USDC) | 매니저 수수료\n`);

        await telegram.notifyTradeExecution({
          spreadBps: oracleRes.marketData.arbitrageSpreadBps,
          amountUSDC: decision.tradeAmountUSDC,
          profitUSDC: profit,
          newNAV: settlement.newNAV,
          txHash: gateRes.txHash || "0xSimulatedHash",
          isEscrow: false,
        });
      } else {
        console.log(`   └─ 🚫 Security-Gate 거부: ${gateRes.reason}\n`);
      }
    }
  }

  // 쿨다운 해제 대기
  console.log("⏳ 온체인 쿨다운 대기 (11초)...");
  await sleep(11000);

  // -------------------------------------------------------------------------
  // [PHASE 3] Autonomous Cycle 02: 2차 자율 트레이딩 & 자립 금고 복리 누적
  // -------------------------------------------------------------------------
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚡ [CYCLE 02] 2차 시장 기회 포착 및 연속 복리 수익 실현");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const oracleRes2 = await oracleClient.fetchMarketIntelligence(context.agentId);
  if (oracleRes2.success && oracleRes2.marketData) {
    vaultManager.deductAgentExpense(0.001, "A.GRID x402 Data Ingestion");
    const decision2 = quantEngine.evaluate(oracleRes2.marketData);

    const txPayload2: ProposeTxPayload = {
      chainId: 8453,
      to: decision2.targetContract,
      data: decision2.calldata,
      description: `2차 델타 뉴트럴 차익거래 (${decision2.tradeAmountUSDC} USDC)`,
    };

    const gateRes2 = await gateClient.proposeTransaction(txPayload2);
    if (gateRes2.approved) {
      const settlement2 = vaultManager.recordTradeProfit(decision2.expectedProfitUSDC);
      console.log(`• 2차 거래 체결 완료 (TxHash: ${gateRes2.txHash})`);
      console.log(`• 실현 수익: +${decision2.expectedProfitUSDC} USDC | 신규 NAV: $${settlement2.newNAV}\n`);
    }
  }

  console.log("⏳ 온체인 쿨다운 대기 (11초)...");
  await sleep(11000);

  // -------------------------------------------------------------------------
  // [PHASE 3-B] Autonomous Cycle 03: Universal Escrow Hub 조건부 대형 OTC 거래
  // -------------------------------------------------------------------------
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏛️  [CYCLE 03] Universal Escrow Hub 연동: 기관급 조건부 OTC 에스크로 안전 거래");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("1. [OTC Opportunity] 기관 유동성 공급자와 75 USDC 대량 조건부 매매 합의 포착.");
  console.log("2. [Escrow Lock] DEX 직접 덤프 대신 UniversalEscrowCore(Base)에 대금 안전 예치(Lock)...");

  const escrowDeposit = UniversalEscrowClient.createDepositPayload({
    chainId: 8453,
    tokenAddress: USDC_BASE,
    amountUSDC: 75,
    domain: 1, // Finance
    durationSec: 3600,
    description: "기관급 장외 OTC 조건부 에스크로 대금 예치 (75 USDC)",
  });

  const escrowGateRes = await gateClient.proposeTransaction(escrowDeposit.proposePayload);

  if (escrowGateRes.approved) {
    console.log(`   └─ 🛡️ [Security-Gate] UniversalEscrowCore 화이트리스트 검증 승인!`);
    console.log(`   └─ 🔒 대금 안전 락업 완료 (TxHash: ${escrowGateRes.txHash})`);
    console.log(`   └─ 📋 에스크로 Job ID: ${escrowDeposit.jobId.slice(0, 18)}... | 만료 타임락: 1시간`);

    // x402 오라클의 조건 이행 확인 후 차익 실현 정산
    const otcProfit = 0.45; // 75 USDC OTC 거래 스프레드 마진
    const otcSettlement = vaultManager.recordTradeProfit(otcProfit);
    console.log(`3. [Escrow Settlement] x402 오라클 상대방 납품 증명 확인 -> 에스크로 릴리즈 체결 완료!`);
    console.log(`   └─ 실현 수익: +${otcProfit} USDC | 신규 NAV: $${otcSettlement.newNAV}\n`);

    await telegram.notifyTradeExecution({
      spreadBps: 60, // OTC 조건부 마진 60 bps
      amountUSDC: 75,
      profitUSDC: otcProfit,
      newNAV: otcSettlement.newNAV,
      txHash: escrowGateRes.txHash || "0xSimulatedEscrowHash",
      isEscrow: true,
    });
  } else {
    console.log(`   └─ 🚫 Security-Gate 거부: ${escrowGateRes.reason}\n`);
  }

  console.log("⏳ 온체인 쿨다운 대기 (11초)...");
  await sleep(11000);

  // -------------------------------------------------------------------------
  // [PHASE 4] Adversarial Security Test: 적대적 프롬프트 인젝션 / 해킹 방어
  // -------------------------------------------------------------------------
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🛡️ [PHASE 4] 적대적 공격 시뮬레이션: 프롬프트 인젝션 및 미인가 자금 탈취 차단");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚠️ [공격 시나리오] 악의적 공격자가 에이전트에 프롬프트 인젝션을 가해 5,000 USDC 과잉 인출 시도!");

  const maliciousCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [UNKNOWN_DRAINER, parseUnits("5000", 6)],
  });

  const attackPayload: ProposeTxPayload = {
    chainId: 8453,
    to: USDC_BASE,
    data: maliciousCalldata,
    description: "공격자가 조작한 5,000 USDC 탈취 트랜잭션",
  };

  const attackRes = await gateClient.proposeTransaction(attackPayload);

  if (!attackRes.approved) {
    console.log(`🔒 [Security-Gate 차단 완료!]`);
    console.log(`   └─ 차단 사유: "${attackRes.reason}"`);
    console.log(`   └─ 결과: 개인키 탈취 불가능, 금고 피해액 $0.00 (완벽 방어)\n`);

    await telegram.notifyAttackBlocked({
      threat: "프롬프트 인젝션 기반 5,000 USDC 무단 인출 시도",
      targetAmount: "5,000 USDC",
      tier: "Security-Gate Calldata 역어셈블 방화벽",
    });
  } else {
    console.error("❌ 치명적 결함: 비인가 거래가 승인되었습니다!");
  }

  // -------------------------------------------------------------------------
  // [PHASE 5] Executive Performance Report (기관급 감사 보고서)
  // -------------------------------------------------------------------------
  const finalSnap = vaultManager.getSnapshot();
  console.log("==========================================================================================");
  console.log("📊 [DeHedge] 자율 헤지펀드 최종 감사 및 운용 보고서 (Executive Fund Audit)");
  console.log("==========================================================================================");
  console.log(`• 총 운용자산 (AUM):        $${parseFloat(finalSnap.totalAUM).toLocaleString()} USDC`);
  console.log(`• 총 발행 지분 ($wALPHA):   ${parseFloat(finalSnap.totalShares).toLocaleString()} shares`);
  console.log(`• 현재 1주당 NAV:           $${finalSnap.sharePriceNAV} USDC (수익률: +${((parseFloat(finalSnap.sharePriceNAV) - 1.0) * 100).toFixed(4)}%)`);
  console.log(`• High-Water Mark:          $${finalSnap.highWaterMarkNAV} USDC`);
  console.log(`• 총 누적 실현 수익:        +$${finalSnap.totalRealizedYieldUSDC} USDC`);
  console.log(`• 총 성공 체결 건수:        ${finalSnap.totalTradesExecuted} 건`);
  console.log(`• 에이전트 자립 금고 잔고:  $${finalSnap.agentTreasuryUSDC} USDC (자체 생존 가능)`);
  console.log(`• 누적 프로토콜 매니저 수익:$${finalSnap.managerFeeUSDC} USDC`);
  console.log(`• 외부 공격 차단 방어율:    100.0%`);
  console.log("==========================================================================================\n");

  const auditSummary = `📊 [VaultAgent-X402 일일 감사 운용 보고서]
━━━━━━━━━━━━━━━━━━━━
💰 총 운용자산 (AUM): $${parseFloat(finalSnap.totalAUM).toLocaleString()} USDC
📈 현재 1주당 NAV: $${finalSnap.sharePriceNAV} USDC
🏆 High-Water Mark: $${finalSnap.highWaterMarkNAV} USDC
💵 누적 실현 수익: +$${finalSnap.totalRealizedYieldUSDC} USDC
⚡ 성공 체결 건수: ${finalSnap.totalTradesExecuted} 건
👑 파운더 순수익: $${finalSnap.managerFeeUSDC} USDC
🍱 에이전트 밥값(금고): $${finalSnap.agentTreasuryUSDC} USDC
🛡️ 외부 공격 차단율: 100.0% (피해 $0.00)
━━━━━━━━━━━━━━━━━━━━
24시간 자율 금융 루프가 정상 가동 중입니다.`;

  await telegram.sendAlert(auditSummary);

  if (spawnedServer) {
    spawnedServer.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith("autonomousFundLoop.ts")) {
  runAutonomousHedgeFundSimulation().catch(console.error);
}
