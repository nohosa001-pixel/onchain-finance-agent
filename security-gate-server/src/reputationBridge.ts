export interface AgentReputationResult {
  address: string;
  creditScore: number;
  creditGrade: string;
  erc8004Registered: boolean;
  source: "LIVE_SECURITY_GATE" | "UNAVAILABLE";
}

const DEFAULT_SECURITY_GATE_URL =
  process.env.SECURITY_GATE_URL ||
  "https://agent-security-gate-x402-212942243360.asia-northeast3.run.app";

/**
 * Fetches agent Credit Rating Score (CRS) & ERC-8004 reputation from A.GRID Security Gate.
 */
export async function fetchAgentReputation(
  address: string
): Promise<AgentReputationResult> {
  try {
    const url = `${DEFAULT_SECURITY_GATE_URL.replace(/\/$/, "")}/api/v1/credit/${encodeURIComponent(address)}`;
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const data: any = await resp.json();
    const score = Number(data?.credit_score ?? data?.score ?? 650);
    const grade = String(data?.grade ?? data?.credit_grade ?? "B");
    return {
      address,
      creditScore: score,
      creditGrade: grade,
      erc8004Registered: Boolean(data?.erc8004_registered ?? false),
      source: "LIVE_SECURITY_GATE",
    };
  } catch {
    return {
      address,
      creditScore: 650,
      creditGrade: "UNRATED",
      erc8004Registered: false,
      source: "UNAVAILABLE",
    };
  }
}
