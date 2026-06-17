import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const RaptorCoreAbi: any[] = require("../abi/RaptorCore.json");

export const goatTestnet = defineChain({
  id: 48816,
  name: "GOAT Network Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.GOAT_RPC_URL ?? "https://rpc.testnet3.goat.network"] } },
  blockExplorers: { default: { name: "GOAT Explorer", url: "https://explorer.testnet3.goat.network" } },
  testnet: true,
});

export const RAPTOR_CORE_ADDRESS =
  (process.env.RAPTOR_CORE_ADDRESS as `0x${string}`) ?? "0x0000000000000000000000000000000000000000";

export const MOCK_USDC_ADDRESS =
  (process.env.MOCK_USDC_ADDRESS as `0x${string}`) ?? "0x0000000000000000000000000000000000000000";

export const PYTH_BTC_USD_FEED =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" as `0x${string}`;

export type Role = "market_ops" | "trader" | "risk_lp";

const ROLE_KEY_ENV: Record<Role, string> = {
  market_ops: "MARKET_OPS_PRIVATE_KEY",
  trader:     "TRADER_PRIVATE_KEY",
  risk_lp:    "RISK_LP_PRIVATE_KEY",
};

export function buildConnections(role: Role) {
  // market_ops uses MARKET_OPS_PRIVATE_KEY (a separate wallet).
  // The admin must call grantOperator(<market_ops_address>) on RaptorCore first
  // so that haltMarket/resumeMarket (onlyOperator) accept the market_ops wallet.
  const pk = process.env[ROLE_KEY_ENV[role]] ?? process.env.PRIVATE_KEY;
  if (!pk) throw new Error(`No private key for role ${role}`);
  const account = privateKeyToAccount(pk as `0x${string}`);
  const rpc = process.env.GOAT_RPC_URL ?? "https://rpc.testnet3.goat.network";
  const publicClient = createPublicClient({ chain: goatTestnet, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain: goatTestnet, transport: http(rpc) });
  return { account, publicClient, walletClient, abi: RaptorCoreAbi };
}

export type Connections = ReturnType<typeof buildConnections>;
