"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "garasho-visa-assistance-v1";

type VisaAssistanceCase = {
  id: string;
  travelerName: string;
  destination: string;
  status: string;
  nextStep: string;
  notes: string;
  updatedAt: string;
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

function loadCases(): VisaAssistanceCase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is VisaAssistanceCase =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as VisaAssistanceCase).id === "string" &&
        typeof (row as VisaAssistanceCase).travelerName === "string"
    );
  } catch {
    return [];
  }
}

function saveCases(cases: VisaAssistanceCase[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

export default function VisaAssistancePage() {
  const router = useRouter();
  const formId = useId();
  const [cases, setCases] = useState<VisaAssistanceCase[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [travelerName, setTravelerName] = useState("");
  const [destination, setDestination] = useState("");
  const [status, setStatus] = useState<string>(STATUS_OPTIONS[0]!);
  const [nextStep, setNextStep] = useState("");
  const [notes, setNotes] = useState("");

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

  function resetForm() {
    setTravelerName("");
    setDestination("");
    setStatus(STATUS_OPTIONS[0]!);
    setNextStep("");
    setNotes("");
    setEditingId(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = travelerName.trim();
    const dest = destination.trim();
    if (!name || !dest) return;

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
                updatedAt: now,
              }
            : c
        )
      );
    } else {
      const row: VisaAssistanceCase = {
        id: crypto.randomUUID(),
        travelerName: name,
        destination: dest,
        status,
        nextStep: nextStep.trim(),
        notes: notes.trim(),
        updatedAt: now,
      };
      setCases((prev) => [row, ...prev]);
    }
    resetForm();
  }

  function startEdit(c: VisaAssistanceCase) {
    setEditingId(c.id);
    setTravelerName(c.travelerName);
    setDestination(c.destination);
    setStatus(c.status || STATUS_OPTIONS[0]!);
    setNextStep(c.nextStep || "");
    setNotes(c.notes || "");
  }

  function handleDelete(id: string) {
    if (!window.confirm("Remove this visa case from the tracker?")) return;
    setCases((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) resetForm();
  }

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
              Track standalone visa applications — embassy, destination, and where each file stands.
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
                  Log who needs help, where they are applying, and the current stage.
                </p>
              </div>
              <form id={formId} onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-5">
                <div>
                  <label htmlFor={`${formId}-name`} className="block text-xs font-medium text-slate-700">
                    Traveler name
                  </label>
                  <input
                    id={`${formId}-name`}
                    value={travelerName}
                    onChange={(e) => setTravelerName(e.target.value)}
                    required
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
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
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                    placeholder="e.g. UK visitor visa, UAE, Schengen — France"
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-status`} className="block text-xs font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    id={`${formId}-status`}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
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
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
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
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                    placeholder="Internal notes, appointment refs, fees…"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                  >
                    {editingId ? "Save changes" : "Add case"}
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
                  Cases are stored in this browser for your team&apos;s quick pipeline view. Connect to
                  Supabase later if you want shared server-side records.
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
