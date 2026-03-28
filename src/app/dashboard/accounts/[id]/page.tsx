"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { BackButton } from "@/components/BackButton";
import { useToast } from "@/components/providers/ToastProvider";
import { formatConfirmationCode } from "@/lib/bookingConfirmation";
import { formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const PROVIDERS = ["Hormoud", "Salaam", "Premier", "EVC", "M-Pesa", "Cash"] as const;

type RailUi = "Bank" | "Mobile" | "Cash";

const RAIL_OPTIONS: { label: string; value: RailUi; db: "Bank Account" | "Mobile Money" | "Cash" }[] = [
  { label: "Bank", value: "Bank", db: "Bank Account" },
  { label: "Mobile (EVC)", value: "Mobile", db: "Mobile Money" },
  { label: "Cash", value: "Cash", db: "Cash" },
];

const DEFAULT_PROVIDER = PROVIDERS[0];
const DEFAULT_RAIL: RailUi = "Mobile";

function railDbValue(rail: RailUi): "Bank Account" | "Mobile Money" | "Cash" {
  return RAIL_OPTIONS.find((o) => o.value === rail)!.db;
}

function railUiFromType(type: string): RailUi {
  const last = (type || "")
    .split("·")
    .map((s) => s.trim())
    .pop();
  const match = RAIL_OPTIONS.find((o) => o.db === last);
  return match?.value ?? DEFAULT_RAIL;
}

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  provider_name: string | null;
  account_number: string | null;
};

function rowToAccount(row: Record<string, unknown>): Account {
  const raw = row.current_balance != null ? row.current_balance : 0;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    type: String(row.type ?? "Account"),
    balance: Number(raw) || 0,
    provider_name: (row.provider_name as string | null) ?? (row.provider as string | null) ?? null,
    account_number: (row.account_number as string | null) ?? null,
  };
}

type LedgerRow = {
  id: string;
  amount: number;
  source: string;
  memo: string | null;
  booking_id: string | null;
  created_at: string;
};

