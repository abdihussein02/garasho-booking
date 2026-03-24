"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Booking = {
  id: string;
  traveler_name: string | null;
  airline_name: string | null;
  flight_number: string | null;
  departure_city: string | null;
  destination_city: string | null;
  travel_date: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  notes: string | null;
  include_price: boolean | null;
  selling_price: number | null;
};

export default function ItineraryPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase
          .from("bookings")
          .select(
            "id, traveler_name, airline_name, flight_number, departure_city, destination_city, travel_date, departure_time, arrival_time, notes, include_price, selling_price"
          )
          .eq("id", params.id)
          .single();
        setBooking((data as Booking) ?? null);
      } finally {
        setLoading(false);
      }
    }
    if (params?.id) load();
  }, [params?.id]);

  if (loading) {
    return <main className="p-6 text-sm text-slate-600">Loading itinerary...</main>;
  }

  if (!booking) {
    return <main className="p-6 text-sm text-rose-600">Booking not found.</main>;
  }

  const showPrice = Boolean(booking.include_price);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Professional Itinerary</h1>
            <p className="mt-1 text-sm text-slate-600">Booking ID: {booking.id}</p>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-sky-700 hover:text-sky-800">
            Back
          </Link>
        </div>

        <ol className="relative border-s border-slate-200 ps-5">
          <li className="mb-8 ms-2">
            <span className="absolute -start-2 mt-1.5 h-3 w-3 rounded-full bg-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Traveler</h3>
            <p className="mt-1 text-sm text-slate-700">{booking.traveler_name || "-"}</p>
          </li>
          <li className="mb-8 ms-2">
            <span className="absolute -start-2 mt-1.5 h-3 w-3 rounded-full bg-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Flight</h3>
            <p className="mt-1 text-sm text-slate-700">
              {booking.airline_name || "Airline not set"} {booking.flight_number ? `(${booking.flight_number})` : ""}
            </p>
          </li>
          <li className="mb-8 ms-2">
            <span className="absolute -start-2 mt-1.5 h-3 w-3 rounded-full bg-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Route</h3>
            <p className="mt-1 text-sm text-slate-700">
              {booking.departure_city || "-"} to {booking.destination_city || "-"}
            </p>
          </li>
          <li className="mb-8 ms-2">
            <span className="absolute -start-2 mt-1.5 h-3 w-3 rounded-full bg-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Schedule</h3>
            <p className="mt-1 text-sm text-slate-700">
              Date: {booking.travel_date || "-"} | Departure: {booking.departure_time || "-"} | Arrival:{" "}
              {booking.arrival_time || "-"}
            </p>
          </li>
          {showPrice ? (
            <li className="mb-8 ms-2">
              <span className="absolute -start-2 mt-1.5 h-3 w-3 rounded-full bg-sky-600" />
              <h3 className="text-sm font-semibold text-slate-900">Price</h3>
              <p className="mt-1 text-sm text-slate-700">
                {booking.selling_price !== null ? `$${booking.selling_price.toLocaleString()}` : "-"}
              </p>
            </li>
          ) : null}
          <li className="ms-2">
            <span className="absolute -start-2 mt-1.5 h-3 w-3 rounded-full bg-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
            <p className="mt-1 text-sm text-slate-700">{booking.notes || "-"}</p>
          </li>
        </ol>
      </div>
    </main>
  );
}
