"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { useToast } from "@/components/providers/ToastProvider";
import { formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDbTimeTo12h } from "@/lib/agencyBranding";
import { BOOKING_UUID_RE, resolveBookingUuid } from "@/lib/bookingConfirmation";
import { applyDepositIncrement } from "@/lib/bankingDeposit";
import { fetchBookingByIdFlexible } from "@/lib/bookingsQuery";
import { DateInputDdMmYyyy } from "@/components/DateInputDdMmYyyy";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { formatIsoDateDisplay, formatIsoDateToDdMmYyyy, isoDateFromDbValue } from "@/lib/dateFormats";
import jsPDF from "jspdf";

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** True when route/date exist but main flight fields are empty (e.g. legacy minimal save). */
function bookingRowLooksMissingFlight(row: Record<string, unknown>): boolean {
  const dest = String(row.destination_city ?? row.destination ?? "").trim();
  const depDate = String(row.departure_date ?? "").trim();
  const hasRoute = Boolean(dest) || Boolean(depDate);
  const hasFlight =
    String(row.airline_name ?? "").trim() ||
    String(row.flight_number ?? "").trim() ||
    String(row.departure_city ?? "").trim() ||
    Boolean(formatDbTimeTo12h(row.departure_time)) ||
    Boolean(formatDbTimeTo12h(row.arrival_time));
  return hasRoute && !hasFlight;
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none ring-sky-200 focus:bg-white focus:ring-2"
      />
    );
  }

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

type BankingAccount = {
  id: string;
  name: string;
  type: string;
  balance: number | null;
  /** From `provider_name` (legacy may store it elsewhere; UI derives rail from `type`). */
  provider_name?: string | null;
};

/** Stable id for the first row so server and client markup match during hydration. */
const INITIAL_LAYOVER_ROW_ID = "layover-row-initial";

function createEmptyLayover(stableId?: string): Layover {
  return {
    id: stableId ?? crypto.randomUUID(),
    city: "",
    airport: "",
    departure_time: "",
    arrival_time: "",
  };
}

const VISA_DESTINATIONS = [
  "Kenya",
  "Turkey",
  "Saudi",
  "UAE",
  "Egypt",
  "Other",
] as const;

const fieldClass =
  "mt-1 block w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-slate-200/80 transition placeholder:text-slate-400 focus:border-[#0f172a]/25 focus:ring-2 focus:ring-[#0f172a]/15";

