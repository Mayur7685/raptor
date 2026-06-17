import { notFound } from "next/navigation";
import { AgentDetailTabs } from "@/components/agents/AgentDetailTabs";
import { fetchAgentRow, fetchAgentEvents } from "@/lib/db/queries";
import { EXPLORER_ADDR } from "@/lib/chain";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { market_ops: "MarketOps", trader: "Trader", risk_lp: "Risk-LP" };

export default async function AgentPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const [agent, events] = await Promise.all([
    fetchAgentRow(address).catch(() => null),
    fetchAgentEvents(address).catch(() => []),
  ]);
  if (!agent) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{ROLE_LABEL[agent.role ?? ""] ?? agent.role ?? "Agent"}</h1>
          <p className="font-mono text-sm text-muted-foreground break-all">{agent.owner_address}</p>
        </div>
        <a href={EXPLORER_ADDR(agent.owner_address)} target="_blank" rel="noopener noreferrer"
          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
          Explorer ↗
        </a>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 text-sm">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="mt-1 font-mono font-semibold">{agent.current_balance != null ? `${(agent.current_balance / 1_000_000).toFixed(2)} USDC` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">ERC-8004 ID</p>
          <p className="mt-1 font-mono font-semibold">{agent.erc8004_id ? `#${agent.erc8004_id}` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Total events</p>
          <p className="mt-1 font-mono font-semibold">{events.length}</p>
        </div>
      </div>
      <AgentDetailTabs ownerAddress={agent.owner_address} initialEvents={events} />
    </div>
  );
}
