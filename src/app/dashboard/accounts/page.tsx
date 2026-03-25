"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
};

const DEFAULT_PROVIDER_TYPE = "Hormoud EVC Plus";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState(DEFAULT_PROVIDER_TYPE);
  const [startingBalance, setStartingBalance] = useState("");

  async function loadAccounts() {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("banking_accounts")
      .select("id, name, type, balance")
      .order("name", { ascending: true });

    if (error) throw error;
    setAccounts(((data as Account[]) ?? []).map((a) => ({ ...a, balance: Number(a.balance) || 0 })));
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

  async function handleAddAccount(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setCreating(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const parsedBalance = startingBalance.trim()
        ? Number(startingBalance.replace(/[^0-9.]/g, ""))
        : 0;

      if (Number.isNaN(parsedBalance)) {
        throw new Error("Starting balance must be a valid number.");
      }

      const { error } = await supabase.from("banking_accounts").insert({
        name: name.trim(),
        type: type.trim(),
        balance: parsedBalance,
      });
      if (error) throw error;

      setName("");
      setType(DEFAULT_PROVIDER_TYPE);
      setStartingBalance("");
      await loadAccounts();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add account.";
      setSubmitError(msg);
    } finally {
      setCreating(false);
    }
  }

  const totalLiquidAssets = accounts.reduce((sum, account) => sum + (account.balance || 0), 0);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-xl shadow-slate-300/40 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
                Treasury Command
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Agency Banking Portal
              </h1>
              <p className="mt-2 text-sm text-slate-200">
                Manage all payment rails and operating cash with enterprise visibility.
              </p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-sky-200">
                Total Liquid Assets
              </p>
              <p className="mt-1 text-2xl font-semibold">${totalLiquidAssets.toLocaleString()}</p>
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Accounts Management</h2>
            <p className="mt-1 text-sm text-slate-600">Create and track operational accounts by provider.</p>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-sky-700 hover:text-sky-800">
            Back
          </Link>
        </div>

        <form onSubmit={handleAddAccount} className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Add New Account</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Account name"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
            />
            <select
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
            >
              <option value="Hormoud EVC Plus">Hormoud EVC Plus</option>
              <option value="Salaam Bank">Salaam Bank</option>
              <option value="Premier Bank">Premier Bank</option>
              <option value="M-Pesa (Safaricom)">M-Pesa (Safaricom)</option>
              <option value="Dahabshiil">Dahabshiil</option>
              <option value="Cash">Cash</option>
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              placeholder="Starting balance"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
            />
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-70"
            >
              {creating ? "Adding..." : "Add account"}
            </button>
          </div>
        </form>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <div className="col-span-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Loading accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="col-span-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No accounts yet. Add your first account above.
            </div>
          ) : (
            accounts.map((account) => (
              <article
                key={account.id}
                className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Business Account</p>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {account.type}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{account.name}</h3>
                <div className="mt-8 flex items-end justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Available Balance</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">${account.balance.toLocaleString()}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-sky-100 ring-4 ring-sky-50" />
                </div>
              </article>
            ))
          )}
        </div>
        {submitError ? <p className="mt-3 text-xs font-medium text-rose-700">{submitError}</p> : null}
      </div>
      </div>
    </main>
  );
}