function NewBookingPageContent() {
  const { toast } = useToast();
  const [travelerName, setTravelerName] = useState("");
  const [travelerPhone, setTravelerPhone] = useState("");
  const [passportIdNumber, setPassportIdNumber] = useState("");
  const [passportIssueDate, setPassportIssueDate] = useState("");
  const [passportExpiryDate, setPassportExpiryDate] = useState("");
  const [visaServicesEnabled, setVisaServicesEnabled] = useState(false);
  const [visaDestination, setVisaDestination] = useState("");
  const [visaDestinationOther, setVisaDestinationOther] = useState("");
  const [visaServiceFee, setVisaServiceFee] = useState("");
  const [visaStatus, setVisaStatus] = useState("Pending");
  const [airlineName, setAirlineName] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [departureCity, setDepartureCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [tripType, setTripType] = useState<"one_way" | "return_trip">("one_way");
  const [returnDate, setReturnDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [includePrice, setIncludePrice] = useState(true);
  const [netCost, setNetCost] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [bankingAccounts, setBankingAccounts] = useState<BankingAccount[]>([]);
  const [layovers, setLayovers] = useState<Layover[]>(() => [
    createEmptyLayover(INITIAL_LAYOVER_ROW_ID),
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [showPartialBookingNotice, setShowPartialBookingNotice] = useState(false);
  const editLoadSeqRef = useRef(0);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inAppShell = pathname === "/dashboard/tickets";

  function copyPassportToNotes() {
    const lines = [
      travelerName.trim() && `Traveler: ${travelerName.trim()}`,
      passportIdNumber.trim() && `Passport/ID: ${passportIdNumber.trim()}`,
      passportIssueDate && `Issued: ${formatIsoDateToDdMmYyyy(passportIssueDate) || passportIssueDate}`,
      passportExpiryDate && `Expires: ${formatIsoDateToDdMmYyyy(passportExpiryDate) || passportExpiryDate}`,
    ].filter(Boolean) as string[];
    if (lines.length === 0) {
      toast("error", "Add at least one passport or ID detail first.");
      return;
    }
    const block = ["--- Passport (CRM) ---", ...lines].join("\n");
    setNotes((prev) => {
      const p = prev.trim();
      return p ? `${p}\n\n${block}` : block;
    });
    toast("success", "Passport details copied to notes.");
  }

  useEffect(() => {
    async function loadAccounts() {
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.auth.refreshSession().catch(() => {});

        const res = await supabase
          .from("banking_accounts")
          .select("id, name, type, current_balance, provider_name, account_number")
          .order("name", { ascending: true });
        if (res.error) return;
        const raw = (res.data as Record<string, unknown>[]) ?? [];

        setBankingAccounts(
          raw.map((row) => ({
            id: String(row.id),
            name: String(row.name ?? ""),
            type: String(row.type ?? ""),
            balance: row.current_balance != null ? Number(row.current_balance) : null,
            provider_name: (row.provider_name as string | null) ?? null,
          }))
        );
      } catch {
        setBankingAccounts([]);
      }
    }
    loadAccounts();
  }, []);

  const editParam = searchParams.get("edit");

  useEffect(() => {
    const editParamRaw = editParam;
    if (!editParamRaw) {
      setEditingBookingId(null);
      setShowPartialBookingNotice(false);
      return;
    }
    const editQuery = editParamRaw;
    editLoadSeqRef.current += 1;
    const loadSeq = editLoadSeqRef.current;
    let cancelled = false;
    async function loadForEdit() {
      setLoadingEdit(true);
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.auth.refreshSession().catch(() => {});

        let bookingId = editQuery.trim();
        if (!BOOKING_UUID_RE.test(bookingId)) {
          const resolved = await resolveBookingUuid(supabase, bookingId);
          if (cancelled) return;
          if (!resolved) {
            toast("error", "Could not find a ticket for that link or confirmation code.");
            router.replace(pathname);
            setEditingBookingId(null);
            return;
          }
          bookingId = resolved;
          router.replace(`${pathname}?edit=${encodeURIComponent(bookingId)}`);
          return;
        }

        setEditingBookingId(bookingId);
        const { data, error } = await fetchBookingByIdFlexible(supabase, bookingId);
        if (cancelled) return;
        if (loadSeq !== editLoadSeqRef.current) return;
        if (error || !data) {
          toast("error", "Could not load this ticket for editing.");
          router.replace("/dashboard/tickets");
          setEditingBookingId(null);
          setShowPartialBookingNotice(false);
          setLoadingEdit(false);
          return;
        }
        const row = data as Record<string, unknown>;
        if (cancelled) return;
        if (loadSeq !== editLoadSeqRef.current) return;
        setTravelerName(String(row.traveler_name ?? ""));
        setTravelerPhone(String(row.traveler_phone ?? ""));
        const passport = String(row.passport_id_number ?? row.passport_number ?? "");
        setPassportIdNumber(passport);
        const iss = row.passport_issue_date;
        const exp = row.passport_expiry_date;
        setPassportIssueDate(isoDateFromDbValue(iss));
        setPassportExpiryDate(isoDateFromDbValue(exp));
        setAirlineName(String(row.airline_name ?? ""));
        setFlightNumber(String(row.flight_number ?? ""));
        setDepartureCity(String(row.departure_city ?? ""));
        setDestinationCity(String(row.destination_city ?? row.destination ?? ""));
        setDepartureDate(isoDateFromDbValue(row.departure_date));
        const rd = row.return_date as string | null | undefined;
        if (rd) {
          setTripType("return_trip");
          setReturnDate(isoDateFromDbValue(rd));
        } else {
          setTripType("one_way");
          setReturnDate("");
        }
        setDepartureTime(formatDbTimeTo12h(row.departure_time));
        setArrivalTime(formatDbTimeTo12h(row.arrival_time));
        setIncludePrice(row.include_price != null ? Boolean(row.include_price) : true);
        setNetCost(row.net_cost != null ? String(row.net_cost) : "");
        const visaEn = Boolean(row.visa_services_enabled);
        setVisaServicesEnabled(visaEn);
        const dest = String(row.visa_destination ?? "");
        if (visaEn && dest) {
          if ((VISA_DESTINATIONS as readonly string[]).includes(dest)) {
            setVisaDestination(dest);
            setVisaDestinationOther("");
          } else {
            setVisaDestination("Other");
            setVisaDestinationOther(dest);
          }
        } else {
          setVisaDestination("Kenya");
          setVisaDestinationOther("");
        }
        const vf = row.visa_service_fee != null ? Number(row.visa_service_fee) : null;
        const sp = row.selling_price != null ? Number(row.selling_price) : null;
        if (visaEn && vf != null && !Number.isNaN(vf) && vf > 0 && sp != null) {
          setVisaServiceFee(String(vf));
          setSellingPrice(String(Math.max(0, sp - vf)));
        } else {
          setVisaServiceFee(vf != null && !Number.isNaN(vf) ? String(vf) : "");
          setSellingPrice(sp != null ? String(sp) : "");
        }
        setVisaStatus(String(row.visa_status ?? "Pending"));
        setNotes(String(row.notes ?? ""));
        setPaymentMethod(String(row.payment_method ?? "Cash"));
        const depId = row.deposit_to_id ?? row.deposit_account_id;
        setDepositAccountId(depId != null ? String(depId) : "");

        const { data: lo } = await supabase
          .from("booking_layovers")
          .select("id, city, airport, departure_time, arrival_time")
          .eq("booking_id", bookingId);
        if (cancelled) return;
        if (loadSeq !== editLoadSeqRef.current) return;
        const layoverCount = Array.isArray(lo) ? lo.length : 0;
        if (layoverCount > 0) {
          setLayovers(
            (lo as Record<string, unknown>[]).map((L) => ({
              id: String(L.id ?? crypto.randomUUID()),
              city: String(L.city ?? ""),
              airport: String(L.airport ?? ""),
              departure_time: formatDbTimeTo12h(L.departure_time),
              arrival_time: formatDbTimeTo12h(L.arrival_time),
            }))
          );
        } else {
          setLayovers([createEmptyLayover(INITIAL_LAYOVER_ROW_ID)]);
        }
        setShowPartialBookingNotice(
          layoverCount === 0 && bookingRowLooksMissingFlight(row)
        );
      } catch {
        if (!cancelled) {
          toast("error", "Could not load ticket.");
          router.replace("/dashboard/tickets");
          setEditingBookingId(null);
          setShowPartialBookingNotice(false);
        }
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    }
    void loadForEdit();
    return () => {
      cancelled = true;
    };
  }, [editParam, pathname, router, toast]);

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
      await supabase.auth.refreshSession().catch(() => {});

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

      let parsedVisaFee: number | null = null;
      if (visaServicesEnabled && visaServiceFee.trim()) {
        parsedVisaFee = Number(visaServiceFee.replace(/[^0-9.]/g, ""));
        if (Number.isNaN(parsedVisaFee)) {
          throw new Error("Visa service fee must be a number.");
        }
      }

      const resolvedVisaDestination =
        visaDestination === "Other" ? visaDestinationOther.trim() : visaDestination.trim();

      if (visaServicesEnabled) {
        if (!resolvedVisaDestination) {
          throw new Error("Select a visa destination or enter a country for “Other”.");
        }
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
        throw new Error("Enter a valid departure date (DD/MM/YYYY).");
      }
      if (tripType === "return_trip") {
        if (!returnDate.trim()) {
          throw new Error("Choose a return date for return-trip tickets.");
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
          throw new Error("Enter a valid return date (DD/MM/YYYY).");
        }
        if (departureDate && returnDate.trim() < departureDate) {
          throw new Error("Return date must be on or after the departure date.");
        }
      }
      if (passportIssueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(passportIssueDate)) {
        throw new Error("Passport issue date must be DD/MM/YYYY or empty.");
      }
      if (passportExpiryDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(passportExpiryDate)) {
        throw new Error("Passport expiry must be DD/MM/YYYY or empty.");
      }

      const tripSelling = parsedSellingPrice ?? 0;
      const visaAmount = visaServicesEnabled && parsedVisaFee !== null ? parsedVisaFee : 0;
      const totalSellingPrice = tripSelling + visaAmount;
      const sellingPriceForDb = totalSellingPrice > 0 ? totalSellingPrice : null;

      if (depositAccountId.trim()) {
        const allowed = new Set(bankingAccounts.map((a) => a.id));
        if (!allowed.has(depositAccountId.trim())) {
          throw new Error(
            "Choose a deposit account from the list, or add it under Banking first. The app never creates accounts from this form."
          );
        }
      }

      // Try inserting with the newer flight info fields first.
      const depositFk = depositAccountId || null;
      const passportNum = passportIdNumber.trim() || null;

      const returnDatePayload =
        tripType === "return_trip" && returnDate.trim()
          ? { return_date: returnDate.trim() }
          : {};

      const bookingPayloadBase = {
        traveler_name: travelerName,
        traveler_phone: travelerPhone.trim() || null,
        passport_number: passportNum,
        passport_id_number: passportNum,
        passport_issue_date: passportIssueDate || null,
        passport_expiry_date: passportExpiryDate || null,
        departure_city: departureCity,
        destination_city: destinationCity,
        departure_time: dep24,
        arrival_time: arr24,
        net_cost: parsedNetCost,
        selling_price: sellingPriceForDb,
        airline_name: airlineName,
        flight_number: flightNumber,
        departure_date: departureDate,
        include_price: includePrice,
        payment_method: paymentMethod,
        visa_services_enabled: visaServicesEnabled,
        visa_destination: visaServicesEnabled ? resolvedVisaDestination : null,
        visa_service_fee: visaServicesEnabled && parsedVisaFee !== null ? parsedVisaFee : null,
        visa_status: visaServicesEnabled ? visaStatus : null,
        notes,
        ...returnDatePayload,
      };

      const bookingPayload = {
        ...bookingPayloadBase,
        deposit_to_id: depositFk,
      };

      async function updateBookingRow(bid: string, payload: Record<string, unknown>) {
        let res = await supabase.from("bookings").update(payload).eq("id", bid).select("id").single();
        for (const col of ["notes", "return_date"] as const) {
          if (!res.error) break;
          const msg = res.error?.message ?? "";
          const missingCol =
            (/schema cache/i.test(msg) || /could not find/i.test(msg)) &&
            new RegExp(`['"]?${col}['"]?`, "i").test(msg);
          if (!missingCol || !(col in payload)) continue;
          const { [col]: _omit, ...rest } = payload;
          res = await supabase.from("bookings").update(rest).eq("id", bid).select("id").single();
          payload = rest;
        }
        return res;
      }

      if (editingBookingId) {
        const editPayloadBase: Record<string, unknown> = {
          ...bookingPayloadBase,
          ...(tripType === "one_way" ? { return_date: null } : {}),
        };

        let res = await updateBookingRow(editingBookingId, {
          ...editPayloadBase,
          deposit_to_id: depositFk,
        });
        if (res.error) {
          res = await updateBookingRow(editingBookingId, {
            ...editPayloadBase,
            deposit_account_id: depositFk,
          });
        }
        if (res.error) {
          res = await updateBookingRow(editingBookingId, editPayloadBase);
        }
        if (res.error) throw res.error;

        const bookingId = editingBookingId;

        await supabase.from("booking_layovers").delete().eq("booking_id", bookingId);

        const filteredLayoversEdit = layovers.filter(
          (l) => l.city || l.airport || l.departure_time || l.arrival_time
        );

        if (filteredLayoversEdit.length > 0) {
          const layoverRows = filteredLayoversEdit.map((l) => ({
            booking_id: bookingId,
            city: l.city,
            airport: l.airport,
            departure_time: parseTimeTo24h(l.departure_time) ?? l.departure_time,
            arrival_time: parseTimeTo24h(l.arrival_time) ?? l.arrival_time,
          }));

          const { error: layoverError } = await supabase.from("booking_layovers").insert(layoverRows);

          if (layoverError) throw layoverError;
        }

        router.push(`/dashboard/tickets/${bookingId}?saved=1`);
      } else {
      /**
       * Retry without optional columns missing from the remote `bookings` table (PostgREST schema cache).
       */
      async function insertBookingRow(payload: Record<string, unknown>) {
        let res = await supabase.from("bookings").insert(payload).select("id").single();
        for (const col of ["notes", "return_date"] as const) {
          if (!res.error) break;
          const msg = res.error?.message ?? "";
          const missingCol =
            (/schema cache/i.test(msg) || /could not find/i.test(msg)) &&
            new RegExp(`['"]?${col}['"]?`, "i").test(msg);
          if (!missingCol || !(col in payload)) continue;
          const { [col]: _omit, ...rest } = payload;
          res = await supabase.from("bookings").insert(rest).select("id").single();
          payload = rest;
        }
        return res;
      }

      let savedWithMinimalFallback = false;
      const insertPrimary = await insertBookingRow(bookingPayload);

      let booking = insertPrimary.data;
      let error = insertPrimary.error;

      // Fallback chain: only the first insert may include `deposit_to_id`. Never retry `deposit_to_id`.
      // All fallbacks use `deposit_account_id` only (legacy FK).
      if (error) {
        const fallbackLegacyDeposit = await insertBookingRow({
          ...bookingPayloadBase,
          deposit_account_id: depositFk,
        });

        booking = fallbackLegacyDeposit.data;
        error = fallbackLegacyDeposit.error;
      }

      if (error) {
        const fallbackExtended = await insertBookingRow({
          traveler_name: travelerName,
          traveler_phone: travelerPhone.trim() || null,
          passport_number: passportNum,
          passport_id_number: passportNum,
          passport_issue_date: passportIssueDate || null,
          passport_expiry_date: passportExpiryDate || null,
          destination: destinationCity,
          departure_date: departureDate,
          ...returnDatePayload,
          notes,
          departure_city: departureCity,
          destination_city: destinationCity,
          departure_time: dep24,
          arrival_time: arr24,
          airline_name: airlineName,
          flight_number: flightNumber,
          net_cost: parsedNetCost,
          selling_price: sellingPriceForDb,
          include_price: includePrice,
          payment_method: paymentMethod,
          deposit_account_id: depositFk,
          visa_services_enabled: visaServicesEnabled,
          visa_destination: visaServicesEnabled ? resolvedVisaDestination : null,
          visa_service_fee: visaServicesEnabled && parsedVisaFee !== null ? parsedVisaFee : null,
          visa_status: visaServicesEnabled ? visaStatus : null,
        });

        booking = fallbackExtended.data;
        error = fallbackExtended.error;
      }

      if (error) {
        const fallbackMinimal = await insertBookingRow({
          traveler_name: travelerName,
          destination: destinationCity,
          departure_date: departureDate,
          ...returnDatePayload,
          notes,
        });

        booking = fallbackMinimal.data;
        error = fallbackMinimal.error;
        if (!error) savedWithMinimalFallback = true;
      }

      if (error) throw error;

      if (savedWithMinimalFallback) {
        toast(
          "info",
          "This ticket was saved with limited fields only (traveler, route, date, notes). Run the SQL migrations in supabase/migrations on your database so airline, times, and prices can be stored."
        );
      }

      const bookingId = booking?.id;
      if (!bookingId) {
        throw new Error("Booking was saved but no id was returned.");
      }

      if (depositAccountId && sellingPriceForDb !== null) {
        const memo = visaServicesEnabled
          ? `Ticket sale + visa (${travelerName.trim() || "Traveler"})`
          : `Ticket sale (${travelerName.trim() || "Traveler"})`;
        await applyDepositIncrement(supabase, depositAccountId, sellingPriceForDb, toast, {
          bookingId,
          memo,
        });
      }

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
          booking_id: bookingId,
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

      router.push(`/dashboard/tickets/${bookingId}?saved=1`);
      }
    } catch (error) {
      const rawMessage =
        error instanceof Error
          ? error.message
          : typeof error === "object" &&
              error !== null &&
              "message" in error
            ? String((error as { message?: unknown }).message ?? "")
            : "";
      const message = rawMessage.trim() || "Something went wrong while saving. Please try again.";
      setSubmitError(message);
      toast("error", formatSupabaseUserMessage(message));
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
    addLine("Trip", tripType === "return_trip" ? "Return trip" : "One way");
    addLine("Departure date", departureDate ? formatIsoDateDisplay(departureDate) : "-");
    if (tripType === "return_trip" && returnDate.trim()) {
      addLine("Return date", formatIsoDateDisplay(returnDate));
    }
    addLine("Depart", formatTimeTo12h(parseTimeTo24h(departureTime) ?? departureTime));
    addLine("Arrive", formatTimeTo12h(parseTimeTo24h(arrivalTime) ?? arrivalTime));
    addLine("Airline", airlineName);
    addLine("Flight no.", flightNumber);
    if (includePrice) {
      const tripNum = sellingPrice.trim()
        ? Number(sellingPrice.replace(/[^0-9.]/g, ""))
        : 0;
      const visaNum =
        visaServicesEnabled && visaServiceFee.trim()
          ? Number(visaServiceFee.replace(/[^0-9.]/g, ""))
          : 0;
      const total =
        (Number.isNaN(tripNum) ? 0 : tripNum) + (Number.isNaN(visaNum) ? 0 : visaNum);
      addLine("Price", total > 0 ? String(total) : sellingPrice);
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
    <main className="flex min-h-screen bg-slate-100/80">
      {inAppShell ? <AgencySidebar /> : null}
      <div
        className={
          inAppShell
            ? "flex-1 px-4 py-6 sm:px-8 sm:py-8"
            : "w-full px-4 py-6 sm:px-8 sm:py-8"
        }
      >
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-200/90 pb-5">
          {!inAppShell ? <BackButton className="-ml-1 px-2 py-1" /> : null}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">
                GARASHO · Prime Time
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#0f172a] sm:text-2xl">
                {editingBookingId ? "Edit ticket" : "Tickets"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {editingBookingId
                  ? "Update traveler, flight, and visa details — changes are saved to this booking."
                  : "Enterprise CRM for East African agencies — flight, traveler, and visa in one flow."}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#0f172a] shadow-sm hover:bg-slate-50"
              >
                Download itinerary PDF
              </button>
              <p className="max-w-[14rem] text-right text-[10px] text-slate-500">
                Saves a file to your computer (usually Downloads). For a paper copy, open the file and print, or use
                your browser’s Print → Save as PDF.
              </p>
            </div>
          </div>
        </div>

        {loadingEdit && editingBookingId ? (
          <div className="mt-10 flex min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-slate-600">
            <p>Loading ticket…</p>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-8">
          {editingBookingId && showPartialBookingNotice ? (
            <div
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
            >
              <p className="font-medium text-amber-950">Some flight fields are empty on purpose</p>
              <p className="mt-1.5 leading-relaxed text-amber-900/90">
                For this ticket, only route and date were saved in the database (often from an earlier
                “limited” save when the project database was missing columns). The form is not hiding
                your data—those values were never stored. Apply your project’s SQL migrations in
                Supabase, then enter airline, flight number, cities, and times here and save again.
              </p>
            </div>
          ) : null}
          <section className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-5 sm:p-6">
            <header className="border-b border-slate-200/80 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">01</p>
              <h2 className="mt-1 text-base font-semibold text-[#0f172a]">Flight details</h2>
              <p className="mt-1 text-xs text-slate-600">
                Route, schedule, commercial terms, connections, and layovers.
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Flight dates: use <span className="font-medium">DD/MM/YYYY</span> (day first).
              </p>
            </header>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <fieldset className="sm:col-span-2">
                <legend className="block text-xs font-medium text-slate-700">Trip type</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      tripType === "one_way"
                        ? "border-[#0f172a] bg-[#0f172a]/5 text-[#0f172a] ring-1 ring-[#0f172a]/15"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="garasho-trip-type"
                      className="sr-only"
                      checked={tripType === "one_way"}
                      onChange={() => {
                        setTripType("one_way");
                        setReturnDate("");
                      }}
                    />
                    One way
                  </label>
                  <label
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      tripType === "return_trip"
                        ? "border-[#0f172a] bg-[#0f172a]/5 text-[#0f172a] ring-1 ring-[#0f172a]/15"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="garasho-trip-type"
                      className="sr-only"
                      checked={tripType === "return_trip"}
                      onChange={() => setTripType("return_trip")}
                    />
                    Return trip
                  </label>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Return trip saves a return date (Supabase `bookings.return_date` — see migrations if missing).
                </p>
              </fieldset>

              <div>
                <label className="block text-xs font-medium text-slate-700">Airline</label>
                <input
                  type="text"
                  value={airlineName}
                  onChange={(e) => setAirlineName(e.target.value)}
                  placeholder="e.g. Turkish Airlines"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Flight number</label>
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder="e.g. TK647"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Departure city
                </label>
                <input
                  type="text"
                  required
                  value={departureCity}
                  onChange={(e) => setDepartureCity(e.target.value)}
                  className={fieldClass}
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
                  className={fieldClass}
                />
              </div>

              <DateInputDdMmYyyy
                id="booking-departure-date"
                label="Departure date"
                valueIso={departureDate}
                onChangeIso={setDepartureDate}
                required
                className={fieldClass}
              />

              {tripType === "return_trip" ? (
                <div>
                  <DateInputDdMmYyyy
                    id="booking-return-date"
                    label="Return date"
                    valueIso={returnDate}
                    onChangeIso={setReturnDate}
                    required
                    minIso={departureDate || undefined}
                    className={fieldClass}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Must be on or after departure (DD/MM/YYYY).
                  </p>
                </div>
              ) : null}

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
                    <p className="mt-1 text-[11px] text-slate-500">
                      Visa service fees (below) are added to this for the recorded total and banking deposit.
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Payment & deposit
                  </h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Payment method
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
                      >
                        <option value="Cash">Cash</option>
                        <option value="EVC">EVC</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Visa/Mastercard">Visa/Mastercard</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Deposit to
                      </label>
                      <select
                        value={depositAccountId}
                        onChange={(e) => setDepositAccountId(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
                      >
                        <option value="">No account selected</option>
                        {bankingAccounts.map((account) => {
                          const providerLabel = account.provider_name?.trim() || "";
                          const category =
                            account.type.includes("·")
                              ? account.type
                                  .split("·")
                                  .map((s) => s.trim())
                                  .pop() || ""
                              : "";
                          const rail =
                            [providerLabel, category].filter(Boolean).join(" · ") || account.type;
                          return (
                            <option key={account.id} value={account.id}>
                              {account.name} ({rail})
                            </option>
                          );
                        })}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Optional: which account should receive the deposit. Only accounts you added under Banking
                        appear here—this form never creates new bank accounts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Layovers
                </h3>
                <button
                  type="button"
                  onClick={addLayoverRow}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-[#0f172a] hover:border-[#0f172a]/30"
                >
                  + Add layover
                </button>
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/90">
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
                          onChange={(e) => updateLayover(l.id, "city", e.target.value)}
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
                          onChange={(e) => updateLayover(l.id, "airport", e.target.value)}
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
                Use 12-hour times (for example 9:30 AM).
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6">
            <header className="border-b border-slate-200/80 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">02</p>
              <h2 className="mt-1 text-base font-semibold text-[#0f172a]">Traveler identity</h2>
              <p className="mt-1 text-xs text-slate-600">
                Phone and passport — CRM only; never on the customer itinerary PDF.
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Passport issue and expiry: <span className="font-medium">DD/MM/YYYY</span>.
              </p>
            </header>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Traveler name</label>
                <input
                  type="text"
                  required
                  value={travelerName}
                  onChange={(e) => setTravelerName(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Traveler phone</label>
                <input
                  type="tel"
                  value={travelerPhone}
                  onChange={(e) => setTravelerPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="+252 ..."
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Passport number</label>
                <input
                  type="text"
                  value={passportIdNumber}
                  onChange={(e) => setPassportIdNumber(e.target.value)}
                  autoComplete="off"
                  className={fieldClass}
                />
              </div>
              <DateInputDdMmYyyy
                id="passport-issue-date"
                label="Passport issue date"
                valueIso={passportIssueDate}
                onChangeIso={setPassportIssueDate}
                className={fieldClass}
              />
              <DateInputDdMmYyyy
                id="passport-expiry-date"
                label="Passport expiry"
                valueIso={passportExpiryDate}
                onChangeIso={setPassportExpiryDate}
                className={fieldClass}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-4">
              <button
                type="button"
                onClick={copyPassportToNotes}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-[#0f172a] shadow-sm transition hover:bg-slate-50"
              >
                Copy passport to notes
              </button>
              <span className="text-[11px] text-slate-500">
                Appends ID and dates to Notes for quick CRM reference.
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">03</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-[#0f172a]">Visa services</h2>
                  {visaServicesEnabled ? (
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                        visaStatus === "Approved"
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : visaStatus === "Submitted"
                            ? "bg-sky-50 text-sky-800 ring-sky-200"
                            : "bg-amber-50 text-amber-900 ring-amber-200"
                      }`}
                    >
                      {visaStatus}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Visa fee rolls into selling price for accounting. Destination may appear on itinerary.
                  Track status here so your team sees workload at a glance.
                </p>
              </div>
              <label className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={visaServicesEnabled}
                  onChange={(e) => setVisaServicesEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0f172a] focus:ring-[#0f172a]"
                />
                Enable visa services
              </label>
            </div>
            {visaServicesEnabled ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Destination</label>
                  <select
                    required={visaServicesEnabled}
                    value={visaDestination}
                    onChange={(e) => setVisaDestination(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                  >
                    <option value="">Select country</option>
                    {VISA_DESTINATIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                {visaDestination === "Other" ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Other country</label>
                    <input
                      type="text"
                      required={visaServicesEnabled && visaDestination === "Other"}
                      value={visaDestinationOther}
                      onChange={(e) => setVisaDestinationOther(e.target.value)}
                      placeholder="Country name"
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Visa fee (adds to selling price)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={visaServiceFee}
                    onChange={(e) => setVisaServiceFee(e.target.value)}
                    placeholder="e.g. 150"
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Status</label>
                  <select
                    value={visaStatus}
                    onChange={(e) => setVisaStatus(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Approved">Approved</option>
                  </select>
                </div>
              </div>
            ) : null}
          </section>

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
              Tickets and layovers are saved to your project database.
            </p>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              {submitError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {submitError}
                </div>
              ) : null}
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-center text-sm font-medium text-[#0f172a] shadow-sm transition hover:bg-slate-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving || loadingEdit}
                  className="inline-flex items-center justify-center rounded-lg bg-[#0f172a] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving
                    ? editingBookingId
                      ? "Updating…"
                      : "Saving booking…"
                    : editingBookingId
                      ? "Update ticket"
                      : "Save booking"}
                </button>
              </div>
            </div>
          </div>
        </form>
        )}
      </div>
      </div>
    </main>
  );
}

export default function NewBookingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100/80 px-4">
          <p className="text-sm text-slate-600">Loading…</p>
        </main>
      }
    >
      <NewBookingPageContent />
    </Suspense>
  );
}

