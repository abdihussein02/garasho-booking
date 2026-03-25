-- Link bookings to banking_accounts for deposit routing (official column name).

alter table public.bookings
  add column if not exists deposit_to_id uuid references public.banking_accounts (id) on delete set null;

comment on column public.bookings.deposit_to_id is 'Banking account that received this booking deposit; legacy clients may use deposit_account_id instead.';
