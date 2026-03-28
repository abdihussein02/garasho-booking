"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { BackButton } from "@/components/BackButton";
import { useToast } from "@/components/providers/ToastProvider";
import { formatConfirmationCode } from "@/lib/bookingConfirmation";
import { formatIsoDateDisplay } from "@/lib/dateFormats";
import {
  bookingSoldInLocalMonth,
  bookingsSoldInMonth,
  countVisaCasesInMonth,
  fetchBookingsForFinance,
  type FinanceBookingRow,
  profitForBooking,
  revenueForBooking,
  sumMonthlyProfit,
  sumMonthlyRevenue,
  sumVisaFeesInMonth,
} from "@/lib/financeBookings";
import { formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatMonthLabel(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function monthKey(year: number, monthIndex0: number) {
  return `${year}-${pad2(monthIndex0 + 1)}`;
}

function parseMonthKey(raw: string | null): { y: number; m0: number } | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const [ys, ms] = raw.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  return { y, m0: mo - 1 };
}

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function FinancePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [rows, setRows] = useState<FinanceBookingRow[]>([]);
  const [soldDateField, setSoldDateField] = useState<"created_at" | "departure_date">("created_at");
  const [loading, setLoading] = useState(true);

  const monthFromUrl = parseMonthKey(searchParams.get("month"));
  const { y: year, m0: monthIndex0 } = monthFromUrl ?? {
    y: new Date().getFullYear(),
    m0: new Date().getMonth(),
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/auth");
        return;
      }
      await supabase.auth.refreshSession().catch(() => {});

      const { data, error, meta } = await fetchBookingsForFinance(supabase);
      if (error) throw error;
      setRows(data);
      setSoldDateField(meta.soldDateField);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load finance data.";
      toast("error", formatSupabaseUserMessage(msg));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const inMonth = useMemo(
    () => bookingsSoldInMonth(rows, year, monthIndex0),
    [rows, year, monthIndex0]
  );

  const revenue = useMemo(
    () => sumMonthlyRevenue(rows, year, monthIndex0),
    [rows, year, monthIndex0]
  );

  const profit = useMemo(() => sumMonthlyProfit(rows, year, monthIndex0), [rows, year, monthIndex0]);

  const visaFees = useMemo(
    () => sumVisaFeesInMonth(rows, year, monthIndex0),
    [rows, year, monthIndex0]
  );

  const activeVisaCases = useMemo(
    () => countVisaCasesInMonth(rows, year, monthIndex0),
    [rows, year, monthIndex0]
  );

  function goMonth(delta: number) {
    const d = new Date(year, monthIndex0 + delta, 1);
    const next = monthKey(d.getFullYear(), d.getMonth());
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("month", next);
    router.push(`/dashboard/finance?${sp.toString()}`);
  }

  const soldLabel = (b: FinanceBookingRow) => {
    if (soldDateField === "created_at" && b.created_at?.trim()) {
      return formatIsoDateDisplay(b.created_at.slice(0, 10));
    }
    return formatIsoDateDisplay(b.departure_date);
  };

  const soldHint =
    soldDateField === "created_at"
      ? "Revenue and profit use tickets first saved in this month (created date)."
      : "Your database has no created-at column on tickets yet — months use departure date. Run the bookings timestamps migration for sale-accurate months.";

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <AgencySidebar />
      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">Finance</p>
              <h1 className="mt-1 text-xl font-semibold text-[#0f172a] sm:text-2xl">Revenue &amp; profit</h1>
              <p className="mt-1 text-sm text-slate-600">
                Ticket and visa-linked totals for the selected month. Cancelled tickets are excluded.
              </p>
            </div>
            <BackButton className="px-3 py-2" fallbackHref="/dashboard" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-white"
              >
                ← Prev
              </button>
              <span className="min-w-[10rem] text-center text-sm font-semibold text-[#0f172a]">
                {formatMonthLabel(year, monthIndex0)}
              </span>
              <button
                type="button"
                onClick={() => goMonth(1)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-white"
              >
                Next →
              </button>
            </div>
            <Link
              href="/dashboard/tickets/history"
              className="text-sm font-medium text-sky-700 underline-offset-2 hover:underline"
            >
              All tickets
            </Link>
          </div>

          {soldDateField === "departure_date" ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {soldHint}
            </p>
          ) : (
            <p className="text-xs text-slate-500">{soldHint}</p>
          )}

          {loading ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : (
            <>
              <div id="revenue" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Monthly revenue
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-[#0f172a]">{money(revenue)}</p>
                  <p className="mt-1 text-xs text-slate-500">Selling price total (this month)</p>
                </article>
                <article id="profit" className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Monthly profit
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-[#0f172a]">{money(profit)}</p>
                  <p className="mt-1 text-xs text-slate-500">Selling price − net cost (this month)</p>
                </article>
                <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Tickets sold
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-[#0f172a]">{inMonth.length}</p>
                  <p className="mt-1 text-xs text-slate-500">Non-cancelled in month</p>
                </article>
                <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Visa (month)
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-[#0f172a]">{activeVisaCases}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Active cases · Fees {money(visaFees)}
                  </p>
                </article>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Tickets in {formatMonthLabel(year, monthIndex0)}
                  </p>
                </div>
                {inMonth.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">
                    No ticket revenue in this month with the current date rules.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-white text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Confirmation</th>
                          <th className="px-4 py-3">Traveler</th>
                          <th className="px-4 py-3">Destination</th>
                          <th className="px-4 py-3">{soldDateField === "created_at" ? "Sold" : "Departure"}</th>
                          <th className="px-4 py-3 text-right">Revenue</th>
                          <th className="px-4 py-3 text-right">Net cost</th>
                          <th className="px-4 py-3 text-right">Profit</th>
                          <th className="px-4 py-3">Visa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {inMonth.map((b) => {
                          const dest = b.destination_city?.trim() || b.destination?.trim() || "—";
                          const rev = revenueForBooking(b);
                          const net = b.net_cost != null && !Number.isNaN(b.net_cost) ? b.net_cost : null;
                          const p = profitForBooking(b);
                          return (
                            <tr key={b.id} className="hover:bg-slate-50/80">
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-[10px] text-slate-600">
                                <Link
                                  href={`/dashboard/tickets/${b.id}`}
                                  className="font-medium text-[#0f172a] underline-offset-2 hover:underline"
                                >
                                  {formatConfirmationCode(b.id)}
                                </Link>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-900">{b.traveler_name}</td>
                              <td className="px-4 py-3 text-slate-700">{dest}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{soldLabel(b)}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
                                {money(rev)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                                {net != null ? money(net) : "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium text-[#0f172a]">
                                {money(p)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                                {b.visa_services_enabled ? (
                                  <span>
                                    {b.visa_status ?? "—"}
                                    {b.visa_service_fee != null && !Number.isNaN(b.visa_service_fee)
                                      ? ` · ${money(b.visa_service_fee)}`
                                      : ""}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function FinancePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen bg-slate-100/80">
          <AgencySidebar />
          <section className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">
            Loading finance…
          </section>
        </main>
      }
    >
      <FinancePageInner />
    </Suspense>
  );
}
