"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseTimeTo24h(value: string): string | null {
  const v = normalizeSpaces(value).toUpperCase();
  if (!v) return null;

  // Accept "HH:MM" (24-hour) or "H:MM AM/PM"
  const m12 = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (m12) {
    let hours = Number(m12[1]);
    const minutes = Number(m12[2]);
    const meridiem = m12[3];
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 1 || hours > 12) return null;
    if (minutes < 0 || minutes > 59) return null;
    if (meridiem === "AM") hours = hours === 12 ? 0 : hours;
    if (meridiem === "PM") hours = hours === 12 ? 12 : hours + 12;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  }

  const m24 = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const hours = Number(m24[1]);
    const minutes = Number(m24[2]);
    const seconds = m24[3] ? Number(m24[3]) : 0;
    if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds))
      return null;
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;
    if (seconds < 0 || seconds > 59) return null;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }

  return null;
}

function formatTimeTo12h(value: string): string {
  const v = normalizeSpaces(value);
  if (!v) return "";
  const m24 = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m24) return v;
  const hours = Number(m24[1]);
  const minutes = Number(m24[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return v;
  const meridiem = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 === 0 ? 12 : hours % 12;
  return `${h}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function getTimeSuggestions(stepMinutes = 30) {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      options.push(formatTimeTo12h(`${hh}:${mm}:00`));
    }
  }
  return options;
}

const TIME_SUGGESTIONS = getTimeSuggestions(30);

function TimeInput({
  id,
  value,
  onChange,
  required = false,
  placeholder = "e.g. 9:30 AM",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        list={`${id}-list`}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none ring-sky-200 focus:bg-white focus:ring-2"
      />
      <datalist id={`${id}-list`}>
        {TIME_SUGGESTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

type Layover = {
  id: string;
  city: string;
  airport: string;
  departure_time: string;
  arrival_time: string;
};

function createEmptyLayover(): Layover {
  return {
    id: crypto.randomUUID(),
    city: "",
    airport: "",
    departure_time: "",
    arrival_time: "",
  };
}

export default function NewBookingPage() {
  const [travelerName, setTravelerName] = useState("");
  const [airlineName, setAirlineName] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [departureCity, setDepartureCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [includePrice, setIncludePrice] = useState(true);
  const [netCost, setNetCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [layovers, setLayovers] = useState<Layover[]>([createEmptyLayover()]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const router = useRouter();

  function addLayoverRow() {
    setLayovers((prev) => [...prev, createEmptyLayover()]);
  }

  function updateLayover(id: string, field: keyof Layover, value: string) {
    setLayovers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  }

  function removeLayover(id: string) {
    setLayovers((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSubmitError(null);

    try {
      const supabase = getSupabaseBrowserClient();

      const dep24 = parseTimeTo24h(departureTime);
      const arr24 = parseTimeTo24h(arrivalTime);
      if (!dep24 || !arr24) {
        throw new Error("Please enter valid departure and arrival times (e.g. 9:30 AM).");
      }

      const parsedNetCost = netCost.trim()
        ? Number(netCost.replace(/[^0-9.]/g, ""))
        : null;
      const parsedSellingPrice = sellingPrice.trim()
        ? Number(sellingPrice.replace(/[^0-9.]/g, ""))
        : null;
      if (parsedNetCost !== null && Number.isNaN(parsedNetCost)) {
        throw new Error("Net cost must be a number.");
      }
      if (parsedSellingPrice !== null && Number.isNaN(parsedSellingPrice)) {
        throw new Error("Selling price must be a number.");
      }

      // Try inserting with the newer flight info fields first.
      const insertPrimary = await supabase
        .from("bookings")
        .insert({
          traveler_name: travelerName,
          departure_city: departureCity,
          destination_city: destinationCity,
          travel_date: travelDate,
          departure_time: dep24,
          arrival_time: arr24,
          airline_name: airlineName,
          flight_number: flightNumber,
          include_price: includePrice,
          net_cost: parsedNetCost,
          selling_price: parsedSellingPrice,
          total_price: parsedSellingPrice,
          notes,
        })
        .select("id")
        .single();

      let booking = insertPrimary.data;
      let error = insertPrimary.error;

      // Fallback for older schemas (keeps app usable if columns differ).
      if (error) {
        const fallback = await supabase
          .from("bookings")
          .insert({
            traveler_name: travelerName,
            destination: destinationCity,
            departure_date: travelDate,
            return_date: null,
            notes,
          })
          .select("id")
          .single();

        booking = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;

      const filteredLayovers = layovers.filter(
        (l) =>
          l.city ||
          l.airport ||
          l.departure_time ||
          l.arrival_time
      );

      if (filteredLayovers.length > 0) {
        const layoverRows = filteredLayovers.map((l) => ({
          // Store as "HH:MM:SS" (24-hour) to keep consistency in DB.
          // If the user typed invalid values, store raw strings so data isn't lost.
          booking_id: booking.id,
          city: l.city,
          airport: l.airport,
          departure_time: parseTimeTo24h(l.departure_time) ?? l.departure_time,
          arrival_time: parseTimeTo24h(l.arrival_time) ?? l.arrival_time,
        }));

        const { error: layoverError } = await supabase
          .from("booking_layovers")
          .insert(layoverRows);

        if (layoverError) throw layoverError;
      }

      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong while saving. Please try again.";
      setSubmitError(message);
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    const agencyName =
      (typeof window !== "undefined" &&
        window.localStorage.getItem("agency_name")) ||
      "Your Travel Agency";
    const doc = new jsPDF();

    // Logo placeholder - real logo could be added via data URL
    doc.setFillColor(12, 148, 196);
    doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(agencyName, 14, 18);

    doc.setTextColor(33, 37, 41);
    doc.setFontSize(14);
    doc.text("Travel Itinerary", 14, 45);

    doc.setFontSize(11);
    let y = 55;

    const addLine = (label: string, value: string) => {
      doc.setFont(undefined, "bold");
      doc.text(`${label}:`, 14, y);
      doc.setFont(undefined, "normal");
      doc.text(value || "-", 60, y);
      y += 8;
    };

    addLine("Traveler", travelerName);
    addLine("From", departureCity);
    addLine("To", destinationCity);
    addLine("Travel date", travelDate);
    addLine("Depart", formatTimeTo12h(parseTimeTo24h(departureTime) ?? departureTime));
    addLine("Arrive", formatTimeTo12h(parseTimeTo24h(arrivalTime) ?? arrivalTime));
    addLine("Airline", airlineName);
    addLine("Flight no.", flightNumber);
    if (includePrice) {
      addLine("Price", sellingPrice);
    }

    if (notes) {
      y += 4;
      doc.setFont(undefined, "bold");
      doc.text("Notes", 14, y);
      y += 6;
      doc.setFont(undefined, "normal");
      const splitNotes = doc.splitTextToSize(notes, 170);
      doc.text(splitNotes, 14, y);
      y += splitNotes.length * 6 + 4;
    }

    if (layovers.some((l) => l.city || l.airport)) {
      y += 6;
      doc.setFont(undefined, "bold");
      doc.text("Layovers", 14, y);
      y += 8;
      doc.setFont(undefined, "normal");

      layovers.forEach((l, index) => {
        if (!l.city && !l.airport) return;
        doc.text(
          `${index + 1}. ${l.city || "City"} (${l.airport || "Airport"})`,
          14,
          y
        );
        y += 6;
        doc.text(
          `   Depart: ${
            formatTimeTo12h(parseTimeTo24h(l.departure_time) ?? l.departure_time) || "-"
          }   Arrive: ${
            formatTimeTo12h(parseTimeTo24h(l.arrival_time) ?? l.arrival_time) || "-"
          }`,
          14,
          y
        );
        y += 8;
      });
    }

    doc.save("itinerary.pdf");
  }

  return (
    <main className="flex min-h-screen bg-slate-50 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 shadow-lg shadow-slate-200 sm:p-8">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              New booking
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Capture traveler details, flights, and layovers in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
          >
            Print itinerary (PDF)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Traveler name
              </label>
              <input
                type="text"
                required
                value={travelerName}
                onChange={(e) => setTravelerName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Airline name
              </label>
              <input
                type="text"
                value={airlineName}
                onChange={(e) => setAirlineName(e.target.value)}
                placeholder="e.g. Turkish Airlines"
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Flight info
              </h2>
            </div>

            <div className="mt-3 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Departure city
                </label>
                <input
                  type="text"
                  required
                  value={departureCity}
                  onChange={(e) => setDepartureCity(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Destination city
                </label>
                <input
                  type="text"
                  required
                  value={destinationCity}
                  onChange={(e) => setDestinationCity(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Flight number
                </label>
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder="e.g. TK647"
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Travel date
                </label>
                <input
                  type="date"
                  required
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Departure time
                  </label>
                  <div className="mt-1">
                    <TimeInput
                      id="flight-departure-time"
                      value={departureTime}
                      onChange={setDepartureTime}
                      required
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Type like “9:30 AM” or pick a suggestion.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Arrival time
                  </label>
                  <div className="mt-1">
                    <TimeInput
                      id="flight-arrival-time"
                      value={arrivalTime}
                      onChange={setArrivalTime}
                      required
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    12-hour AM/PM format.
                  </p>
                </div>
              </div>

              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={includePrice}
                    onChange={(e) => setIncludePrice(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  Include price on itinerary?
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Net cost (your cost)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={netCost}
                      onChange={(e) => setNetCost(e.target.value)}
                      placeholder="e.g. 900"
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Selling price (customer price)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      placeholder="e.g. 1250"
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Layovers</h2>
              <button
                type="button"
                onClick={addLayoverRow}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-200 hover:text-sky-700"
              >
                + Add layover
              </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <div className="hidden bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:grid sm:grid-cols-4">
                <div className="px-3 py-2">City</div>
                <div className="px-3 py-2">Airport</div>
                <div className="px-3 py-2">Departure</div>
                <div className="px-3 py-2">Arrival</div>
              </div>
              <div className="divide-y divide-slate-100">
                {layovers.map((l) => (
                  <div
                    key={l.id}
                    className="grid gap-3 bg-white px-3 py-3 sm:grid-cols-4"
                  >
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-500 sm:hidden">
                        City
                      </label>
                      <input
                        type="text"
                        value={l.city}
                        onChange={(e) =>
                          updateLayover(l.id, "city", e.target.value)
                        }
                        className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none ring-sky-200 focus:bg-white focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-500 sm:hidden">
                        Airport
                      </label>
                      <input
                        type="text"
                        value={l.airport}
                        onChange={(e) =>
                          updateLayover(l.id, "airport", e.target.value)
                        }
                        className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none ring-sky-200 focus:bg-white focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-500 sm:hidden">
                        Departure
                      </label>
                      <TimeInput
                        id={`layover-departure-${l.id}`}
                        value={l.departure_time}
                        onChange={(v) => updateLayover(l.id, "departure_time", v)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="mb-1 block text-[11px] font-medium text-slate-500 sm:hidden">
                          Arrival
                        </label>
                        <TimeInput
                          id={`layover-arrival-${l.id}`}
                          value={l.arrival_time}
                          onChange={(v) => updateLayover(l.id, "arrival_time", v)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLayover(l.id)}
                        className="mt-5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-500 hover:border-rose-200 hover:text-rose-600 sm:mt-0"
                        aria-label="Remove layover"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Times accept “h:mm AM/PM” and will be stored as 24-hour in Supabase.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Notes for traveler (optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
              placeholder="Visa reminders, baggage details, hotel confirmations, etc."
            />
          </div>

          <div className="flex flex-col justify-between gap-3 pt-2 sm:flex-row sm:items-center">
            <p className="text-[11px] text-slate-500">
              Bookings are saved to your Supabase `bookings` and
              `booking_layovers` tables.
            </p>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              {submitError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {submitError}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving booking..." : "Save booking"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

