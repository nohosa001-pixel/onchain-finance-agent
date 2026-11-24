import crypto from "crypto";
import { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { checkSanctionsAndMixer, type SanctionsCheckResult } from "./sanctionsAndMixerCheck.js";
import { checkWalletSolvency, type SolvencyCheckResult } from "./solvencyChecker.js";
import { fetchAgentReputation, type AgentReputationResult } from "./reputationBridge.js";

export interface KywVerifyRequest {
  counterpartyAddress: string;
  chainId: number;
  requiredAmountUSDC: number;
  escrowJobId?: string | number;
}

export interface KywVerifyResult {
  protocol: "A.GRID-KYW-SOLVENCY/1.0";
  verdict: "APPROVED" | "REJECTED" | "REVIEW_REQUIRED";
  reasons: string[];
  counterpartyAddress: string;
  chainId: number;
  requiredAmountUSDC: number;
  escrowJobId?: string | number;
  sanctions: SanctionsCheckResult;
  solvency: SolvencyCheckResult;
  reputation: AgentReputationResult;
  proofHash: `0x${string}`;
  attestationSignature?: `0x${string}`;
  signerAddress?: `0x${string}`;
  verifiedAtUtc: string;
}

export class KywOracleService {
  private totalVerifications = 0;
  private paidVerifications = 0;

  public validateX402Payment(paymentProof?: string, vaultKey?: string): {
    isPaid: boolean;
    invoice?: Record<string, unknown>;
  } {
    const isValidTxHash =
      typeof paymentProof === "string" && /^0x[a-fA-F0-9]{64}$/.test(paymentProof);
    const isValidTicket =
      typeof paymentProof === "string" &&
      paymentProof.startsWith("x402_ticket_") &&
      paymentProof.length > 20;
    const hasVaultPass =
      typeof vaultKey === "string" && vaultKey.trim().length >= 12;

    if (!isValidTxHash && !isValidTicket && !hasVaultPass) {
      const recipient =
        process.env.GATE_PAY_TO_ADDRESS ||
        "0xEbA2821B8E37eb5a231c074345c991Cb1F139920";
      return {
        isPaid: false,
        invoice: {
          error: "Payment Required",
          status: 402,
          protocol: "x402",
          invoice: {
            invoiceId: `inv_kyw_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            costUSDC: "0.02",
            currency: "USDC",
            recipient,
            network: "Base (ChainID 8453) / Polygon (137) / Solana (501)",
            requiredHeader: "X-402-Payment-Proof",
            instructions:
              "Submit 0.02 USDC micro-payment and retry with 'X-402-Payment-Proof' header.",
          },
        },
      };
    }

    this.paidVerifications++;
    return { isPaid: true };
  }

  public async verifyCounterparty(req: KywVerifyRequest): Promise<KywVerifyResult> {
    this.totalVerifications++;

    const [sanctions, solvency, reputation] = await Promise.all([
      checkSanctionsAndMixer(req.counterpartyAddress, req.chainId),
      checkWalletSolvency(req.counterpartyAddress, req.chainId, req.requiredAmountUSDC),
      fetchAgentReputation(req.counterpartyAddress),
    ]);

    const reasons: string[] = [];
    if (!sanctions.ofacClean) {
      reasons.push(...sanctions.riskFlags);
    }
    if (solvency.source === "RPC_UNAVAILABLE") {
      reasons.push("SOLVENCY_RPC_UNAVAILABLE");
    } else if (!solvency.hasSufficientUsdc) {
      reasons.push(
        `INSUFFICIENT_USDC (${solvency.usdcBalance} < ${req.requiredAmountUSDC})`
      );
    }
    if (reputation.creditGrade === "F" || reputation.creditScore < 400) {
      reasons.push(`LOW_CREDIT_GRADE_${reputation.creditGrade}`);
    }

    let verdict: "APPROVED" | "REJECTED" | "REVIEW_REQUIRED" = "APPROVED";
    if (!sanctions.ofacClean || reputation.creditGrade === "F" || reputation.creditScore < 400) {
      verdict = "REJECTED";
    } else if (solvency.source === "RPC_UNAVAILABLE") {
      verdict = "REVIEW_REQUIRED";
    } else if (!solvency.hasSufficientUsdc) {
      verdict = "REJECTED";
    }

    const verifiedAtUtc = new Date().toISOString();
    const canonicalPayload = JSON.stringify({
      counterpartyAddress: req.counterpartyAddress,
      chainId: req.chainId,
      requiredAmountUSDC: req.requiredAmountUSDC,
      verdict,
      ofacClean: sanctions.ofacClean,
      usdcBalance: solvency.usdcBalance,
      creditScore: reputation.creditScore,
      verifiedAtUtc,
    });
    const proofHash = `0x${crypto
      .createHash("sha256")
      .update(canonicalPayload)
      .digest("hex")}` as `0x${string}`;

    let attestationSignature: `0x${string}` | undefined;
    let signerAddress: `0x${string}` | undefined;
    const signerKey = (
      process.env.KYW_SIGNER_PRIVATE_KEY ||
      process.env.SESSION_KEY_PRIVATE_KEY ||
      ""
    ).trim();
    if (/^0x[a-fA-F0-9]{64}$/.test(signerKey)) {
      const account = privateKeyToAccount(signerKey as Hex);
      signerAddress = account.address;
      attestationSignature = await account.signMessage({
        message: { raw: proofHash },
      });
    }

    return {
      protocol: "A.GRID-KYW-SOLVENCY/1.0",
      verdict,
      reasons,
      counterpartyAddress: req.counterpartyAddress,
      chainId: req.chainId,
      requiredAmountUSDC: req.requiredAmountUSDC,
      escrowJobId: req.escrowJobId,
      sanctions,
      solvency,
      reputation,
      proofHash,
      attestationSignature,
      signerAddress,
      verifiedAtUtc,
    };
  }

  public getStats() {
    return {
      totalVerifications: this.totalVerifications,
      paidVerifications: this.paidVerifications,
      pricePerCheckUSDC: "0.02",
    };
  }
}
