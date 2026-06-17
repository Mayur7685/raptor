import { createPublicClient, http, decodeEventLog, defineChain, type Log } from "viem";
import { getWriteSupabase } from "../supabase/server";
import RaptorCoreAbi from "../abi/RaptorCore.json";

const ABI = RaptorCoreAbi as any[];
const RAPTOR_ADDRESS = (process.env.NEXT_PUBLIC_RAPTOR_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
const RPC_URL = process.env.GOAT_RPC_URL ?? "https://rpc.testnet3.goat.network";
const POLL_MS = Number(process.env.RAPTOR_INDEXER_POLL_MS ?? 6_000);
const CHAIN   = "goat-testnet";
const WINNER_MAP = ["none", "yes", "no"];

// Lowercase address → role mapping
const AGENT_ROLES: Record<string, string> = {
  "0xf29ab6a879ff65ba032f31ac401de187a92c4788": "market_ops",
  "0xed6bc25b8b9f2cb064e8603b149a5b370d5b8872": "trader",
  "0xbeb9df3e69e54376dcbaded74764168fab498fdd": "risk_lp",
};

const goatTestnet = defineChain({
  id: 48816, name: "GOAT Network Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
});
const client = createPublicClient({ chain: goatTestnet, transport: http(RPC_URL) });

async function processLog(sb: ReturnType<typeof getWriteSupabase>, log: Log) {
  let decoded: { eventName: string; args: Record<string, unknown> };
  try { decoded = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics }) as any; }
  catch { return; }
  const { eventName, args } = decoded;
  const block = await client.getBlock({ blockNumber: log.blockNumber! });
  const blockTime = new Date(Number(block.timestamp) * 1000).toISOString();
  const tx = log.transactionHash!;
  const li = Number(log.logIndex ?? 0);
  const bn = Number(log.blockNumber ?? 0);

  if (eventName === "MarketCreated")
    await sb.from("markets").upsert({ market_id: Number(args.id), open_ts: Number(args.openTs), close_ts: Number(args.closeTs), oracle_feed: args.oracleFeed as string, status: "pending", created_tx: tx, updated_at: blockTime }, { onConflict: "market_id" });
  if (eventName === "MarketOpened")
    await sb.from("markets").upsert({ market_id: Number(args.id), status: "open", strike_price: Number(args.strike), opened_tx: tx, updated_at: blockTime }, { onConflict: "market_id" });
  if (eventName === "MarketClosed")
    await sb.from("markets").upsert({ market_id: Number(args.id), status: "closed", close_price: Number(args.finalPrice), winner: WINNER_MAP[Number(args.winner)] ?? null, closed_tx: tx, updated_at: blockTime }, { onConflict: "market_id" });
  if (eventName === "MarketHalted")
    await sb.from("markets").update({ status: "halted", updated_at: blockTime }).eq("market_id", Number(args.id));
  if (eventName === "MarketResumed")
    await sb.from("markets").update({ status: "open", updated_at: blockTime }).eq("market_id", Number(args.id));
  if (eventName === "AgentRegistered")
    await sb.from("agents").upsert({ owner_address: args.agent as string, role: AGENT_ROLES[(args.agent as string).toLowerCase()] ?? null, registered_at: blockTime, updated_at: blockTime }, { onConflict: "owner_address" });
  if (eventName === "Deposited")
    await sb.from("agents").upsert({ owner_address: args.agent as string, current_balance: Number(args.amount), updated_at: blockTime }, { onConflict: "owner_address" });
  if (eventName === "BetPlaced") {
    await sb.from("events").upsert({ tx_hash: tx, log_index: li, block_number: bn, block_time: blockTime, market_id: Number(args.marketId), kind: "BetPlaced", actor: args.agent as string, args: { side: Number(args.side) === 0 ? "yes" : "no", amount: Number(args.amount), shares: Number(args.shares) }, success: true, inserted_at: blockTime }, { onConflict: "tx_hash,log_index" });
    await sb.from("agents").update({ last_event_at: blockTime, updated_at: blockTime }).eq("owner_address", args.agent as string);
  }
  if (eventName === "BetCancelled") {
    await sb.from("events").upsert({ tx_hash: tx, log_index: li, block_number: bn, block_time: blockTime, market_id: Number(args.marketId), kind: "BetCancelled", actor: args.agent as string, args: {}, success: true, inserted_at: blockTime }, { onConflict: "tx_hash,log_index" });
    await sb.from("agents").update({ last_event_at: blockTime, updated_at: blockTime }).eq("owner_address", args.agent as string);
  }
  if (eventName === "PositionSettled") {
    await sb.from("events").upsert({ tx_hash: tx, log_index: li, block_number: bn, block_time: blockTime, market_id: Number(args.marketId), kind: "PositionSettled", actor: args.agent as string, args: { payout: Number(args.payout) }, success: true, inserted_at: blockTime }, { onConflict: "tx_hash,log_index" });
    await sb.from("agents").update({ last_event_at: blockTime, updated_at: blockTime }).eq("owner_address", args.agent as string);
  }
  if (["MarketOpened","MarketClosed","MarketHalted","MarketResumed","MarketCreated"].includes(eventName))
    await sb.from("events").upsert({ tx_hash: tx, log_index: li, block_number: bn, block_time: blockTime, market_id: Number((args.id ?? args.marketId) ?? 0), kind: eventName, actor: null, args: args as any, success: true, inserted_at: blockTime }, { onConflict: "tx_hash,log_index" });
}

export function startIndexer() {
  console.log("[indexer] starting — RaptorCore:", RAPTOR_ADDRESS);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const sb = getWriteSupabase();
      const { data } = await sb.from("cursors").select("last_block").eq("chain", CHAIN).maybeSingle();
      const lastBlock = BigInt((data as any)?.last_block ?? 0);
      const latest = await client.getBlockNumber();
      if (latest <= lastBlock) return;
      let from = lastBlock + 1n;
      while (from <= latest) {
        const to = from + 999n < latest ? from + 999n : latest;
        const logs = await client.getLogs({ address: RAPTOR_ADDRESS, fromBlock: from, toBlock: to });
        for (const log of logs) {
          try { await processLog(sb, log); } catch (e: any) { console.warn("[indexer] log failed:", e.message?.slice(0, 80)); }
        }
        from = to + 1n;
      }
      await sb.from("cursors").update({ last_block: Number(latest), updated_at: new Date().toISOString() }).eq("chain", CHAIN);
    } catch (e: any) { console.error("[indexer] tick:", e.message); }
    finally { running = false; }
  };
  void tick();
  setInterval(() => void tick(), POLL_MS);
}
