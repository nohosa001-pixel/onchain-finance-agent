# On-Chain Finance Agent (`onchain-finance-agent`)

비결정론적인 LLM 에이전트(두뇌)와 결정론적인 온체인 트랜잭션 사이에 **Security-Gate(결정론적 보안 검증 가드레일 레이어)**를 배치하여, 프롬프트 인젝션, 환각, 키 탈취 리스크를 원천 차단하고 월스트리트 수준의 리스크 관리를 수행하는 자율 금융 에이전트 시스템입니다.

---

## 🏛️ 아키텍처 개요

```
[ LLM 에이전트 (WallStreet-Disruptor-Agent) ]
       │
       ▼ (PROPOSE_TRANSACTION 액션 호출 - 서명 권한 없음)
[ Security-Gate Engine (REST API :3000) ]
       ├── 1. 체인 및 컨트랙트 화이트리스트 검증 (Unauthorized Target 차단)
       ├── 2. 함수 셀렉터 검증 (0xa9059cbb: transfer, 0x095ea7b3: approve 등)
       ├── 3. 쿨다운 및 분당 호출 횟수 속도 제한 (Rate Limiting)
       ├── 4. Calldata 역어셈블 및 단일 건 한도 검증 (maxPerTx)
       └── 5. 24시간 롤링 윈도우 누적 지출 한도 검증 (maxDailyLimit)
       │
       ▼ (모든 정책 통과 시)
[ 온체인 트랜잭션 서명 & 실행 엔진 (Viem / Safe Session Key) ]
```

---

## 📂 프로젝트 구조

```text
onchain-finance-agent/
├── security-gate-server/         # 결정론적 가드레일 검증 & 실행 API 서버
│   ├── config/
│   │   ├── policy.schema.json    # JSON 스키마 명세
│   │   └── policy.config.json    # 활성 정책 (한도, 화이트리스트, 쿨다운)
│   └── src/
│       ├── securityGateService.ts # Safe Protocol Kit & 결정론적 가드레일 통합 서비스
│       ├── gate.ts               # SecurityGate 핵심 엔진 (Viem 디코딩, 슬라이딩 윈도우)
│       ├── executor.ts           # 시뮬레이션 및 트랜잭션 서명기
│       ├── server.ts             # Express REST API (POST /v1/tx/validate-and-execute)
│       └── types.ts
│
├── eliza-agent-bridge/           # 에이전트 플러그인 & 데모 시뮬레이터
│   ├── characters/
│   │   └── wallstreet.character.json # 에이전트 캐릭터 설정
│   └── src/
│       ├── actions/proposeTx.ts  # LLM 트랜잭션 가로채기 & Gate 중계 액션
│       ├── demo-runner.ts        # 5대 보안 시나리오 E2E 시뮬레이션
│       └── index.ts              # @elizaos/plugin-security-gate export
│
├── tests/
│   └── security-gate.test.ts     # 7가지 보안 가드레일 유닛 테스트
├── package.json
└── tsconfig.json
```

---

## 🚀 빠른 시작 (Quick Start)

### 1. 의존성 설치
```bash
npm install
```

### 2. 가드레일 및 DeHedge 단위 테스트 실행 (Test Suite)
모든 정책(체인, 화이트리스트, 셀렉터, 쿨다운, 단일 한도, 24시간 누적 한도, ERC-4626 HWM 정산, x402 오라클 결제, 퀀트 엔진) 11종을 자동 검증합니다.
```bash
npm test
```

### 3. Universal Escrow Hub 인터롭 테스트 (Escrow-Protected Trade)
EVM(Base, Polygon) 멀티체인 에스크로 예치(`depositEscrow`), 안전 환불(`refundEscrow`), 미인가 셀렉터 차단 5종을 검증합니다:
```bash
npm run test:escrow
```

### 4. 가혹 레드팀 모의 해킹 침투 테스트 (Adversarial Stress Test)
살라미 쪼개기 공격, Calldata 스머글링, x402 위조 영수증, 20-쓰레드 동시성 레이스 컨디션, 손실 왜곡 공격 5종을 검증합니다:
```bash
npm run test:redteam
```

### 5. 탈중앙화 자율 헤지펀드(DeHedge) E2E 라이브 엔진 시뮬레이션
LP 자본 수탁부터 x402 오라클 결제, Universal Escrow Hub 조건부 OTC 거래, 2 & 20 수수료 정산, 프롬프트 인젝션 방어까지 단일 명령으로 실행합니다:
```bash
npm run start:fund
```

### 4. Security-Gate 독립 서버 실행
```bash
npm run start:gate
```
- 서버 엔드포인트: `http://localhost:3000`
- 헬스체크: `GET http://localhost:3000/health`
- x402 오라클 시장 데이터: `GET http://localhost:3000/v1/oracle/market-intelligence`
- ERC-4626 Vault 상태: `GET http://localhost:3000/v1/vault/status`
- 트랜잭션 검증 및 실행: `POST http://localhost:3000/v1/tx/validate-and-execute`

---

## 🛡️ 적용된 5대 핵심 가드레일

1. **지출 한도 및 주기 통제 (Velocity & Spend Limits)**
   - 단일 건 한도 (`maxPerTx`): 100 USDC 이하로 강제.
   - 24시간 슬라이딩 윈도우 한도 (`maxDailyLimit`): 일일 누적 1,000 USDC 초과 시 즉시 차단.
2. **컨트랙트 및 수신처 화이트리스트 (Strict Allowlisting)**
   - Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), Uniswap Router 등 사전 검증된 컨트랙트만 통과.
3. **함수 셀렉터(Selector) 통제**
   - 4-byte 시그니처(`0xa9059cbb`, `0x095ea7b3`) 외 미인가 함수 호출 원천 차단.
4. **쿨다운(Cooldown) 제약**
   - 연속 호출 최소 간격 강제(기본 5초)로 플래시론/고빈도 어뷰징 방지.
5. **개인키 격리 (Zero Key Exposure)**
   - 에이전트 두뇌 모델 환경에는 개인키가 전혀 존재하지 않으며 오직 `PROPOSE_TRANSACTION`만 가능.
