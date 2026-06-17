import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAllMarkets } from "@/lib/db/queries";
import { formatStrike, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  open: "text-emerald-500", halted: "text-yellow-500", closed: "text-zinc-400", pending: "text-zinc-500",
};

export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter  = status && status !== "all" ? status : undefined;
  const markets = await fetchAllMarkets({ status: filter, limit: 200 }).catch(() => []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
        <p className="text-sm text-muted-foreground">Every 5-minute window the scheduler has produced.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["all","pending","open","halted","closed"].map(f => {
          const active = (f === "all" && !status) || f === status;
          return (
            <Link key={f} href={f === "all" ? "/markets" : `/markets?status=${f}`}
              className={active ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground" : "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Link>
          );
        })}
      </div>
      <Card>
        <CardHeader><CardTitle>{markets.length} market{markets.length !== 1 ? "s" : ""}</CardTitle></CardHeader>
        <CardContent>
          {markets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No markets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    {["ID","Status","Open","Close","Strike","Final","Winner"].map(h => (
                      <th key={h} className="px-2 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {markets.map(m => (
                    <tr key={m.market_id} className="hover:bg-muted/40">
                      <td className="px-2 py-2 font-mono font-medium">#{m.market_id}</td>
                      <td className={`px-2 py-2 font-medium capitalize ${STATUS_COLOR[m.status ?? ""] ?? ""}`}>{m.status}</td>
                      <td className="px-2 py-2 font-mono text-xs">{formatDateTime(m.open_ts ?? undefined)}</td>
                      <td className="px-2 py-2 font-mono text-xs">{formatDateTime(m.close_ts ?? undefined)}</td>
                      <td className="px-2 py-2 font-mono text-xs">{formatStrike(m.strike_price ?? undefined)}</td>
                      <td className="px-2 py-2 font-mono text-xs">{formatStrike(m.close_price ?? undefined)}</td>
                      <td className={`px-2 py-2 font-medium ${m.winner === "yes" ? "text-emerald-500" : m.winner === "no" ? "text-rose-500" : "text-muted-foreground"}`}>
                        {m.winner === "yes" ? "YES ↑" : m.winner === "no" ? "NO ↓" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
