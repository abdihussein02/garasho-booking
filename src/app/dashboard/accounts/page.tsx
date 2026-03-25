"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { useToast } from "@/components/providers/ToastProvider";
import { formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const PROVIDERS = ["Hormoud", "Salaam", "Premier", "EVC", "M-Pesa", "Cash"] as const;

type RailUi = "Bank" | "Mobile" | "Cash";

const RAIL_OPTIONS: { label: string; value: RailUi; db: "Bank Account" | "Mobile Money" | "Cash" }[] = [
  { label: "Bank", value: "Bank", db: "Bank Account" },
  { label: "Mobile (EVC)", value: "Mobile", db: "Mobile Money" },
  { label: "Cash", value: "Cash", db: "Cash" },
];

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  provider_name: string | null;
  account_number: string | null;
};

function displayProviderName(account: Account): string {
  return (
    account.provider_name?.trim() ||
    ((account.type || "").includes("·")
      ? (account.type || "").split("·")[0]!.trim()
      : account.type) ||
    ""
  );
}

function maskAccountNumber(raw: string | null | undefined): string {
  if (!raw || !String(raw).trim()) return "—";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 0) return "—";
  if (digits.length <= 4) return `****${digits}`;
  return `****${digits.slice(-4)}`;
}

/** Cash → green; EVC / Hormoud / M-Pesa → purple (mobile); Salaam / Premier / banks → blue. */
function railIconForProviderLabel(provider: string): "cash" | "bank" | "mobile" | "card" {
  const s = provider.toLowerCase();
  if (s.includes("cash")) return "cash";
  if (s.includes("evc") || s.includes("hormoud") || s.includes("m-pesa") || s.includes("mpesa"))
    return "mobile";
  if (s.includes("salaam") || s.includes("premier") || s.includes("dahabshiil")) return "bank";
  return "bank";
}

const LEGACY_CATEGORIES = ["Mobile Money", "Bank Account", "Visa/Mastercard", "Cash"] as const;

function resolveDisplayCategory(account: Account): string | null {
  const parts = (account.type || "").split("·").map((s) => s.trim());
  if (
    parts.length >= 2 &&
    (LEGACY_CATEGORIES as readonly string[]).includes(parts[parts.length - 1]! as (typeof LEGACY_CATEGORIES)[number])
  ) {
    return parts[parts.length - 1]!;
  }
  return null;
}

/** Rail category from `type` ("Provider · Category") for card color (Bank / Mobile / Cash). */
function resolveAccountKind(account: Account): "Bank Account" | "Mobile Money" | "Cash" | null {
  const fromType = resolveDisplayCategory(account);
  if (fromType === "Bank Account" || fromType === "Mobile Money" || fromType === "Cash") return fromType;
  return null;
}

function cardGradientTheme(account: Account, displayProvider: string) {
  const low = displayProvider.toLowerCase();
  if (low.includes("evc")) return getCategoryTheme("Mobile Money");
  const kind = resolveAccountKind(account);
  if (kind) return getCategoryTheme(kind);
  return walletThemeFromProvider(displayProvider, resolveDisplayCategory(account));
}

function cardIconKind(account: Account, displayProvider: string): "cash" | "bank" | "mobile" | "card" {
  const kind = resolveAccountKind(account);
  if (kind === "Cash") return "cash";
  if (kind === "Mobile Money") return "mobile";
  if (kind === "Bank Account") return "bank";
  return railIconForProviderLabel(displayProvider);
}

function chipLabelForAccount(account: Account): string {
  const k = resolveAccountKind(account);
  if (k === "Bank Account") return "Bank";
  if (k === "Mobile Money") return "Mobile";
  if (k === "Cash") return "Cash";
  return resolveDisplayCategory(account) || "Account";
}

function getCategoryTheme(category: string | null | undefined) {
  switch (category) {
    case "Cash":
      return {
        border: "border-emerald-300/60",
        gradient: "from-emerald-600/90 via-emerald-700/85 to-slate-900",
        accent: "text-emerald-100",
        chip: "bg-emerald-500/25 text-emerald-50 ring-emerald-400/30",
        icon: "cash" as const,
      };
    case "Bank Account":
      return {
        border: "border-sky-400/50",
        gradient: "from-sky-600/95 via-blue-800/90 to-slate-950",
        accent: "text-sky-100",
        chip: "bg-white/15 text-sky-50 ring-white/20",
        icon: "bank" as const,
      };
    case "Mobile Money":
      return {
        border: "border-violet-400/50",
        gradient: "from-violet-600/95 via-purple-800/88 to-slate-950",
        accent: "text-violet-100",
        chip: "bg-white/15 text-violet-50 ring-white/20",
        icon: "mobile" as const,
      };
    case "Visa/Mastercard":
      return {
        border: "border-sky-400/50",
        gradient: "from-sky-600/95 via-blue-800/90 to-slate-950",
        accent: "text-sky-100",
        chip: "bg-white/15 text-sky-50 ring-white/20",
        icon: "bank" as const,
      };
    default:
      return {
        border: "border-slate-400/40",
        gradient: "from-slate-700 via-slate-800 to-slate-950",
        accent: "text-slate-200",
        chip: "bg-white/10 text-slate-100 ring-white/15",
        icon: "bank" as const,
      };
  }
}

