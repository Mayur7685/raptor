import { buildConnections } from "./common/connections.js";
import { send } from "./common/tx.js";
import { findActiveOpenMarket, findHaltedMarket } from "./common/markets.js";
import { readOracleSnapshot } from "./common/oracle.js";
import { ensureRegistered } from "./common/registry.js";
import { ensureErc8004Registered } from "./erc8004.js";

const TICK_MS          = 1_500;
const STALE_THRESHOLD  = 30;
const FORCE_HALT_EVERY = Number(process.env.AGENTS_OPS_FORCE_HALT_EVERY ?? 4);
const FORCE_HALT_SECS  = Number(process.env.AGENTS_OPS_FORCE_HALT_SECS  ?? 20);

const conns = buildConnections("market_ops");
const seenMarkets = new Set<number>();
let forceHaltActive: { marketId: number; resumeAtMs: number } | null = null;

async function tick() {
  const open   = await findActiveOpenMarket(conns);
  const halted = await findHaltedMarket(conns);

  // Demo force-halt on every Nth market
  if (FORCE_HALT_EVERY > 0 && open && !seenMarkets.has(open.id)) {
    seenMarkets.add(open.id);
    if (open.id % FORCE_HALT_EVERY === 0) {
      forceHaltActive = { marketId: open.id, resumeAtMs: Date.now() + FORCE_HALT_SECS * 1000 };
      try {
        const h = await send(conns, "haltMarket", [open.id]);
        console.log(`[market_ops] force-halt id=${open.id} tx=${h}`);
      } catch (e: any) { console.warn("[market_ops] force-halt failed:", e.message?.slice(0, 80)); }
      return;
    }
  }

  if (forceHaltActive && Date.now() >= forceHaltActive.resumeAtMs) {
    if (halted && halted.id === forceHaltActive.marketId) {
      try {
        const h = await send(conns, "resumeMarket", [halted.id]);
        console.log(`[market_ops] resume force-halt id=${halted.id} tx=${h}`);
      } catch (e: any) { console.warn("[market_ops] resume failed:", e.message?.slice(0, 80)); }
    }
    forceHaltActive = null;
    return;
  }

  const snap  = await readOracleSnapshot();
  const stale = snap ? snap.ageSecs > STALE_THRESHOLD : false;
  const live  = open ?? halted;
  if (!live) return;
  console.log(`[market_ops] market=${live.id} status=${live.status} oracleAge=${snap?.ageSecs ?? "?"}s stale=${stale}`);

  if (open && stale) {
    try { const h = await send(conns, "haltMarket", [open.id]); console.log(`[market_ops] halt stale id=${open.id} tx=${h}`); }
    catch (e: any) { console.warn("[market_ops] halt failed:", e.message?.slice(0, 80)); }
  } else if (halted && !stale && !forceHaltActive) {
    try { const h = await send(conns, "resumeMarket", [halted.id]); console.log(`[market_ops] resume id=${halted.id} tx=${h}`); }
    catch (e: any) { console.warn("[market_ops] resume failed:", e.message?.slice(0, 80)); }
  }
}

async function main() {
  // market_ops uses MARKET_OPS_PRIVATE_KEY — a separate wallet from admin.
  // Admin must have called grantOperator(<this_address>) on RaptorCore first.
  // haltMarket/resumeMarket are now onlyOperator so this wallet is accepted.
  await new Promise(r => setTimeout(r, 3_000));
  await ensureRegistered(conns);
  await ensureErc8004Registered(conns, "market_ops");
  console.log("[market_ops] running as", conns.account.address);
  while (true) {
    try { await tick(); } catch (e: any) { console.error("[market_ops] tick error:", e.message); }
    await new Promise(r => setTimeout(r, TICK_MS));
  }
}

main();
