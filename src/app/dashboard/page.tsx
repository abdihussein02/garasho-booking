"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
};

type LegacyBookingRow = {
  id: string;
  traveler_name: string;
  destination: string | null;
  departure_date: string | null;
  status: "upcoming" | "completed" | "cancelled" | null;
};

export default function DashboardPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
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
        const ownerEmail = process.env.NEXT_PUBLIC_OWNER_EMAIL?.toLowerCase();
        const userRole = String(session.user.user_metadata?.role ?? "").toLowerCase();
        const userEmail = session.user.email?.toLowerCase();
        const fullName =
          String(session.user.user_metadata?.full_name ?? "").trim() ||
          String(session.user.user_metadata?.name ?? "").trim();
        const emailPrefix = userEmail ? userEmail.split("@")[0] : "Agent";
        setAgentName(fullName || emailPrefix || "Agent");
        setIsOwner(Boolean(userRole === "owner" || (ownerEmail && userEmail === ownerEmail)));

        const primaryQuery = await supabase
          .from("bookings")
          .select(
            "id, traveler_name, destination, destination_city, departure_date, selling_price, net_cost, include_price, status"
          )
          .order("departure_date", { ascending: true, nullsFirst: false });

        let rows: Booking[] = [];

        if (!primaryQuery.error) {
          rows = ((primaryQuery.data as Booking[]) ?? []).slice();
        } else {
          // Fallback for older schemas where newer columns are not available yet.
          const fallbackQuery = await supabase
            .from("bookings")
            .select("id, traveler_name, destination, departure_date, status")
            .order("departure_date", { ascending: true, nullsFirst: false });

          if (fallbackQuery.error) {
            throw fallbackQuery.error;
          }

          rows = ((fallbackQuery.data as LegacyBookingRow[]) ?? []).map((row) => ({
            id: row.id,
            traveler_name: row.traveler_name,
            destination: row.destination,
            destination_city: null,
            departure_date: row.departure_date,
            selling_price: null,
            net_cost: null,
            include_price: null,
            status: (row.status ?? "upcoming") as "upcoming" | "completed" | "cancelled",
          }));
        }

        rows.sort((a, b) => {
          const aDate = a.departure_date;
          const bDate = b.departure_date;
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return aDate.localeCompare(bDate);
        });
        setBookings(rows);
      } catch (error) {
        // In a real app you would surface this
        console.error(error);
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

  function formatCurrency(value: number | null) {
    if (value === null || value === undefined) return "-";
    return `$${value.toLocaleString()}`;
  }

  function getProfit(booking: Booking) {
    if (booking.selling_price === null || booking.net_cost === null) return null;
    return booking.selling_price - booking.net_cost;
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

  const activeItineraries = bookings.filter((booking) => booking.status === "upcoming").length;
  const totalProfit = bookings.reduce((sum, booking) => {
    const p = getProfit(booking);
    return p === null ? sum : sum + p;
  }, 0);

  const recentBookings = bookings.slice(0, 5);

  function getPaymentBadge(status: Booking["status"]) {
    if (status === "completed") return "Paid";
    if (status === "cancelled") return "Cancelled";
    return "Pending";
  }

  return (
    <main className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white/80 p-6 backdrop-blur sm:flex">
        <div className="mb-8">
          <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-sky-600">
            GARASHO
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Agency Dashboard
          </p>
        </div>
        <nav className="space-y-1 text-sm">
          <Link
            href="/dashboard"
            className="flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 font-medium text-sky-700"
          >
            Overview
            <span className="rounded-full bg-sky-100 px-2 text-[10px] font-semibold">
              Bookings
            </span>
          </Link>
          <Link
            href="/bookings/new"
            className="flex items-center rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
          >
            New booking
          </Link>
          <Link
            href="/settings"
            className="flex items-center rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
          >
            Settings
          </Link>
          <Link
            href="/dashboard/accounts"
            className="flex items-center rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
          >
            Accounts
          </Link>
        </nav>
        <button
          onClick={handleLogout}
          className="mt-auto inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Logout
        </button>
      </aside>

      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Bookings overview
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              See all of your agency&apos;s upcoming and recent trips.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/bookings/new"
              className="inline-flex items-center rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
            >
              New booking
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Agency settings
            </Link>
            <Link
              href="/dashboard/accounts"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Accounts
            </Link>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-6 text-white shadow-xl shadow-slate-300/40 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Command Center
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Welcome back, {agentName}
          </h2>
          <p className="mt-2 text-sm text-slate-200">
            Monitor sales, manage itineraries, and keep your operations moving.
          </p>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Sales This Month
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">${salesThisMonth.toLocaleString()}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Active Itineraries
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{activeItineraries}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Total Profit
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {isOwner ? `$${totalProfit.toLocaleString()}` : "Restricted"}
            </p>
          </article>
        </section>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
            Recent Activity
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
                  className="font-medium text-sky-600 hover:text-sky-700"
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
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Documents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {recentBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {b.traveler_name}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {getDestination(b)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {getDepartureDateDisplay(b)}
                      </td>
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
      </section>
    </main>
  );
}

