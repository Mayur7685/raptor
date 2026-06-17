import { buildConnections, RAPTOR_CORE_ADDRESS, MOCK_USDC_ADDRESS } from "./common/connections.js";
import { send } from "./common/tx.js";
import { findActiveOpenMarket, MarketStatus } from "./common/markets.js";
import { readOracleSnapshot } from "./common/oracle.js";
import { ensureRegistered, getBalance } from "./common/registry.js";
import { defaultPolicy, WRONG_ROOT, ZERO_ROOT } from "./common/policy.js";
import { ensureErc8004Registered } from "./erc8004.js";

const TICK_MS       = 1_000;
const BASE_SIZE     = BigInt(process.env.AGENTS_TRADER_BASE_SIZE      ?? "200000");
const TARGET_BAL    = BigInt(process.env.AGENTS_TRADER_TARGET_BALANCE ?? "2000000");
const OVER_CAP_AT   = Number(process.env.AGENTS_TRADER_OVER_CAP_AT   ?? 10);
const WRONG_LIST_AT = Number(process.env.AGENTS_TRADER_WRONG_LIST_AT ?? 20);

const USDC_ABI = [{ name: "approve", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }];

const conns = buildConnections("trader");

interface Memo { honestPlaced: boolean; overCapAttempted: boolean; wrongAllowlistAttempted: boolean; }
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
    console.log(`[trader] deposited ${needed}`);
  }
}

async function placeBet(marketId: number, side: number, amount: bigint, expectFail?: string) {
  try {
    const h = await send(conns, "placeBet", [marketId, side, amount]);
    console.log(`[trader] placeBet market=${marketId} side=${side} amount=${amount} tx=${h}`);
  } catch (e: any) {
    if (expectFail) console.log(`[trader] placeBet blocked (expected ${expectFail}):`, e.message?.slice(0, 80));
    else console.warn(`[trader] placeBet failed:`, e.message?.slice(0, 80));
  }
}

async function tick() {
  const market = await findActiveOpenMarket(conns);
  if (!market || market.status !== MarketStatus.Open) return;

  const nowSec = Math.floor(Date.now() / 1000);
  const memo = memos.get(market.id) ?? { honestPlaced: false, overCapAttempted: false, wrongAllowlistAttempted: false };
  memos.set(market.id, memo);
  const elapsed = nowSec - market.openTs;

  if (!memo.honestPlaced) {
    const snap = await readOracleSnapshot();
    const side = snap && Number(snap.rawPrice) >= Number(market.strike) ? 0 : 1;
    await placeBet(market.id, side, BASE_SIZE);
    memo.honestPlaced = true;
  }

  if (!memo.overCapAttempted && elapsed >= OVER_CAP_AT) {
    memo.overCapAttempted = true;
    await placeBet(market.id, 0, defaultPolicy().maxStakePerWindow + 1n, "OverPolicyCap");
  }

  if (!memo.wrongAllowlistAttempted && elapsed >= WRONG_LIST_AT) {
    memo.wrongAllowlistAttempted = true;
    const pol = defaultPolicy();
    await send(conns, "updatePolicy", [{ ...pol, allowedMarketsRoot: WRONG_ROOT }]);
    await placeBet(market.id, 1, BASE_SIZE, "MarketNotAllowed");
    await send(conns, "updatePolicy", [pol]);
    console.log("[trader] policy restored");
  }
}

async function main() {
  await ensureRegistered(conns);
  await ensureErc8004Registered(conns, "trader");
  await ensureDeposited();
  console.log("[trader] running as", conns.account.address);
  while (true) {
    try { await tick(); } catch (e: any) { console.error("[trader] tick error:", e.message); }
    await new Promise(r => setTimeout(r, TICK_MS));
  }
}

main();
