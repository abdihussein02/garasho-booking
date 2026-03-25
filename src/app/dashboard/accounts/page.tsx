"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const PROVIDERS = [
  "Hormoud",
  "Salaam Bank",
  "Premier Bank",
  "M-Pesa",
  "Dahabshiil",
  "Cash",
] as const;

const ACCOUNT_CATEGORIES = [
  "Mobile Money",
  "Bank Account",
  "Visa/Mastercard",
  "Cash",
] as const;

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  provider: string | null;
  account_category: string | null;
  account_number: string | null;
};

function maskAccountNumber(raw: string | null | undefined): string {
  if (!raw || !String(raw).trim()) return "—";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 0) return "—";
  if (digits.length <= 4) return `****${digits}`;
  return `****${digits.slice(-4)}`;
}

/** Hormoud / M-Pesa → mobile; Salaam / Premier / Dahabshiil → bank; Cash → cash. */
function railIconForProviderLabel(provider: string): "cash" | "bank" | "mobile" | "card" {
  const s = provider.toLowerCase();
  if (s.includes("cash")) return "cash";
  if (s.includes("hormoud") || s.includes("m-pesa") || s.includes("mpesa")) return "mobile";
  if (s.includes("salaam") || s.includes("premier") || s.includes("dahabshiil")) return "bank";
  return "bank";
}

function resolveDisplayCategory(account: Account): string | null {
  if (account.account_category) return account.account_category;
  const parts = (account.type || "").split("·").map((s) => s.trim());
  if (
    parts.length >= 2 &&
    (ACCOUNT_CATEGORIES as readonly string[]).includes(parts[parts.length - 1]!)
  ) {
    return parts[parts.length - 1]!;
  }
  return null;
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
        border: "border-amber-400/55",
        gradient: "from-amber-600/95 via-orange-800/88 to-slate-950",
        accent: "text-amber-100",
        chip: "bg-white/15 text-amber-50 ring-white/20",
        icon: "card" as const,
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
const DEFAULT_CATEGORY = ACCOUNT_CATEGORIES[0];

export default function AccountsPage() {
  const modalTitleId = useId();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER);
  const [accountCategory, setAccountCategory] = useState<string>(DEFAULT_CATEGORY);
  const [accountNumber, setAccountNumber] = useState("");
  const [startingBalance, setStartingBalance] = useState("");

  async function loadAccounts() {
    const supabase = getSupabaseBrowserClient();
    const full = await supabase
      .from("banking_accounts")
      .select("id, name, type, balance, provider, account_category, account_number")
      .order("name", { ascending: true });

    if (full.error) {
      const minimal = await supabase
        .from("banking_accounts")
        .select("id, name, type, balance")
        .order("name", { ascending: true });
      if (minimal.error) throw minimal.error;
      setAccounts(
        ((minimal.data as Pick<Account, "id" | "name" | "type" | "balance">[]) ?? []).map(
          (a) => ({
            ...a,
            balance: Number(a.balance) || 0,
            provider: null,
            account_category: null,
            account_number: null,
          })
        )
      );
      return;
    }

    setAccounts(
      ((full.data as Account[]) ?? []).map((a) => ({
        ...a,
        balance: Number(a.balance) || 0,
        provider: a.provider ?? null,
        account_category: a.account_category ?? null,
        account_number: a.account_number ?? null,
      }))
    );
  }

  useEffect(() => {
    async function run() {
      try {
        await loadAccounts();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to load accounts.";
        setSubmitError(msg);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, []);

  function validateForm(): string | null {
    if (!name.trim()) return "Please enter an account name.";
    if (!provider.trim()) return "Please select a provider.";
    if (!accountCategory.trim()) return "Please select an account type.";
    if (!accountNumber.trim()) return "Please enter an account number.";
    const parsedBalance = startingBalance.trim()
      ? Number(startingBalance.replace(/[^0-9.]/g, ""))
      : 0;
    if (Number.isNaN(parsedBalance)) return "Initial balance must be a valid number.";
    return null;
  }

  async function handleAddAccount(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    const parsedBalance = startingBalance.trim()
      ? Number(startingBalance.replace(/[^0-9.]/g, ""))
      : 0;

    setCreating(true);
    try {
      const supabase = getSupabaseBrowserClient();

      const payload = {
        name: name.trim(),
        provider: provider.trim(),
        account_category: accountCategory.trim(),
        account_number: accountNumber.trim(),
        balance: parsedBalance,
        type: provider.trim(),
      };

      const { error } = await supabase.from("banking_accounts").insert(payload);

      if (error) {
        const { error: legacyError } = await supabase.from("banking_accounts").insert({
          name: name.trim(),
          type: `${provider.trim()} · ${accountCategory.trim()}`,
          balance: parsedBalance,
        });
        if (legacyError) throw legacyError;
      }

      setName("");
      setProvider(DEFAULT_PROVIDER);
      setAccountCategory(DEFAULT_CATEGORY);
      setAccountNumber("");
      setStartingBalance("");
      setAddOpen(false);
      await loadAccounts();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "We couldn’t add this account. Check your connection and try again.";
      setSubmitError(msg);
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
                    Global balance
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
                setAddOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800"
            >
              Add account
            </button>
            <BackButton className="px-3 py-2" />
          </div>
        </div>

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
              const displayProvider =
                account.provider?.trim() ||
                ((account.type || "").includes("·")
                  ? (account.type || "").split("·")[0]!.trim()
                  : account.type) ||
                "—";
              const theme = walletThemeFromProvider(displayProvider, resolveDisplayCategory(account));
              return (
                <li key={account.id}>
                  <article
                    className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-6 text-white shadow-lg ${theme.border} ${theme.gradient}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`rounded-full p-2 ${theme.chip} ring-1`}>
                        <CardIcon kind={railIconForProviderLabel(displayProvider)} />
                      </div>
                      <span
                        className={`max-w-[55%] truncate rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${theme.chip}`}
                      >
                        {resolveDisplayCategory(account) || "Account"}
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
                      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
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

        {submitError && !addOpen ? (
          <p className="text-center text-sm text-rose-600" role="alert">
            {submitError}
          </p>
        ) : null}
      </div>

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating) setAddOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">
                  GARASHO
                </p>
                <h2 id={modalTitleId} className="mt-1 text-xl font-semibold text-slate-900">
                  Add account
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Capture provider, rail type, and masked reference for your ledger.
                </p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => setAddOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Account name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                  placeholder="e.g. Main operating wallet"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none ring-sky-200/60 focus:bg-white focus:ring-2"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Provider name</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none ring-sky-200/60 focus:bg-white focus:ring-2"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={accountCategory}
                    onChange={(e) => setAccountCategory(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none ring-sky-200/60 focus:bg-white focus:ring-2"
                  >
                    {ACCOUNT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Account number</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  autoComplete="off"
                  placeholder="MSISDN, IBAN, or card reference"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none ring-sky-200/60 focus:bg-white focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Initial balance</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none ring-sky-200/60 focus:bg-white focus:ring-2"
                />
              </div>

              {submitError ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100" role="alert">
                  {submitError}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setAddOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-md hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {creating ? (
                    <>
                      <Spinner className="h-4 w-4 text-white" />
                      Saving…
                    </>
                  ) : (
                    "Add account"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
