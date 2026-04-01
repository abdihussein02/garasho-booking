"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { useToast } from "@/components/providers/ToastProvider";
import { applyDepositIncrement } from "@/lib/bankingDeposit";
import { formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "garasho-visa-assistance-v2";

type BankingAccountOption = {
  id: string;
  name: string;
  type: string;
  provider_name: string | null;
};

type VisaAssistanceCase = {
  id: string;
  travelerName: string;
  destination: string;
  status: string;
  nextStep: string;
  notes: string;
  updatedAt: string;
  /** Embassy / supplier cost to the agency (optional). */
  agencyCost: number | null;
  /** Fee charged to the customer for assistance (optional). */
  agencyFee: number | null;
  depositAccountId: string | null;
  depositAccountName: string | null;
  /** True when agency fee was credited to banking via Supabase. */
  bankDepositApplied: boolean;
};

const STATUS_OPTIONS = [
  "Intake",
  "Documents collected",
  "Submitted to embassy",
  "Interview scheduled",
  "Decision pending",
  "Approved",
  "Closed",
] as const;

function parseMoney(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeCase(raw: unknown): VisaAssistanceCase | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.travelerName !== "string") return null;
  const cost = r.agencyCost != null ? Number(r.agencyCost) : null;
  const fee = r.agencyFee != null ? Number(r.agencyFee) : null;
  return {
    id: r.id,
    travelerName: r.travelerName,
    destination: String(r.destination ?? ""),
    status: String(r.status ?? STATUS_OPTIONS[0]),
    nextStep: String(r.nextStep ?? ""),
    notes: String(r.notes ?? ""),
    updatedAt: String(r.updatedAt ?? new Date().toISOString()),
    agencyCost: cost != null && Number.isFinite(cost) ? cost : null,
    agencyFee: fee != null && Number.isFinite(fee) ? fee : null,
    depositAccountId: r.depositAccountId != null ? String(r.depositAccountId) : null,
    depositAccountName: r.depositAccountName != null ? String(r.depositAccountName) : null,
    bankDepositApplied: Boolean(r.bankDepositApplied),
  };
}

function loadCases(): VisaAssistanceCase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem("garasho-visa-assistance-v1");
      if (legacy) {
        const parsed = JSON.parse(legacy) as unknown;
        if (Array.isArray(parsed)) {
          const migrated: VisaAssistanceCase[] = parsed
            .map((row) => {
              const n = normalizeCase(row);
              if (!n) return null;
              const out: VisaAssistanceCase = {
                ...n,
                agencyCost: null,
                agencyFee: null,
                depositAccountId: null,
                depositAccountName: null,
                bankDepositApplied: false,
              };
              return out;
            })
            .filter((x): x is VisaAssistanceCase => x != null);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          localStorage.removeItem("garasho-visa-assistance-v1");
          return migrated;
        }
      }
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCase).filter((x): x is VisaAssistanceCase => x != null);
  } catch {
    return [];
  }
}

