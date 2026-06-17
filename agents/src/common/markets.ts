import { Connections, RAPTOR_CORE_ADDRESS } from "./connections.js";

export const MarketStatus = { Pending: 0, Open: 1, Halted: 2, Closed: 3 } as const;

export interface MarketView {
  id: number; openTs: number; closeTs: number; strike: bigint;
  status: number; oracleFeed: `0x${string}`; yesReserve: bigint; noReserve: bigint; winner: number;
}

export async function getMarket(conns: Connections, id: number): Promise<MarketView | null> {
  try {
    const m = await conns.publicClient.readContract({
      address: RAPTOR_CORE_ADDRESS, abi: conns.abi, functionName: "getMarket", args: [id],
    }) as any;
    return { id, openTs: Number(m.openTs), closeTs: Number(m.closeTs), strike: BigInt(m.strike),
      status: Number(m.status), oracleFeed: m.oracleFeed,
      yesReserve: BigInt(m.yesReserve), noReserve: BigInt(m.noReserve), winner: Number(m.winner) };
  } catch { return null; }
}

export async function listMarkets(conns: Connections): Promise<MarketView[]> {
  const count = Number(await conns.publicClient.readContract({
    address: RAPTOR_CORE_ADDRESS, abi: conns.abi, functionName: "marketCount",
  }) as bigint);
  const results = await Promise.all(Array.from({ length: count }, (_, i) => getMarket(conns, i)));
  return results.filter(Boolean) as MarketView[];
}

export async function findActiveOpenMarket(conns: Connections): Promise<MarketView | null> {
  return (await listMarkets(conns)).find(m => m.status === MarketStatus.Open) ?? null;
}

export async function findHaltedMarket(conns: Connections): Promise<MarketView | null> {
  return (await listMarkets(conns)).find(m => m.status === MarketStatus.Halted) ?? null;
}
