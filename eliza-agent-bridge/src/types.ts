import type { Hex } from "viem";

export interface ProposeTxPayload {
  chainId: number;
  to: `0x${string}`;
  value?: string;
  data: Hex;
  description: string;
}

export interface SecurityGateResponse {
  approved: boolean;
  reason?: string;
  txHash?: `0x${string}`;
  decodedMethod?: string;
  decodedAmount?: string;
  simulationDetails?: {
    gasUsed?: string;
    slippageBps?: number;
    executedAt?: number;
  };
  elapsedMs?: number;
}

export interface AgentContext {
  agentId: string;
  gateUrl: string;
  apiKey?: string;
}
