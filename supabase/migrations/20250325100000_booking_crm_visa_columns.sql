-- Optional: add CRM / visa columns to bookings. Apply in Supabase SQL editor if not present.

alter table public.bookings
  add column if not exists traveler_phone text,
  add column if not exists passport_id_number text,
  add column if not exists passport_issue_date date,
  add column if not exists passport_expiry_date date,
  add column if not exists visa_services_enabled boolean default false,
  add column if not exists visa_destination text,
  add column if not exists visa_service_fee numeric,
  add column if not exists visa_status text;
