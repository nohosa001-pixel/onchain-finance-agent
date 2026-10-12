import { parseUnits, formatUnits } from "viem";

export interface VaultShareholder {
  address: string;
  shares: bigint;
  depositedUSDC: bigint;
}

export interface FundSnapshot {
  totalAUM: string; // USDC formatted
  totalShares: string; // $wALPHA formatted
  sharePriceNAV: string; // USDC per $wALPHA (Base 1.0)
  highWaterMarkNAV: string;
  agentTreasuryUSDC: string; // Agent Self-Sustaining operating capital
  managerFeeUSDC: string;
  totalRealizedYieldUSDC: string;
  totalTradesExecuted: number;
}

/**
 * ERC-4626 Tokenized Vault & Treasury Manager
 * 2 & 20 HWM (High-Water Mark) performance fee accounting and non-custodial vault model
 */
export class DeHedgeVaultManager {
  private totalAssetsUSDC: bigint = 0n; // 6 decimals
  private totalShares: bigint = 0n; // 18 decimals ($wALPHA)
  private highWaterMarkNAV: number = 1.0; // Starting NAV baseline
  private agentOperatingTreasury: bigint = parseUnits("5.0", 6); // 5 USDC initial seed for compute & x402
  private protocolManagerFeeBalance: bigint = 0n;
  private totalRealizedProfit: bigint = 0n;
  private tradeCount: number = 0;
  private shareholders: Map<string, VaultShareholder> = new Map();

  constructor(initialDepositUSDC?: number) {
    if (initialDepositUSDC && initialDepositUSDC > 0) {
      this.deposit("0xLP_Investor_Genesis", initialDepositUSDC);
    }
  }

  /**
   * LP Deposit (USDC -> $wALPHA Shares)
   */
  public deposit(investorAddress: string, amountUSDC: number): { sharesMinted: string; currentNAV: string } {
    const amountBig = parseUnits(amountUSDC.toString(), 6);
    const nav = this.getSharePriceNAV();

    let sharesToMint: bigint;
    if (this.totalShares === 0n) {
      sharesToMint = parseUnits(amountUSDC.toString(), 18);
    } else {
      sharesToMint = parseUnits((amountUSDC / nav).toFixed(6), 18);
    }

    this.totalAssetsUSDC += amountBig;
    this.totalShares += sharesToMint;

    const existing = this.shareholders.get(investorAddress) || {
      address: investorAddress,
      shares: 0n,
      depositedUSDC: 0n,
    };
    existing.shares += sharesToMint;
    existing.depositedUSDC += amountBig;
    this.shareholders.set(investorAddress, existing);

    return {
      sharesMinted: formatUnits(sharesToMint, 18),
      currentNAV: nav.toFixed(4),
    };
  }

  /**
   * Net Asset Value (NAV): Total Assets / Total Shares
   */
  public getSharePriceNAV(): number {
    if (this.totalShares === 0n || this.totalAssetsUSDC === 0n) {
      return 1.0;
    }
    const assetsFloat = parseFloat(formatUnits(this.totalAssetsUSDC, 6));
    const sharesFloat = parseFloat(formatUnits(this.totalShares, 18));
    return assetsFloat / sharesFloat;
  }

