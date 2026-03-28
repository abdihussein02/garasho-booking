"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { useToast } from "@/components/providers/ToastProvider";
import { bookingMatchesTicketSearch, formatConfirmationCode } from "@/lib/bookingConfirmation";
import { deleteBookingById } from "@/lib/bookingDelete";
import { formatIsoDateDisplay } from "@/lib/dateFormats";
import { fetchBookingsForHistory, formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { getSupabaseErrorMessage } from "@/lib/supabaseErrors";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  traveler_name: string;
  destination: string | null;
  destination_city: string | null;
  departure_date: string | null;
  status: string;
  selling_price: number | null;
  passport_number?: string | null;
  passport_id_number?: string | null;
  visa_services_enabled?: boolean | null;
  visa_status?: string | null;
};

function normalize(raw: Record<string, unknown>): Row {
  const id = raw.id != null ? String(raw.id) : "";
  return {
    id,
    traveler_name: String(raw.traveler_name ?? ""),
    destination: (raw.destination as string | null) ?? null,
    destination_city: (raw.destination_city as string | null) ?? null,
    departure_date: (raw.departure_date as string | null) ?? null,
    status: String(raw.status ?? "upcoming"),
    selling_price: raw.selling_price != null ? Number(raw.selling_price) : null,
    passport_number: (raw.passport_number as string | null) ?? null,
    passport_id_number: (raw.passport_id_number as string | null) ?? null,
    visa_services_enabled: (raw.visa_services_enabled as boolean | null) ?? null,
    visa_status: (raw.visa_status as string | null) ?? null,
  };
}

export default function TicketHistoryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

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
        await supabase.auth.refreshSession().catch(() => {});
        const { data, error } = await fetchBookingsForHistory(supabase);
        if (error) {
          const msg = formatSupabaseUserMessage(error.message || "Could not load tickets.");
          toast("error", msg);
          setRows([]);
          return;
        }
        const list = Array.isArray(data) ? data : data != null ? [data as Record<string, unknown>] : [];
        setRows(
          list
            .filter((raw): raw is Record<string, unknown> => raw != null && typeof raw === "object")
            .map(normalize)
            .filter((r) => r.id.length > 0)
        );
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : typeof e === "string" ? e : "Could not load tickets.";
        toast("error", formatSupabaseUserMessage(msg));
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, toast]);

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      bookingMatchesTicketSearch(
        {
          id: r.id,
          traveler_name: r.traveler_name,
          passport_number: r.passport_number,
          passport_id_number: r.passport_id_number,
        },
        q
      )
    );
  }, [rows, q]);

  function dest(r: Row) {
    return r.destination_city || r.destination || "—";
  }

  async function handleDeleteTicket(id: string) {
    const label = formatConfirmationCode(id);
    const ok = window.confirm(
      `Delete ticket ${label}? This cannot be undone. If a deposit was recorded to a banking account for this ticket, that amount will be reversed on that account.`
    );
    if (!ok) return;

    setDeletingId(id);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.refreshSession().catch(() => {});
      await deleteBookingById(supabase, id, toast);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast("success", "Ticket deleted.");
    } catch (e) {
      const raw = getSupabaseErrorMessage(e);
      const msg = raw || "Could not delete ticket.";
      toast("error", formatSupabaseUserMessage(msg));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <AgencySidebar />
      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#0f172a] sm:text-2xl">
              Ticket history
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Search by traveler name, passport / ID, confirmation code (e.g. GAR-A1B2C3D4E5), or paste the
              full booking UUID.
            </p>
          </div>
          <Link
            href="/dashboard/tickets"
            className="inline-flex items-center justify-center rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            New ticket
          </Link>
        </header>

        <div className="mb-4">
          <label htmlFor="ticket-search" className="sr-only">
            Search tickets
          </label>
          <input
            id="ticket-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, passport, confirmation GAR-…"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none ring-sky-200 focus:ring-2"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            All tickets ({filtered.length}
            {q.trim() ? ` of ${rows.length}` : ""})
          </div>
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              {rows.length === 0 ? (
                <>
                  No tickets yet.{" "}
                  <Link href="/dashboard/tickets" className="font-medium text-[#0f172a] underline">
                    Create one
                  </Link>
                  .
                </>
              ) : (
                "No matches — try another search."
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Confirmation</th>
                    <th className="px-4 py-3">Traveler</th>
                    <th className="px-4 py-3">Passport / ID</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-700">
                        {formatConfirmationCode(r.id)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.traveler_name || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.passport_number?.trim() ||
                          r.passport_id_number?.trim() ||
                          "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{dest(r)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatIsoDateDisplay(r.departure_date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/tickets/${r.id}`}
                            className="font-medium text-[#0f172a] underline-offset-2 hover:underline"
                          >
                            Open
                          </Link>
                          <button
                            type="button"
                            disabled={deletingId === r.id}
                            onClick={() => void handleDeleteTicket(r.id)}
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                          >
                            {deletingId === r.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
