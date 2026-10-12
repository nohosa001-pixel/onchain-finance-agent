import { decodeFunctionData, parseAbi, isAddressEqual, type Hex } from "viem";
import type { PolicyConfig, TxRequest, ValidationResult } from "./types.js";

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export class SecurityGate {
  private lastExecutedAt: number = 0;
  private recentRequests: number[] = [];
  private dailySpent: Map<string, Array<{ timestamp: number; amount: bigint }>> = new Map();

  constructor(private policy: PolicyConfig) {}

  public getPolicy(): PolicyConfig {
    return this.policy;
  }

  public updatePolicy(newPolicy: PolicyConfig): void {
    this.policy = newPolicy;
  }

  public resetState(): void {
    this.lastExecutedAt = 0;
    this.recentRequests = [];
    this.dailySpent.clear();
  }

  public async validateTransaction(tx: TxRequest): Promise<ValidationResult> {
    const now = Date.now();

    // 1. 체인 ID 검증
    if (!this.policy.allowedChains.includes(tx.chainId)) {
      return {
        approved: false,
        reason: `Chain ID ${tx.chainId} is not allowed by policy. Allowed: [${this.policy.allowedChains.join(", ")}]`,
      };
    }

    // 2. 대상 컨트랙트 및 메서드 셀렉터 화이트리스트 검증
    const targetPolicy = this.policy.contractWhitelist.find(
      (c) => c.chainId === tx.chainId && isAddressEqual(c.address, tx.to)
    );
    if (!targetPolicy) {
      return {
        approved: false,
        reason: `Target contract ${tx.to} is not in whitelist on chain ${tx.chainId}.`,
      };
    }

    // Calldata 포맷 및 4-byte selector 추출
    if (!tx.data || tx.data.length < 10) {
      return {
        approved: false,
        reason: "Invalid calldata: Missing or truncated 4-byte function selector.",
      };
    }

    const selector = tx.data.slice(0, 10).toLowerCase();
    const isSelectorAllowed = targetPolicy.allowedSelectors
      .map((s) => s.toLowerCase())
      .includes(selector);

    if (!isSelectorAllowed) {
      return {
        approved: false,
        reason: `Function selector ${selector} is forbidden on target ${tx.to}.`,
      };
    }

    // 3. 쿨다운 및 속도 제한(Rate Limit) 검증
    if (
      this.lastExecutedAt > 0 &&
      now - this.lastExecutedAt < this.policy.rateLimits.cooldownSeconds * 1000
    ) {
      const waitRemaining = Math.ceil(
        (this.policy.rateLimits.cooldownSeconds * 1000 - (now - this.lastExecutedAt)) / 1000
      );
      return {
        approved: false,
        reason: `Cooldown period active (${waitRemaining}s remaining). Re-execution throttled.`,
      };
    }

    // 60초 슬라이딩 윈도우 요청 수 제한
    this.recentRequests = this.recentRequests.filter((t) => now - t < 60000);
    if (this.recentRequests.length >= this.policy.rateLimits.maxRequestsPerMinute) {
      return {
        approved: false,
        reason: `Rate limit exceeded: Maximum ${this.policy.rateLimits.maxRequestsPerMinute} requests per minute reached.`,
      };
    }

    // 4. 전송 수량 디코딩 및 단일 건/24시간 한도 검증
    const targetAddressLower = tx.to.toLowerCase();
    const tokenRule = this.policy.tokenPolicies[targetAddressLower];

    let decodedAmount: bigint | undefined;
    let decodedMethodName: string | undefined;

    if (tokenRule && (selector === "0xa9059cbb" || selector === "0x095ea7b3")) {
      try {
        const decoded = decodeFunctionData({
          abi: ERC20_ABI,
          data: tx.data as Hex,
        });

        decodedMethodName = decoded.functionName;
        // decoded.args = [to/spender, amount]
        decodedAmount = decoded.args[1] as bigint;

        const maxPerTx = BigInt(tokenRule.maxPerTx);
        const maxDaily = BigInt(tokenRule.maxDailyLimit);

        // (1) 단일 건 한도 검증
        if (decodedAmount > maxPerTx) {
          return {
            approved: false,
            reason: `Transaction amount ${decodedAmount} exceeds single-transaction limit of ${maxPerTx} (Decimals: ${tokenRule.decimals}).`,
            decodedMethod: decodedMethodName,
            decodedAmount,
          };
        }

        // (2) 24시간 롤링 윈도우 누적 지출 한도 검증
        const dailyRecords = (this.dailySpent.get(targetAddressLower) || []).filter(
          (entry) => now - entry.timestamp < 86400000
        );
        const currentDailyTotal = dailyRecords.reduce((sum, item) => sum + item.amount, 0n);

        if (currentDailyTotal + decodedAmount > maxDaily) {
          return {
            approved: false,
            reason: `Daily spend limit reached for asset ${tx.to}. Current 24h daily total: ${currentDailyTotal}, Attempted: ${decodedAmount}, Max Daily Limit: ${maxDaily}.`,
            decodedMethod: decodedMethodName,
            decodedAmount,
          };
        }

        // 상태 저장 예약 (검증 성공 시 기록)
        dailyRecords.push({ timestamp: now, amount: decodedAmount });
        this.dailySpent.set(targetAddressLower, dailyRecords);
      } catch (err: any) {
        return {
          approved: false,
          reason: `Calldata decoding failed for ERC-20 selector ${selector}: ${err.message}`,
        };
      }
    }

    // 5. 검증 통과 후 상태 갱신
    this.lastExecutedAt = now;
    this.recentRequests.push(now);

    return {
      approved: true,
      decodedMethod: decodedMethodName,
      decodedAmount,
    };
  }
}
