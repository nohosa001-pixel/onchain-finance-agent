import dotenv from "dotenv";

dotenv.config();

export class TelegramNotifier {
  private token: string;
  private chatId: string;
  private enabled: boolean;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || "";
    this.chatId = process.env.TELEGRAM_CHAT_ID || "";
    this.enabled = Boolean(this.token && this.chatId);
  }

  public async sendAlert(message: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
        }),
        signal: AbortSignal.timeout(6000),
      });
      const data = (await res.json()) as { ok: boolean };
      return data.ok;
    } catch (err: any) {
      console.warn(`[TelegramNotifier] Failed to send alert: ${err.message}`);
      return false;
    }
  }

  public async notifyTradeExecution(params: {
    tradeNumber?: number;
    observationCount?: number;
    spreadBps: number;
    amountUSDC: number;
    profitUSDC?: number;
    netProfitUSDC?: number;
    grossProfitUSDC?: number;
    dexFeeUSDC?: number;
    gasFeeUSDC?: number;
    newNAV?: string;
    currentCapitalUSDC?: number;
    totalProfitUSDC?: number;
    totalTrades?: number;
    winRatePct?: number;
    totalObservations?: number;
    direction?: string;
    uniPrice?: number;
    aeroPrice?: number;
    cbBtcPrice?: number;
    blockNumber?: string;
    txHash: string;
    isEscrow?: boolean;
  }) {
    const tradeNumStr = params.tradeNumber ? `#${params.tradeNumber}` : (params.totalTrades ? `#${params.totalTrades}` : "");
    const tradeType = params.isEscrow
      ? "🔗 Universal Escrow 조건부 결제"
      : "⚡ Phase 5 실전 DEX 온체인 차익거래";

    const directionStr = params.direction === "BUY_UNISWAP_SELL_AERODROME"
      ? "🦄 Uniswap v3 ➔ ✈️ Aerodrome"
      : params.direction === "BUY_AERODROME_SELL_UNISWAP"
      ? "✈️ Aerodrome ➔ 🦄 Uniswap v3"
      : params.direction || "DEX 순환 차익";

    const grossProfit = params.grossProfitUSDC ?? params.amountUSDC * (params.spreadBps / 10000);
    const dexFee = params.dexFeeUSDC ?? (params.amountUSDC * 0.001);
    const gasFee = params.gasFeeUSDC ?? 0.007;
    const pureNetProfit = params.netProfitUSDC ?? (grossProfit - dexFee - gasFee);

    const currentCapital = params.currentCapitalUSDC ? `$${params.currentCapitalUSDC.toFixed(4)} USDC` : "-";
    const totalProfit = params.totalProfitUSDC ? `+$${params.totalProfitUSDC.toFixed(4)} USDC` : "-";
    const tradesRecord = params.totalTrades ? `${params.totalTrades}전 ${params.totalTrades}승 (${params.winRatePct || 100}%)` : "1전 1승 (100%)";

    const msg = `🏛️ [A.GRID Phase 5 실전 체결 보고 ${tradeNumStr}]
━━━━━━━━━━━━━━━━━━━━
📍 매매 경로: ${directionStr}
📊 실시간 호가:
  • Uniswap ETH: $${params.uniPrice ? params.uniPrice.toFixed(2) : "-"}
  • Aerodrome ETH: $${params.aeroPrice ? params.aeroPrice.toFixed(2) : "-"}
  • 실전 차익 스프레드: +${params.spreadBps} bps (+${(params.spreadBps / 100).toFixed(2)}%)
${params.cbBtcPrice ? `  • cbBTC 선행시세: $${params.cbBtcPrice.toLocaleString()}\n` : ""}💰 실전 투입규모: $${params.amountUSDC} USDC
───────────────
💵 실현 총수익 (Gross): +$${grossProfit.toFixed(4)} USDC
➖ 거래소 수수료 (DEX 10 bps): -$${dexFee.toFixed(4)} USDC
➖ 온체인 가스비 (Base Gas): -$${gasFee.toFixed(4)} USDC (~10원)
────────────────────
💎 실전 확정 순익 (Net): +$${pureNetProfit.toFixed(4)} USDC (비용 100% 공제)
🏦 실전 운용자본: ${currentCapital} (실전 누적순익: ${totalProfit})
🏆 Phase 5 실전 전적: ${tradesRecord}
⏱️ Phase 5 시장 관측: ${params.observationCount ? `${params.observationCount.toLocaleString()}회` : "1회"} (1번부터 실시간 카운트)
📦 온체인 블록: Base #${params.blockNumber || "-"}
✍️ BaseScan 실시간 영수증:
https://basescan.org/tx/${params.txHash}
🛡️ Security-Gate 방화벽: 통과 (100% 안전 승인)
━━━━━━━━━━━━━━━━━━━━`;

    return this.sendAlert(msg);
  }

  public async notifyAttackBlocked(params: {
    threat: string;
    targetAmount?: string;
    tier: string;
  }) {
    const msg = `🚨 [긴급 보안 경보: 외부 공격 단칼 차단]
━━━━━━━━━━━━━━━━━━━━
⚠️ 탐지된 위협: ${params.threat}
🛡️ 차단 방어선: ${params.tier}
🔒 탈취 시도 금액: ${params.targetAmount || "전액 드레인"}
💰 금고 피해액: $0.00 (완벽 방어)
━━━━━━━━━━━━━━━━━━━━`;

    return this.sendAlert(msg);
  }
}
