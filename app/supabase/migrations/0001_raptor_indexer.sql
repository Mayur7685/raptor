create extension if not exists pgcrypto;

create table if not exists public.markets (
  market_id    integer primary key,
  open_ts      bigint, close_ts bigint, status text,
  strike_price bigint, close_price bigint, winner text,
  yes_reserve  bigint, no_reserve bigint, oracle_feed text,
  opened_tx text, closed_tx text, created_tx text,
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  tx_hash      text not null, log_index integer not null default 0,
  block_number bigint, block_time timestamptz,
  market_id    integer references public.markets(market_id) on delete set null,
  kind text not null, actor text,
  args jsonb not null default '{}'::jsonb,
  success boolean not null default true,
  inserted_at timestamptz not null default now(),
  unique (tx_hash, log_index)
);

create index if not exists events_market_id_idx on public.events (market_id, block_time desc nulls last);
create index if not exists events_actor_idx      on public.events (actor, block_time desc nulls last);

create table if not exists public.agents (
  owner_address   text primary key,
  role            text, label text,
  current_policy  jsonb, current_balance bigint,
  erc8004_id      bigint, erc8004_uri text, reputation_score numeric,
  registered_at   timestamptz, last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.cursors (
  chain      text primary key,
  last_block bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.cursors (chain, last_block) values ('goat-testnet', 0) on conflict do nothing;

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.markets;
alter publication supabase_realtime add table public.agents;

alter table public.markets enable row level security;
alter table public.events  enable row level security;
alter table public.agents  enable row level security;
alter table public.cursors enable row level security;

create policy "markets public" on public.markets for select using (true);
create policy "events public"  on public.events  for select using (true);
create policy "agents public"  on public.agents  for select using (true);
create policy "cursors public" on public.cursors for select using (true);