  /**
   * On-chain Trade Settlement & High-Water Mark 2 & 20 Performance Fee
   * - 80%: LP Compounded Yield
   * - 10%: Agent Autonomous Treasury (compute / x402 data feed)
   * - 10%: Fund Manager / Protocol Revenue
   */
  public recordTradeProfit(profitUSDC: number): {
    newNAV: string;
    agentTreasuryShare: string;
    lpCompoundedYield: string;
    isHighWaterMarkBroken: boolean;
  } {
    const profitBig = parseUnits(profitUSDC.toFixed(6), 6);
    this.tradeCount++;
    this.totalRealizedProfit += profitBig;

    let agentFee = 0n;
    let managerFee = 0n;
    let lpYield = profitBig;
    let brokeHWM = false;

    // 1. In case of Loss: 0 fee, no HWM advance, reflect loss only
    if (profitBig <= 0n) {
      this.totalAssetsUSDC += profitBig;
      return {
        newNAV: this.getSharePriceNAV().toFixed(6),
        agentTreasuryShare: "0",
        lpCompoundedYield: formatUnits(profitBig, 6),
        isHighWaterMarkBroken: false,
      };
    }

    // 2. In case of Profit:
    const prospectiveAssets = this.totalAssetsUSDC + profitBig;
    const prospectiveNAV = parseFloat(formatUnits(prospectiveAssets, 6)) / parseFloat(formatUnits(this.totalShares, 18));

    if (prospectiveNAV > this.highWaterMarkNAV) {
      brokeHWM = true;
      agentFee = (profitBig * 10n) / 100n; // 10%
      managerFee = (profitBig * 10n) / 100n; // 10%
      lpYield = profitBig - agentFee - managerFee; // 80%

      this.agentOperatingTreasury += agentFee;
      this.protocolManagerFeeBalance += managerFee;
      this.totalAssetsUSDC += lpYield;

      this.highWaterMarkNAV = this.getSharePriceNAV();
    } else {
      // Rebound phase under peak: 100% principal recovery, 0% performance fee
      this.totalAssetsUSDC += profitBig;
      lpYield = profitBig;
    }

    return {
      newNAV: this.getSharePriceNAV().toFixed(6),
      agentTreasuryShare: formatUnits(agentFee, 6),
      lpCompoundedYield: formatUnits(lpYield, 6),
      isHighWaterMarkBroken: brokeHWM,
    };
  }

  /**
   * Deduct expense for compute or x402 from agent operating treasury
   */
  public deductAgentExpense(amountUSDC: number, reason: string): boolean {
    const amountBig = parseUnits(amountUSDC.toFixed(6), 6);
    if (this.agentOperatingTreasury < amountBig) {
      return false;
    }
    this.agentOperatingTreasury -= amountBig;
    return true;
  }

  /**
   * Non-Custodial LP Withdrawal & Redemption
   * Only the investor who owns the shares can redeem them for USDC
   */
  public withdraw(investorAddress: string, sharesToRedeem: number): { payoutUSDC: string; remainingShares: string } {
    const investor = this.shareholders.get(investorAddress);
    if (!investor) {
      throw new Error("Unauthorized or non-existent shareholder: " + investorAddress);
    }
    const sharesBig = parseUnits(sharesToRedeem.toString(), 18);
    if (investor.shares < sharesBig) {
      throw new Error("Insufficient shares: requested " + sharesToRedeem + ", has " + formatUnits(investor.shares, 18));
    }
    const nav = this.getSharePriceNAV();
    const payoutUSDCAmount = sharesToRedeem * nav;
    const payoutBig = parseUnits(payoutUSDCAmount.toFixed(6), 6);

    investor.shares -= sharesBig;
    this.totalShares -= sharesBig;
    this.totalAssetsUSDC -= payoutBig;

    return {
      payoutUSDC: formatUnits(payoutBig, 6),
      remainingShares: formatUnits(investor.shares, 18),
    };
  }

  /**
   * Retrieve total fund snapshot
   */
  public getSnapshot(): FundSnapshot {
    return {
      totalAUM: formatUnits(this.totalAssetsUSDC, 6),
      totalShares: formatUnits(this.totalShares, 18),
      sharePriceNAV: this.getSharePriceNAV().toFixed(6),
      highWaterMarkNAV: this.highWaterMarkNAV.toFixed(6),
      agentTreasuryUSDC: formatUnits(this.agentOperatingTreasury, 6),
      managerFeeUSDC: formatUnits(this.protocolManagerFeeBalance, 6),
      totalRealizedYieldUSDC: formatUnits(this.totalRealizedProfit, 6),
      totalTradesExecuted: this.tradeCount,
    };
  }
}
