-- Financial portal fields: provider, account category, masked display source.

alter table public.banking_accounts
  add column if not exists provider text,
  add column if not exists account_category text,
  add column if not exists account_number text;

-- Backfill provider from legacy single "type" when present.
update public.banking_accounts
set provider = coalesce(nullif(trim(provider), ''), nullif(trim(type), ''))
where (provider is null or trim(provider) = '')
  and type is not null
  and trim(type) <> '';