type BookingDepositRow = {
  id: string;
  traveler_name: string | null;
  destination_city: string | null;
  destination: string | null;
  selling_price: number | null;
  visa_services_enabled: boolean | null;
  created_at: string | null;
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function AccountActivityPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const formTitleId = useId();

  const accountId = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerTableMissing, setLedgerTableMissing] = useState(false);
  const [bookingRows, setBookingRows] = useState<BookingDepositRow[]>([]);

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER);
  const [railType, setRailType] = useState<RailUi>(DEFAULT_RAIL);
  const [accountNumber, setAccountNumber] = useState("");
  const [startingBalance, setStartingBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.auth.refreshSession().catch(() => {});

        const accRes = await supabase
          .from("banking_accounts")
          .select("id, name, type, current_balance, provider_name, account_number")
          .eq("id", accountId)
          .maybeSingle();

        if (cancelled) return;
        if (accRes.error || !accRes.data) {
          setAccount(null);
          setLedger([]);
          setBookingRows([]);
          return;
        }

        const acc = rowToAccount(accRes.data as Record<string, unknown>);
        setAccount(acc);
        setName(acc.name || "");
        const providerFromType = (acc.type || "")
          .split("·")
          .map((s) => s.trim())[0] || DEFAULT_PROVIDER;
        setProvider(acc.provider_name?.trim() || providerFromType || DEFAULT_PROVIDER);
        setRailType(railUiFromType(acc.type));
        setAccountNumber(acc.account_number || "");
        setStartingBalance(String(acc.balance ?? 0));

        const led = await supabase
          .from("banking_account_ledger")
          .select("id, amount, source, memo, booking_id, created_at")
          .eq("banking_account_id", accountId)
          .order("created_at", { ascending: false });

        if (cancelled) return;
        if (led.error) {
          const msg = led.error.message ?? "";
          if (/banking_account_ledger|42P01|does not exist|relation/i.test(msg)) {
            setLedgerTableMissing(true);
            setLedger([]);
          } else {
            setLedgerTableMissing(false);
            setLedger([]);
          }
        } else {
          setLedgerTableMissing(false);
          setLedger((led.data as LedgerRow[]) ?? []);
        }

        // Prefer deposit_to_id (current schema). Some DBs never had deposit_account_id — selecting or
        // filtering on it makes PostgREST error before any row is returned.
        const bookingSelect =
          "id, traveler_name, destination_city, destination, selling_price, visa_services_enabled, created_at, deposit_to_id";
        let book = await supabase
          .from("bookings")
          .select(bookingSelect)
          .eq("deposit_to_id", accountId)
          .order("created_at", { ascending: false });

        if (book.error) {
          const msg = book.error.message ?? "";
          if (/deposit_to_id.*does not exist|column .*deposit_to_id/i.test(msg)) {
            book = (await supabase
              .from("bookings")
              .select(
                "id, traveler_name, destination_city, destination, selling_price, visa_services_enabled, created_at, deposit_account_id"
              )
              .eq("deposit_account_id", accountId)
              .order("created_at", { ascending: false })) as typeof book;
          }
        }

        if (cancelled) return;
        setBookingRows((book.data as BookingDepositRow[]) ?? []);
      } catch {
        if (!cancelled) {
          setAccount(null);
          toast("error", "Could not load this account.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId, toast]);

  function validateForm(): string | null {
    if (!name.trim()) return "Please enter an account name.";
    if (!provider.trim()) return "Please select a provider.";
    if (!accountNumber.trim()) return "Please enter an account number.";
    const parsedBalance = startingBalance.trim()
      ? Number(startingBalance.replace(/[^0-9.]/g, ""))
      : 0;
    if (Number.isNaN(parsedBalance)) return "Balance must be a valid number.";
    return null;
  }

  async function handleUpdateAccount(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!accountId) return;

    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      toast("error", validationError);
      return;
    }

    const parsedBalance = startingBalance.trim()
      ? Number(startingBalance.replace(/[^0-9.]/g, ""))
      : 0;

    const accountCategoryDb = railDbValue(railType);
    const typeDisplay = `${provider.trim()} · ${accountCategoryDb}`;

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.refreshSession().catch(() => {});

      const providerLabel = provider.trim();
      const accountName = name.trim();
      const acctNum = accountNumber.trim();

      const payload = {
        name: accountName,
        type: typeDisplay,
        current_balance: parsedBalance,
        provider_name: providerLabel,
        account_number: acctNum,
      };

      const { error } = await supabase.from("banking_accounts").update(payload).eq("id", accountId);

      if (error) {
        const msg = formatSupabaseUserMessage(error.message || "Could not update account.");
        setSubmitError(msg);
        toast("error", msg);
        return;
      }

      setSubmitError(null);
      toast("success", "Account updated.");
      router.refresh();
      const supabase2 = getSupabaseBrowserClient();
      const accRes = await supabase2
        .from("banking_accounts")
        .select("id, name, type, current_balance, provider_name, account_number")
        .eq("id", accountId)
        .maybeSingle();
      if (accRes.data) {
        setAccount(rowToAccount(accRes.data as Record<string, unknown>));
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : "We couldn’t update this account.";
      const msg = formatSupabaseUserMessage(raw);
      setSubmitError(msg);
      toast("error", msg);
    } finally {
      setSaving(false);
    }
  }

  const ledgerBookingIds = new Set(ledger.map((r) => r.booking_id).filter(Boolean) as string[]);
  const inferredFromBookings = bookingRows.filter((b) => !ledgerBookingIds.has(b.id));

  /** Sum of selling_price for tickets that deposit to this account (same basis as activity list). */
  const ticketDepositsTotal = useMemo(
    () =>
      bookingRows.reduce((sum, r) => {
        if (r.selling_price == null) return sum;
        const n = Number(r.selling_price);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [bookingRows]
  );

  /**
   * Stored `current_balance` is updated when `increment_bank_account_balance` or the fallback runs at
   * ticket save. If that step failed or tickets predate it, DB balance can stay 0 while bookings still
   * link here — activity shows those tickets; balance should reflect them when ledger is empty.
   */
  const displayBalance =
    account && ledger.length === 0 && ticketDepositsTotal > 0
      ? Math.max(account.balance, ticketDepositsTotal)
      : account?.balance ?? 0;

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <AgencySidebar />
      <div className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">
                Banking
              </p>
              <h1 className="mt-1 text-xl font-semibold text-[#0f172a] sm:text-2xl">
                {account ? account.name : "Account"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Deposits from ticket sales (including visa totals on the same booking) and balance edits.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BackButton className="px-3 py-2" fallbackHref="/dashboard/accounts" />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : !account ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900">
              <p>Account not found.</p>
              <Link href="/dashboard/accounts" className="mt-2 inline-block font-medium text-rose-950 underline">
                Back to Digital wallet
              </Link>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-sm font-semibold text-[#0f172a]">Current balance</h2>
                <p className="mt-2 text-3xl font-bold tabular-nums text-[#0f172a]">
                  {money(displayBalance)}
                </p>
                {Math.abs(account.balance - displayBalance) > 0.005 ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Stored balance in the database is {money(account.balance)}. The headline figure matches
                    ticket deposits linked here—save account details with that total to sync the bank row, or
                    run your Supabase migrations so the bank increment function runs when tickets are saved.
                  </p>
                ) : null}
              </section>

              <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-base font-semibold text-[#0f172a]">Activity</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Money credited when a ticket is saved with this account as &quot;Deposit to&quot;. Visa fees are
                  included in the same booking total when visa is enabled.
                </p>

                {ledger.length > 0 ? (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {ledger.map((row) => {
                      const amt = Number(row.amount);
                      return (
                      <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {amt >= 0 ? "+" : ""}
                            {money(amt)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {row.created_at
                              ? new Date(row.created_at).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </p>
                          {row.memo ? <p className="mt-1 text-sm text-slate-700">{row.memo}</p> : null}
                          {row.booking_id ? (
                            <Link
                              href={`/dashboard/tickets/${row.booking_id}`}
                              className="mt-1 inline-flex text-sm font-medium text-sky-700 hover:underline"
                            >
                              Ticket {formatConfirmationCode(row.booking_id)}
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    );
                    })}
                  </ul>
                ) : null}

                {ledger.length === 0 && inferredFromBookings.length > 0 ? (
                  <div className="mt-4">
                    {ledgerTableMissing ? (
                      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-100">
                        Ledger history table is not applied yet. Showing deposits inferred from ticket records
                        linked to this account.
                      </p>
                    ) : (
                      <p className="mb-3 text-xs text-slate-500">
                        No ledger rows yet. Showing ticket-linked deposits from your bookings table.
                      </p>
                    )}
                    <ul className="divide-y divide-slate-100">
                      {inferredFromBookings.map((b) => {
                        const dest =
                          (b.destination_city && b.destination_city.trim()) ||
                          (b.destination && b.destination.trim()) ||
                          "—";
                        const amt = b.selling_price != null ? Number(b.selling_price) : 0;
                        const visa = Boolean(b.visa_services_enabled);
                        return (
                          <li
                            key={b.id}
                            className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-900">+{money(amt)}</p>
                              <p className="text-xs text-slate-500">
                                {b.created_at
                                  ? new Date(b.created_at).toLocaleString(undefined, {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    })
                                  : "—"}
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                {visa ? "Ticket + visa" : "Ticket"} · {b.traveler_name?.trim() || "Traveler"} ·{" "}
                                {dest}
                              </p>
                              <Link
                                href={`/dashboard/tickets/${b.id}`}
                                className="mt-1 inline-flex text-sm font-medium text-sky-700 hover:underline"
                              >
                                {formatConfirmationCode(b.id)}
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {ledger.length === 0 && inferredFromBookings.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    No deposits recorded for this account yet. Save a ticket with &quot;Deposit to&quot; set to
                    this wallet, or apply the banking ledger migration to start a detailed history.
                  </p>
                ) : null}
              </section>

              <section
                className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-5 sm:p-6"
                aria-labelledby={formTitleId}
              >
                <h2 id={formTitleId} className="text-base font-semibold text-[#0f172a]">
                  Account details
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Name, provider, rail, reference, and balance. This does not create a new account.
                </p>
                <form onSubmit={handleUpdateAccount} className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600">Account name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="off"
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Provider name</label>
                      <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
                      >
                        {PROVIDERS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Type</label>
                      <select
                        value={railType}
                        onChange={(e) => setRailType(e.target.value as RailUi)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
                      >
                        {RAIL_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Account number</label>
                      <input
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        autoComplete="off"
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Balance</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={startingBalance}
                        onChange={(e) => setStartingBalance(e.target.value)}
                        className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
                      />
                    </div>
                  </div>
                  {submitError ? (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-100" role="alert">
                      {submitError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-xl bg-[#0f172a] px-5 py-2.5 text-sm font-medium text-white shadow-md hover:bg-slate-800 disabled:opacity-70"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </form>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
