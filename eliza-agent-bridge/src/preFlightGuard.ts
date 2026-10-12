/**
 * Pre-flight Safety Gate Engine
 * 1. Inbound Pre-flight: LLM 추론 전 프롬프트 인젝션 및 시스템 탈옥 시도 초고속(<1ms) 차단
 * 2. Outbound Pre-flight: LLM 출력 및 트랜잭션 제안 시 개인키/시드 문구 및 파괴적 코드 유출 사전 차단
 */

export interface PreFlightAuditResult {
  passed: boolean;
  verdict: "ALLOW" | "WARN" | "BLOCK";
  riskScore: number;
  threats: string[];
  executionTimeMs: number;
}

const INBOUND_INJECTION_PATTERNS = [
  {
    pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
    threat: "Prompt Injection: Instruction Override",
    risk: 90,
  },
  {
    pattern: /you\s+are\s+now\s+(in\s+)?dan\s+mode/i,
    threat: "Jailbreak: DAN Mode Persona",
    risk: 95,
  },
  {
    pattern: /developer\s+mode\s+(enabled|activated)/i,
    threat: "Jailbreak: Developer Mode Override",
    risk: 85,
  },
  {
    pattern: /bypass\s+(safety|content|security)\s+filters?/i,
    threat: "Security Filter Bypass Attempt",
    risk: 90,
  },
  {
    pattern: /system\s*:\s*override/i,
    threat: "System Prompt Spoofing",
    risk: 85,
  },
  {
    pattern: /disregard\s+(all\s+)?(system|rules|guidelines)/i,
    threat: "System Rule Disregard",
    risk: 90,
  },
  {
    pattern: /(drain|transfer|steal)\s+(all\s+)?(funds|usdc|balance|treasury)/i,
    threat: "Malicious Vault Drain Instruction",
    risk: 95,
  },
];

const CODE_HAZARD_PATTERNS = [
  {
    pattern: /\b(os\.system|subprocess\.(Popen|run|call)|exec\(|eval\()/i,
    threat: "Malicious Code Execution Pattern",
    risk: 95,
  },
  {
    pattern: /\b(rm\s+-rf|del\s+\/f|\bformat\s+[a-z]:)/i,
    threat: "Destructive File System Command",
    risk: 98,
  },
  {
    pattern: /powershell(\.exe)?\s+(-enc|-encodedcommand)/i,
    threat: "Obfuscated PowerShell Execution",
    risk: 95,
  },
];

const CREDENTIAL_LEAK_PATTERNS = [
  {
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
    threat: "Private Key Disclosure Attempt",
    risk: 99,
  },
  {
    pattern: /\b0x[a-fA-F0-9]{64}\b/,
    threat: "Raw Hex Private Key / Seed Material Detected",
    risk: 95,
  },
];

/**
 * 온체인 공개 트랜잭션 해시, 블록 해시와 실제 개인키(Private Key) 유출 시도를 정밀하게 구별
 */
export function isBenignBlockchainHash(
  matchStart: number,
  matchEnd: number,
  content: string,
  window: number = 70
): boolean {
  const start = Math.max(0, matchStart - window);
  const end = Math.min(content.length, matchEnd + window);
  const ctx = content.slice(start, end).toLowerCase();

  const privateKeyMarkers = [
    "private_key",
    "privatekey",
    "privkey",
    "priv_key",
    "secret_key",
    "secretkey",
    "signer_key",
    "signerkey",
    "wallet_key",
    "deployer_key",
    "seed phrase",
    "mnemonic",
    "my key is",
    "export private_key",
  ];
  if (privateKeyMarkers.some((marker) => ctx.includes(marker))) {
    return false; // 실제 개인키 유출 시도 -> 차단
  }

  const benignHashMarkers = [
    "tx",
    "tx_hash",
    "txhash",
    "transaction",
    "receipt",
    "block",
    "hash",
    "merkle",
    "base",
    "polygon",
    "arbitrum",
    "jobid",
    "job_id",
    "payment",
    "submitted",
    "proof",
  ];
  if (benignHashMarkers.some((marker) => ctx.includes(marker))) {
    return true; // 안전한 온체인 트랜잭션 해시
  }

  const preceding = content.slice(Math.max(0, matchStart - 30), matchStart).toLowerCase();
  const jsonKeyMarkers = ['"hash"', '"tx"', '"txhash"', '"jobid"'];
  if (jsonKeyMarkers.some((k) => preceding.includes(k))) {
    return true;
  }

  return false;
}

export class PreFlightSafetyGate {
  /**
   * [1단계 Inbound Gate] LLM 추론 직전 프롬프트 인젝션 및 시스템 탈옥 검사
   */
  public static inspectInboundPrompt(text: string): PreFlightAuditResult {
    const startTime = Date.now();
    const normalized = (text || "").replace(/\0/g, " ").replace(/[\u200B-\u200D\uFEFF]/g, "");
    const threats: string[] = [];
    let maxRisk = 0;

    for (const { pattern, threat, risk } of INBOUND_INJECTION_PATTERNS) {
      if (pattern.test(normalized)) {
        threats.push(threat);
        maxRisk = Math.max(maxRisk, risk);
      }
    }

    const passed = maxRisk < 75;
    return {
      passed,
      verdict: maxRisk >= 75 ? "BLOCK" : maxRisk >= 30 ? "WARN" : "ALLOW",
      riskScore: maxRisk,
      threats,
      executionTimeMs: Math.max(1, Date.now() - startTime),
    };
  }

  /**
   * [2단계 Outbound Gate] LLM 생성 결과물 및 트랜잭션 제안 내 개인키 유출 및 위험 코드 검사
   */
  public static inspectOutboundPayload(content: string): PreFlightAuditResult {
    const startTime = Date.now();
    const normalized = (content || "").replace(/\0/g, " ");
    const threats: string[] = [];
    let maxRisk = 0;

    // 파괴적 코드 패턴 검사
    for (const { pattern, threat, risk } of CODE_HAZARD_PATTERNS) {
      if (pattern.test(normalized)) {
        threats.push(threat);
        maxRisk = Math.max(maxRisk, risk);
      }
    }

    // 개인키 유출 검사
    for (const { pattern, threat, risk } of CREDENTIAL_LEAK_PATTERNS) {
      const match = pattern.exec(normalized);
      if (match) {
        if (pattern.source.includes("0x[a-fA-F0-9]{64}")) {
          // 온체인 공개 해시인지 개인키인지 판별
          if (isBenignBlockchainHash(match.index, match.index + match[0].length, normalized)) {
            continue; // 정상적인 TxHash는 통과
          }
        }
        threats.push(threat);
        maxRisk = Math.max(maxRisk, risk);
      }
    }

    const passed = maxRisk < 75;
    return {
      passed,
      verdict: maxRisk >= 75 ? "BLOCK" : maxRisk >= 30 ? "WARN" : "ALLOW",
      riskScore: maxRisk,
      threats,
      executionTimeMs: Math.max(1, Date.now() - startTime),
    };
  }
}