function saveCases(cases: VisaAssistanceCase[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function VisaAssistancePage() {
  const router = useRouter();
  const { toast } = useToast();
  const formId = useId();
  const [cases, setCases] = useState<VisaAssistanceCase[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [bankingAccounts, setBankingAccounts] = useState<BankingAccountOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [travelerName, setTravelerName] = useState("");
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState<string>(STATUS_OPTIONS[0]!);
  const [nextStep, setNextStep] = useState("");
  const [notes, setNotes] = useState("");
  const [agencyCostInput, setAgencyCostInput] = useState("");
  const [agencyFeeInput, setAgencyFeeInput] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    async function gate() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/auth");
        return;
      }
      await supabase.auth.refreshSession().catch(() => {});

      const res = await supabase
        .from("banking_accounts")
        .select("id, name, type, current_balance, provider_name")
        .order("name", { ascending: true });
      if (!res.error && res.data) {
        const raw = (res.data as Record<string, unknown>[]) ?? [];
        setBankingAccounts(
          raw.map((row) => ({
            id: String(row.id),
            name: String(row.name ?? ""),
            type: String(row.type ?? ""),
            provider_name: (row.provider_name as string | null) ?? null,
          }))
        );
      }

      setCases(loadCases());
      setHydrated(true);
    }
    gate();
  }, [router]);

  useEffect(() => {
    if (!hydrated) return;
    saveCases(cases);
  }, [cases, hydrated]);

  const sorted = useMemo(
    () =>
      [...cases].sort((a, b) =>
        (b.updatedAt || "").localeCompare(a.updatedAt || "")
      ),
    [cases]
  );

  const marginPreview = useMemo(() => {
    const fee = parseMoney(agencyFeeInput);
    const cost = parseMoney(agencyCostInput);
    if (fee == null && cost == null) return null;
    const f = fee ?? 0;
    const c = cost ?? 0;
    return f - c;
  }, [agencyFeeInput, agencyCostInput]);

  function resetForm() {
    setTravelerName("");
    setDestination("");
    setStatus(STATUS_OPTIONS[0]!);
    setNextStep("");
    setNotes("");
    setAgencyCostInput("");
    setAgencyFeeInput("");
    setDepositAccountId("");
    setEditingId(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = travelerName.trim();
    const dest = destination.trim();
    if (!name || !dest) return;

    const agencyCost = parseMoney(agencyCostInput);
    const agencyFee = parseMoney(agencyFeeInput);
    const depId = depositAccountId.trim();

    if (agencyFee != null && agencyFee > 0) {
      const allowed = new Set(bankingAccounts.map((a) => a.id));
      if (!depId || !allowed.has(depId)) {
        toast(
          "error",
          "Choose a deposit account when you enter an agency fee, or clear the fee. Add accounts under Banking first."
        );
        return;
      }
    }

    const now = new Date().toISOString();

    if (editingId) {
      setCases((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                travelerName: name,
                destination: dest,
                status,
                nextStep: nextStep.trim(),
                notes: notes.trim(),
                agencyCost,
                agencyFee,
                depositAccountId: depId || null,
                depositAccountName: depId
                  ? bankingAccounts.find((a) => a.id === depId)?.name ?? c.depositAccountName
                  : null,
                updatedAt: now,
              }
            : c
        )
      );
      resetForm();
      toast("success", "Case updated. Bank balance is not changed when editing—adjust Banking if needed.");
      return;
    }

    const id = crypto.randomUUID();
    const accountMeta = depId ? bankingAccounts.find((a) => a.id === depId) : null;
    const depositAccountName = accountMeta?.name ?? null;

    const row: VisaAssistanceCase = {
      id,
      travelerName: name,
      destination: dest,
      status,
      nextStep: nextStep.trim(),
      notes: notes.trim(),
      updatedAt: now,
      agencyCost,
      agencyFee,
      depositAccountId: depId || null,
      depositAccountName,
      bankDepositApplied: false,
    };

    if (agencyFee != null && agencyFee > 0 && depId) {
      setSubmitting(true);
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.auth.refreshSession().catch(() => {});
        await applyDepositIncrement(supabase, depId, agencyFee, toast, {
          memo: `Visa assistance · ${name} · ${id.slice(0, 8)}`,
          source: "visa_case",
        });
        row.bankDepositApplied = true;
        toast("success", "Case added and agency fee credited to the selected account.");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not apply deposit. Case was not saved.";
        toast("error", formatSupabaseUserMessage(msg));
        setSubmitting(false);
        return;
      } finally {
        setSubmitting(false);
      }
    } else {
      toast("success", "Case added.");
    }

    setCases((prev) => [row, ...prev]);
    resetForm();
  }

  function startEdit(c: VisaAssistanceCase) {
    setEditingId(c.id);
    setTravelerName(c.travelerName);
    setDestination(c.destination);
    setStatus(c.status || STATUS_OPTIONS[0]!);
    setNextStep(c.nextStep || "");
    setNotes(c.notes || "");
    setAgencyCostInput(c.agencyCost != null ? String(c.agencyCost) : "");
    setAgencyFeeInput(c.agencyFee != null ? String(c.agencyFee) : "");
    setDepositAccountId(c.depositAccountId ?? "");
  }

  function handleDelete(id: string) {
    if (!window.confirm("Remove this visa case from the tracker? Banking entries are not reversed."))
      return;
    setCases((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) resetForm();
  }

  const fieldClass =
    "mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2";

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <AgencySidebar />

      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#0f172a] sm:text-2xl">
              Visa assistance
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Track standalone visa applications — embassy, destination, costs, fees, and where each file stands.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/tickets"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Tickets
            </Link>
            <Link
              href="/dashboard/accounts"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Banking
            </Link>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-5">
          <section className="xl:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {editingId ? "Edit case" : "New case"}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Log who needs help, where they are applying, your costs, and the fee you charge. Agency fee can
                  be deposited to a bank wallet when you add a new case.
                </p>
              </div>
              <form id={formId} onSubmit={(ev) => void handleSubmit(ev)} className="space-y-4 p-4 sm:p-5">
                <div>
                  <label htmlFor={`${formId}-name`} className="block text-xs font-medium text-slate-700">
                    Traveler name
                  </label>
                  <input
                    id={`${formId}-name`}
                    value={travelerName}
                    onChange={(e) => setTravelerName(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="Full name as on passport"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-dest`}
                    className="block text-xs font-medium text-slate-700"
                  >
                    Destination / embassy country
                  </label>
                  <input
                    id={`${formId}-dest`}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="e.g. UK visitor visa, UAE, Schengen — France"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${formId}-cost`} className="block text-xs font-medium text-slate-700">
                      Cost to agency
                    </label>
                    <input
                      id={`${formId}-cost`}
                      type="text"
                      inputMode="decimal"
                      value={agencyCostInput}
                      onChange={(e) => setAgencyCostInput(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. 150 (embassy / supplier)"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">What you pay out (optional).</p>
                  </div>
                  <div>
                    <label htmlFor={`${formId}-fee`} className="block text-xs font-medium text-slate-700">
                      Agency fee (customer)
                    </label>
                    <input
                      id={`${formId}-fee`}
                      type="text"
                      inputMode="decimal"
                      value={agencyFeeInput}
                      onChange={(e) => setAgencyFeeInput(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. 300"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Charged to the traveler (optional).</p>
                  </div>
                </div>
                {marginPreview != null ? (
                  <p className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">Margin (fee − cost):</span>{" "}
                    {money(marginPreview)}
                  </p>
                ) : null}
                <div>
                  <label htmlFor={`${formId}-deposit`} className="block text-xs font-medium text-slate-700">
                    Deposit agency fee to
                  </label>
                  <select
                    id={`${formId}-deposit`}
                    value={depositAccountId}
                    onChange={(e) => setDepositAccountId(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">No account (no bank credit)</option>
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
                    When you add a case, the agency fee amount is credited to this wallet (same as ticket deposits).
                    Requires an agency fee and a selected account.
                  </p>
                </div>
                <div>
                  <label htmlFor={`${formId}-status`} className="block text-xs font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    id={`${formId}-status`}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={fieldClass}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${formId}-next`} className="block text-xs font-medium text-slate-700">
                    Next step
                  </label>
                  <input
                    id={`${formId}-next`}
                    value={nextStep}
                    onChange={(e) => setNextStep(e.target.value)}
                    className={fieldClass}
                    placeholder="e.g. Bank statements due Friday"
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-notes`} className="block text-xs font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    id={`${formId}-notes`}
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={fieldClass}
                    placeholder="Internal notes, appointment refs…"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {submitting ? "Saving…" : editingId ? "Save changes" : "Add case"}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-slate-500">
                  Pipeline rows are stored in this browser. Deposits use your Supabase banking accounts and
                  ledger. Editing a case does not change bank balances—correct them under Banking if needed.
                </p>
              </form>
            </div>
          </section>

          <section className="xl:col-span-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Pipeline
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {sorted.length === 0
                    ? "No visa cases yet — add one on the left."
                    : `${sorted.length} case${sorted.length === 1 ? "" : "s"} on file.`}
                </p>
              </div>
              {!hydrated ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">Loading…</div>
              ) : sorted.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">
                  Standalone visa help (not tied to a flight ticket) shows up here.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sorted.map((c) => (
                    <article key={c.id} className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-[#0f172a]">{c.travelerName}</p>
                          <p className="mt-0.5 text-sm text-slate-700">{c.destination}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5">
                              Cost {money(c.agencyCost)}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5">
                              Fee {money(c.agencyFee)}
                            </span>
                            {c.agencyFee != null &&
                            c.agencyCost != null &&
                            Number.isFinite(c.agencyFee) &&
                            Number.isFinite(c.agencyCost) ? (
                              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-900">
                                Margin {money(c.agencyFee - c.agencyCost)}
                              </span>
                            ) : null}
                          </div>
                          {c.bankDepositApplied && c.depositAccountName ? (
                            <p className="mt-2 text-[11px] text-sky-800">
                              Fee deposited to: <span className="font-medium">{c.depositAccountName}</span>
                            </p>
                          ) : null}
                          <p className="mt-2 inline-flex rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-900 ring-1 ring-sky-100">
                            {c.status}
                          </p>
                          {c.nextStep ? (
                            <p className="mt-2 text-xs text-slate-600">
                              <span className="font-medium text-slate-700">Next:</span> {c.nextStep}
                            </p>
                          ) : null}
                          {c.notes ? (
                            <p className="mt-2 text-xs leading-relaxed text-slate-600">{c.notes}</p>
                          ) : null}
                          <p className="mt-2 text-[10px] text-slate-400">
                            Updated {new Date(c.updatedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
