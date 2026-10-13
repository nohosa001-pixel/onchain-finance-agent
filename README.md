# 🛡️ On-Chain Finance Agent (`onchain-finance-agent`)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Viem](https://img.shields.io/badge/Web3-Viem-black.svg?logo=ethereum)](https://viem.sh/)
[![ERC-4626](https://img.shields.io/badge/Standard-ERC--4626-4C51BF.svg)](https://eips.ethereum.org/EIPS/eip-4626)
[![Safe](https://img.shields.io/badge/MultiSig-Safe%20Protocol-12ff80.svg)](https://safe.global/)
[![x402](https://img.shields.io/badge/Micropayments-HTTP%20402%20(x402)-orange.svg)](https://agent-security-gate-x402-212942243360.asia-northeast3.run.app/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An institutional-grade **Autonomous On-Chain Finance Agent Framework** that establishes a **Deterministic Security-Gate Guardrail Layer** between non-deterministic Large Language Models (LLMs) and on-chain execution. It eliminates prompt injection vulnerabilities, hallucinations, and private key exfiltration while providing Wall Street-level quantitative risk management, non-custodial capital vaulting, and multi-chain settlement.

---

## 📑 Table of Contents

- [Key Architecture & Data Flow](#-key-architecture--data-flow)
- [Core Features](#-core-features)
- [The 5+ Deterministic Guardrails](#-the-5-deterministic-guardrails)
- [Repository Structure](#-repository-structure)
- [Quick Start](#-quick-start)
- [Execution Modes](#-execution-modes)
- [Test Suites & Security Verification](#-test-suites--security-verification)
- [API Reference](#-api-reference)
- [Smart Contract Architecture (`DeHedgeVault.sol`)](#-smart-contract-architecture-dehedgevaultsol)
- [Economic Directive & Zero-Trust Protocol](#-economic-directive--zero-trust-protocol)

---

## 🏛️ Key Architecture & Data Flow

```text
┌─────────────────────────────────────────────────────────────┐
│                 LLM Agent Cognitive Layer                   │
│         (WallStreet Disruptor / ElizaOS Agent Brain)        │
│              - NO PRIVATE KEY ACCESS / ZERO SIGNING         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ Proposes Action (PROPOSE_TRANSACTION)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Pre-Flight Safety Guard & Sanitizer             │
│   - Prompt Injection Sanitization & Salami Slicing Defense  │
│   - Calldata Inspection & Structural Schema Validation       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ Forward via REST (HTTP / JSON-RPC)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│          Deterministic Security-Gate Engine (:3000)         │
│  ├── 1. Chain & Target Allowlist (Authorized Contracts)     │
│  ├── 2. 4-Byte Function Selector Whitelist Verification     │
│  ├── 3. Velocity Checks: Max Per-Transaction Limit          │
│  ├── 4. Sliding Window: 24h Cumulative Spend Ceiling        │
│  ├── 5. Cooldown & Anti-Spam Rate Limiting                  │
│  └── 6. x402 Micropayment & Oracle Verification             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ Approved & Validated Request
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Execution & Settlement Rail (Safe/Viem)         │
│   - Safe Session Key / Isolated Signer                      │
│   - DeHedge Institutional Vault (ERC-4626 $wALPHA)          │
│   - Universal Escrow Hub (Zero-Trust Collateral Payouts)    │
│   - Multi-Chain: Base (8453), Polygon (137), Solana (501)   │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Core Features

- **Zero-Key Exposure (Isolation by Design)**: LLM agents never possess or sign with private keys. They can only emit structured transaction proposals (`PROPOSE_TRANSACTION`).
- **Deterministic Guardrails**: Disassembles binary calldata with [Viem](https://viem.sh/) in real time, matching function selectors and evaluating cumulative limits in a rolling 24-hour sliding window.
- **DeHedge Institutional Vault (`ERC-4626`)**: Non-custodial vault with High-Water Mark (HWM) "2 & 20" institutional performance fee distribution and a 5% on-chain maximum drawdown circuit breaker.
- **A.GRID x402 Oracle Integration**: Native HTTP 402 pay-per-query oracle access, enabling autonomous agent-to-agent data monetization and zero-trust escrow transactions.
- **Delta-Neutral Quant Strategy Engine**: Algorithmic spread scanner across decentralized exchanges (Uniswap, Aerodrome) executing low-risk arbitrage with automatic slippage control.
- **Interactive Telegram Agent**: Bi-directional command-and-control bot providing real-time portfolio status, risk metrics, trade alerts, and manual overrides.
- **Universal Escrow Interoperability**: Protocol-compliant settlement allowing agents to deposit, verify, and release conditional payments without uncollateralized risk.

---

## 🛡️ The 5+ Deterministic Guardrails

| Guardrail | Enforcement Mechanism | Purpose |
| :--- | :--- | :--- |
| **1. Zero Key Exposure** | Air-gapped Execution | Agent environment holds zero private keys; execution is gated by the Security Gate. |
| **2. Spend Velocity Control** | `maxPerTx` & `maxDailyLimit` | Restricts single-trade size (e.g. 100 USDC) and sliding 24-hour spend (e.g. 1,000 USDC). |
| **3. Target Contract Allowlist** | Address & Chain Whitelist | Strictly restricts interaction to pre-approved contracts (Base USDC, Router, Vault). |
| **4. 4-Byte Selector Filtering** | Calldata Parsing | Only approved function selectors (e.g., `0xa9059cbb` for `transfer`) are authorized. |
| **5. Cooldown & Rate Limiting** | Timestamp Sliding Window | Enforces minimum interval between transactions (e.g., 5 seconds) to block flash-loan drains. |
| **6. Salami Attack Protection** | Aggregated Pre-Flight Checks | Detects and neutralizes micro-transaction splitting attacks that attempt to bypass limits. |
| **7. 5% Max Drawdown Circuit Breaker** | Smart Contract Enforced | Halts trading operations if portfolio drawdown exceeds 5% within a single epoch. |

---

## 📂 Repository Structure

```text
onchain-finance-agent/
├── contracts/
│   └── DeHedgeVault.sol               # Institutional ERC-4626 Vault with HWM & Circuit Breaker
│
├── security-gate-server/              # Deterministic Guardrail Engine & Microservices
│   ├── config/
│   │   ├── policy.schema.json         # JSON schema definition for safety policies
│   │   └── policy.config.json         # Active operational policy (Limits, Allowlist, Cooldown)
│   └── src/
│       ├── gate.ts                    # SecurityGate core (Calldata decoding, Sliding window)
│       ├── executor.ts                # Isolated transaction signer & Safe execution pipeline
│       ├── fundVault.ts               # Off-chain ledger & ERC-4626 Vault management module
│       ├── liveMarketOracle.ts        # DEX pricing feeds & real-time liquidity scanner
│       ├── oracleService.ts           # A.GRID HTTP 402 (x402) Oracle verification service
│       ├── securityGateService.ts     # Safe Protocol Kit & Gate orchestration service
│       ├── server.ts                  # Express REST API (:3000)
│       └── types.ts                   # Core TypeScript types & interfaces
│
├── eliza-agent-bridge/                # Agent Client, Quant Strategies & Bot Integrations
│   ├── characters/
│   │   └── wallstreet.character.json  # Agent character persona & behavior configuration
│   └── src/
│       ├── actions/proposeTx.ts       # ElizaOS action handler intercepting LLM actions
│       ├── autonomousFundLoop.ts      # Autonomous fund execution engine (24/7 market loop)
│       ├── demo-runner.ts             # 5 core security attack vector simulation runner
│       ├── preFlightGuard.ts          # Pre-flight safety mesh & calldata sanitization
│       ├── quantStrategyEngine.ts     # Delta-neutral arbitrage & market signal analyzer
│       ├── telegramInteractiveAgent.ts # Interactive Telegram bot with live approval workflows
│       ├── telegramNotifier.ts        # Telegram push notification dispatcher
│       └── universalEscrowClient.ts   # Universal Escrow Hub smart contract client
│
├── tests/
│   ├── security-gate.test.ts          # 11-step comprehensive unit test suite
│   ├── red-team-stress.test.ts        # Adversarial penetration test suite (5 attack vectors)
│   ├── universal-escrow-interop.test.ts # Multi-chain escrow interop & conditional release test
│   ├── full-preflight-safety-mesh.test.ts # End-to-end pre-flight filter verification
│   ├── live-market-feed.test.ts       # Real-time DEX liquidity & price feed accuracy tests
│   └── dehedge-vault.test.ts          # ERC-4626 accounting & High-Water Mark unit tests
│
├── AGENTS.md                          # Zero-Trust Economic Handshake Directive (A.GRID AP2/1.0)
├── package.json                       # Monorepo workspaces & executable scripts
└── tsconfig.json                      # Root TypeScript configuration
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: `v20.x` or higher
- **npm**: `v9.x` or higher

### 2. Installation

Clone the repository and install all dependencies:

```bash
git clone https://github.com/nohosa001-pixel/onchain-finance-agent.git
cd onchain-finance-agent
npm install
```

### 3. Environment Configuration

Copy the example configuration to `.env` and configure your credentials:

```bash
cp .env.example .env
```

Key environment variables:
```dotenv
# Port & Server Settings
GATE_PORT=3000

# Private Key (Isolated to Security-Gate only, NEVER exposed to LLM context)
EXECUTOR_PRIVATE_KEY=0x...

# Telegram Bot (Optional for interactive notifications)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Target RPCs
BASE_RPC_URL=https://mainnet.base.org
POLYGON_RPC_URL=https://polygon-rpc.com
```

---

## ⚡ Execution Modes

### 1. Start the Security-Gate Server
Launches the standalone REST API on port `3000`:
```bash
npm run start:gate
```
*Healthcheck available at `http://localhost:3000/health`.*

### 2. Launch the Autonomous Fund Loop
Runs the continuous autonomous fund management loop (Oracle intelligence gathering -> Quant signal computation -> Gate verification -> Settlement):
```bash
npm run start:fund
```

### 3. Start the Interactive Telegram Agent
Launches the 24/7 interactive Telegram bot for autonomous alerts, trade reviews, and real-time portfolio tracking:
```bash
npm run start:telegram
```

---

## 🧪 Test Suites & Security Verification

The repository includes a comprehensive testing matrix covering security policies, adversarial stress tests, and smart contract invariants:

### 1. Security Gate & Vault Suite (11 Core Invariants)
Verifies chain validation, allowlisting, selector gating, rate limiting, single-trade caps, daily ceilings, High-Water Mark fee allocation, and x402 payment checks:
```bash
npm test
```

### 2. Adversarial Red-Team Stress Test
Simulates malicious attacks against the Security Gate:
- Salami micro-splitting attack
- Calldata smuggling
- Forged x402 payment receipts
- 20-thread concurrency race condition
- PnL loss distortion attack
```bash
npm run test:redteam
```

### 3. Universal Escrow Interoperability Test
Validates multichain escrow lifecycle (`depositEscrow`, `refundEscrow`, unauthorized selector rejection):
```bash
npm run test:escrow
```

### 4. Full Pre-Flight Safety Mesh Test
Ensures multi-layered calldata inspection blocks unauthorized inputs before they reach the RPC:
```bash
npm run test:preflight
```

### 5. Live Market Feed & Oracle Accuracy Test
Validates real-time price discovery and liquidity depth monitoring:
```bash
npm run test:live
```

---

## 📡 API Reference

The `security-gate-server` exposes clean REST endpoints:

### `GET /health`
Returns system operational status and loaded configuration version.
```json
{
  "status": "HEALTHY",
  "version": "1.0.0",
  "uptime": 124.5
}
```

### `GET /v1/oracle/market-intelligence`
Fetches real-time market data across decentralized exchanges. Requires an A.GRID x402 payment header or micro-settlement invoice verification.

### `GET /v1/vault/status`
Returns real-time DeHedge Vault metrics including Total AUM, NAV, High-Water Mark, and available liquidity.

### `POST /v1/tx/validate-and-execute`
Primary gateway for LLM transaction validation and execution.
- **Request Body**:
```json
{
  "chainId": 8453,
  "to": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "data": "0xa9059cbb000000000000000000000000...",
  "value": "0",
  "agentId": "onchain-finance-agent-01"
}
```
- **Response (Approved)**:
```json
{
  "status": "APPROVED_AND_EXECUTED",
  "txHash": "0x4f3a...c81d",
  "executedAmount": "50000000",
  "dailySpent": "50000000",
  "remainingDailyLimit": "950000000"
}
```
- **Response (Rejected)**:
```json
{
  "status": "REJECTED",
  "reason": "Single transaction amount (150000000) exceeds maximum limit (100000000)"
}
```

---

## 📜 Smart Contract Architecture (`DeHedgeVault.sol`)

Located at [`contracts/DeHedgeVault.sol`](file:///contracts/DeHedgeVault.sol), the vault implements:

1. **ERC-4626 Standards Compliance**: Full compatibility with DeFi liquidity aggregators and automated money markets.
2. **Non-Custodial Invariants**: Depositors maintain sole custody of redemption rights. The autonomous agent is strictly constrained to executing trades on whitelisted DEX routers.
3. **5% Max Drawdown Circuit Breaker**: If total assets drop by more than 5% within an epoch, trading functions lock automatically until governance reviews the state.
4. **2 & 20 High-Water Mark Accounting**:
   - 2% annual management fee.
   - 20% performance fee assessed only upon setting a new all-time high NAV, safeguarding depositors against paying fees on recovered losses.

---

## 🤝 Economic Directive & Zero-Trust Protocol

This project strictly adheres to the **A.GRID AP2/1.0 Zero-Trust Economic Directive** defined in [`AGENTS.md`](file:///AGENTS.md):

1. **No Uncollateralized Transfers**: The agent never sends uncollateralized funds to unverified external agents.
2. **Escrow First**: Settlements are escrowed with deterministic verification via the [Universal Escrow Hub](https://agent-security-gate-x402-212942243360.asia-northeast3.run.app/hub/).
3. **Truth Oracle Invariant**: Deliverables must pass cryptographic or deterministic validation before funds are unlocked.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
