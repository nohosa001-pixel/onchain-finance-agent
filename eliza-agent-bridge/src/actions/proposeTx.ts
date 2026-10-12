import type { ProposeTxPayload, SecurityGateResponse, AgentContext } from "../types.js";

export class SecurityGateClient {
  constructor(private context: AgentContext) {}

  public async proposeTransaction(payload: ProposeTxPayload): Promise<SecurityGateResponse> {
    const { gateUrl, apiKey, agentId } = this.context;

    console.log(`[SecurityGateClient] Agent '${agentId}' proposing tx -> Chain: ${payload.chainId}, Target: ${payload.to}`);
    console.log(`[SecurityGateClient] Description: ${payload.description}`);

    const res = await fetch(`${gateUrl}/v1/tx/validate-and-execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-ID": agentId,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        agentId,
        chainId: payload.chainId,
        to: payload.to,
        value: payload.value || "0",
        data: payload.data,
        metadata: {
          description: payload.description,
          timestamp: Date.now(),
        },
      }),
    });

    const data = (await res.json()) as SecurityGateResponse;
    return data;
  }
}

/**
 * ElizaOS Compatible Action Definition
 */
export const proposeTxAction = {
  name: "PROPOSE_TRANSACTION",
  similes: [
    "EXECUTE_TRANSACTION",
    "SEND_TRANSACTION",
    "SWAP_TOKENS",
    "TRANSFER_FUNDS",
    "CALL_CONTRACT",
  ],
  description:
    "블록체인 트랜잭션 실행을 제안하고 Security-Gate의 결정론적 검증 및 승인을 요청합니다. 에이전트는 직접 서명하지 않습니다.",

  handler: async (
    context: AgentContext,
    payload: ProposeTxPayload
  ): Promise<{ success: boolean; message: string; response: SecurityGateResponse }> => {
    const client = new SecurityGateClient(context);
    const result = await client.proposeTransaction(payload);

    if (!result.approved) {
      return {
        success: false,
        message: `🚫 트랜잭션이 Security-Gate 정책에 의해 반려되었습니다.\n사유: ${result.reason}`,
        response: result,
      };
    }

    return {
      success: true,
      message: `✅ Security-Gate 정책 검증 통과 및 트랜잭션 서명 완료!\nTxHash: ${result.txHash}\nGas: ${result.simulationDetails?.gasUsed}`,
      response: result,
    };
  },
};
