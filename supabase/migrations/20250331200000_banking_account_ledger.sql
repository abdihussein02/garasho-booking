-- Per-account ledger for ticket/visa deposits and future manual entries.

create table if not exists public.banking_account_ledger (
  id uuid primary key default gen_random_uuid (),
  banking_account_id uuid not null references public.banking_accounts (id) on delete cascade,
  amount numeric not null,
  source text not null default 'booking',
  booking_id uuid references public.bookings (id) on delete set null,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists banking_account_ledger_account_created_idx
  on public.banking_account_ledger (banking_account_id, created_at desc);

comment on table public.banking_account_ledger is 'Credits to wallet/bank rails; booking_id links to ticket (visa fees included in booking totals).';
