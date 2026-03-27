-- Free-text notes on bookings (used by Tickets flow, itinerary, receipts).

alter table public.bookings
  add column if not exists notes text;
