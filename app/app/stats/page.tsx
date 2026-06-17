import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPublicStats } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const stats = await fetchPublicStats().catch(() => null);

  if (!stats) return (
    <div className="mx-auto max-w-5xl p-6 text-muted-foreground text-sm">Stats unavailable — Supabase not configured.</div>
  );

  const rows = [
    { label: "Total markets",    value: stats.totalMarkets },
    { label: "Open",             value: stats.marketsByStatus["open"] ?? 0 },
    { label: "Closed",           value: stats.marketsByStatus["closed"] ?? 0 },
    { label: "Total events",     value: stats.totalEvents },
    { label: "Events (24h)",     value: stats.eventsLast24h },
    { label: "Agents registered",value: stats.totalAgents },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="text-sm text-muted-foreground">Aggregated from the Supabase indexer.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {rows.map(r => (
          <Card key={r.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{r.label}</CardTitle></CardHeader>
            <CardContent><p className="font-mono text-2xl font-semibold">{r.value.toLocaleString()}</p></CardContent>
          </Card>
        ))}
      </div>
      {stats.lastEventAt && (
        <p className="text-xs text-muted-foreground">Last event indexed: {new Date(stats.lastEventAt).toLocaleString()}</p>
      )}
    </div>
  );
}
