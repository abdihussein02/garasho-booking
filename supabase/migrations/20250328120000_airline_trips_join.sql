-- Future airline schedule / seat data; optional FK from bookings for join queries.

create table if not exists public.airline_trips (
  id uuid primary key default gen_random_uuid(),
  airline_code text,
  flight_number text,
  scheduled_departure timestamptz,
  available_seats int,
  created_at timestamptz default now()
);

alter table public.bookings
  add column if not exists airline_trip_id uuid references public.airline_trips (id);

create index if not exists bookings_airline_trip_id_idx on public.bookings (airline_trip_id);
