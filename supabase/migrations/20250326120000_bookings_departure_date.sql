-- Canonical flight date column (aligns with app inserts from /bookings/new).

alter table public.bookings
  add column if not exists departure_date date;
