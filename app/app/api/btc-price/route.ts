import { NextResponse } from "next/server";

const FEED = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

export async function GET() {
  try {
    const res = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${FEED}`,
      { cache: "no-store" }
    );
    const data = await res.json() as any;
    const item = data.parsed?.[0];
    if (!item) return NextResponse.json({ price: null, publishTimeSec: null });
    const rawPrice = Number(item.price.price);
    const expo = Number(item.price.expo);
    const price = rawPrice * Math.pow(10, expo);
    const publishTimeSec = Number(item.price.publish_time);
    return NextResponse.json({ price, publishTimeSec });
  } catch {
    return NextResponse.json({ price: null, publishTimeSec: null });
  }
}
