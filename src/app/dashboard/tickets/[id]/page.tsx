"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { useToast } from "@/components/providers/ToastProvider";
import {
  BOOKING_UUID_RE,
  formatConfirmationCode,
  resolveBookingUuid,
  segmentIdFromParams,
} from "@/lib/bookingConfirmation";
import { formatTimeForItinerary } from "@/lib/agencyBranding";
import { deleteBookingById } from "@/lib/bookingDelete";
import { getSupabaseErrorMessage } from "@/lib/supabaseErrors";
import { fetchBookingByIdFlexible, formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { formatDateTimeDisplay, formatIsoDateDisplay } from "@/lib/dateFormats";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type Ticket = {
  id: string;
  traveler_name: string | null;
  traveler_phone: string | null;
  passport_number: string | null;
  passport_id_number: string | null;
  airline_name: string | null;
  flight_number: string | null;
  departure_city: string | null;
  destination_city: string | null;
  departure_date: string | null;
  return_date: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  notes: string | null;
  status: string | null;
  include_price: boolean | null;
  selling_price: number | null;
  net_cost: number | null;
  visa_services_enabled: boolean | null;
  visa_destination: string | null;
  visa_status: string | null;
  /** When the row was created (migration `20250331220000_bookings_timestamps`). */
  created_at?: string | null;
  /** Last update (any field, including visa). */
  updated_at?: string | null;
};

const STATUS_OPTIONS = ["upcoming", "completed", "cancelled"] as const;

function ticketFromRow(row: Record<string, unknown>): Ticket {
  const destMerged =
    (row.destination_city as string | null) ?? (row.destination as string | null) ?? null;
  return {
    id: String(row.id),
    traveler_name: (row.traveler_name as string | null) ?? null,
    traveler_phone: (row.traveler_phone as string | null) ?? null,
    passport_number: (row.passport_number as string | null) ?? null,
    passport_id_number: (row.passport_id_number as string | null) ?? null,
    airline_name: (row.airline_name as string | null) ?? null,
    flight_number: (row.flight_number as string | null) ?? null,
    departure_city: (row.departure_city as string | null) ?? null,
    destination_city: destMerged,
    departure_date: (row.departure_date as string | null) ?? null,
    return_date: (row.return_date as string | null) ?? null,
    departure_time: (row.departure_time as string | null) ?? null,
    arrival_time: (row.arrival_time as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: (row.status as string | null) ?? "upcoming",
    include_price: (row.include_price as boolean | null) ?? null,
    selling_price: row.selling_price != null ? Number(row.selling_price) : null,
    net_cost: row.net_cost != null ? Number(row.net_cost) : null,
    visa_services_enabled: (row.visa_services_enabled as boolean | null) ?? null,
    visa_destination: (row.visa_destination as string | null) ?? null,
    visa_status: (row.visa_status as string | null) ?? null,
    created_at: row.created_at != null ? String(row.created_at) : null,
    updated_at: row.updated_at != null ? String(row.updated_at) : null,
  };
}

function TicketDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const savedToastRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [status, setStatus] = useState<string>("upcoming");
  const [notes, setNotes] = useState("");

  const rawSegment = segmentIdFromParams(params?.id);

  useEffect(() => {
    if (!ticket?.id) return;
    const saved = searchParams.get("saved") === "1";
    if (saved && !savedToastRef.current) {
      savedToastRef.current = true;
      toast("success", "Ticket saved — print or open documents below.");
      router.replace(`/dashboard/tickets/${ticket.id}`, { scroll: false });
    }
  }, [ticket?.id, searchParams, router, toast]);

  useEffect(() => {
    async function load() {
      if (!rawSegment) {
        setLoading(false);
        setTicket(null);
        return;
      }
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

        const resolvedId = BOOKING_UUID_RE.test(rawSegment)
          ? rawSegment
          : await resolveBookingUuid(supabase, rawSegment);
        if (!resolvedId) {
          setTicket(null);
          return;
        }

        const { data: rowData, error: fetchErr } = await fetchBookingByIdFlexible(supabase, resolvedId);

        if (fetchErr || !rowData) {
          setTicket(null);
          return;
        }

        const t = ticketFromRow(rowData as Record<string, unknown>);
        setTicket(t);
        setStatus(t.status || "upcoming");
        setNotes(t.notes || "");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [rawSegment, router]);

  async function handleSaveMeta(e: FormEvent) {
    e.preventDefault();
    if (!ticket?.id) return;
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.refreshSession().catch(() => {});
      const { error } = await supabase
        .from("bookings")
        .update({
          status,
          notes: notes.trim() || null,
        })
        .eq("id", ticket.id);
      if (error) throw error;
      toast("success", "Ticket updated.");
      const { data: freshRow, error: refetchErr } = await fetchBookingByIdFlexible(
        supabase,
        ticket.id
      );
      if (!refetchErr && freshRow) {
        setTicket(ticketFromRow(freshRow as Record<string, unknown>));
      } else {
        setTicket((prev) =>
          prev ? { ...prev, status, notes: notes.trim() || null } : prev
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not update ticket.";
      toast("error", formatSupabaseUserMessage(msg));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTicket() {
    if (!ticket) return;
    const conf = formatConfirmationCode(ticket.id);
    const ok = window.confirm(
      `Delete ticket ${conf}? This cannot be undone. If a deposit was recorded to a banking account for this ticket, that amount will be reversed on that account.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.refreshSession().catch(() => {});
      await deleteBookingById(supabase, ticket.id, toast);
      toast("success", "Ticket deleted.");
      router.replace("/dashboard/tickets/history");
    } catch (e) {
      const raw = getSupabaseErrorMessage(e);
      const msg = raw || "Could not delete ticket.";
      toast("error", formatSupabaseUserMessage(msg));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen bg-slate-100/80">
        <div className="print:hidden">
          <AgencySidebar />
        </div>
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">
          Loading ticket…
        </div>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="flex min-h-screen bg-slate-100/80">
        <div className="print:hidden">
          <AgencySidebar />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <p className="text-sm text-rose-700">Ticket not found.</p>
          <Link href="/dashboard/tickets/history" className="text-sm font-medium text-[#0f172a] underline">
            Back to history
          </Link>
        </div>
      </main>
    );
  }

  const conf = formatConfirmationCode(ticket.id);

  return (
    <main className="flex min-h-screen bg-slate-100/80 print:block print:bg-white">
      <div className="print:hidden">
        <AgencySidebar />
      </div>
      <section className="flex-1 px-4 py-6 print:p-8 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-3xl print:max-w-none">
          <div className="mb-6 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">
                Ticket
              </p>
              <h1 className="mt-1 text-xl font-semibold text-[#0f172a]">{ticket.traveler_name || "Traveler"}</h1>
              <p className="mt-1 font-mono text-sm text-slate-600">
                Confirmation <span className="font-semibold text-[#0f172a]">{conf}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/dashboard/tickets?edit=${encodeURIComponent(ticket.id)}`}
                className="inline-flex items-center rounded-lg bg-[#0f172a] px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
              >
                Edit ticket
              </Link>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Print
              </button>
              <Link
                href={`/dashboard/itinerary/${ticket.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Itinerary (new tab)
              </Link>
              <Link
                href={`/dashboard/receipt/${ticket.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Receipt (new tab)
              </Link>
              <Link
                href="/dashboard/tickets/history"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                History
              </Link>
              <button
                type="button"
                disabled={deleting || saving}
                onClick={() => void handleDeleteTicket()}
                className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete ticket"}
              </button>
            </div>
          </div>

          <div
            id="ticket-print-root"
            className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm print:border-0 print:shadow-none sm:p-8"
          >
            <div className="hidden print:mb-6 print:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">GARASHO · Ticket</p>
              <p className="mt-1 font-mono text-sm">Confirmation {conf}</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#0f172a]">{ticket.traveler_name}</h2>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Phone</dt>
                <dd className="text-slate-900">{ticket.traveler_phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Passport / ID</dt>
                <dd className="text-slate-900">
                  {ticket.passport_number?.trim() || ticket.passport_id_number?.trim() || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Route</dt>
                <dd className="text-slate-900">
                  {(ticket.departure_city || "—") + " → " + (ticket.destination_city || "—")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Departure</dt>
                <dd className="text-slate-900">{formatIsoDateDisplay(ticket.departure_date)}</dd>
              </div>
              {ticket.return_date ? (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Return</dt>
                  <dd className="text-slate-900">{formatIsoDateDisplay(ticket.return_date)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Flight</dt>
                <dd className="text-slate-900">
                  {(ticket.airline_name || "—") + " " + (ticket.flight_number || "")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Times</dt>
                <dd className="text-slate-900">
                  {formatTimeForItinerary(ticket.departure_time) +
                    " → " +
                    formatTimeForItinerary(ticket.arrival_time)}
                </dd>
              </div>
              {ticket.selling_price != null ? (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Selling price</dt>
                  <dd className="text-slate-900">${ticket.selling_price.toLocaleString()}</dd>
                </div>
              ) : null}
              {ticket.visa_services_enabled ? (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Visa</dt>
                  <dd className="text-slate-900">
                    {(ticket.visa_destination || "—") + (ticket.visa_status ? ` · ${ticket.visa_status}` : "")}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/90 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Record</p>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] text-slate-500">Added</dt>
                  <dd className="text-slate-800">{formatDateTimeDisplay(ticket.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Last edited</dt>
                  <dd className="text-slate-800">{formatDateTimeDisplay(ticket.updated_at)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Times are when this ticket was first saved and last changed in the database (including visa
                updates). Run the bookings timestamps migration if these show as empty.
              </p>
            </div>

            <form onSubmit={handleSaveMeta} className="mt-8 space-y-4 border-t border-slate-100 pt-6 print:hidden">
              <div>
                <label htmlFor="ticket-status" className="block text-xs font-medium text-slate-700">
                  Trip status
                </label>
                <select
                  id="ticket-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ticket-notes" className="block text-xs font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  id="ticket-notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                  placeholder="Internal notes…"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </form>

            {(notes.trim() || ticket.notes) ? (
              <div className="mt-6 hidden border-t border-slate-100 pt-6 print:block">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{notes.trim() || ticket.notes}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function TicketDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen bg-slate-100/80">
          <div className="print:hidden">
            <AgencySidebar />
          </div>
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">
            Loading ticket…
          </div>
        </main>
      }
    >
      <TicketDetailContent />
    </Suspense>
  );
}
