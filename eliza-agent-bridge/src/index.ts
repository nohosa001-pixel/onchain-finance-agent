import { proposeTxAction, SecurityGateClient } from "./actions/proposeTx.js";
import type { ProposeTxPayload, SecurityGateResponse, AgentContext } from "./types.js";

export const securityGatePlugin = {
  name: "security-gate",
  description: "결정론적 Security-Gate를 통해 온체인 트랜잭션을 검증 및 중계하는 플러그인",
  actions: [proposeTxAction],
  evaluators: [],
  providers: [],
};

export default securityGatePlugin;
export { proposeTxAction, SecurityGateClient };
export type { ProposeTxPayload, SecurityGateResponse, AgentContext };
