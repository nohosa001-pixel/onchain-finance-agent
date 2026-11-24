# 🛡️ A.GRID Counterparty KYW & Solvency Oracle (`onchain-finance-agent`)

[![CI](https://github.com/nohosa001-pixel/onchain-finance-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/nohosa001-pixel/onchain-finance-agent/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Viem](https://img.shields.io/badge/Web3-Viem-black.svg?logo=ethereum)](https://viem.sh/)
[![Safe](https://img.shields.io/badge/MultiSig-Safe%20Protocol-12ff80.svg)](https://safe.global/)
[![x402](https://img.shields.io/badge/Micropayments-HTTP%20402%20(x402)-orange.svg)](https://agent-security-gate-x402-212942243360.asia-northeast3.run.app/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Deterministic Counterparty KYW (Know Your Wallet), Proof-of-Funds Solvency, and Pre-Sign Security Oracle for Autonomous M2M Settlement.**

Before an autonomous AI agent or escrow contract releases or accepts funds, `onchain-finance-agent` verifies the counterparty wallet across **EVM (`Base`, `Polygon`, `Arbitrum`, `Ethereum`)** and **Solana (`501`)**—with **zero directional trading, zero custodial vaulting, and zero market-risk exposure**.

---

## 🏛️ Architecture & Verification Flow

```text
┌────────────────────────────────────────────────────────────────────┐
│          Buyer / Escrow / Autonomous M2M Agent                     │
│   Calls POST /v1/kyw/verify (with X-402-Payment-Proof: $0.02 USDC) │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                KywOracleService (security-gate-server)             │
│  ├── 1. Sanctions & Mixer Check (sanctionsAndMixerCheck.ts)        │
│  │      └─ OFAC / Tornado Cash / BLOCKED_ADDRESSES (EVM & Solana)  │
│  ├── 2. Live On-Chain Solvency Check (solvencyChecker.ts)          │
│  │      └─ Native Gas + USDC Balance >= requiredAmountUSDC         │
│  │         (Base 8453, Polygon 137, Arbitrum 42161, ETH 1, SOL 501)│
│  └── 3. Agent Credit & ERC-8004 Reputation (reputationBridge.ts)   │
│         └─ Live CRS Score & Grade via A.GRID Security Gate         │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  Deterministic Verdict + Cryptographic Attestation                 │
│  - verdict: "APPROVED" | "REJECTED" | "REVIEW_REQUIRED"            │
│  - proofHash: SHA-256 canonical digest (0x...)                     │
│  - attestationSignature: Optional EIP-191 signer attestation       │
└────────────────────────────────────────────────────────────────────┘
```

In addition to counterparty KYW & solvency verification, the server retains the deterministic **Pre-Sign Security Gate** (`POST /v1/tx/validate-and-execute`) enforcing chain allowlists, 4-byte function selector whitelisting, per-tx caps, and 24-hour sliding-window spend limits.

---

## ✨ Core Capabilities

- **OFAC & Mixer Screening (`sanctionsAndMixerCheck.ts`)**: Deterministic screening against canonical sanctioned/mixer addresses (EVM & Solana) plus configurable `BLOCKED_ADDRESSES`.
- **Multi-Chain Proof of Funds (`solvencyChecker.ts`)**: Live RPC balance checks for native gas and canonical USDC across **Base (`8453`)**, **Polygon (`137`)**, **Arbitrum (`42161`)**, **Ethereum (`1`)**, and **Solana (`501`)**.
- **ERC-8004 & Credit Bridge (`reputationBridge.ts`)**: Queries A.GRID Security Gate (`/api/v1/credit/{address}`) for Credit Rating Score (CRS) and ERC-8004 registration status.
- **HTTP 402 (`x402`) Micro-Payment Native (`kywOracleService.ts`)**: Enforces `$0.02 USDC` per verification via `X-402-Payment-Proof` or `X-Vault-Key`, returning standard `402 Payment Required` invoices when unpaid.
- **Pre-Sign Calldata Firewall (`securityGateService.ts` & `gate.ts`)**: Decodes ERC-20 calldata via `viem` and enforces per-tx & 24h cumulative spend ceilings.

---

## 📁 Repository Structure

```text
onchain-finance-agent/
├── package.json
├── tsconfig.json
├── security-gate-server/
│   ├── config/policy.config.json
│   └── src/
│       ├── server.ts                  # Express API (/health, /v1/kyw/verify, /v1/kyw/stats, /v1/tx/validate-and-execute)
│       ├── kywOracleService.ts        # KYW + Solvency orchestration, x402 gating, proofHash & EIP-191 signing
│       ├── sanctionsAndMixerCheck.ts  # OFAC / mixer / blocked address screening
│       ├── solvencyChecker.ts         # Multi-chain live USDC & gas solvency checks (EVM + Solana)
│       ├── reputationBridge.ts        # A.GRID Credit Rating & ERC-8004 reputation bridge
│       ├── securityGateService.ts     # Safe/viem pre-sign policy enforcement
│       ├── gate.ts                    # Deterministic calldata & spend-limit firewall
│       ├── oracleService.ts           # x402 invoice & verification helpers
│       ├── solscanService.ts          # Solana Solscan API client
│       └── types.ts
├── eliza-agent-bridge/
│   └── src/
│       ├── preFlightGuard.ts          # Pre-flight prompt & payload safety guard
│       ├── universalEscrowClient.ts   # A.GRID Universal Escrow Hub client
│       └── actions/                   # ElizaOS action bindings
└── tests/
    ├── kyw-solvency-oracle.test.ts    # KYW, x402 402 invoice, sanctions & rejection proofHash tests
    ├── security-gate.test.ts          # Calldata firewall & spend-limit tests
    ├── red-team-stress.test.ts        # Salami slicing, malformed calldata & burst race-condition tests
    ├── full-preflight-safety-mesh.test.ts
    └── universal-escrow-interop.test.ts
```

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build all workspaces
npm run build

# 3. Run KYW & Solvency Oracle tests
npm run test:kyw

# 4. Run Security-Gate & Red-Team suites
npm test
npm run test:redteam

# 5. Start the Oracle & Security-Gate server (default :3000)
npm run start:gate
```

---

## 📡 API Reference

### `POST /v1/kyw/verify` (`x402` Protected — `$0.02 USDC`)
Verifies a counterparty wallet's sanctions status, live USDC solvency, and A.GRID credit grade.

```bash
curl -X POST http://localhost:3000/v1/kyw/verify \
  -H "Content-Type: application/json" \
  -H "X-402-Payment-Proof: x402_ticket_demo_valid_proof_0001" \
  -d '{
    "counterpartyAddress": "0xEbA2821B8E37eb5a231c074345c991Cb1F139920",
    "chainId": 8453,
    "requiredAmountUSDC": 100,
    "escrowJobId": 9001
  }'
```

### `GET /v1/kyw/stats`
Returns total and paid KYW verification counts and per-check USDC pricing.

### `POST /v1/tx/validate-and-execute`
Validates EVM calldata against chain, contract, selector, and 24-hour spend policies prior to Safe execution.

### `GET /health`
Returns service health, configured chains, and oracle telemetry.

---

## 📜 License

MIT License — see [LICENSE](LICENSE).
