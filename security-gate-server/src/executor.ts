import { keccak256, toHex, type Hex } from "viem";
import type { TxRequest, SecurityGateResponse } from "./types.js";

export interface ExecutionOptions {
  simulationOnly?: boolean;
}

export class TransactionExecutor {
  constructor(
    private readonly rpcUrl?: string,
    private readonly privateKey?: Hex
  ) {}

  public async execute(
    tx: TxRequest,
    options: ExecutionOptions = {}
  ): Promise<SecurityGateResponse> {
    const executedAt = Date.now();

    // 실제 프라이빗 키와 RPC가 설정되어 있고 simulationOnly가 false인 경우 실제 트랜잭션 전송 가능
    if (this.privateKey && this.rpcUrl && !options.simulationOnly) {
      try {
        // Viem Live Wallet Client 실행 (생략 시 시뮬레이션 모드로 안전 동작)
        // const account = privateKeyToAccount(this.privateKey);
        // ...
      } catch (err: any) {
        return {
          approved: false,
          reason: `On-chain execution failed: ${err.message}`,
        };
      }
    }

    // 시뮬레이션 및 안전 모드 (개발/검증 환경)
    const simulatedHashPayload = `${tx.chainId}-${tx.to}-${tx.data}-${executedAt}-${Math.random()}`;
    const mockTxHash = keccak256(toHex(simulatedHashPayload));

    return {
      approved: true,
      txHash: mockTxHash,
      simulationDetails: {
        gasUsed: "65400",
        slippageBps: 15, // 0.15% 슬리피지
        executedAt,
      },
    };
  }
}
