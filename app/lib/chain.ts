import { createPublicClient, defineChain, http } from "viem";
import RaptorCoreAbi from "./abi/RaptorCore.json";

export const goatTestnet = defineChain({
  id: 48816,
  name: "GOAT Network Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.GOAT_RPC_URL ?? "https://rpc.testnet3.goat.network"] } },
  blockExplorers: { default: { name: "GOAT Explorer", url: "https://explorer.testnet3.goat.network" } },
  testnet: true,
});

export const RAPTOR_ADDRESS =
  (process.env.NEXT_PUBLIC_RAPTOR_ADDRESS as `0x${string}`) ?? "0x0000000000000000000000000000000000000000";

export const EXPLORER_TX   = (hash: string) => `https://explorer.testnet3.goat.network/tx/${hash}`;
export const EXPLORER_ADDR = (addr: string) => `https://explorer.testnet3.goat.network/address/${addr}`;

export const publicClient = createPublicClient({
  chain: goatTestnet,
  transport: http(process.env.GOAT_RPC_URL ?? "https://rpc.testnet3.goat.network"),
});

export const abi = RaptorCoreAbi as any[];

export const MarketStatus = { Pending: 0, Open: 1, Halted: 2, Closed: 3 } as const;
export const StatusLabel  = ["Pending", "Open", "Halted", "Closed"] as const;
export const WinnerLabel  = ["—", "YES", "NO"] as const;

export interface Market {
  id: number; openTs: number; closeTs: number; strike: bigint;
  status: number; oracleFeed: string; yesReserve: bigint; noReserve: bigint; winner: number;
}

export async function fetchMarket(id: number): Promise<Market> {
  const m = await publicClient.readContract({ address: RAPTOR_ADDRESS, abi, functionName: "getMarket", args: [id] }) as any;
  return { id, openTs: Number(m.openTs), closeTs: Number(m.closeTs), strike: BigInt(m.strike),
    status: Number(m.status), oracleFeed: m.oracleFeed,
    yesReserve: BigInt(m.yesReserve), noReserve: BigInt(m.noReserve), winner: Number(m.winner) };
}

export async function fetchAllMarkets(): Promise<Market[]> {
  const count = Number(await publicClient.readContract({ address: RAPTOR_ADDRESS, abi, functionName: "marketCount" }) as bigint);
  if (count === 0) return [];
  return Promise.all(Array.from({ length: count }, (_, i) => fetchMarket(i)));
}
