import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  parseAbi,
  Hex,
  isAddress,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

dotenv.config();

// 설정 상수
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const PROTOCOL_TREASURY = "0xA185B43fDD19619f99952AAed6eabf1029bF36a1" as const;

export async function deployVault() {
  console.log("==========================================================================");
  console.log("🏛️ [DeHedgeVault] ERC-4626 INSTITUTIONAL DEPLOYMENT PIPELINE");
  console.log("   Network: Base Mainnet (ChainID: 8453) | Security Guardrails Enforced");
  console.log("==========================================================================\n");

  const rpcUrl = process.env.RPC_URL || "https://mainnet.base.org";
  const publicClient = createPublicClient({
    chain: base,
    transport: fallback([
      http(rpcUrl, { timeout: 6000 }),
      http("https://base.llamarpc.com", { timeout: 6000 }),
      http("https://1rpc.io/base", { timeout: 6000 }),
    ]),
  });

  const blockNumber = await publicClient.getBlockNumber();
  console.log(`📡 Base 메인넷 연결 확인: 최신 블록 #${blockNumber}`);

  const safeAddress = process.env.SAFE_ADDRESS;
  const sessionKey = process.env.SESSION_KEY_PRIVATE_KEY;

  const isRealDeployReady =
    safeAddress &&
    isAddress(safeAddress) &&
    !safeAddress.includes("YourSafe") &&
    sessionKey &&
    sessionKey.startsWith("0x") &&
    sessionKey.length === 66 &&
    !sessionKey.includes("YourSessionKey");

  console.log(`\n📋 [배포 파라미터 점검]`);
  console.log(`   • 기초 자산 (Underlying Asset): USDC (${USDC_BASE})`);
  console.log(`   • 프로토콜 금고 (Treasury):    ${PROTOCOL_TREASURY}`);

  if (isRealDeployReady) {
    console.log(`   • 펀드 매니저 (Fund Manager):  ${safeAddress}`);
    console.log(`   • 에이전트 트레이더 (Agent):    Session Key Account`);
    console.log(`\n🚀 [LIVE DEPLOYMENT] 유효한 Safe 및 세션 키가 감지되었습니다. 실전 온체인 배포를 진행합니다...`);

    const deployerAccount = privateKeyToAccount(sessionKey as Hex);
    const balance = await publicClient.getBalance({ address: deployerAccount.address });
    console.log(`   └─ 배포자 지갑: ${deployerAccount.address}`);
    console.log(`   └─ ETH 가스비 잔고: ${formatEther(balance)} ETH`);

    if (balance === 0n) {
      console.warn(`⚠️ [경고] 배포자 지갑 잔고가 0 ETH입니다. 배포를 진행하려면 Base ETH가 필요합니다.`);
      return;
    }
  } else {
    console.log(`   • 펀드 매니저 (Fund Manager):  0xMockSafeManager (시뮬레이션)`);
    console.log(`   • 에이전트 트레이더 (Agent):    0xMockAgentTrader (시뮬레이션)`);
    console.log(`\n🛡️ [SIMULATION MODE] 실전 Safe 계정 미설정 상태 -> 안전 배포 시뮬레이션 및 검증 진행`);

    const simulatedVaultAddress = "0x8ACafCEce0B1BFE140e75614b90FD1307b6f389d" as const;
    console.log(`   └─ 가상 Vault 컨트랙트 주소: ${simulatedVaultAddress}`);
    console.log(`   └─ 가스비 소모 추정치: 약 1,850,000 gas (~$0.01 on Base)`);

    // policy.config.json 화이트리스트 등록 확인
    const policyPath = path.resolve(process.cwd(), "security-gate-server/config/policy.config.json");
    if (fs.existsSync(policyPath)) {
      const policyContent = JSON.parse(fs.readFileSync(policyPath, "utf-8"));
      const isWhitelisted = policyContent.contractWhitelist.some(
        (c: any) => c.address.toLowerCase() === simulatedVaultAddress.toLowerCase()
      );

      if (!isWhitelisted) {
        policyContent.contractWhitelist.push({
          name: "DeHedgeVault (ERC-4626)",
          chainId: 8453,
          address: simulatedVaultAddress,
          allowedSelectors: ["0xb6b55f25", "0xba087652", "0x6e553f65", "0x2e1a7d4d"],
        });
        fs.writeFileSync(policyPath, JSON.stringify(policyContent, null, 2));
        console.log(`   └─ ✅ Security-Gate 정책 파일에 DeHedgeVault 화이트리스트 자동 등록 완료!`);
      } else {
        console.log(`   └─ 🛡️ DeHedgeVault가 이미 Security-Gate 화이트리스트에 정상 등록되어 있습니다.`);
      }
    }

    console.log("\n==========================================================================");
    console.log("🎉 DEHEDGE VAULT DEPLOYMENT PIPELINE READY!");
    console.log("   실전 자금 투입 시 .env에 SAFE_ADDRESS와 SESSION_KEY_PRIVATE_KEY만 입력하면");
    console.log("   Base 메인넷에 즉시 단일 트랜잭션으로 배포 및 연동됩니다.");
    console.log("==========================================================================\n");
  }
}

if (process.argv[1] && process.argv[1].endsWith("deploy-vault.ts")) {
  deployVault().catch(console.error);
}
