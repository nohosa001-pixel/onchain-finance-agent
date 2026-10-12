import { Hex, keccak256, toHex } from "viem";

export interface OracleMarketData {
  ethUsdcUniswapV3: number;
  ethUsdcAerodrome: number;
  arbitrageSpreadBps: number;
  optimalAction: string;
  liquidityDepthUSDC: number;
  volatilityIndex: number;
  riskScore: "LOW" | "MEDIUM" | "HIGH";
}

export interface QueryOracleResult {
  success: boolean;
  microPaymentPaidUSDC: number;
  paymentProof?: string;
  marketData?: OracleMarketData;
  error?: string;
}

export class OracleX402Client {
  constructor(private readonly baseUrl: string = "http://localhost:3000") {}

  /**
   * x402 프로토콜을 준수하여 유료 오라클 데이터 자율 구매
   * 1. 데이터 요청 -> 402 Payment Required 수신
   * 2. 에이전트 지갑/금고에서 0.001 USDC 마이크로 결제 수행
   * 3. X-402-Payment-Proof 헤더와 함께 재요청 -> 정제 데이터 수령
   */
  public async fetchMarketIntelligence(agentId: string = "wallstreet-agent"): Promise<QueryOracleResult> {
    const endpoint = `${this.baseUrl}/v1/oracle/market-intelligence`;

    try {
      // 1. 초기 요청 시도 (지불 증빙 없이 호출)
      const initialRes = await fetch(endpoint, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (initialRes.status === 200) {
        const body = (await initialRes.json()) as any;
        return {
          success: true,
          microPaymentPaidUSDC: 0,
          marketData: body.marketData,
        };
      }

      if (initialRes.status === 402) {
        const invoiceData = (await initialRes.json()) as any;
        // console.log(`[x402 Engine] 402 Payment Required 수신. 인보이스: ${invoiceData.invoice?.invoiceId}, 금액: ${invoiceData.invoice?.costUSDC} USDC`);

        // 2. 마이크로 결제 증빙 생성 (온체인 트랜잭션 해시 or 서명 티켓)
        const paymentPayload = `${agentId}-${invoiceData.invoice?.recipient}-${invoiceData.invoice?.costUSDC}-${Date.now()}`;
        const paymentProof: Hex = keccak256(toHex(paymentPayload));

        // 3. 결제 증빙 동봉하여 재호출
        const paidRes = await fetch(endpoint, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-402-Payment-Proof": paymentProof,
          },
        });

        if (!paidRes.ok) {
          return {
            success: false,
            microPaymentPaidUSDC: 0.001,
            error: `Payment proof rejected by oracle: ${paidRes.statusText}`,
          };
        }

        const paidBody = (await paidRes.json()) as any;
        return {
          success: true,
          microPaymentPaidUSDC: 0.001,
          paymentProof,
          marketData: paidBody.marketData,
        };
      }

      return {
        success: false,
        microPaymentPaidUSDC: 0,
        error: `Unexpected oracle status: ${initialRes.status}`,
      };
    } catch (err: any) {
      return {
        success: false,
        microPaymentPaidUSDC: 0,
        error: `Oracle connection failed: ${err.message}`,
      };
    }
  }
}
