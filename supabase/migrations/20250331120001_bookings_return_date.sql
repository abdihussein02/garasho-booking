-- Optional return / round-trip date (legacy inserts send null when unused).

alter table public.bookings
  add column if not exists return_date date;
