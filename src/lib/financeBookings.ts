import type { SupabaseClient } from "@supabase/supabase-js";

/** Row shape for revenue / profit reporting (dashboard + /dashboard/finance). */
export type FinanceBookingRow = {
  id: string;
  traveler_name: string;
  destination: string | null;
  destination_city: string | null;
  departure_date: string | null;
  /** When the ticket row was created — best for “sold this month”. May be missing on old DBs. */
  created_at: string | null;
  selling_price: number | null;
  net_cost: number | null;
  include_price: boolean | null;
  status: string;
  passport_expiry_date: string | null;
  visa_services_enabled: boolean | null;
  visa_status: string | null;
  visa_service_fee: number | null;
};

function rowToFinance(raw: Record<string, unknown>): FinanceBookingRow {
  return {
    id: String(raw.id),
    traveler_name: String(raw.traveler_name ?? ""),
    destination: (raw.destination as string | null) ?? null,
    destination_city: (raw.destination_city as string | null) ?? null,
    departure_date: (raw.departure_date as string | null) ?? null,
    created_at: raw.created_at != null ? String(raw.created_at) : null,
    selling_price: raw.selling_price != null ? Number(raw.selling_price) : null,
    net_cost: raw.net_cost != null ? Number(raw.net_cost) : null,
    include_price: (raw.include_price as boolean | null) ?? null,
    status: String(raw.status ?? "upcoming"),
    passport_expiry_date: (raw.passport_expiry_date as string | null) ?? null,
    visa_services_enabled: (raw.visa_services_enabled as boolean | null) ?? null,
    visa_status: (raw.visa_status as string | null) ?? null,
    visa_service_fee: raw.visa_service_fee != null ? Number(raw.visa_service_fee) : null,
  };
}

const FINANCE_SELECT_FULL =
  "id, traveler_name, destination_city, destination, departure_date, created_at, selling_price, net_cost, include_price, status, passport_expiry_date, visa_services_enabled, visa_status, visa_service_fee";

const FINANCE_SELECT_NO_CREATED =
  "id, traveler_name, destination_city, destination, departure_date, selling_price, net_cost, include_price, status, passport_expiry_date, visa_services_enabled, visa_status, visa_service_fee";

const FINANCE_SELECT_MINIMAL =
  "id, traveler_name, destination_city, destination, departure_date, selling_price, net_cost, status, passport_expiry_date, visa_services_enabled, visa_status";

export type FinanceFetchMeta = {
  /** Which date field defines “sold in this month” for metrics. */
  soldDateField: "created_at" | "departure_date";
};

/**
 * Loads bookings for finance metrics. Prefers `created_at` for “sold in month”; falls back to
 * narrower selects when optional columns are missing.
 */
export async function fetchBookingsForFinance(
  client: SupabaseClient
): Promise<{ data: FinanceBookingRow[]; error: Error | null; meta: FinanceFetchMeta }> {
  let res = await client.from("bookings").select(FINANCE_SELECT_FULL).order("created_at", {
    ascending: false,
    nullsFirst: false,
  });

  if (!res.error) {
    const list = (res.data as Record<string, unknown>[]) ?? [];
    return {
      data: list.map(rowToFinance),
      error: null,
      meta: { soldDateField: "created_at" },
    };
  }

  const resMid = await client.from("bookings").select(FINANCE_SELECT_NO_CREATED).order("departure_date", {
    ascending: false,
    nullsFirst: false,
  });

  if (!resMid.error) {
    const list = (resMid.data as Record<string, unknown>[]) ?? [];
    return {
      data: list.map(rowToFinance),
      error: null,
      meta: { soldDateField: "departure_date" },
    };
  }

  const resMin = await client.from("bookings").select(FINANCE_SELECT_MINIMAL).order("departure_date", {
    ascending: false,
    nullsFirst: false,
  });

  if (resMin.error) {
    return {
      data: [],
      error: new Error(resMin.error.message ?? "Could not load bookings."),
      meta: { soldDateField: "departure_date" },
    };
  }

  const list = (resMin.data as Record<string, unknown>[]) ?? [];
  return {
    data: list.map(rowToFinance),
    error: null,
    meta: { soldDateField: "departure_date" },
  };
}

/** Whether a booking “counts” for a calendar month (local time). Uses created_at when present, else departure_date. */
export function bookingSoldInLocalMonth(
  b: FinanceBookingRow,
  year: number,
  monthIndex0: number
): boolean {
  if (b.status === "cancelled") return false;
  const created = b.created_at?.trim();
  if (created) {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) {
      return d.getFullYear() === year && d.getMonth() === monthIndex0;
    }
  }
  const dep = b.departure_date?.trim()?.slice(0, 10);
  if (!dep) return false;
  const d2 = new Date(dep + "T12:00:00");
  if (Number.isNaN(d2.getTime())) return false;
  return d2.getFullYear() === year && d2.getMonth() === monthIndex0;
}

export function revenueForBooking(b: FinanceBookingRow): number {
  if (b.status === "cancelled") return 0;
  if (b.selling_price == null || Number.isNaN(b.selling_price)) return 0;
  return b.selling_price;
}

export function profitForBooking(b: FinanceBookingRow): number {
  if (b.status === "cancelled") return 0;
  const sell = b.selling_price != null && !Number.isNaN(b.selling_price) ? b.selling_price : 0;
  const net = b.net_cost != null && !Number.isNaN(b.net_cost) ? b.net_cost : 0;
  return sell - net;
}

export function sumMonthlyRevenue(rows: FinanceBookingRow[], year: number, monthIndex0: number): number {
  return rows.reduce((sum, b) => {
    if (!bookingSoldInLocalMonth(b, year, monthIndex0)) return sum;
    return sum + revenueForBooking(b);
  }, 0);
}

export function sumMonthlyProfit(rows: FinanceBookingRow[], year: number, monthIndex0: number): number {
  return rows.reduce((sum, b) => {
    if (!bookingSoldInLocalMonth(b, year, monthIndex0)) return sum;
    return sum + profitForBooking(b);
  }, 0);
}

export function bookingsSoldInMonth(
  rows: FinanceBookingRow[],
  year: number,
  monthIndex0: number
): FinanceBookingRow[] {
  return rows.filter((b) => bookingSoldInLocalMonth(b, year, monthIndex0));
}

export function countVisaCasesInMonth(
  rows: FinanceBookingRow[],
  year: number,
  monthIndex0: number
): number {
  return rows.filter(
    (b) =>
      bookingSoldInLocalMonth(b, year, monthIndex0) &&
      b.visa_services_enabled &&
      b.visa_status &&
      b.visa_status !== "Approved"
  ).length;
}

export function sumVisaFeesInMonth(
  rows: FinanceBookingRow[],
  year: number,
  monthIndex0: number
): number {
  return rows.reduce((sum, b) => {
    if (!bookingSoldInLocalMonth(b, year, monthIndex0)) return sum;
    if (!b.visa_services_enabled) return sum;
    const vf = b.visa_service_fee;
    if (vf == null || Number.isNaN(vf)) return sum;
    return sum + vf;
  }, 0);
}
