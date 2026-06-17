import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAllAgents } from "@/lib/db/queries";
import { EXPLORER_ADDR } from "@/lib/chain";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  market_ops: "MarketOps", trader: "Trader", risk_lp: "Risk-LP",
};

export default async function AgentsPage() {
  const agents = await fetchAllAgents().catch(() => []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">Three autonomous agents registered on RaptorCore and ERC-8004.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {agents.map(a => (
          <Card key={a.owner_address}>
            <CardHeader>
              <CardTitle className="text-base">{ROLE_LABEL[a.role ?? ""] ?? a.role ?? "Agent"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="font-mono text-xs text-muted-foreground break-all">{a.owner_address}</div>
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Balance: <span className="font-mono text-foreground">{a.current_balance != null ? `${(a.current_balance / 1_000_000).toFixed(2)} USDC` : "—"}</span></span>
                {a.last_event_at && <span className="text-muted-foreground">Last event: <span className="font-mono text-foreground">{new Date(a.last_event_at).toLocaleTimeString()}</span></span>}
                {a.erc8004_id && <span className="text-muted-foreground">ERC-8004 ID: <span className="font-mono text-foreground">#{a.erc8004_id}</span></span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Link href={`/agents/${a.owner_address}`}
                  className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  View trace
                </Link>
                <a href={EXPLORER_ADDR(a.owner_address)} target="_blank" rel="noopener noreferrer"
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
                  Explorer ↗
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
        {agents.length === 0 && (
          <div className="col-span-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No agents indexed yet. Start the scheduler and agents, then wait for the indexer to catch up.
          </div>
        )}
      </div>
    </div>
  );
}
