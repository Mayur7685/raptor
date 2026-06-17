"use client";

import { useState } from "react";
import { EventCard } from "@/components/timeline/EventCard";
import { cn } from "@/lib/utils";
import type { EventRow } from "@/lib/db/queries";
import { EXPLORER_ADDR } from "@/lib/chain";

type Tab = "trace" | "bets";

export function AgentDetailTabs({ ownerAddress, initialEvents }: { ownerAddress: string; initialEvents: EventRow[] }) {
  const [tab, setTab] = useState<Tab>("trace");

  const betEvents = initialEvents.filter(e => ["BetPlaced","BetCancelled","PositionSettled"].includes(e.kind));
  const allEvents = [...initialEvents].reverse();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(["trace","bets"] as Tab[]).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted")}>
            {t === "trace" ? "All events" : "Bets"}
          </button>
        ))}
        <a href={EXPLORER_ADDR(ownerAddress)} target="_blank" rel="noopener noreferrer"
          className="ml-auto rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
          Explorer ↗
        </a>
      </div>

      {(tab === "trace" ? allEvents : betEvents).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No events yet — indexer is running.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(tab === "trace" ? allEvents : betEvents).map(ev => <EventCard key={ev.id} event={ev} />)}
        </div>
      )}
    </div>
  );
}
