import { buildConnections, RAPTOR_CORE_ADDRESS, MOCK_USDC_ADDRESS } from "./common/connections.js";
import { send } from "./common/tx.js";
import { findActiveOpenMarket } from "./common/markets.js";
import { readOracleSnapshot } from "./common/oracle.js";
import { ensureRegistered, getBalance } from "./common/registry.js";
import { ensureErc8004Registered } from "./erc8004.js";

const TICK_MS          = 2_500;
const HEDGE_SIZE       = BigInt(process.env.AGENTS_RISK_LP_HEDGE_SIZE            ?? "75000");
const HEDGES_PER_MKT   = Number(process.env.AGENTS_RISK_LP_HEDGES_PER_MARKET     ?? 2);
const CANCEL_NEAR_SECS = Number(process.env.AGENTS_RISK_LP_CANCEL_NEAR_CLOSE_SECS ?? 30);
const TARGET_BAL       = 1_000_000n;

const USDC_ABI = [{ name: "approve", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }];

const conns = buildConnections("risk_lp");

interface Memo { hedgesPlaced: number; cancelled: boolean; }
const memos = new Map<number, Memo>();

async function ensureDeposited() {
  const bal = await getBalance(conns);
  if (bal < TARGET_BAL) {
    const needed = TARGET_BAL - bal;
    const h = await conns.walletClient.writeContract({
      address: MOCK_USDC_ADDRESS, abi: USDC_ABI, functionName: "approve",
      args: [RAPTOR_CORE_ADDRESS, needed],
    });
    await conns.publicClient.waitForTransactionReceipt({ hash: h });
    await send(conns, "deposit", [needed]);
    console.log(`[risk_lp] deposited ${needed}`);
  }
}

async function tick() {
  const market = await findActiveOpenMarket(conns);
  if (!market) return;

  const memo = memos.get(market.id) ?? { hedgesPlaced: 0, cancelled: false };
  memos.set(market.id, memo);

  const secsToClose = market.closeTs - Math.floor(Date.now() / 1000);
  const snap  = await readOracleSnapshot();
  const stale = snap ? snap.ageSecs > 30 : false;

  if (!memo.cancelled && (stale || secsToClose <= CANCEL_NEAR_SECS)) {
    try {
      const h = await send(conns, "cancelBet", [market.id]);
      console.log(`[risk_lp] cancelBet market=${market.id} reason=${stale ? "stale" : "near-close"} tx=${h}`);
    } catch { /* no position ok */ }
    memo.cancelled = true;
    return;
  }

  if (memo.hedgesPlaced >= HEDGES_PER_MKT || memo.cancelled) return;

  const yes = market.yesReserve;
  const no  = market.noReserve;
  if (yes === no) return;
  const side = yes > no ? 0 : 1;

  try {
    const h = await send(conns, "placeBet", [market.id, side, HEDGE_SIZE]);
    console.log(`[risk_lp] hedge market=${market.id} side=${side} amount=${HEDGE_SIZE} tx=${h}`);
    memo.hedgesPlaced++;
  } catch (e: any) {
    memo.hedgesPlaced = HEDGES_PER_MKT;
    console.warn("[risk_lp] hedge failed:", e.message?.slice(0, 60));
  }
}

async function main() {
  await ensureRegistered(conns);
  await ensureErc8004Registered(conns, "risk_lp");
  await ensureDeposited();
  console.log("[risk_lp] running as", conns.account.address);
  while (true) {
    try { await tick(); } catch (e: any) { console.error("[risk_lp] tick error:", e.message); }
    await new Promise(r => setTimeout(r, TICK_MS));
  }
}

main();
