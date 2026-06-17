import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CONTRACTS = [
  { label: "RaptorCore", address: "0x5C6Ebe08f2a3C788E47c2531779884070B249ddD" },
  { label: "MockPyth",   address: "0x1CA52Db11Db1aC233B7737Ee1c80Fc7E4A8f7195" },
  { label: "MockUSDC",   address: "0x9AD22D97f29C09c7a06b8267d08976b9F5378d95" },
  { label: "ERC-8004 Identity", address: "0x556089008Fc0a60cD09390Eca93477ca254A5522" },
];

const STACK = [
  { layer: "Smart contract",  tech: "Solidity 0.8.20, Foundry" },
  { layer: "Chain",           tech: "GOAT Testnet3 · Chain ID 48816" },
  { layer: "Oracle",          tech: "MockPyth — prices pushed from Pyth Hermes REST" },
  { layer: "Stablecoin",      tech: "MockUSDC · 6 decimals · admin-mintable" },
  { layer: "Agent identity",  tech: "ERC-8004 Identity Registry (GOAT-native)" },
  { layer: "Off-chain",       tech: "TypeScript · viem" },
  { layer: "Frontend",        tech: "Next.js 15 · Tailwind · shadcn/ui" },
];

const AGENTS = [
  { role: "market_ops", color: "bg-amber-500/10 text-amber-700 dark:text-amber-400",   desc: "Oracle watchdog. Halts the market when Pyth price is stale (>30s). Resumes on recovery. Demo: force-halts every 4th market for 20s." },
  { role: "trader",     color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", desc: "Momentum trader. Bets YES if price ≥ strike, NO otherwise. Deliberately triggers OverPolicyCap and MarketNotAllowed reverts each window." },
  { role: "risk_lp",    color: "bg-sky-500/10 text-sky-700 dark:text-sky-400",         desc: "AMM hedger. Bets on the under-bought side to push YES/NO reserves back toward 50/50. Cancels position near market close." },
];

export default function DocsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 p-6">

      {/* Hero */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Raptor</h1>
          <Badge variant="outline">GOAT Testnet3</Badge>
        </div>
        <p className="max-w-2xl text-muted-foreground">
          Policy-governed AI agent trading on short BTC/USD prediction markets. Three autonomous agents trade
          YES/NO on 5-minute windows. Every bet is validated on-chain — stake caps, oracle freshness, allowlist
          gating. Violations revert with named errors traceable on the GOAT explorer.
        </p>
      </div>

      {/* Contract Addresses */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Contract Addresses</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {CONTRACTS.map(c => (
                  <tr key={c.label}>
                    <td className="px-4 py-3 font-medium text-muted-foreground w-40">{c.label}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://explorer.testnet3.goat.network/address/${c.address}`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono text-xs text-primary hover:underline underline-offset-4"
                      >
                        {c.address}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Stack */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Stack</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {STACK.map(s => (
                  <tr key={s.layer}>
                    <td className="px-4 py-3 font-medium text-muted-foreground w-40">{s.layer}</td>
                    <td className="px-4 py-3">{s.tech}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Agents */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Agents</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {AGENTS.map(a => (
            <Card key={a.role}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${a.color}`}>{a.role}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{a.desc}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Architecture</h2>
        <Card>
          <CardContent className="pt-4">
            <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs leading-relaxed text-foreground">{`GOAT Testnet3 (48816)
└── RaptorCore.sol
    ├── MockUSDC vault  (deposit / withdraw)
    ├── Markets         (CPMM AMM · MockPyth oracle resolution)
    └── AgentProfiles   (policy checks on every placeBet)

Off-chain
├── scheduler/      creates + opens + closes + settles markets
│                   pushes BTC price from Hermes → MockPyth before each open/close
└── agents/
    ├── market_ops  halt/resume watchdog · ERC-8004 registered · onlyOperator role
    ├── trader      momentum bets · deliberate policy violation demos
    └── risk_lp     AMM hedger · cancels near close`}</pre>
          </CardContent>
        </Card>
      </section>

      {/* Policy Demo */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Policy Enforcement Demo</h2>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4 text-sm">
            <p className="text-muted-foreground">
              The <span className="font-mono text-foreground">trader</span> agent deliberately triggers two on-chain
              policy violations per market window. Both are verifiable on the GOAT explorer as reverted transactions.
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <span className="mt-0.5 rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-xs text-destructive">OverPolicyCap</span>
                <span className="text-muted-foreground">Bet amount exceeds <code className="text-foreground">maxStakePerWindow</code> → transaction reverts at T+10s</span>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <span className="mt-0.5 rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-xs text-destructive">MarketNotAllowed</span>
                <span className="text-muted-foreground">Wrong <code className="text-foreground">allowedMarketsRoot</code> set → revert at T+20s, then policy restored</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ERC-8004 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">ERC-8004 Agent Identity</h2>
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            <p>
              All three agents register on the GOAT Testnet ERC-8004 Identity Registry at startup. Each wallet
              is tied to a JSON metadata URI with role and project attributes — making agents discoverable
              on-chain. This is GOAT-native: no equivalent exists on Celo or Solana.
            </p>
            <div className="mt-3">
              <a
                href="https://explorer.testnet3.goat.network/address/0x556089008Fc0a60cD09390Eca93477ca254A5522"
                target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline underline-offset-4"
              >
                0x556089008Fc0a60cD09390Eca93477ca254A5522 ↗
              </a>
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}
