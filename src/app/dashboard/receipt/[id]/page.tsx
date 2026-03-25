"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type ReceiptBooking = {
  id: string;
  traveler_name: string | null;
  selling_price: number | null;
};

type LegacyReceiptWithTotal = {
  id: string;
  traveler_name: string | null;
  total_price: number | null;
};

type LegacyReceiptMinimal = {
  id: string;
  traveler_name: string | null;
};

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<ReceiptBooking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const primary = await supabase
          .from("bookings")
          .select("id, traveler_name, selling_price")
          .eq("id", params.id)
          .single();

        if (!primary.error && primary.data) {
          setBooking(primary.data as ReceiptBooking);
          return;
        }

        const withTotal = await supabase
          .from("bookings")
          .select("id, traveler_name, total_price")
          .eq("id", params.id)
          .single();

        if (!withTotal.error && withTotal.data) {
          const row = withTotal.data as LegacyReceiptWithTotal;
          setBooking({
            id: row.id,
            traveler_name: row.traveler_name,
            selling_price: row.total_price,
          });
          return;
        }

        const minimal = await supabase
          .from("bookings")
          .select("id, traveler_name")
          .eq("id", params.id)
          .single();

        if (!minimal.error && minimal.data) {
          const row = minimal.data as LegacyReceiptMinimal;
          setBooking({
            id: row.id,
            traveler_name: row.traveler_name,
            selling_price: null,
          });
          return;
        }

        setBooking(null);
      } finally {
        setLoading(false);
      }
    }
    if (params?.id) load();
  }, [params?.id]);

  if (loading) {
    return <main className="p-6 text-sm text-slate-600">Loading receipt...</main>;
  }

  if (!booking) {
    return <main className="p-6 text-sm text-rose-600">Booking not found.</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-4">
          <h1 className="text-xl font-semibold text-slate-900">Professional Receipt</h1>
          <BackButton className="px-2 py-1" />
        </div>

        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <span className="font-semibold text-slate-900">Booking ID:</span> {booking.id}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Customer Name:</span> {booking.traveler_name || "-"}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Selling Price:</span>{" "}
            {booking.selling_price !== null ? `$${booking.selling_price.toLocaleString()}` : "-"}
          </p>
        </div>

        <div className="mt-16 border-t border-slate-300 pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Stamp & Signature
          </p>
          <div className="mt-8 h-px w-64 bg-slate-300" />
        </div>
      </div>
    </main>
  );
}
