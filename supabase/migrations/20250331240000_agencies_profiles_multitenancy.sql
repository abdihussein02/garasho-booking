-- Multi-tenant agencies: each user belongs to a profile with optional agency_id.
-- Platform admins (profiles.is_platform_admin) can manage the agencies table and see all tenant data.

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  contact_email text not null,
  created_at timestamptz not null default now(),
  constraint agencies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index if not exists agencies_slug_lower_idx on public.agencies (lower(slug));

comment on table public.agencies is 'Travel agency tenants; referenced from profiles and data rows.';

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  agency_id uuid references public.agencies (id) on delete set null,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists profiles_agency_id_idx on public.profiles (agency_id);

comment on table public.profiles is 'One row per auth user; agency_id scopes CRM data. is_platform_admin manages agencies and sees all rows.';

-- Link existing bookings / banking to an agency when set on the user profile.
alter table public.bookings
  add column if not exists agency_id uuid references public.agencies (id) on delete set null;

create index if not exists bookings_agency_id_idx on public.bookings (agency_id);

alter table public.banking_accounts
  add column if not exists agency_id uuid references public.agencies (id) on delete set null;

create index if not exists banking_accounts_agency_id_idx on public.banking_accounts (agency_id);

-- New auth users get a profile row (SECURITY DEFINER bypasses RLS).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Requires permission on auth.users (Supabase typically allows this in SQL editor / db push).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this migration.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.agencies enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- Profiles: inserts only via trigger; no direct client insert/update (admins use SQL or future RPC).

drop policy if exists "agencies_select" on public.agencies;
create policy "agencies_select"
  on public.agencies for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_platform_admin = true
          or p.agency_id = agencies.id
        )
    )
  );

drop policy if exists "agencies_insert_admin" on public.agencies;
create policy "agencies_insert_admin"
  on public.agencies for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_platform_admin = true
    )
  );

drop policy if exists "agencies_update_admin" on public.agencies;
create policy "agencies_update_admin"
  on public.agencies for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_platform_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_platform_admin = true
    )
  );

drop policy if exists "agencies_delete_admin" on public.agencies;
create policy "agencies_delete_admin"
  on public.agencies for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_platform_admin = true
    )
  );

-- Bookings: same agency as profile, or platform admin, matched with IS NOT DISTINCT FROM for nulls.
drop policy if exists "garasho_authenticated_all" on public.bookings;
drop policy if exists "bookings_agency_access" on public.bookings;
create policy "bookings_agency_access"
  on public.bookings for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_platform_admin = true
    )
    or agency_id is not distinct from (
      select p.agency_id from public.profiles p where p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_platform_admin = true
    )
    or agency_id is not distinct from (
      select p.agency_id from public.profiles p where p.id = auth.uid()
    )
  );

drop policy if exists "garasho_authenticated_all" on public.banking_accounts;
drop policy if exists "banking_accounts_agency_access" on public.banking_accounts;
create policy "banking_accounts_agency_access"
  on public.banking_accounts for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_platform_admin = true
    )
    or agency_id is not distinct from (
      select p.agency_id from public.profiles p where p.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_platform_admin = true
    )
    or agency_id is not distinct from (
      select p.agency_id from public.profiles p where p.id = auth.uid()
    )
  );

drop policy if exists "garasho_authenticated_all" on public.booking_layovers;
drop policy if exists "booking_layovers_agency_access" on public.booking_layovers;
create policy "booking_layovers_agency_access"
  on public.booking_layovers for all
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.profiles p on p.id = auth.uid()
      where b.id = booking_layovers.booking_id
        and (
          p.is_platform_admin = true
          or b.agency_id is not distinct from p.agency_id
        )
    )
  )
  with check (
    exists (
      select 1
      from public.bookings b
      join public.profiles p on p.id = auth.uid()
      where b.id = booking_layovers.booking_id
        and (
          p.is_platform_admin = true
          or b.agency_id is not distinct from p.agency_id
        )
    )
  );

drop policy if exists "garasho_authenticated_all" on public.banking_account_ledger;
drop policy if exists "banking_ledger_agency_access" on public.banking_account_ledger;
create policy "banking_ledger_agency_access"
  on public.banking_account_ledger for all
  to authenticated
  using (
    exists (
      select 1
      from public.banking_accounts ba
      join public.profiles p on p.id = auth.uid()
      where ba.id = banking_account_ledger.banking_account_id
        and (
          p.is_platform_admin = true
          or ba.agency_id is not distinct from p.agency_id
        )
    )
  )
  with check (
    exists (
      select 1
      from public.banking_accounts ba
      join public.profiles p on p.id = auth.uid()
      where ba.id = banking_account_ledger.banking_account_id
        and (
          p.is_platform_admin = true
          or ba.agency_id is not distinct from p.agency_id
        )
    )
  );

comment on column public.bookings.agency_id is 'Tenant scope; must match the creating user profile agency_id.';
comment on column public.banking_accounts.agency_id is 'Tenant scope; must match the creating user profile agency_id.';
