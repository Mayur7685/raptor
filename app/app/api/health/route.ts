import { NextResponse } from "next/server";

const RPC = process.env.GOAT_RPC_URL ?? "https://rpc.testnet3.goat.network";

export async function GET() {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      next: { revalidate: 0 },
    });
    const json = await res.json() as { result?: string };
    const blockNumber = json.result ? Number(BigInt(json.result)) : null;
    return NextResponse.json({ ok: true, blockNumber });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
  }
}
