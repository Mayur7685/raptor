import { buildConnections, RAPTOR_CORE_ADDRESS, MOCK_PYTH_ADDRESS, MOCK_USDC_ADDRESS, PYTH_BTC_USD_FEED } from "./common/connections.js";
import { send } from "./common/tx.js";
import { listMarkets, MarketStatus } from "./common/markets.js";

const TICK_MS        = Number(process.env.SCHEDULER_TICK_MS      ?? 5_000);
const WINDOW_SECS    = Number(process.env.SCHEDULER_WINDOW_SECS  ?? 300);
const HORIZON_SECS   = Number(process.env.SCHEDULER_HORIZON_SECS ?? 600);
const SEED_LIQUIDITY = BigInt(process.env.SCHEDULER_SEED_USDC    ?? "5000000");

const MOCK_PYTH_ABI = [{ name: "updatePrice", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "feedId", type: "bytes32" }, { name: "price", type: "int64" }, { name: "publishTime", type: "uint256" }],
  outputs: [] }];

const USDC_ABI = [{ name: "approve", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ type: "bool" }] }];

const conns = buildConnections();

async function approveUsdc() {
  const h = await conns.walletClient.writeContract({
    address: MOCK_USDC_ADDRESS, abi: USDC_ABI, functionName: "approve",
    args: [RAPTOR_CORE_ADDRESS, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
  });
  await conns.publicClient.waitForTransactionReceipt({ hash: h });
  console.log("[scheduler] USDC approved");
}

async function pushMockPrice(): Promise<boolean> {
  try {
    const res  = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_BTC_USD_FEED}`);
    const data = await res.json() as any;
    const item = data.parsed?.[0];
    if (!item) return false;
    const price       = BigInt(item.price.price);
    const publishTime = BigInt(item.price.publish_time);
    const h = await conns.walletClient.writeContract({
      address: MOCK_PYTH_ADDRESS, abi: MOCK_PYTH_ABI, functionName: "updatePrice",
      args: [PYTH_BTC_USD_FEED, price, publishTime],
    });
    await conns.publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`[scheduler] MockPyth price=${price} tx=${h}`);
    return true;
  } catch (e: any) {
    console.warn("[scheduler] pushMockPrice failed:", e.message?.slice(0, 120));
    return false;
  }
}

async function tick() {
  const nowSec  = Math.floor(Date.now() / 1000);
  const markets = await listMarkets(conns);

  // Push fresh price every tick so agents never hit OracleStale on placeBet
  await pushMockPrice();

  // Phase 1 — fill horizon
  const latestClose = markets.reduce((max, m) => Math.max(max, m.closeTs), nowSec);
  if (latestClose - nowSec < HORIZON_SECS) {
    const openTs  = latestClose > nowSec ? latestClose : nowSec + 10;
    const closeTs = openTs + WINDOW_SECS;
    try {
      const hash = await send(conns, "createMarket", [openTs, closeTs, PYTH_BTC_USD_FEED]);
      console.log(`[scheduler] createMarket openTs=${openTs} closeTs=${closeTs} tx=${hash}`);
    } catch (e: any) { console.warn("[scheduler] createMarket failed:", e.message?.slice(0, 120)); }
  }

  // Phase 2 — open pending markets
  for (const m of markets.filter(m => m.status === MarketStatus.Pending && nowSec >= m.openTs)) {
    try {
      const hash = await send(conns, "openMarket", [m.id, SEED_LIQUIDITY]);
      console.log(`[scheduler] openMarket id=${m.id} tx=${hash}`);
    } catch (e: any) { console.warn(`[scheduler] openMarket id=${m.id} failed:`, e.message?.slice(0, 120)); }
  }

  // Phase 3 — close markets past closeTs
  for (const m of markets.filter(m => (m.status === MarketStatus.Open || m.status === MarketStatus.Halted) && nowSec >= m.closeTs)) {
    try {
      const hash = await send(conns, "closeMarket", [m.id]);
      console.log(`[scheduler] closeMarket id=${m.id} tx=${hash}`);
    } catch (e: any) { console.warn(`[scheduler] closeMarket id=${m.id} failed:`, e.message?.slice(0, 120)); }
  }

  // Phase 4 — settle closed markets
  for (const m of markets.filter(m => m.status === MarketStatus.Closed)) {
    try { await send(conns, "settlePositions", [[m.id]]); } catch { /* no positions ok */ }
  }
}

async function main() {
  console.log("[scheduler] admin:", conns.account.address);
  console.log("[scheduler] RaptorCore:", RAPTOR_CORE_ADDRESS);
  await approveUsdc();
  while (true) {
    try { await tick(); } catch (e: any) { console.error("[scheduler] tick error:", e.message); }
    await new Promise(r => setTimeout(r, TICK_MS));
  }
}

main();
