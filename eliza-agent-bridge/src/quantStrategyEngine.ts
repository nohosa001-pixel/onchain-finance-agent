import { encodeFunctionData, parseAbi, parseUnits, Hex } from "viem";
import type { OracleMarketData } from "./actions/queryOracleX402.js";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const UNISWAP_V3_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481" as const; // Base Uniswap Router

export interface QuantStrategyDecision {
  tradeRecommended: boolean;
  strategyName: string;
  reason: string;
  tradeAmountUSDC: number;
  expectedProfitUSDC: number;
  expectedProfitBps: number;
  targetContract: `0x${string}`;
  calldata: Hex;
}

export class QuantStrategyEngine {
  private readonly minSpreadThresholdBps = 25; // 최소 25 bps(0.25%) 차익 필요
  private readonly defaultTradeSizeUSDC = 50; // 단일 50 USDC (가드레일 maxPerTx=100 준수)

  /**
   * 오라클 정제 데이터를 기반으로 퀀트 전략 계산 및 Calldata 조립
   */
  public evaluate(market: OracleMarketData): QuantStrategyDecision {
    // 1. 시장 리스크 평가
    if (market.riskScore === "HIGH" || market.volatilityIndex > 45) {
      return {
        tradeRecommended: false,
        strategyName: "RISK_AVOIDANCE",
        reason: `시장 변동성 위험 과다 (VIX: ${market.volatilityIndex}, Score: ${market.riskScore}). 포지션 진입 유보.`,
        tradeAmountUSDC: 0,
        expectedProfitUSDC: 0,
        expectedProfitBps: 0,
        targetContract: USDC_BASE,
        calldata: "0x",
      };
    }

    // 2. DEX 스프레드 기반 무위험 차익거래(Arbitrage) 기회 탐색
    if (market.arbitrageSpreadBps >= this.minSpreadThresholdBps) {
      const spreadRatio = market.arbitrageSpreadBps / 10000;
      const expectedProfitUSDC = Number((this.defaultTradeSizeUSDC * spreadRatio).toFixed(4));

      // Uniswap Router로 50 USDC 전송 및 차익거래 스왑 calldata 생성
      const calldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [UNISWAP_V3_ROUTER, parseUnits(this.defaultTradeSizeUSDC.toString(), 6)],
      });

      return {
        tradeRecommended: true,
        strategyName: "DELTA_NEUTRAL_DEX_ARBITRAGE",
        reason: `DEX 가격 스프레드 ${market.arbitrageSpreadBps} bps 포착 (Uni: $${market.ethUsdcUniswapV3} vs Aero: $${market.ethUsdcAerodrome}). 기대수익: +${expectedProfitUSDC} USDC`,
        tradeAmountUSDC: this.defaultTradeSizeUSDC,
        expectedProfitUSDC,
        expectedProfitBps: market.arbitrageSpreadBps,
        targetContract: USDC_BASE,
        calldata,
      };
    }

    // 3. 차익 기회 부족 시 No-Op
    return {
      tradeRecommended: false,
      strategyName: "MARKET_OBSERVATION",
      reason: `스프레드 ${market.arbitrageSpreadBps} bps가 임계치(${this.minSpreadThresholdBps} bps)에 미달하여 관망 유지.`,
      tradeAmountUSDC: 0,
      expectedProfitUSDC: 0,
      expectedProfitBps: market.arbitrageSpreadBps,
      targetContract: USDC_BASE,
      calldata: "0x",
    };
  }
}
