"use client";

import { cn } from "@/lib/utils";
import type { EventRow } from "@/lib/db/queries";
import { EXPLORER_TX } from "@/lib/chain";

const KIND_LABEL: Record<string, string> = {
  MarketCreated: "Market created", MarketOpened: "Market opened", MarketClosed: "Market closed",
  MarketHalted: "Market halted", MarketResumed: "Market resumed",
  AgentRegistered: "Agent registered", PolicyUpdated: "Policy updated",
  BetPlaced: "Bet placed", BetCancelled: "Bet cancelled", PositionSettled: "Position settled",
  Deposited: "Deposited", Withdrawn: "Withdrawn",
};

const KIND_TONE: Record<string, string> = {
  MarketCreated: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  MarketOpened:  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  MarketClosed:  "bg-zinc-500/10 text-zinc-500",
  MarketHalted:  "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  MarketResumed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  BetPlaced:     "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  BetCancelled:  "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  PositionSettled: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  PolicyUpdated: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

function fmtUsdc(v: any): string {
  const n = Number(v);
  if (!v || isNaN(n)) return "—";
  return `$${(n / 1_000_000).toFixed(2)}`;
}

function summary(ev: EventRow): string {
  const a = (ev.args ?? {}) as Record<string, any>;
  switch (ev.kind) {
    case "BetPlaced":      return `${String(a.side ?? "").toUpperCase()} · ${fmtUsdc(a.amount)} → ${a.shares ?? "—"} shares`;
    case "BetCancelled":   return `market #${ev.market_id}`;
    case "PositionSettled":return `payout ${fmtUsdc(a.payout)}`;
    case "MarketClosed":   return `winner=${String(a.winner ?? "?").toUpperCase()}`;
    case "MarketOpened":   return `strike=${a.strike ? `$${(Number(a.strike) / 1e8).toFixed(0)}` : "—"}`;
    case "Deposited":      return fmtUsdc(a.amount);
    default: return "";
  }
}

function shortHash(h: string | null | undefined, n = 6) {
  if (!h) return "—";
  return `${h.slice(0, n + 2)}…${h.slice(-n)}`;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString();
}

export function EventCard({ event }: { event: EventRow }) {
  const label = KIND_LABEL[event.kind] ?? event.kind;
  const tone  = KIND_TONE[event.kind] ?? "bg-muted text-foreground";
  const sub   = summary(event);
  const isDestructive = !event.success;

  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border border-border bg-card p-4", isDestructive && "border-destructive/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", tone)}>{label}</span>
        {!event.success && <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-xs text-destructive">blocked</span>}
        <span className="ml-auto font-mono text-xs text-muted-foreground">{fmtTime(event.block_time ?? event.inserted_at)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {sub && <span className="text-foreground">{sub}</span>}
        {event.actor && <span className="font-mono text-xs text-muted-foreground">{shortHash(event.actor)}</span>}
        <a href={EXPLORER_TX(event.tx_hash)} target="_blank" rel="noopener noreferrer"
          className="ml-auto font-mono text-xs text-primary underline-offset-4 hover:underline">
          {shortHash(event.tx_hash)}
        </a>
      </div>
    </div>
  );
}
