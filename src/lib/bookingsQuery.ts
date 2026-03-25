import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Core booking columns for dashboard / CRM. Extend when adding fields.
 */
export const BOOKINGS_SELECT_BASE =
  "id, traveler_name, destination, destination_city, departure_date, selling_price, net_cost, include_price, status, passport_expiry_date, visa_services_enabled, visa_status, visa_service_fee";

/**
 * Join-ready select: pulls optional schedule/seat rows from `airline_trips` when `airline_trip_id` is set.
 * Falls back to a non-join select if the relationship is unavailable (older DBs).
 */
export async function fetchBookingsWithOptionalTripJoin(client: SupabaseClient) {
  const withTrip = await client
    .from("bookings")
    .select(
      `${BOOKINGS_SELECT_BASE}, airline_trips ( id, flight_number, scheduled_departure, available_seats )`
    )
    .order("departure_date", { ascending: true, nullsFirst: false });

  if (!withTrip.error) {
    return { data: withTrip.data, error: null as null, joined: true as const };
  }

  const basic = await client
    .from("bookings")
    .select(BOOKINGS_SELECT_BASE)
    .order("departure_date", { ascending: true, nullsFirst: false });

  if (!basic.error) {
    return { data: basic.data, error: null as null, joined: false as const };
  }

  const legacy = await client
    .from("bookings")
    .select("id, traveler_name, destination, departure_date, status")
    .order("departure_date", { ascending: true, nullsFirst: false });

  return { data: legacy.data, error: legacy.error, joined: false as const };
}

export function formatSupabaseUserMessage(raw: string): string {
  const m = raw.trim();
  if (!m) return "Something went wrong. Please try again.";
  if (/invalid.*date|date format|_date/i.test(m)) {
    return "Invalid date — check passport or departure dates.";
  }
  if (/passport|constraint|check/i.test(m)) {
    return "Could not save traveler details. Check passport and date fields.";
  }
  if (/violates foreign key|foreign key/i.test(m)) {
    return "Linked record not found. Refresh and try again.";
  }
  if (/permission|RLS|policy/i.test(m)) {
    return "You don’t have permission to save this record.";
  }
  return m.length > 120 ? `${m.slice(0, 117)}…` : m;
}
