"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useLiveBtcPrice } from "@/components/markets/useLiveBtcPrice";

function Pill({ label, value, tone = "muted" }: { label: string; value: React.ReactNode; tone?: "ok"|"warn"|"bad"|"muted"|"info" }) {
  const tones = { ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", warn: "bg-amber-500/10 text-amber-800 dark:text-amber-400", bad: "bg-destructive/15 text-destructive", muted: "bg-muted text-muted-foreground", info: "bg-sky-500/10 text-sky-700 dark:text-sky-400" };
  return (
    <div className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-xs", tones[tone])}>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function fmtSecs(s: number) { return s < 60 ? `${Math.max(0, Math.floor(s))}s` : `${Math.floor(s/60)}m ${String(Math.floor(s%60)).padStart(2,"0")}s`; }

export function SystemStatusStrip() {
  const { price, publishTimeSec } = useLiveBtcPrice();
  const [now, setNow] = useState(Date.now());
  const [blockNumber, setBlockNumber] = useState<number|null>(null);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const fetchBlock = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const j = await res.json();
        if (j.blockNumber) setBlockNumber(j.blockNumber);
      } catch {}
    };
    void fetchBlock();
    const id = setInterval(() => void fetchBlock(), 10_000);
    return () => clearInterval(id);
  }, []);

  const oracleAgeSec = publishTimeSec ? Math.max(0, Math.floor(now / 1000) - publishTimeSec) : null;
  const oracleTone: "ok"|"warn"|"bad" = oracleAgeSec == null ? "muted" : oracleAgeSec <= 30 ? "ok" : oracleAgeSec <= 60 ? "warn" : "bad";

  return (
    <div className="sticky top-14 z-20 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-6 py-2">
        <Pill label="Chain" tone="info" value="GOAT Testnet · 48816" />
        <Pill label="Oracle" tone={oracleTone}
          value={oracleAgeSec != null ? `${fmtSecs(oracleAgeSec)} ago` : "no feed"} />
        <Pill label="BTC" tone={price ? "ok" : "muted"}
          value={price ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} />
        {blockNumber && <Pill label="Block" tone="muted" value={blockNumber.toLocaleString()} />}
      </div>
    </div>
  );
}
