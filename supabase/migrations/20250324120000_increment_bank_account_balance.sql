-- Atomic balance increment for concurrent-safe revenue updates from the app.
-- Run this in the Supabase SQL editor or via `supabase db push`.

create or replace function public.increment_bank_account_balance(
  p_account_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount = 0 then
    return;
  end if;

  update public.banking_accounts
  set balance = coalesce(balance, 0) + p_amount
  where id = p_account_id;

  if not found then
    raise exception 'banking account not found: %', p_account_id;
  end if;
end;
$$;

grant execute on function public.increment_bank_account_balance(uuid, numeric) to authenticated;
grant execute on function public.increment_bank_account_balance(uuid, numeric) to service_role;
