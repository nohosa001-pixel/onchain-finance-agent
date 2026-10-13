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
      });
      const data = (await res.json()) as { ok: boolean };
      return data.ok;
    } catch (err: any) {
      console.warn(`[TelegramNotifier] Failed to send alert: ${err.message}`);
      return false;
    }
  }

  public async notifyTradeExecution(params: {
    spreadBps: number;
    amountUSDC: number;
    profitUSDC: number;
    newNAV: string;
    txHash: string;
    isEscrow?: boolean;
  }) {
    const tradeType = params.isEscrow
      ? "🔗 Universal Escrow 조건부 장외 OTC 거래"
      : "⚡ 델타 뉴트럴 DEX 차익거래";

    const msg = `🏛️ [OnchainFinanceAgent 실시간 체결 보고]
━━━━━━━━━━━━━━━━━━━━
📌 유형: ${tradeType}
🎯 포착 스프레드: ${params.spreadBps} bps
💰 거래 규모: ${params.amountUSDC} USDC
📈 실현 수익: +${params.profitUSDC} USDC
💹 신규 펀드 NAV: $${params.newNAV} USDC
✍️ Safe 세션 서명 해시:
${params.txHash.slice(0, 22)}...
🛡️ 지출 방화벽 검증: 통과 (100% 안전)
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
