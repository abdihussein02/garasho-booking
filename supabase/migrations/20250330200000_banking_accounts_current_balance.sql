-- Production uses current_balance; rename legacy balance if present and align RPC.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'banking_accounts'
      and column_name = 'balance'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'banking_accounts'
      and column_name = 'current_balance'
  ) then
    alter table public.banking_accounts rename column balance to current_balance;
  end if;
end$$;

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
  set current_balance = coalesce(current_balance, 0) + p_amount
  where id = p_account_id;

  if not found then
    raise exception 'banking account not found: %', p_account_id;
  end if;
end;
$$;

grant execute on function public.increment_bank_account_balance(uuid, numeric) to authenticated;
grant execute on function public.increment_bank_account_balance(uuid, numeric) to service_role;