/** Digital wallet colors: bank → blue, mobile → purple, cash → green (provider wins over stored category). */
function walletThemeFromProvider(displayProvider: string, category: string | null) {
  const rail = railIconForProviderLabel(displayProvider);
  if (rail === "cash") return getCategoryTheme("Cash");
  if (rail === "mobile") return getCategoryTheme("Mobile Money");
  if (rail === "bank") return getCategoryTheme("Bank Account");
  return getCategoryTheme(category);
}

function CardIcon({ kind }: { kind: "cash" | "bank" | "mobile" | "card" }) {
  const cls = "h-8 w-8";
  if (kind === "cash") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" className="opacity-80" />
        <path
          d="M12 7v10M9 10h6M9 14h6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "mobile") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 18h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "card") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9zM3 10V7a2 2 0 012-2h14a2 2 0 012 2v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GlobalBalanceIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.25" className="opacity-40" />
      <path
        d="M12 3a9 9 0 019 9M12 3a9 9 0 00-9 9M12 3v18M3 12h18"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        className="opacity-80"
      />
      <path
        d="M12 3c2.5 3.5 4 6.2 4 9s-1.5 5.5-4 9c-2.5-3.5-4-6.2-4-9s1.5-5.5 4-9z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const DEFAULT_PROVIDER = PROVIDERS[0];
const DEFAULT_RAIL: RailUi = "Mobile";

function railDbValue(rail: RailUi): "Bank Account" | "Mobile Money" | "Cash" {
  return RAIL_OPTIONS.find((o) => o.value === rail)!.db;
}

/** Map DB row to UI account (`current_balance` → local `balance` for display). */
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

function isSchemaCacheOrStaleColumnError(message: string | undefined): boolean {
  return /schema cache|could not find|does not exist|PGRST204/i.test(message || "");
}

export default function AccountsPage() {
  const addFormTitleId = useId();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER);
  const [railType, setRailType] = useState<RailUi>(DEFAULT_RAIL);
  const [accountNumber, setAccountNumber] = useState("");
  const [startingBalance, setStartingBalance] = useState("");

  async function loadAccounts() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.refreshSession().catch(() => {});

    const selectList = "id, name, type, current_balance, provider_name, account_number";
    const runSelect = () =>
      supabase.from("banking_accounts").select(selectList).order("name", { ascending: true });

    let res = await runSelect();
    if (res.error && isSchemaCacheOrStaleColumnError(res.error.message)) {
      await new Promise((r) => setTimeout(r, 200));
      res = await runSelect();
    }

    if (res.error) throw res.error;
    const rows = (res.data as unknown as Record<string, unknown>[]) ?? [];
    setAccounts(rows.map(rowToAccount));
  }

  useEffect(() => {
    async function run() {
      try {
        await loadAccounts();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to load accounts.";
        setSubmitError(msg);
        toast("error", formatSupabaseUserMessage(msg));
      } finally {
        setLoading(false);
      }
    }
    run();
  }, []);

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

  async function handleAddAccount(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

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

    setCreating(true);
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

      let inserted = await supabase.from("banking_accounts").insert(payload).select("id").maybeSingle();

      if (inserted.error) {
        const minimal = await supabase
          .from("banking_accounts")
          .insert({
            name: accountName,
            type: typeDisplay,
            current_balance: parsedBalance,
            provider_name: providerLabel,
          })
          .select("id")
          .single();

        if (minimal.error) {
          const msg = formatSupabaseUserMessage(minimal.error.message || "Could not save account.");
          setSubmitError(msg);
          toast("error", msg);
          return;
        }

        const rowId = minimal.data.id;
        const { error: patchErr } = await supabase
          .from("banking_accounts")
          .update({
            provider_name: providerLabel,
            account_number: acctNum,
          })
          .eq("id", rowId);

        if (patchErr) {
          const ignorable =
            /column|does not exist|schema cache|could not find/i.test(patchErr.message || "");
          if (!ignorable) {
            const msg = formatSupabaseUserMessage(patchErr.message);
            setSubmitError(msg);
            toast("error", msg);
            return;
          }
        }
      }

      setName("");
      setProvider(DEFAULT_PROVIDER);
      setRailType(DEFAULT_RAIL);
      setAccountNumber("");
      setStartingBalance("");
      setAddPanelOpen(false);
      setSubmitError(null);
      await loadAccounts();
      toast("success", "Account saved.");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "We couldn’t add this account.";
      const msg = formatSupabaseUserMessage(raw);
      setSubmitError(msg);
      toast("error", msg);
    } finally {
      setCreating(false);
    }
  }

  const totalLiquidAssets = accounts.reduce((sum, account) => sum + (account.balance || 0), 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-slate-200/80 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-6 text-white shadow-2xl shadow-slate-900/25 sm:p-10">
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-500/15 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl"
            aria-hidden
          />

          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/95">
                GARASHO
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Digital wallet
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Bank (blue), mobile money (purple), and cash (green) rails—balances, masked references, and
                liquidity in one place.
              </p>
            </div>

            <div className="relative flex min-w-[min(100%,280px)] flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.09] to-white/[0.02] p-6 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/90">
                    Total liquid assets
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-white sm:text-[2rem]">
                    ${totalLiquidAssets.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Total liquid assets across all accounts</p>
                </div>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/30 to-indigo-500/25 text-sky-100 ring-1 ring-white/10">
                  <GlobalBalanceIcon className="h-8 w-8" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Your accounts</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Cards reflect live balances from GARASHO bookings and manual top-ups.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                setAddPanelOpen((o) => !o);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-[#0f172a] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800"
            >
              {addPanelOpen ? "Close" : "Add account"}
            </button>
            <BackButton className="px-3 py-2" />
          </div>
        </div>

        {addPanelOpen ? (
          <section
            className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5"
            aria-labelledby={addFormTitleId}
          >
            <div className="mb-4 border-b border-slate-100 pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">GARASHO</p>
              <h2 id={addFormTitleId} className="mt-1 text-base font-semibold text-[#0f172a]">
                Add account
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Name, provider, rail type, reference, and opening balance — saved to Supabase with automatic
                liquidity refresh.
              </p>
            </div>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end xl:gap-4">
                <div className="min-w-[min(100%,12rem)] flex-1">
                  <label htmlFor="garasho-account-name" className="block text-[11px] font-medium text-slate-600">
                    Account name
                  </label>
                  <input
                    id="garasho-account-name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                    placeholder="e.g. Main operating wallet"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
                  />
                </div>
                <div className="min-w-[min(100%,10rem)] flex-1">
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
                <div className="min-w-[min(100%,10rem)] flex-1">
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
                <div className="min-w-[min(100%,11rem)] flex-1">
                  <label className="block text-[11px] font-medium text-slate-600">Account number</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    autoComplete="off"
                    placeholder="MSISDN, IBAN, or ref."
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
                  />
                </div>
                <div className="min-w-[min(100%,8rem)] flex-1">
                  <label className="block text-[11px] font-medium text-slate-600">Balance</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={startingBalance}
                    onChange={(e) => setStartingBalance(e.target.value)}
                    placeholder="0"
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
                  />
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end xl:w-auto xl:flex-initial xl:pb-0.5">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => {
                      setSubmitError(null);
                      setAddPanelOpen(false);
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f172a] px-5 py-2.5 text-sm font-medium text-white shadow-md hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {creating ? (
                      <>
                        <Spinner className="h-4 w-4 text-white" />
                        Saving…
                      </>
                    ) : (
                      "Save account"
                    )}
                  </button>
                </div>
              </div>
              {submitError && addPanelOpen ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-100" role="alert">
                  {submitError}
                </p>
              ) : null}
            </form>
          </section>
        ) : null}

        {loading ? (
          <div className="flex justify-center rounded-2xl border border-slate-200/80 bg-white/80 py-20">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Spinner className="h-8 w-8 text-sky-600" />
              <p className="text-sm">Loading accounts…</p>
            </div>
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No accounts yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Add your first wallet or bank rail with the button above.
            </p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => {
              const displayProvider = displayProviderName(account) || "—";
              const theme = cardGradientTheme(account, displayProvider);
              return (
                <li key={account.id}>
                  <article
                    className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-6 text-white shadow-lg ${theme.border} ${theme.gradient}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`rounded-full p-2 ${theme.chip} ring-1`}>
                        <CardIcon kind={cardIconKind(account, displayProvider)} />
                      </div>
                      <span
                        className={`max-w-[55%] truncate rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${theme.chip}`}
                      >
                        {chipLabelForAccount(account)}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold leading-snug tracking-tight">
                      {account.name}
                    </h3>
                    <p className={`mt-1 text-xs font-medium ${theme.accent} opacity-90`}>
                      {displayProvider}
                    </p>
                    <p className="mt-4 font-mono text-sm tracking-[0.12em] text-white/80">
                      {maskAccountNumber(account.account_number)}
                    </p>
                    <div className="mt-5 flex flex-1 flex-col justify-end border-t border-white/10 pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                        Balance
                      </p>
                      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
                        ${account.balance.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {submitError && !addPanelOpen ? (
          <p className="text-center text-sm text-rose-600" role="alert">
            {submitError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
