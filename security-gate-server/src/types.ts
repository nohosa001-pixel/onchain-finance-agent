import type { Hex } from "viem";

export interface RateLimits {
  cooldownSeconds: number;
  maxRequestsPerMinute: number;
}

export interface TokenPolicy {
  decimals: number;
  maxPerTx: string;
  maxDailyLimit: string;
}

export interface WhitelistEntry {
  chainId: number;
  address: `0x${string}`;
  label?: string;
  allowedSelectors: string[];
}

export interface PolicyConfig {
  version: string;
  agentId: string;
  allowedChains: number[];
  rateLimits: RateLimits;
  tokenPolicies: Record<string, TokenPolicy>;
  contractWhitelist: WhitelistEntry[];
}

export interface TxRequest {
  agentId?: string;
  chainId: number;
  to: `0x${string}`;
  value?: string | bigint;
  data: Hex;
  metadata?: {
    description?: string;
    timestamp?: number;
  };
}

export interface ValidationResult {
  approved: boolean;
  reason?: string;
  decodedMethod?: string;
  decodedAmount?: bigint;
}

export interface SecurityGateResponse {
  approved: boolean;
  reason?: string;
  txHash?: `0x${string}`;
  simulationDetails?: {
    gasUsed?: string;
    slippageBps?: number;
    executedAt?: number;
  };
}
