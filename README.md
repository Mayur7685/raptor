# Raptor

**Policy-governed AI agent trading on short BTC/USD prediction markets — settled on GOAT Network.**

Three autonomous agents trade YES/NO on 5-minute Bitcoin windows. Every bet is validated on-chain against the agent's policy: stake caps, oracle freshness, allowlist gating, and paused flag. Violations revert with named errors traceable on the GOAT explorer. Agent identities are anchored in ERC-8004 — GOAT's native on-chain agent identity standard.

---

## Live Demo

- **Frontend**: *(add Vercel URL after deploy)*
- **Contract (GOAT Testnet3)**: [`0x5C6Ebe08f2a3C788E47c2531779884070B249ddD`](https://explorer.testnet3.goat.network/address/0x5C6Ebe08f2a3C788E47c2531779884070B249ddD)
- **Agents on ERC-8004**:
  - [MarketOps](https://explorer.testnet3.goat.network/address/0xf29ab6a879Ff65BA032F31aC401DE187a92c4788)
  - [Trader](https://explorer.testnet3.goat.network/address/0xed6bc25b8B9F2Cb064e8603b149a5B370d5b8872)
  - [Risk-LP](https://explorer.testnet3.goat.network/address/0xbeb9DF3E69e54376dCBADed74764168faB498Fdd)

---

## What it is

| Component | Description |
|---|---|
| `RaptorCore.sol` | Single Solidity contract: CPMM binary markets, AgentPolicy, MockUSDC vault, MockPyth oracle resolution |
| `market_ops` agent | Oracle watchdog — halts/resumes markets on price staleness, registered as ERC-8004 operator |
| `trader` agent | Momentum trader — bets YES/NO based on price vs strike, demos policy violations |
| `risk_lp` agent | AMM hedger — bets on under-bought side to balance YES/NO reserves |
| `scheduler` | Rolling horizon — creates, opens, closes, and settles markets; pushes BTC price to MockPyth |
| `app` | Next.js frontend — live BTC chart, markets table, agent profiles, event timeline |

---

## Architecture

```
GOAT Testnet3 (Chain ID: 48816)
└── RaptorCore.sol
    ├── MockUSDC vault  (deposit / withdraw)
    ├── Markets         (CPMM AMM · MockPyth oracle resolution)
    └── AgentProfiles   (policy enforcement on every bet)

Off-chain
├── scheduler/      creates + opens + closes + settles markets
│                   pushes BTC/USD price from Pyth Hermes → MockPyth every tick
└── agents/
    ├── market_ops  halt/resume watchdog · ERC-8004 registered · onlyOperator role
    ├── trader      momentum bets · deliberate policy violation demos (OverPolicyCap, MarketNotAllowed)
    └── risk_lp     AMM hedger · cancels near close
```

---

## Stack

| Layer | Tech |
|---|---|
| Smart contract | Solidity 0.8.20, Foundry |
| Chain | GOAT Network Testnet3 (Chain ID: 48816) |
| Oracle | MockPyth — prices pushed from [Pyth Hermes REST](https://hermes.pyth.network) |
| Stablecoin | MockUSDC — 6 decimals, admin-mintable for testnet |
| Agent identity | [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) Identity Registry (`0x556089...`) |
| Off-chain clients | TypeScript, [viem](https://viem.sh) |
| Frontend | Next.js 15, Tailwind CSS v4, shadcn/ui |
| Indexer | Supabase (Postgres + Realtime) |

---

## GOAT-Native Differentiators

- **ERC-8004 Agent Identity** — each of the 3 agents registers on GOAT's native identity registry at startup. Wallet addresses are tied to metadata URIs with role/project attributes. No equivalent on Celo or Solana.
- **BTC as gas** — GOAT is a Bitcoin-secured EVM L2. Gas is paid in native BTC.
- **Operator role pattern** — `market_ops` uses a separate wallet granted `operator` role via `grantOperator()`, enabling true 3-agent separation (Celo/Falco required sharing the admin key).

---

## Contract Addresses (GOAT Testnet3)

| Contract | Address |
|---|---|
| RaptorCore | `0x5C6Ebe08f2a3C788E47c2531779884070B249ddD` |
| MockPyth | `0x1CA52Db11Db1aC233B7737Ee1c80Fc7E4A8f7195` |
| MockUSDC | `0x9AD22D97f29C09c7a06b8267d08976b9F5378d95` |
| ERC-8004 Identity Registry | `0x556089008Fc0a60cD09390Eca93477ca254A5522` |

---

## Policy Enforcement Demo

The `trader` agent deliberately triggers two on-chain policy violations per market window:

1. **OverPolicyCap** — places a bet exceeding `maxStakePerWindow` → reverts with `OverPolicyCap`
2. **MarketNotAllowed** — sets `allowedMarketsRoot` to wrong value, places a bet → reverts with `MarketNotAllowed`, then restores policy

Both are verifiable on the GOAT explorer as reverted transactions from the trader address.

---

## Quick Start

### Prerequisites
- Node.js 20+, pnpm, Foundry, cast

### 1. Clone & install

```bash
git clone <repo-url>
cd raptor

pnpm install          # scheduler + agents
cd app && npm install # Next.js app
```

### 2. Contracts (already deployed — skip to step 3)

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
forge build
forge test            # 22/22 tests pass
```

To redeploy:
```bash
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.testnet3.goat.network \
  --private-key $PRIVATE_KEY --broadcast --legacy
```

### 3. Grant operator role to market_ops wallet

```bash
cast send 0x5C6Ebe08f2a3C788E47c2531779884070B249ddD \
  "grantOperator(address)" <MARKET_OPS_ADDRESS> \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.testnet3.goat.network
```

### 4. Mint MockUSDC to agent wallets

```bash
# 10 USDC each
cast send 0x9AD22D97f29C09c7a06b8267d08976b9F5378d95 \
  "mint(address,uint256)" <TRADER_ADDRESS> 10000000 \
  --private-key $PRIVATE_KEY --rpc-url https://rpc.testnet3.goat.network

cast send 0x9AD22D97f29C09c7a06b8267d08976b9F5378d95 \
  "mint(address,uint256)" <RISK_LP_ADDRESS> 10000000 \
  --private-key $PRIVATE_KEY --rpc-url https://rpc.testnet3.goat.network
```

### 5. Environment files

**`scheduler/.env`**
```env
PRIVATE_KEY=0x...
GOAT_RPC_URL=https://rpc.testnet3.goat.network
RAPTOR_CORE_ADDRESS=0x5C6Ebe08f2a3C788E47c2531779884070B249ddD
MOCK_PYTH_ADDRESS=0x1CA52Db11Db1aC233B7737Ee1c80Fc7E4A8f7195
MOCK_USDC_ADDRESS=0x9AD22D97f29C09c7a06b8267d08976b9F5378d95
SCHEDULER_TICK_MS=5000
SCHEDULER_WINDOW_SECS=300
SCHEDULER_SEED_USDC=5000000
```

**`agents/.env`**
```env
MARKET_OPS_PRIVATE_KEY=0x...
TRADER_PRIVATE_KEY=0x...
RISK_LP_PRIVATE_KEY=0x...
GOAT_RPC_URL=https://rpc.testnet3.goat.network
RAPTOR_CORE_ADDRESS=0x5C6Ebe08f2a3C788E47c2531779884070B249ddD
MOCK_USDC_ADDRESS=0x9AD22D97f29C09c7a06b8267d08976b9F5378d95
```

**`app/.env`** (or `.env.local`)
```env
NEXT_PUBLIC_RAPTOR_ADDRESS=0x5C6Ebe08f2a3C788E47c2531779884070B249ddD
GOAT_RPC_URL=https://rpc.testnet3.goat.network
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
RAPTOR_INDEXER_ENABLED=true
```

### 6. Supabase setup

Run `app/supabase/migrations/0001_raptor_indexer.sql` in the Supabase SQL Editor.

Then set the indexer start block to the deployment block:
```sql
UPDATE cursors SET last_block = 14422267 WHERE chain = 'goat-testnet';
```

### 7. Run (4 terminals in order)

```bash
# Terminal 1 — Scheduler
cd scheduler && pnpm dev

# Terminal 2 — App + Indexer (after scheduler creates first market)
cd app && npm run dev

# Terminal 3 — All 3 agents
cd agents && pnpm dev:all
```

---

## Project Structure

```
raptor/
├── contracts/              Foundry — Solidity
│   ├── src/
│   │   ├── RaptorCore.sol  Core contract (CPMM markets + policy)
│   │   ├── MockPyth.sol    Testnet oracle stub
│   │   ├── MockUSDC.sol    Testnet collateral token
│   │   └── interfaces/IPyth.sol
│   ├── script/Deploy.s.sol
│   └── test/RaptorCore.t.sol  22 tests
│
├── scheduler/              TypeScript — market lifecycle + price oracle
│   └── src/index.ts        Creates/opens/closes markets, pushes MockPyth price every tick
│
├── agents/                 TypeScript — 3 autonomous agents
│   └── src/
│       ├── market_ops.ts   Oracle watchdog (onlyOperator)
│       ├── trader.ts       Momentum + policy violation demos
│       ├── risk_lp.ts      AMM hedger
│       └── erc8004.ts      ERC-8004 identity registration
│
└── app/                    Next.js 15
    ├── app/                Pages: /, /markets, /agents, /stats, /docs
    ├── components/         BtcLiveChart, LiveMarketCard, EventCard, SystemStatusStrip, AgentDetailTabs
    ├── lib/
    │   ├── chain.ts        GOAT testnet viem client
    │   └── indexer/        Supabase event indexer (runs inside Next.js)
    └── supabase/migrations/
```

---

## Key Design Decisions

**Why MockPyth instead of real Pyth?**
Pyth is not deployed on GOAT Testnet3. MockPyth implements the same `IPyth` interface and is fed real BTC prices from the Pyth Hermes REST API every scheduler tick. The contract logic is identical to what would run with real Pyth on mainnet.

**Why MockUSDC?**
No canonical USDC exists on GOAT Testnet3. MockUSDC is a standard ERC-20 with a `mint()` function for testnet funding. 6 decimals, identical interface to real USDC.

**Why operator role?**
`haltMarket` and `resumeMarket` require elevated permission. Rather than sharing the admin key with market_ops (the Falco/Celo pattern), we added a `grantOperator()` function so market_ops runs as a fully independent wallet. True 3-agent separation.

---

## Comparison: Raptor vs Falco vs Kestrel

| | Kestrel | Falco | Raptor |
|---|---|---|---|
| Chain | Solana devnet + MagicBlock ER | Celo Sepolia | **GOAT Testnet3** |
| Contract | Anchor (Rust) | Solidity | **Solidity** |
| Oracle | Pyth (on-chain) | Pyth Celo | **MockPyth + Hermes** |
| Agent identity | — | — | **ERC-8004** |
| market_ops key | Admin (shared) | Admin (shared) | **Separate wallet + operator role** |
| Gas token | SOL | CELO | **BTC** |

---

## License

MIT
