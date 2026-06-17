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

export const MOCK_PYTH_ADDRESS =
  (process.env.MOCK_PYTH_ADDRESS as `0x${string}`) ?? "0x0000000000000000000000000000000000000000";

export const MOCK_USDC_ADDRESS =
  (process.env.MOCK_USDC_ADDRESS as `0x${string}`) ?? "0x0000000000000000000000000000000000000000";

export const PYTH_BTC_USD_FEED =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" as `0x${string}`;

const RPC_URL = process.env.GOAT_RPC_URL ?? "https://rpc.testnet3.goat.network";

function loadAccount() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  return privateKeyToAccount(pk as `0x${string}`);
}

export function buildConnections() {
  const account = loadAccount();
  const publicClient = createPublicClient({ chain: goatTestnet, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: goatTestnet, transport: http(RPC_URL) });
  return { account, publicClient, walletClient, abi: RaptorCoreAbi };
}

export type Connections = ReturnType<typeof buildConnections>;
