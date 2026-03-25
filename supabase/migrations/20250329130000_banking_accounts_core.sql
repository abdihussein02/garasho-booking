-- Core banking_accounts shape for portal inserts (safe if table already exists from the dashboard).

create table if not exists public.banking_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Account',
  current_balance numeric not null default 0,
  provider text,
  account_category text,
  account_number text,
  created_at timestamptz not null default now()
);

alter table public.banking_accounts
  add column if not exists provider text,
  add column if not exists account_category text,
  add column if not exists account_number text;

comment on table public.banking_accounts is 'Agency wallets and bank rails; type often stores "Provider · Category" for legacy rows.';
