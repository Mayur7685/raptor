import Link from "next/link";

const NAV = [
  { href: "/",        label: "Home" },
  { href: "/markets", label: "Markets" },
  { href: "/agents",  label: "Agents" },
  { href: "/stats",   label: "Stats" },
  { href: "/docs",    label: "Docs" },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-6">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">Raptor</Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {NAV.slice(1).map(n => (
            <Link key={n.href} href={n.href} className="hover:text-foreground transition-colors">{n.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            GOAT Testnet
          </span>
        </div>
      </div>
    </header>
  );
}
