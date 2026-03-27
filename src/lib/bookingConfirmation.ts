import type { SupabaseClient } from "@supabase/supabase-js";

/** Human-readable confirmation reference derived from booking UUID (no extra DB column). */
export function formatConfirmationCode(bookingId: string): string {
  const compact = bookingId.replace(/-/g, "");
  return `GAR-${compact.slice(0, 10).toUpperCase()}`;
}

/** PostgREST / Supabase booking id (UUID v4). */
export const BOOKING_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `useParams().id` may be `string | string[]` depending on Next.js version. */
export function segmentIdFromParams(id: unknown): string {
  if (id == null) return "";
  if (Array.isArray(id)) return String(id[0] ?? "").trim();
  return String(id).trim();
}

/**
 * If the URL segment is not a UUID (e.g. user pasted GAR-XXXXXXXXXX), resolve by scanning ids.
 * Only runs when the segment is not already a valid UUID.
 */
export async function resolveBookingUuid(
  client: SupabaseClient,
  raw: string
): Promise<string | null> {
  const t = raw.trim();
  if (!t) return null;
  if (BOOKING_UUID_RE.test(t)) return t;

  const normalized = t.toUpperCase().replace(/^GAR-/, "").replace(/[^0-9A-F]/g, "");
  if (normalized.length < 4) return null;

  const { data, error } = await client.from("bookings").select("id");
  if (error || !data?.length) return null;

  const upperInput = t.toUpperCase();
  for (const row of data as { id: string }[]) {
    const id = String(row.id);
    const code = formatConfirmationCode(id).toUpperCase();
    const compact = code.replace(/^GAR-/, "");
    if (code === upperInput || formatConfirmationCode(id) === upperInput) return id;
    if (compact.startsWith(normalized.slice(0, 10)) && normalized.length >= 6) return id;
    if (compact.startsWith(normalized)) return id;
  }
  return null;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Match name, passport fields, full id, or confirmation code (partial ok). */
export function bookingMatchesTicketSearch(
  row: {
    id: string;
    traveler_name: string;
    passport_number?: string | null;
    passport_id_number?: string | null;
  },
  queryRaw: string
): boolean {
  const q = queryRaw.trim();
  if (!q) return true;
  const n = norm(q);
  const code = norm(formatConfirmationCode(row.id));
  const idn = norm(row.id);
  const idCompact = idn.replace(/-/g, "");
  const parts = [
    norm(row.traveler_name),
    norm(row.passport_number ?? ""),
    norm(row.passport_id_number ?? ""),
    idn,
    idCompact,
    code,
    code.replace(/^gar-/, ""),
  ];
  return parts.some((p) => p && (p.includes(n) || n.includes(p)));
}
