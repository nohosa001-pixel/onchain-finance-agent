import { parseAbi, encodeFunctionData, parseUnits, keccak256, toHex, type Hex } from "viem";
import type { ProposeTxPayload } from "./types.js";

export const UNIVERSAL_ESCROW_ABI = parseAbi([
  "function depositEscrow(bytes32 jobId, address token, uint256 amount, uint8 domain, bytes32 truthHashRequirement, uint256 durationSec) external",
  "function refundEscrow(bytes32 jobId) external",
  "function executeSettlementWithProof(bytes32 jobId, (address recipient, uint256 amount)[] recipients, bytes truthPayload, uint256 expiresAt, uint8 v, bytes32 r, bytes32 s) external",
]);

export const UNIVERSAL_ESCROW_ADDRESSES: Record<number, `0x${string}`> = {
  8453: "0x745F7FAfFdb626B931Fe769476a09125cbf9d94b", // Base Mainnet
  137: "0x4Dbd77F4799816859a595f24a57A786516D2EAa8",  // Polygon Mainnet
  42161: "0x745F7FAfFdb626B931Fe769476a09125cbf9d94b", // Arbitrum One
};

export interface EscrowDepositParams {
  chainId: number;
  jobId?: Hex;
  tokenAddress: `0x${string}`;
  amountUSDC: number;
  domain?: number; // 기본값 1 (Finance / OTC Domain)
  truthHashRequirement?: Hex;
  durationSec?: number; // 기본 3600 (1시간)
  description?: string;
}

export class UniversalEscrowClient {
  public static getContractAddress(chainId: number): `0x${string}` {
    const addr = UNIVERSAL_ESCROW_ADDRESSES[chainId];
    if (!addr) {
      throw new Error(`Universal Escrow Hub not supported on chainId ${chainId}`);
    }
    return addr;
  }

  /**
   * Universal Escrow Hub에 대금 예치 트랜잭션 페이로드 생성
   * - 에이전트가 고액 OTC 또는 조건부 거래 시 Security-Gate로 제안할 calldata 생성
   */
  public static createDepositPayload(params: EscrowDepositParams): {
    jobId: Hex;
    targetContract: `0x${string}`;
    calldata: Hex;
    proposePayload: ProposeTxPayload;
  } {
    const targetContract = this.getContractAddress(params.chainId);
    const amountBig = parseUnits(params.amountUSDC.toFixed(6), 6);
    const jobId =
      params.jobId ||
      keccak256(toHex(`escrow_job_${Date.now()}_${Math.random()}`));
    const domain = params.domain ?? 1; // Finance Domain
    const truthHash =
      params.truthHashRequirement ||
      keccak256(toHex(`x402_oracle_condition_truth_${jobId}`));
    const duration = BigInt(params.durationSec ?? 3600);

    const calldata = encodeFunctionData({
      abi: UNIVERSAL_ESCROW_ABI,
      functionName: "depositEscrow",
      args: [jobId, params.tokenAddress, amountBig, domain, truthHash, duration],
    });

    const proposePayload: ProposeTxPayload = {
      chainId: params.chainId,
      to: targetContract,
      data: calldata,
      description:
        params.description ||
        `Universal Escrow Lock (${params.amountUSDC} USDC, Job: ${jobId.slice(0, 10)}...)`,
    };

    return {
      jobId,
      targetContract,
      calldata,
      proposePayload,
    };
  }

  /**
   * 조건 불일치 또는 타임아웃 발생 시 안전 원금 회수(Refund) 페이로드 생성
   */
  public static createRefundPayload(chainId: number, jobId: Hex): {
    targetContract: `0x${string}`;
    calldata: Hex;
    proposePayload: ProposeTxPayload;
  } {
    const targetContract = this.getContractAddress(chainId);
    const calldata = encodeFunctionData({
      abi: UNIVERSAL_ESCROW_ABI,
      functionName: "refundEscrow",
      args: [jobId],
    });

    const proposePayload: ProposeTxPayload = {
      chainId,
      to: targetContract,
      data: calldata,
      description: `Universal Escrow Refund (Job: ${jobId.slice(0, 10)}...)`,
    };

    return {
      targetContract,
      calldata,
      proposePayload,
    };
  }
}
