-- Audit columns for tickets (when added / last edited). Optional trigger keeps updated_at fresh.

alter table public.bookings
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

comment on column public.bookings.created_at is 'When this booking row was first created.';
comment on column public.bookings.updated_at is 'Last modification time (any column, including visa fields).';

create or replace function public.garasho_bookings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists garasho_bookings_touch_updated_at on public.bookings;
create trigger garasho_bookings_touch_updated_at
  before update on public.bookings
  for each row
  execute procedure public.garasho_bookings_touch_updated_at();
