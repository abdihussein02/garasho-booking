/**
 * Somalia-friendly calendar dates: DD/MM/YYYY in the UI; ISO `YYYY-MM-DD` for Postgres `date`.
 */

/** Display-only: `YYYY-MM-DD` or DB date string → `DD/MM/YYYY`. */
export function formatIsoDateToDdMmYyyy(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "";
  const s = String(iso).trim().slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Parse strict `DD/MM/YYYY` → `YYYY-MM-DD`, or null if invalid. */
export function parseDdMmYyyyToIso(input: string): string | null {
  const t = input.trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (y < 1900 || y > 2200) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Accept ISO `YYYY-MM-DD` pasted in, or `DD/MM/YYYY`. */
export function parseFlexibleBookingDate(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return parseDdMmYyyyToIso(t);
}

/** Normalize DB `date` (may include time in some clients) to `YYYY-MM-DD`. */
export function isoDateFromDbValue(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return "";
}

/** Timestamps for “added / last edited” (en-GB aligns with DD/MM/YYYY). */
export function formatDateTimeDisplay(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Date-only for itinerary / tables (no time). */
export function formatIsoDateDisplay(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const s = String(iso).trim().slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
