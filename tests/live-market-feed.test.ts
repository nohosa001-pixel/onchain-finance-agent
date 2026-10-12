import { LiveMarketOracle } from "../security-gate-server/src/liveMarketOracle.js";
import { OracleX402Service } from "../security-gate-server/src/oracleService.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [LIVE FEED FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ [PASS] ${message}`);
}

async function runLiveMarketFeedTest() {
  console.log("\n========================================================================");
  console.log("🌐 BASE MAINNET LIVE ON-CHAIN MARKET FEED & LEARNING ENGINE TEST");
  console.log("   Querying Uniswap v3 & Aerodrome on Base ($0.00 Gas Free eth_call)");
  console.log("========================================================================\n");

  const oracle = new LiveMarketOracle();

  // --------------------------------------------------------------------------
  // Test 1: Base 메인넷 실시간 RPC 풀 데이터 조회 (Live Reading)
  // --------------------------------------------------------------------------
  console.log("--- Test 1: Querying Live Uniswap v3 ETH/USDC Pool on Base Mainnet ---");
  const snapshot1 = await oracle.fetchLivePrices();

  assert(snapshot1.uniswapV3EthPrice > 500 && snapshot1.uniswapV3EthPrice < 10000, "정상적인 실시간 ETH 가격 수신 확인");
  assert(snapshot1.aerodromeEthPrice > 500 && snapshot1.aerodromeEthPrice < 10000, "정상적인 호가 가격 수신 확인");
  assert(typeof snapshot1.spreadBps === "number", "실시간 스프레드(bps) 계산 확인");

  console.log(`   └─ 📡 데이터 수신처: ${snapshot1.source}`);
  if (snapshot1.blockNumber) {
    console.log(`   └─ 🧱 온체인 블록 번호: #${snapshot1.blockNumber}`);
  }
  console.log(`   └─ 💎 실시간 Uniswap v3 ETH: $${snapshot1.uniswapV3EthPrice} USDC`);
  console.log(`   └─ 🔄 실시간 Aerodrome ETH:   $${snapshot1.aerodromeEthPrice} USDC`);
  console.log(`   └─ 🎯 실시간 가격 스프레드:    ${snapshot1.spreadBps} bps (${snapshot1.arbitrageDirection})\n`);

  // --------------------------------------------------------------------------
  // Test 2: 연속 관측 및 에이전트 동적 학습 메모리(Learning Metrics) 검증
  // --------------------------------------------------------------------------
  console.log("--- Test 2: Multi-Sample Continuous Ingestion & Learning Accumulation ---");
  console.log("에이전트가 2차, 3차 연속 관측 데이터를 수집하여 시장 변동성을 학습합니다...");

  await new Promise((r) => setTimeout(r, 1000));
  const snapshot2 = await oracle.fetchLivePrices();
  console.log(`   [관측 2] Uniswap ETH: $${snapshot2.uniswapV3EthPrice} | 스프레드: ${snapshot2.spreadBps} bps`);

  await new Promise((r) => setTimeout(r, 1000));
  const snapshot3 = await oracle.fetchLivePrices();
  console.log(`   [관측 3] Uniswap ETH: $${snapshot3.uniswapV3EthPrice} | 스프레드: ${snapshot3.spreadBps} bps`);

  const metrics = oracle.getLearningMetrics();
  assert(metrics.totalObservations >= 3, "총 3건 이상의 실시간 관측 데이터가 메모리에 학습되어야 함");
  assert(metrics.avgSpreadBps > 0, "평균 스프레드가 계산되어야 함");
  assert(metrics.optimalEntryThresholdBps > 0, "학습된 최적 진입 임계값이 도출되어야 함");

  console.log("\n📊 [에이전트 실시간 시장 학습 결과 보고서]");
  console.log(`   • 누적 관측 횟수:        ${metrics.totalObservations} 회`);
  console.log(`   • 관측된 평균 스프레드:  ${metrics.avgSpreadBps} bps`);
  console.log(`   • 동적 추천 진입 임계값: ${metrics.optimalEntryThresholdBps} bps (평균 80% 가중치)`);
  console.log(`   • 쿼리 소비 가스비:      $0.00 (100% 무료 온체인 eth_call)\n`);

  // --------------------------------------------------------------------------
  // Test 3: x402 서비스와 결합된 통합 라이브 인텔리전스 엔드포인트 검증
  // --------------------------------------------------------------------------
  console.log("--- Test 3: Integrated x402 Oracle with Live On-Chain Settlement ---");
  const oracleService = new OracleX402Service();
  const validProof = "0x48e0221087371ad597b814830b83564afc222a9c283ee28ca4df83f50e494223";

  const liveRes = await oracleService.fetchLiveMarketIntelligence(validProof);
  assert(liveRes.isPaid, "유효 영수증 결제 확인");
  assert(typeof liveRes.data?.marketData.ethUsdcUniswapV3 === "number", "라이브 마켓 데이터 바인딩 확인");
  console.log(`   └─ x402 오라클 + Base 메인넷 실시간 피드 결합 성공! (ETH: $${liveRes.data?.marketData.ethUsdcUniswapV3})\n`);

  console.log("========================================================================");
  console.log("🎉 LIVE ON-CHAIN MARKET FEED & LEARNING ENGINE VERIFIED 100%!");
  console.log("========================================================================\n");
}

runLiveMarketFeedTest().catch((err) => {
  console.error("LIVE FEED TEST ERROR:", err);
  process.exit(1);
});
