import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { arbitrum, base, mainnet, polygon } from "viem/chains";

export interface SolvencyCheckResult {
  address: string;
  chainId: number;
  requiredAmountUSDC: number;
  usdcBalance: number;
  nativeGasBalance: number;
  hasSufficientUsdc: boolean;
  hasGasForSettlement: boolean;
  source: "LIVE_RPC" | "RPC_UNAVAILABLE";
  error?: string;
}

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

const EVM_CHAIN_CONFIG: Record<
  number,
  { chain: any; defaultRpc: string; usdcAddress: `0x${string}`; minGas: number }
> = {
  8453: {
    chain: base,
    defaultRpc: "https://mainnet.base.org",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    minGas: 0.0001,
  },
  137: {
    chain: polygon,
    defaultRpc: "https://polygon-bor-rpc.publicnode.com",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    minGas: 0.01,
  },
  42161: {
    chain: arbitrum,
    defaultRpc: "https://arb1.arbitrum.io/rpc",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    minGas: 0.0001,
  },
  1: {
    chain: mainnet,
    defaultRpc: "https://ethereum-rpc.publicnode.com",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    minGas: 0.001,
  },
};

const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function checkSolanaSolvency(
  address: string,
  requiredAmountUSDC: number
): Promise<SolvencyCheckResult> {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  try {
    const [balResp, tokenResp] = await Promise.all([
      fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
        signal: AbortSignal.timeout(6000),
      }),
      fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "getTokenAccountsByOwner",
          params: [address, { mint: SOLANA_USDC_MINT }, { encoding: "jsonParsed" }],
        }),
        signal: AbortSignal.timeout(6000),
      }),
    ]);

    const balJson: any = await balResp.json();
    const tokenJson: any = await tokenResp.json();

    const lamports = Number(balJson?.result?.value ?? 0);
    const solBalance = Number((lamports / 1e9).toFixed(6));

    const accounts: any[] = tokenJson?.result?.value || [];
    let usdcBalance = 0;
    for (const acc of accounts) {
      const uiAmount = acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof uiAmount === "number") {
        usdcBalance += uiAmount;
      }
    }
    usdcBalance = Number(usdcBalance.toFixed(6));

    return {
      address,
      chainId: 501,
      requiredAmountUSDC,
      usdcBalance,
      nativeGasBalance: solBalance,
      hasSufficientUsdc: usdcBalance >= requiredAmountUSDC,
      hasGasForSettlement: solBalance >= 0.0005,
      source: "LIVE_RPC",
    };
  } catch (err: any) {
    return {
      address,
      chainId: 501,
      requiredAmountUSDC,
      usdcBalance: 0,
      nativeGasBalance: 0,
      hasSufficientUsdc: false,
      hasGasForSettlement: false,
      source: "RPC_UNAVAILABLE",
      error: err?.message || "Solana RPC timeout",
    };
  }
}

/**
 * Checks real-time on-chain USDC balance & native gas balance for EVM or Solana wallets.
 */
export async function checkWalletSolvency(
  address: string,
  chainId: number,
  requiredAmountUSDC: number
): Promise<SolvencyCheckResult> {
  if (chainId === 501) {
    return checkSolanaSolvency(address, requiredAmountUSDC);
  }

  const cfg = EVM_CHAIN_CONFIG[chainId];
  if (!cfg) {
    return {
      address,
      chainId,
      requiredAmountUSDC,
      usdcBalance: 0,
      nativeGasBalance: 0,
      hasSufficientUsdc: false,
      hasGasForSettlement: false,
      source: "RPC_UNAVAILABLE",
      error: `Unsupported chainId: ${chainId}`,
    };
  }

  const rpcUrl = process.env[`RPC_URL_${chainId}`] || process.env.RPC_URL || cfg.defaultRpc;
  try {
    const client = createPublicClient({
      chain: cfg.chain,
      transport: http(rpcUrl, { timeout: 6000 }),
    });

    const [rawNative, rawUsdc] = await Promise.all([
      client.getBalance({ address: address as `0x${string}` }),
      client.readContract({
        address: cfg.usdcAddress,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }),
    ]);

    const nativeGasBalance = Number(Number(formatUnits(rawNative, 18)).toFixed(6));
    const usdcBalance = Number(Number(formatUnits(rawUsdc as bigint, 6)).toFixed(6));

    return {
      address,
      chainId,
      requiredAmountUSDC,
      usdcBalance,
      nativeGasBalance,
      hasSufficientUsdc: usdcBalance >= requiredAmountUSDC,
      hasGasForSettlement: nativeGasBalance >= cfg.minGas,
      source: "LIVE_RPC",
    };
  } catch (err: any) {
    return {
      address,
      chainId,
      requiredAmountUSDC,
      usdcBalance: 0,
      nativeGasBalance: 0,
      hasSufficientUsdc: false,
      hasGasForSettlement: false,
      source: "RPC_UNAVAILABLE",
      error: err?.message || "EVM RPC error",
    };
  }
}
