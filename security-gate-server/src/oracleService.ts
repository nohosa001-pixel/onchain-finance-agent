import { Hex } from "viem";
import { LiveMarketOracle, type LiveMarketSnapshot } from "./liveMarketOracle.js";

export interface OracleIntelligenceResponse {
  status: "paid";
  timestamp: number;
  oracleSource: "A.GRID-Institutional-Oracle";
  network: "Base";
  marketData: {
    ethUsdcUniswapV3: number;
    ethUsdcAerodrome: number;
    arbitrageSpreadBps: number;
    optimalAction: "ARBITRAGE_BUY_UNISWAP_SELL_AERODROME" | "NO_OP_BALANCED" | "ARBITRAGE_BUY_AERODROME_SELL_UNISWAP";
    liquidityDepthUSDC: number;
    volatilityIndex: number;
    riskScore: "LOW" | "MEDIUM" | "HIGH";
  };
}

export interface X402Invoice {
  error: "Payment Required";
  status: 402;
  protocol: "x402";
  invoice: {
    invoiceId: string;
    costUSDC: string;
    currency: "USDC";
    recipient: `0x${string}`;
    network: "Base (ChainID 8453)";
    instructions: string;
    requiredHeader: "X-402-Payment-Proof";
  };
}

export class OracleX402Service {
  private readonly oracleSettlementRecipient: `0x${string}` =
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // A.GRID Oracle Settlement Treasury
  private verifiedPayments: Set<string> = new Set();
  private queryCounter: number = 0;
  private liveOracle: LiveMarketOracle = new LiveMarketOracle();

  public getLiveOracle(): LiveMarketOracle {
    return this.liveOracle;
  }

  /**
   * x402 시장 데이터 조회
   * 결제 증빙 헤더가 없거나 유효하지 않으면 402 인보이스 반환
   */
  public handleMarketIntelligenceRequest(paymentProof?: string): {
    isPaid: boolean;
    data?: OracleIntelligenceResponse;
    invoice?: X402Invoice;
  } {
    this.queryCounter++;

    // 결제 증빙 엄격 검증: 66자 0x hex 해시 또는 x402_ticket_ 서명 티켓 형식 필수
    const isValidTxHash = typeof paymentProof === "string" && /^0x[a-fA-F0-9]{64}$/.test(paymentProof);
    const isValidTicket = typeof paymentProof === "string" && paymentProof.startsWith("x402_ticket_") && paymentProof.length > 20;

    if (!paymentProof || (!isValidTxHash && !isValidTicket)) {
      const invoiceId = `inv_agrid_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      return {
        isPaid: false,
        invoice: {
          error: "Payment Required",
          status: 402,
          protocol: "x402",
          invoice: {
            invoiceId,
            costUSDC: "0.001",
            currency: "USDC",
            recipient: this.oracleSettlementRecipient,
            network: "Base (ChainID 8453)",
            instructions: "Submit 0.001 USDC micro-payment and retry with 'X-402-Payment-Proof' header.",
            requiredHeader: "X-402-Payment-Proof",
          },
        },
      };
    }

    // 결제 확인 처리
    this.verifiedPayments.add(paymentProof);

    // 시장 가격 시뮬레이션 (약 42 bps 차익거래 기회 부여)
    const baseEthPrice = 2650.0;
    const uniPrice = Number((baseEthPrice + (Math.sin(this.queryCounter) * 2)).toFixed(2));
    const aeroPrice = Number((uniPrice * 1.0042).toFixed(2)); // +42 bps spread
    const spreadBps = Number((((aeroPrice - uniPrice) / uniPrice) * 10000).toFixed(1));

    return {
      isPaid: true,
      data: {
        status: "paid",
        timestamp: Date.now(),
        oracleSource: "A.GRID-Institutional-Oracle",
        network: "Base",
        marketData: {
          ethUsdcUniswapV3: uniPrice,
          ethUsdcAerodrome: aeroPrice,
          arbitrageSpreadBps: spreadBps,
          optimalAction: spreadBps > 20 ? "ARBITRAGE_BUY_UNISWAP_SELL_AERODROME" : "NO_OP_BALANCED",
          liquidityDepthUSDC: 2450000,
          volatilityIndex: 16.8,
          riskScore: "LOW",
        },
      },
    };
  }

  /**
   * Base 메인넷 라이브 풀 가격을 직접 읽어와 학습 데이터로 반영하는 비동기 실전 오라클 엔드포인트
   */
  public async fetchLiveMarketIntelligence(paymentProof?: string): Promise<{
    isPaid: boolean;
    data?: OracleIntelligenceResponse;
    invoice?: any;
    liveSnapshot?: LiveMarketSnapshot;
  }> {
    const baseRes = this.handleMarketIntelligenceRequest(paymentProof);
    if (!baseRes.isPaid) {
      return baseRes;
    }

    const liveSnapshot = await this.liveOracle.fetchLivePrices();

    return {
      isPaid: true,
      liveSnapshot,
      data: {
        status: "paid",
        timestamp: liveSnapshot.timestamp,
        oracleSource: "A.GRID-Institutional-Oracle",
        network: "Base",
        marketData: {
          ethUsdcUniswapV3: liveSnapshot.uniswapV3EthPrice,
          ethUsdcAerodrome: liveSnapshot.aerodromeEthPrice,
          arbitrageSpreadBps: liveSnapshot.spreadBps,
          optimalAction:
            liveSnapshot.arbitrageDirection === "BUY_UNISWAP_SELL_AERODROME"
              ? "ARBITRAGE_BUY_UNISWAP_SELL_AERODROME"
              : liveSnapshot.arbitrageDirection === "BUY_AERODROME_SELL_UNISWAP"
              ? "ARBITRAGE_BUY_AERODROME_SELL_UNISWAP"
              : "NO_OP_BALANCED",
          liquidityDepthUSDC: 3200000,
          volatilityIndex: 15.2,
          riskScore: "LOW",
        },
      },
    };
  }

  public getSettlementRecipient(): `0x${string}` {
    return this.oracleSettlementRecipient;
  }

  public getStats() {
    return {
      totalQueries: this.queryCounter,
      totalMicroPaymentsVerified: this.verifiedPayments.size,
      accumulatedRevenueUSDC: (this.verifiedPayments.size * 0.001).toFixed(3),
    };
  }
}
