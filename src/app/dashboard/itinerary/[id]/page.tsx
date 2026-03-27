"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";
import {
  formatTimeForItinerary,
  readAgencyBrandingFromStorage,
  type AgencyBranding,
} from "@/lib/agencyBranding";
import {
  BOOKING_UUID_RE,
  formatConfirmationCode,
  resolveBookingUuid,
  segmentIdFromParams,
} from "@/lib/bookingConfirmation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";

type Booking = {
  id: string;
  traveler_name: string | null;
  airline_name: string | null;
  flight_number: string | null;
  departure_city: string | null;
  destination_city: string | null;
  departure_date: string | null;
  return_date: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  notes: string | null;
  include_price: boolean | null;
  selling_price: number | null;
  visa_services_enabled: boolean | null;
  visa_destination: string | null;
  visa_status: string | null;
};

type LegacyItineraryRow = {
  id: string;
  traveler_name: string | null;
  destination: string | null;
  departure_date: string | null;
  notes: string | null;
};

function mapLegacyItinerary(row: LegacyItineraryRow): Booking {
  return {
    id: row.id,
    traveler_name: row.traveler_name,
    airline_name: null,
    flight_number: null,
    departure_city: null,
    destination_city: row.destination,
    departure_date: row.departure_date,
    return_date: null,
    departure_time: null,
    arrival_time: null,
    notes: row.notes,
    include_price: false,
    selling_price: null,
    visa_services_enabled: false,
    visa_destination: null,
    visa_status: null,
  };
}

function routeLine(booking: Booking): { from: string; to: string } {
  const from = booking.departure_city?.trim() || "—";
  const to = booking.destination_city?.trim() || "—";
  return { from, to };
}

