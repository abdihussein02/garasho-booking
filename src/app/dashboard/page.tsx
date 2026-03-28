"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { useToast } from "@/components/providers/ToastProvider";
import { readAgencyBrandingFromStorage } from "@/lib/agencyBranding";
import { formatConfirmationCode } from "@/lib/bookingConfirmation";
import { formatIsoDateDisplay } from "@/lib/dateFormats";
import {
  fetchBookingsForFinance,
  profitForBooking,
  revenueForBooking,
  sumMonthlyProfit,
  sumMonthlyRevenue,
  type FinanceBookingRow,
} from "@/lib/financeBookings";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Booking = FinanceBookingRow;

/** Passport expiry date is between today and six months from now (renewal window). */
function passportExpiringWithinSixMonths(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const exp = new Date(iso);
  if (Number.isNaN(exp.getTime())) return false;
  const now = new Date();
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + 6);
  return exp >= now && exp <= horizon;
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [totalLiquidity, setTotalLiquidity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentName, setAgentName] = useState("Agent");
  const [agencyLabel, setAgencyLabel] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAgencyLabel(readAgencyBrandingFromStorage().name);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/auth");
          return;
        }
        const userEmail = session.user.email?.toLowerCase();
        const fullName =
          String(session.user.user_metadata?.full_name ?? "").trim() ||
          String(session.user.user_metadata?.name ?? "").trim();
        const emailPrefix = userEmail ? userEmail.split("@")[0] : "Agent";
        setAgentName(fullName || emailPrefix || "Agent");

        await supabase.auth.refreshSession().catch(() => {});

        const { data, error } = await fetchBookingsForFinance(supabase);
        if (error) throw error;

        const rows = [...data].sort((a, b) => {
          const aDate = a.departure_date;
          const bDate = b.departure_date;
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return aDate.localeCompare(bDate);
        });
        setBookings(rows);

        let liq = await supabase.from("banking_accounts").select("current_balance");
        if (liq.error) {
          liq = await supabase.from("banking_accounts").select("balance");
        }
        if (!liq.error && liq.data != null) {
          const sum = (liq.data as Record<string, unknown>[]).reduce((s, row) => {
            const v = row.current_balance ?? row.balance;
            return s + (Number(v) || 0);
          }, 0);
          setTotalLiquidity(sum);
        } else {
          setTotalLiquidity(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load dashboard data.";
        toast("error", msg.length > 120 ? `${msg.slice(0, 117)}…` : msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, toast]);

  function getDestination(booking: Booking) {
    return booking.destination_city || booking.destination || "-";
  }

  function getDepartureDateDisplay(booking: Booking) {
    const d = formatIsoDateDisplay(booking.departure_date);
    return d === "—" ? "-" : d;
  }

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const salesThisMonth = sumMonthlyRevenue(bookings, currentYear, currentMonth);

  const profitThisMonth = sumMonthlyProfit(bookings, currentYear, currentMonth);

  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
  const financeMonthHref = `/dashboard/finance?month=${encodeURIComponent(currentMonthKey)}`;

  const activeVisas = useMemo(() => {
    return bookings.filter(
      (b) =>
        b.visa_services_enabled &&
        b.visa_status &&
        b.visa_status !== "Approved"
    ).length;
  }, [bookings]);

  const passportWatch = useMemo(() => {
    return bookings.filter((b) => passportExpiringWithinSixMonths(b.passport_expiry_date));
  }, [bookings]);

  const recentBookings = bookings.slice(0, 5);

  const totalSellingSum = useMemo(
    () => bookings.reduce((sum, b) => sum + revenueForBooking(b), 0),
    [bookings]
  );
  /** All-time profit (non-cancelled): selling − net cost. */
  const portfolioProfit = useMemo(
    () => bookings.reduce((sum, b) => sum + profitForBooking(b), 0),
    [bookings]
  );
  const chartMax = Math.max(totalSellingSum, Math.abs(portfolioProfit), 1);

  function getPaymentBadge(status: string) {
    if (status === "completed") return "Paid";
    if (status === "cancelled") return "Cancelled";
    return "Pending";
  }

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <AgencySidebar />

      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#0f172a] sm:text-2xl">
              Command center
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {agencyLabel ? (
                <>
                  <span className="font-medium text-slate-800">{agencyLabel}</span> — tickets, travelers, visas,
                  banking, and branding in one workspace.
                </>
              ) : (
                <>Tickets, travelers, visas, treasury, and branding — your agency&apos;s one stop shop.</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/tickets"
              className="inline-flex items-center rounded-lg bg-[#0f172a] px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              New ticket
            </Link>
            <Link
              href="/dashboard/tickets/history"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              All tickets
            </Link>
            <Link
              href="/dashboard/visa"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Visa
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Settings
            </Link>
            <Link
              href="/dashboard/accounts"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Banking
            </Link>
            <Link
              href="/dashboard/team"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Team
            </Link>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-[#0f172a] via-slate-900 to-slate-800 px-6 py-6 text-white shadow-xl sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/90">
            GARASHO · Prime Time
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome back, {agentName}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            Record tickets, print itineraries, track visas, and reconcile deposits — without switching tools.
          </p>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href={`${financeMonthHref}#revenue`}
            className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-sky-300/80 hover:shadow-md"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Monthly sales
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-[#0f172a]">
              ${salesThisMonth.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Revenue from tickets first saved this month — click for detail
            </p>
            <p className="mt-2 text-[11px] font-medium text-sky-700 opacity-0 transition group-hover:opacity-100">
              Open finance report →
            </p>
          </Link>
          <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Active visas
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-[#0f172a]">
              {activeVisas}
            </p>
            <p className="mt-1 text-xs text-slate-500">Cases in progress (not yet approved)</p>
          </article>
          <Link
            href={`${financeMonthHref}#profit`}
            className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-emerald-300/80 hover:shadow-md"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Monthly profit
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-[#0f172a]">
              {loading
                ? "—"
                : `$${profitThisMonth.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Selling price − net cost for tickets saved this month — click for detail
            </p>
            <p className="mt-2 text-[11px] font-medium text-emerald-800 opacity-0 transition group-hover:opacity-100">
              Open finance report →
            </p>
          </Link>
          <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Total liquid assets
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-[#0f172a]">
              {loading || totalLiquidity === null
                ? "—"
                : `$${totalLiquidity.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}`}
            </p>
            <p className="mt-1 text-xs text-slate-500">Live sum of all banking_accounts balances</p>
          </article>
        </section>

        <div className="mb-6 overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/40 shadow-sm">
          <div className="border-b border-amber-200/60 bg-amber-50/80 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">
              Passport watch
            </p>
            <p className="mt-0.5 text-[11px] text-amber-900/80">
              Travelers whose passport expires within the next six months
            </p>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-600">Loading…</div>
          ) : passportWatch.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-600">
              No passports in the 6-month renewal window.
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Traveler</th>
                  <th className="px-4 py-2">Passport expires</th>
                  <th className="px-4 py-2">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100/90 bg-white text-xs sm:text-sm">
                {passportWatch.map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-900">
                      {b.traveler_name}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {formatIsoDateDisplay(b.passport_expiry_date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                        Renew soon
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Recent activity</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Click a row to edit the ticket. Search everything in{" "}
              <Link href="/dashboard/tickets/history" className="font-medium text-[#0f172a] underline-offset-2 hover:underline">
                All tickets
              </Link>
              .
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                Loading activity...
              </div>
            ) : recentBookings.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                No bookings yet.{" "}
                <Link
                  href="/dashboard/tickets"
                  className="font-medium text-[#0f172a] underline-offset-2 hover:underline"
                >
                  Create your first ticket.
                </Link>
              </div>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Confirmation</th>
                    <th className="px-4 py-3">Traveler</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Trip</th>
                    <th className="px-4 py-3">Visa</th>
                    <th className="px-4 py-3">Documents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {recentBookings.map((b) => (
                    <tr
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        router.push(`/dashboard/tickets?edit=${encodeURIComponent(b.id)}`)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/dashboard/tickets?edit=${encodeURIComponent(b.id)}`);
                        }
                      }}
                      className="cursor-pointer hover:bg-slate-50/70"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[10px] text-slate-600">
                        {formatConfirmationCode(b.id)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {b.traveler_name}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{getDestination(b)}</td>
                      <td className="px-4 py-3 text-slate-600">{getDepartureDateDisplay(b)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            b.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                              : b.status === "upcoming"
                                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                                : "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                          }`}
                        >
                          {getPaymentBadge(b.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {b.visa_services_enabled && b.visa_status ? (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                              b.visa_status === "Approved"
                                ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
                                : b.visa_status === "Submitted"
                                  ? "bg-sky-50 text-sky-800 ring-sky-100"
                                  : "bg-amber-50 text-amber-900 ring-amber-100"
                            }`}
                          >
                            {b.visa_status}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/itinerary/${b.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Itinerary
                          </Link>
                          <Link
                            href={`/dashboard/receipt/${b.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Receipt
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {!loading && bookings.length > 0 ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Revenue vs. profit
            </p>
            <p className="mt-1 text-sm font-semibold text-[#0f172a]">Portfolio snapshot</p>
            <p className="mt-1 text-xs text-slate-500">
              All-time totals (non-cancelled): revenue is sum of selling prices; profit is selling price
              minus net cost per ticket. Monthly figures are on the{" "}
              <Link href={financeMonthHref} className="font-medium text-[#0f172a] underline-offset-2 hover:underline">
                finance report
              </Link>
              .
            </p>
            <div className="mt-6 flex h-44 items-end justify-center gap-8 sm:gap-16">
              <div className="flex w-24 flex-col items-center gap-2 sm:w-32">
                <div className="flex h-36 w-full items-end justify-center rounded-t-lg bg-slate-100/90">
                  <div
                    className="w-full max-w-[5rem] rounded-t-md bg-slate-500/90"
                    style={{
                      height: `${Math.max(8, (totalSellingSum / chartMax) * 100)}%`,
                      minHeight: "0.5rem",
                    }}
                    title={`$${totalSellingSum.toLocaleString()}`}
                  />
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Revenue
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#0f172a]">
                    ${totalSellingSum.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex w-24 flex-col items-center gap-2 sm:w-32">
                <div className="flex h-36 w-full items-end justify-center rounded-t-lg bg-slate-100/90">
                  <div
                    className={`w-full max-w-[5rem] rounded-t-md ${
                      portfolioProfit >= 0 ? "bg-emerald-600/85" : "bg-rose-500/80"
                    }`}
                    style={{
                      height: `${Math.max(8, (Math.abs(portfolioProfit) / chartMax) * 100)}%`,
                      minHeight: "0.5rem",
                    }}
                    title={`$${portfolioProfit.toLocaleString()}`}
                  />
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Profit
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#0f172a]">
                    ${portfolioProfit.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
