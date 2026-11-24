export interface SanctionsCheckResult {
  address: string;
  chainId: number;
  ofacClean: boolean;
  mixerExposed: boolean;
  riskFlags: string[];
  checkedAtUtc: string;
}

// Canonical OFAC-sanctioned / Tornado Cash router & pool addresses (lowercase)
const DEFAULT_SANCTIONED_EVM = new Set<string>([
  "0x8589427373d6d84e98730d7795d8f6f8731fda16", // Tornado Cash: 0.1 ETH
  "0x722122df12d4e14e13ac3b6895a86e84145b6967", // Tornado Cash: Router
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b", // Tornado Cash: Proxy
  "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf", // Tornado Cash: 10 ETH
  "0xa160cdab225685da1d56aa342ad8841c3b53f291", // Tornado Cash: 100 ETH
  "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3", // Tornado Cash: 100 DAI
  "0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144", // Tornado Cash: 1000 DAI
]);

const DEFAULT_SANCTIONED_SOLANA = new Set<string>([
  "Tor1xzb2Zyy1cUxXmyJfR8aNXuW9HG8Aw2gzsWEBLR6",
]);

function loadExtraBlockedAddresses(): Set<string> {
  const raw = process.env.BLOCKED_ADDRESSES || "";
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(items.map((a) => (a.startsWith("0x") ? a.toLowerCase() : a)));
}

/**
 * Screens a counterparty wallet (EVM or Solana) against OFAC/sanctioned and mixer lists.
 */
export async function checkSanctionsAndMixer(
  address: string,
  chainId: number
): Promise<SanctionsCheckResult> {
  const normalized = address.startsWith("0x") ? address.toLowerCase() : address.trim();
  const extraBlocked = loadExtraBlockedAddresses();
  const riskFlags: string[] = [];

  const isEvmSanctioned = normalized.startsWith("0x") && DEFAULT_SANCTIONED_EVM.has(normalized);
  const isSolanaSanctioned = !normalized.startsWith("0x") && DEFAULT_SANCTIONED_SOLANA.has(normalized);
  const isCustomBlocked = extraBlocked.has(normalized);

  if (isEvmSanctioned || isSolanaSanctioned) {
    riskFlags.push("SANCTIONED_OR_MIXER_ADDRESS");
  }
  if (isCustomBlocked) {
    riskFlags.push("POLICY_BLOCKED_ADDRESS");
  }

  return {
    address: address.trim(),
    chainId,
    ofacClean: !isEvmSanctioned && !isSolanaSanctioned && !isCustomBlocked,
    mixerExposed: isEvmSanctioned || isSolanaSanctioned,
    riskFlags,
    checkedAtUtc: new Date().toISOString(),
  };
}