export default function ItineraryPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState<AgencyBranding>(() => readAgencyBrandingFromStorage());

  useEffect(() => {
    setBranding(readAgencyBrandingFromStorage());
  }, []);

  useEffect(() => {
    async function load() {
      const rawSegment = segmentIdFromParams(params?.id);
      if (!rawSegment) {
        setBooking(null);
        setLoading(false);
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const resolvedId = BOOKING_UUID_RE.test(rawSegment)
          ? rawSegment
          : await resolveBookingUuid(supabase, rawSegment);

        const id = resolvedId ?? "";
        if (!id) {
          setBooking(null);
          return;
        }

        const primary = await supabase
          .from("bookings")
          .select(
            "id, traveler_name, airline_name, flight_number, departure_city, destination_city, departure_date, return_date, departure_time, arrival_time, notes, include_price, selling_price, visa_services_enabled, visa_destination, visa_status"
          )
          .eq("id", id)
          .single();

        if (!primary.error && primary.data) {
          setBooking(primary.data as Booking);
          return;
        }

        const withoutReturn = await supabase
          .from("bookings")
          .select(
            "id, traveler_name, airline_name, flight_number, departure_city, destination_city, departure_date, departure_time, arrival_time, notes, include_price, selling_price, visa_services_enabled, visa_destination, visa_status"
          )
          .eq("id", id)
          .single();

        if (!withoutReturn.error && withoutReturn.data) {
          setBooking({ ...(withoutReturn.data as Booking), return_date: null });
          return;
        }

        const withoutVisaCols = await supabase
          .from("bookings")
          .select(
            "id, traveler_name, airline_name, flight_number, departure_city, destination_city, departure_date, departure_time, arrival_time, notes, include_price, selling_price"
          )
          .eq("id", id)
          .single();

        if (!withoutVisaCols.error && withoutVisaCols.data) {
          setBooking({
            ...(withoutVisaCols.data as Booking),
            return_date: null,
            visa_services_enabled: false,
            visa_destination: null,
            visa_status: null,
          });
          return;
        }

        const legacy = await supabase
          .from("bookings")
          .select("id, traveler_name, destination, departure_date, notes")
          .eq("id", id)
          .single();

        if (!legacy.error && legacy.data) {
          setBooking(mapLegacyItinerary(legacy.data as LegacyItineraryRow));
          return;
        }

        setBooking(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params?.id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f6f8] p-6 text-sm text-slate-600">
        Loading itinerary…
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-[#f4f6f8] p-6 text-sm text-rose-600">
        Booking not found.
      </main>
    );
  }

  const conf = formatConfirmationCode(booking.id);
  const { from, to } = routeLine(booking);
  const showPrice = Boolean(booking.include_price);
  const issued = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const flightLabel = [booking.airline_name?.trim(), booking.flight_number?.trim()].filter(Boolean).join(" · ");
  const hasReturn = Boolean(booking.return_date?.trim());

  return (
    <main className="min-h-screen bg-[#e8eef3] print:bg-white">
      <div className="print:hidden">
        <div className="mx-auto max-w-3xl px-4 pb-2 pt-6 sm:px-6">
          <BackButton className="px-2 py-1" />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-12 pt-2 sm:px-6 print:max-w-none print:px-0 print:pb-0 print:pt-0">
        <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10 print:rounded-none print:border-0 print:shadow-none">
          {/* Brand header — color strip for print + screen */}
          <header className="relative bg-gradient-to-br from-[#0c6e9e] via-[#0b5f8a] to-[#0f172a] px-6 py-8 text-white print:px-8 print:py-10">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.06\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" aria-hidden />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 ring-2 ring-white/25 print:bg-white print:ring-slate-200">
                  {branding.logoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={branding.logoDataUrl}
                      alt=""
                      className="h-full w-full object-contain p-1.5"
                    />
                  ) : (
                    <span className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 print:text-[#0f172a]">
                      Logo
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-100/90">
                    Travel itinerary
                  </p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{branding.name}</h1>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-sky-100/95">{branding.tagline}</p>
                  <div className="mt-3 space-y-0.5 text-xs text-sky-50/95">
                    {branding.phone ? <p>{branding.phone}</p> : null}
                    {branding.address ? (
                      <p className="whitespace-pre-line opacity-95">{branding.address}</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-3 text-left ring-1 ring-white/20 backdrop-blur-sm print:bg-white/95 print:text-[#0f172a] print:ring-slate-200">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100 print:text-slate-500">
                  Ticket reference
                </p>
                <p className="mt-1 font-mono text-lg font-bold tracking-wide sm:text-xl">{conf}</p>
                <p className="mt-2 text-[11px] text-sky-100/80 print:text-slate-500">Issued {issued}</p>
              </div>
            </div>
          </header>

          <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 print:bg-white">
            <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              E-ticket · Please verify names and flight times with the airline
            </p>
          </div>

          <div className="space-y-6 px-6 py-8 sm:px-8 print:px-10 print:py-8">
            {/* Passenger */}
            <section className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/50 p-5 shadow-sm print:border-slate-200">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Passenger</h2>
              <p className="mt-2 text-xl font-semibold text-[#0f172a]">{booking.traveler_name || "—"}</p>
            </section>

            {/* Flight segment */}
            <section className="overflow-hidden rounded-xl border-2 border-[#0c6e9e]/25 bg-white shadow-sm ring-1 ring-[#0c6e9e]/10">
              <div className="bg-gradient-to-r from-[#0c6e9e]/10 to-transparent px-5 py-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0b5f8a]">
                  Flight details
                </h2>
              </div>
              <div className="space-y-4 px-5 pb-6 pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-semibold text-[#0f172a]">
                    {from} <span className="text-slate-400">→</span> {to}
                  </p>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Airline &amp; flight</dt>
                    <dd className="mt-1 font-medium text-slate-900">
                      {flightLabel || <span className="text-slate-400">Add airline and flight number in the ticket</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Departure date</dt>
                    <dd className="mt-1 font-medium text-slate-900">{booking.departure_date || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Departure time</dt>
                    <dd className="mt-1 font-medium text-slate-900">{formatTimeForItinerary(booking.departure_time)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Arrival time</dt>
                    <dd className="mt-1 font-medium text-slate-900">{formatTimeForItinerary(booking.arrival_time)}</dd>
                  </div>
                </dl>
                {hasReturn ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-700">Return date: </span>
                    {booking.return_date}
                  </div>
                ) : null}
              </div>
            </section>

            {showPrice ? (
              <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fare</h2>
                <p className="mt-2 text-lg font-semibold text-[#0f172a]">
                  {booking.selling_price !== null
                    ? `${booking.selling_price.toLocaleString(undefined, { style: "currency", currency: "USD" })}`
                    : "—"}
                </p>
                {booking.visa_services_enabled ? (
                  <p className="mt-1 text-xs text-slate-500">Total may include visa service fees where applicable.</p>
                ) : null}
              </section>
            ) : null}

            {booking.visa_services_enabled ? (
              <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900/80">Visa services</h2>
                <p className="mt-2 text-sm text-slate-800">
                  Destination: {booking.visa_destination || "—"}
                  {booking.visa_status ? ` · Status: ${booking.visa_status}` : ""}
                </p>
              </section>
            ) : null}

            {booking.notes?.trim() ? (
              <section className="rounded-xl border border-slate-200 p-5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{booking.notes}</p>
              </section>
            ) : null}

            <footer className="border-t border-slate-100 pt-6 text-center">
              <p className="text-[11px] text-slate-500">
                Questions? Contact <span className="font-medium text-slate-700">{branding.name}</span>
                {branding.phone ? <> · {branding.phone}</> : null}
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-slate-400">
                Prepared with GARASHO · Prime Time Agency OS
              </p>
              <p className="mt-1 font-mono text-[10px] text-slate-400">Ref: {booking.id}</p>
            </footer>
          </div>
        </article>
      </div>
    </main>
  );
}
