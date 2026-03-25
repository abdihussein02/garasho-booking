"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchBookingsWithOptionalTripJoin } from "@/lib/bookingsQuery";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Booking = {
  id: string;
  traveler_name: string;
  destination: string | null;
  destination_city: string | null;
  departure_date: string | null;
  selling_price: number | null;
  net_cost: number | null;
  include_price: boolean | null;
  status: "upcoming" | "completed" | "cancelled";
  passport_expiry_date?: string | null;
  visa_services_enabled?: boolean | null;
  visa_status?: string | null;
};

function normalizeRow(raw: Record<string, unknown>): Booking {
  return {
    id: String(raw.id),
    traveler_name: String(raw.traveler_name ?? ""),
    destination: (raw.destination as string | null) ?? null,
    destination_city: (raw.destination_city as string | null) ?? null,
    departure_date: (raw.departure_date as string | null) ?? null,
    selling_price: raw.selling_price != null ? Number(raw.selling_price) : null,
    net_cost: raw.net_cost != null ? Number(raw.net_cost) : null,
    include_price: (raw.include_price as boolean | null) ?? null,
    status: (raw.status ?? "upcoming") as Booking["status"],
    passport_expiry_date: (raw.passport_expiry_date as string | null) ?? null,
    visa_services_enabled: (raw.visa_services_enabled as boolean | null) ?? null,
    visa_status: (raw.visa_status as string | null) ?? null,
  };
}

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

const navLink =
  "flex items-center rounded-lg px-3 py-2 text-slate-700 transition hover:bg-slate-100";
const navLinkActive =
  "flex items-center justify-between rounded-lg bg-[#0f172a]/5 px-3 py-2 font-medium text-[#0f172a] ring-1 ring-[#0f172a]/10";

export default function DashboardPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [totalLiquidity, setTotalLiquidity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentName, setAgentName] = useState("Agent");
  const router = useRouter();

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

        const { data, error } = await fetchBookingsWithOptionalTripJoin(supabase);
        if (error) throw error;

        const rows = ((data as Record<string, unknown>[]) ?? []).map((r) => normalizeRow(r));
        rows.sort((a, b) => {
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
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/auth");
  }

  function getDestination(booking: Booking) {
    return booking.destination_city || booking.destination || "-";
  }

  function getDepartureDateDisplay(booking: Booking) {
    return booking.departure_date || "-";
  }

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const salesThisMonth = bookings.reduce((sum, booking) => {
    const dateString = booking.departure_date;
    if (!dateString || booking.selling_price === null) return sum;
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return sum;
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      ? sum + booking.selling_price
      : sum;
  }, 0);

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
    () =>
      bookings.reduce((sum, b) => sum + (b.selling_price != null ? b.selling_price : 0), 0),
    [bookings]
  );
  /** Sum of (selling price − net cost) per booking. */
  const portfolioProfit = useMemo(
    () =>
      bookings.reduce((sum, b) => {
        const sell = b.selling_price != null ? b.selling_price : 0;
        const net = b.net_cost != null ? b.net_cost : 0;
        return sum + (sell - net);
      }, 0),
    [bookings]
  );
  const chartMax = Math.max(totalSellingSum, Math.abs(portfolioProfit), 1);

  function getPaymentBadge(status: Booking["status"]) {
    if (status === "completed") return "Paid";
    if (status === "cancelled") return "Cancelled";
    return "Pending";
  }

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <aside className="hidden w-64 flex-col border-r border-slate-200/90 bg-white p-6 shadow-sm sm:flex">
        <div className="mb-8">
          <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[#0f172a]">
            GARASHO
          </p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Prime Time
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900">Agency OS</p>
        </div>
        <nav className="space-y-1 text-sm">
          <Link href="/dashboard" className={navLinkActive}>
            Overview
            <span className="rounded-full bg-[#0f172a]/10 px-2 text-[10px] font-semibold text-[#0f172a]">
              CRM
            </span>
          </Link>
          <Link href="/bookings/new" className={navLink}>
            New booking
          </Link>
          <Link href="/settings" className={navLink}>
            Settings
          </Link>
          <Link href="/dashboard/accounts" className={navLink}>
            Banking
          </Link>
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-auto inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Logout
        </button>
      </aside>

      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#0f172a] sm:text-2xl">
              Command center
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              East African agencies — bookings, visas, and liquidity in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/bookings/new"
              className="inline-flex items-center rounded-lg bg-[#0f172a] px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              New booking
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
            Built for high-volume agency teams across the Horn and East Africa.
          </p>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Monthly sales
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-[#0f172a]">
              ${salesThisMonth.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">Trip revenue this calendar month</p>
          </article>
          <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Active visas
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-[#0f172a]">
              {activeVisas}
            </p>
            <p className="mt-1 text-xs text-slate-500">Cases in progress (not yet approved)</p>
          </article>
          <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Total profit
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-[#0f172a]">
              {loading
                ? "—"
                : `$${portfolioProfit.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Live from Supabase: selling price minus net cost, all bookings
            </p>
          </article>
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
                      {b.passport_expiry_date || "—"}
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
          <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            Recent activity
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
                  href="/bookings/new"
                  className="font-medium text-[#0f172a] underline-offset-2 hover:underline"
                >
                  Create your first booking.
                </Link>
              </div>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
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
                    <tr key={b.id} className="hover:bg-slate-50/70">
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
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/itinerary/${b.id}`}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Itinerary
                          </Link>
                          <Link
                            href={`/dashboard/receipt/${b.id}`}
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
              Revenue is the sum of selling prices; profit matches the Total profit card (selling
              price − net cost per booking).
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
