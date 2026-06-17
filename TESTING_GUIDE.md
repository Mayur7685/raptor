# Raptor — Testing Guide

**Deployed contracts on GOAT Testnet3 (48816):**
| Contract | Address |
|---|---|
| RaptorCore | `0x5C6Ebe08f2a3C788E47c2531779884070B249ddD` |
| MockPyth | `0x1CA52Db11Db1aC233B7737Ee1c80Fc7E4A8f7195` |
| MockUSDC | `0x9AD22D97f29C09c7a06b8267d08976b9F5378d95` |
| ERC-8004 Identity | `0x556089008Fc0a60cD09390Eca93477ca254A5522` |

Explorer: https://explorer.testnet3.goat.network

---

## Step 1 — Supabase (do once)

1. Go to https://supabase.com → create a new project
2. Go to **SQL Editor** → run these two files in order:
   - `raptor/app/supabase/migrations/0001_raptor_indexer.sql`
3. Go to **Project Settings → API** → copy:
   - `Project URL` → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Grant Operator Role (do once)

The market_ops agent needs permission to halt/resume markets.
Run this with the admin private key (already in `.env`):



```bash
cd raptor/contracts
source ../.env
cast send 0x5C6Ebe08f2a3C788E47c2531779884070B249ddD \
  "grantOperator(address)" <MARKET_OPS_WALLET_ADDRESS> \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.testnet3.goat.network
```

Replace `<MARKET_OPS_WALLET_ADDRESS>` with the address derived from `MARKET_OPS_PRIVATE_KEY`.
To get the address: `cast wallet address --private-key <MARKET_OPS_PRIVATE_KEY>`


---

## Step 3 — Mint MockUSDC to agent wallets (do once)

Each agent needs USDC to deposit. The admin mints it freely:

```bash
cd raptor/contracts
source ../.env

# Mint 10 USDC (10_000_000 = 10 * 10^6) to each agent wallet
cast send 0x9AD22D97f29C09c7a06b8267d08976b9F5378d95 \
  "mint(address,uint256)" <TRADER_ADDRESS> 10000000 \
  --private-key $PRIVATE_KEY --rpc-url https://rpc.testnet3.goat.network

cast send 0x9AD22D97f29C09c7a06b8267d08976b9F5378d95 \
  "mint(address,uint256)" <RISK_LP_ADDRESS> 10000000 \
  --private-key $PRIVATE_KEY --rpc-url https://rpc.testnet3.goat.network
```

> market_ops doesn't need USDC — it only halts/resumes markets.

---

## Step 4 — Create .env files

### `raptor/scheduler/.env`
```
PRIVATE_KEY=0x<admin_private_key>
GOAT_RPC_URL=https://rpc.testnet3.goat.network
RAPTOR_CORE_ADDRESS=0x5C6Ebe08f2a3C788E47c2531779884070B249ddD
MOCK_PYTH_ADDRESS=0x1CA52Db11Db1aC233B7737Ee1c80Fc7E4A8f7195
MOCK_USDC_ADDRESS=0x9AD22D97f29C09c7a06b8267d08976b9F5378d95
SCHEDULER_TICK_MS=5000
SCHEDULER_WINDOW_SECS=300
SCHEDULER_HORIZON_SECS=600
SCHEDULER_SEED_USDC=5000000
```

### `raptor/agents/.env`
```
MARKET_OPS_PRIVATE_KEY=0x<market_ops_key>
TRADER_PRIVATE_KEY=0x<trader_key>
RISK_LP_PRIVATE_KEY=0x<risk_lp_key>
GOAT_RPC_URL=https://rpc.testnet3.goat.network
RAPTOR_CORE_ADDRESS=0x5C6Ebe08f2a3C788E47c2531779884070B249ddD
MOCK_USDC_ADDRESS=0x9AD22D97f29C09c7a06b8267d08976b9F5378d95
AGENTS_TRADER_BASE_SIZE=200000
AGENTS_TRADER_TARGET_BALANCE=2000000
AGENTS_RISK_LP_HEDGE_SIZE=75000
AGENTS_RISK_LP_HEDGES_PER_MARKET=2
AGENTS_RISK_LP_CANCEL_NEAR_CLOSE_SECS=30
```

### `raptor/app/.env.local`
```
NEXT_PUBLIC_RAPTOR_ADDRESS=0x5C6Ebe08f2a3C788E47c2531779884070B249ddD
GOAT_RPC_URL=https://rpc.testnet3.goat.network
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
RAPTOR_INDEXER_ENABLED=true
```

---

## Step 5 — Install dependencies

```bash
# Terminal — run once from raptor root
cd raptor
pnpm install           # installs scheduler + agents

cd app
npm install            # installs Next.js app
```

---

## Step 6 — Start processes (4 terminals in this order)

### Terminal 1 — Scheduler (start first, creates markets)
```bash
cd raptor/scheduler
pnpm dev
```
Wait until you see: `[scheduler] createMarket openTs=... tx=0x...`

### Terminal 2 — App + Indexer
```bash
cd raptor/app
npm run dev
```
Open http://localhost:3000 — you'll see the hero page.

### Terminal 3 — Agents (start after scheduler has created at least 1 market)
```bash
cd raptor/agents
pnpm dev:all
```
This runs all 3 agents concurrently:
- `market_ops` — oracle watchdog, halts/resumes markets
- `trader` — momentum bets + deliberate policy violations
- `risk_lp` — AMM hedger

### Terminal 4 (optional) — Watch logs separately
```bash
# If you want per-agent logs instead of concurrently mixed output:
cd raptor/agents
pnpm dev:market-ops   # Terminal 4
pnpm dev:trader       # Terminal 5
pnpm dev:risk-lp      # Terminal 6
```

---

## What to expect

| Time | What happens |
|---|---|
| T+0s | Scheduler creates market, pushes BTC price to MockPyth, opens market |
| T+5s | trader places honest YES/NO bet |
| T+10s | trader triggers OverPolicyCap revert (visible on explorer) |
| T+20s | trader triggers MarketNotAllowed revert, restores policy |
| T+30s | risk_lp places hedge on under-bought side |
| T+4min | risk_lp cancels position (near close) |
| T+5min | Scheduler closes market, resolves YES/NO winner |
| T+5min+5s | Scheduler settles positions, agents receive payouts |
| Every 4th market | market_ops force-halts for 20s demo |
| Stale oracle | market_ops halts until Hermes recovers |

---

## Verify on-chain

- **Explorer**: https://explorer.testnet3.goat.network/address/0x5C6Ebe08f2a3C788E47c2531779884070B249ddD
- **Policy violation reverts**: open the trader wallet on the explorer — you'll see reverted txs with `OverPolicyCap` / `MarketNotAllowed` selectors
- **ERC-8004 agents**: https://explorer.testnet3.goat.network/address/`<agent_address>`

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `haltMarket` reverts `Unauthorized` | Run Step 2 — grantOperator not called yet |
| `openMarket` reverts | Treasury (admin wallet) has no MockUSDC — run `mint` in Step 3 for admin too: `mint(<ADMIN_ADDRESS>, 100000000000)` — already done in Deploy.s.sol |
| `deposit` reverts | Agent wallet has no MockUSDC — run Step 3 mint |
| Indexer shows no events | Check `RAPTOR_INDEXER_ENABLED=true` in `.env.local`, check Supabase service role key |
| App shows blank markets | Supabase not seeded — wait for scheduler to create first market, indexer will populate |
| `nonce too low` on agents | Scheduler and market_ops share admin key — market_ops delays 3s on startup to avoid collision |
