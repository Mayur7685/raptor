/**
 * register-agents.ts
 * Run: cd agents && pnpm tsx scripts/register-agents.ts
 * Registers all three agent wallets in the ERC-8004 Identity Registry on GOAT Testnet.
 */
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { goatTestnet } from "../src/common/connections.js";

const IDENTITY_REGISTRY = "0x556089008Fc0a60cD09390Eca93477ca254A5522" as `0x${string}`;

const ABI = [
  { name: "register",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }], outputs: [{ name: "agentId", type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const AGENTS = [
  { role: "market_ops", pk: process.env.MARKET_OPS_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "" },
  { role: "trader",     pk: process.env.TRADER_PRIVATE_KEY     ?? process.env.PRIVATE_KEY ?? "" },
  { role: "risk_lp",   pk: process.env.RISK_LP_PRIVATE_KEY    ?? process.env.PRIVATE_KEY ?? "" },
];

const pub = createPublicClient({ chain: goatTestnet, transport: http() });

async function register(role: string, pk: string) {
  if (!pk) { console.warn(`[${role}] No private key — skipping`); return; }
  const account = privateKeyToAccount(pk as `0x${string}`);
  const wallet  = createWalletClient({ account, chain: goatTestnet, transport: http() });

  const bal = await pub.readContract({ address: IDENTITY_REGISTRY, abi: ABI, functionName: "balanceOf", args: [account.address] });
  if (bal > 0n) { console.log(`[${role}] already registered — ${account.address}`); return; }

  const meta = { name: `Raptor ${role}`, attributes: [{ trait_type: "role", value: role }, { trait_type: "project", value: "raptor-goat" }] };
  const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString("base64")}`;
  const hash = await wallet.writeContract({ address: IDENTITY_REGISTRY, abi: ABI, functionName: "register", args: [uri] });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`[${role}] ✅ registered ${account.address} tx=${hash}`);
}

async function main() {
  for (const a of AGENTS) await register(a.role, a.pk);
}
main().catch(e => { console.error(e.message); process.exit(1); });
