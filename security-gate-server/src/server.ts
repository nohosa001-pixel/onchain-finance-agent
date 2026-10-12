import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Hex } from "viem";
import { SecurityGateService, PolicyConfig } from "./securityGateService.js";
import { OracleX402Service } from "./oracleService.js";
import { DeHedgeVaultManager } from "./fundVault.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GATE_API_KEY = process.env.GATE_API_KEY || process.env.SECURITY_GATE_API_KEY || "sg_sec_live_99f01bc_sample_token";

// 기본 검증 정책 로드 또는 Fallback (Base USDC 기준)
const POLICY_FILE_PATH =
  process.env.POLICY_FILE_PATH ||
  path.resolve(__dirname, "../config/policy.config.json");

let policyConfig: PolicyConfig;
try {
  const content = fs.readFileSync(POLICY_FILE_PATH, "utf-8");
  policyConfig = JSON.parse(content) as PolicyConfig;
} catch {
  policyConfig = {
    allowedChains: [8453],
    rateLimits: {
      cooldownSeconds: 10,
      maxRequestsPerMinute: 15,
    },
    tokenPolicies: {
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
        decimals: 6,
        maxPerTx: "50000000", // 50 USDC
        maxDailyLimit: "500000000", // 500 USDC
      },
    },
    contractWhitelist: [
      {
        chainId: 8453,
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        allowedSelectors: [
          "0xa9059cbb", // transfer(address,uint256)
          "0x095ea7b3", // approve(address,uint256)
        ],
      },
    ],
  };
}

const gateService = new SecurityGateService(
  policyConfig,
  process.env.SAFE_ADDRESS as `0x${string}` | undefined,
  process.env.SESSION_KEY_PRIVATE_KEY as Hex | undefined,
  process.env.RPC_URL || "https://mainnet.base.org"
);

const oracleService = new OracleX402Service();
const vaultManager = new DeHedgeVaultManager(1000); // 1,000 USDC genesis AUM

// API Key 인증 미들웨어
const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.headers["x-api-key"] as string);

  if (GATE_API_KEY && token && token !== GATE_API_KEY) {
    res.status(401).json({ approved: false, reason: "Unauthorized: Invalid API key." });
    return;
  }
  next();
};

// 헬스체크 엔드포인트
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    safeConfigured: !!process.env.SAFE_ADDRESS,
    chains: policyConfig.allowedChains,
    vaultAUM: vaultManager.getSnapshot().totalAUM,
    oracleStats: oracleService.getStats(),
    timestamp: Date.now(),
  });
});

// 정책 조회 엔드포인트
app.get("/v1/policy", authenticate, (_req: Request, res: Response) => {
  res.json({ policy: gateService.getPolicy() });
});

// 상태 리셋 (테스트용)
app.post("/v1/gate/reset-state", authenticate, (_req: Request, res: Response) => {
  gateService.resetState();
  res.json({ status: "success", message: "Gate state reset." });
});

// -------------------------------------------------------------
// 🌐 A.GRID HTTP 402 (x402) 오라클 시장 데이터 엔드포인트
// -------------------------------------------------------------
app.get("/v1/oracle/market-intelligence", (req: Request, res: Response) => {
  const paymentProof = req.headers["x-402-payment-proof"] as string | undefined;
  const result = oracleService.handleMarketIntelligenceRequest(paymentProof);

  if (!result.isPaid) {
    res.status(402).json(result.invoice);
    return;
  }
  res.status(200).json(result.data);
});

// -------------------------------------------------------------
// 🏦 ERC-4626 DeHedge Vault 엔드포인트
// -------------------------------------------------------------
app.get("/v1/vault/status", (_req: Request, res: Response) => {
  res.json({
    status: "active",
    vault: vaultManager.getSnapshot(),
  });
});

app.post("/v1/vault/deposit", (req: Request, res: Response) => {
  const { investor, amountUSDC } = req.body;
  if (!investor || !amountUSDC || amountUSDC <= 0) {
    res.status(400).json({ error: "Invalid investor or amountUSDC." });
    return;
  }
  const result = vaultManager.deposit(investor, Number(amountUSDC));
  res.json({ success: true, ...result, vault: vaultManager.getSnapshot() });
});

app.post("/v1/vault/record-profit", authenticate, (req: Request, res: Response) => {
  const { profitUSDC } = req.body;
  if (!profitUSDC || profitUSDC <= 0) {
    res.status(400).json({ error: "Invalid profitUSDC amount." });
    return;
  }
  const result = vaultManager.recordTradeProfit(Number(profitUSDC));
  res.json({ success: true, settlement: result, vault: vaultManager.getSnapshot() });
});

// -------------------------------------------------------------
// 🛡️ 핵심 검증 & Safe 실행 라우트
// -------------------------------------------------------------
app.post("/v1/tx/validate-and-execute", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId, chainId, to, value, data } = req.body;

    if (!chainId || !to || !data) {
      res.status(400).json({
        approved: false,
        reason: "Missing required parameters: chainId, to, data are mandatory.",
      });
      return;
    }

    const result = await gateService.validateAndExecute({
      agentId: agentId || "unknown-agent",
      chainId: Number(chainId),
      to: to.toLowerCase() as `0x${string}`,
      value: value || "0",
      data: data as Hex,
    });

    res.status(result.approved ? 200 : 422).json(result);
  } catch (error: any) {
    console.error("[Gate API Error]", error);
    res.status(500).json({
      approved: false,
      reason: `Internal server error: ${error.message}`,
    });
  }
});

const isMain = process.argv[1] && (
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
  process.argv[1].endsWith("server.ts") ||
  process.argv[1].endsWith("server.js")
);

if (process.env.NODE_ENV !== "test" && isMain) {
  app.listen(PORT, () => {
    console.log(`🛡️ [Security-Gate] Listening on http://localhost:${PORT}`);
    console.log(`💼 Safe Account: ${process.env.SAFE_ADDRESS || "(Simulation/Mock Mode)"}`);
    console.log(`🔗 RPC: ${process.env.RPC_URL || "https://mainnet.base.org"}`);
    console.log(`🌐 x402 Oracle: http://localhost:${PORT}/v1/oracle/market-intelligence`);
    console.log(`🏦 Vault Status: http://localhost:${PORT}/v1/vault/status`);
  });
}

export { app, gateService, oracleService, vaultManager };
