import { PYTH_BTC_USD_FEED } from "./connections.js";

export interface OracleSnapshot {
  price: number; rawPrice: bigint; expo: number; ageSecs: number;
}

export async function readOracleSnapshot(): Promise<OracleSnapshot | null> {
  try {
    const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_BTC_USD_FEED}`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const item = data.parsed?.[0];
    if (!item) return null;
    const rawPrice = BigInt(item.price.price);
    const expo = Number(item.price.expo);
    const ageSecs = Math.floor(Date.now() / 1000) - Number(item.price.publish_time);
    return { price: Number(rawPrice) * Math.pow(10, expo), rawPrice, expo, ageSecs };
  } catch { return null; }
}
