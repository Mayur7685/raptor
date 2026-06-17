import { Connections } from "./common/connections.js";

// ERC-8004 Identity Registry on GOAT Testnet
const IDENTITY_REGISTRY = "0x556089008Fc0a60cD09390Eca93477ca254A5522" as `0x${string}`;

const ABI = [
  { name: "register", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }], outputs: [{ name: "agentId", type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export async function ensureErc8004Registered(conns: Connections, role: string): Promise<void> {
  try {
    const bal = await conns.publicClient.readContract({
      address: IDENTITY_REGISTRY, abi: ABI, functionName: "balanceOf", args: [conns.account.address],
    }) as bigint;
    if (bal > 0n) {
      console.log(`[${role}] ERC-8004 already registered`);
      return;
    }
    const meta = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: `Raptor ${role}`,
      description: `Policy-governed trading agent on GOAT Network — role: ${role}`,
      attributes: [{ trait_type: "role", value: role }, { trait_type: "project", value: "raptor-goat" }],
    };
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString("base64")}`;
    const hash = await conns.walletClient.writeContract({
      address: IDENTITY_REGISTRY, abi: ABI, functionName: "register", args: [uri],
    });
    await conns.publicClient.waitForTransactionReceipt({ hash });
    console.log(`[${role}] ERC-8004 registered tx=${hash}`);
  } catch (e: any) {
    console.warn(`[${role}] ERC-8004 registration skipped:`, e.message?.slice(0, 80));
  }
}
