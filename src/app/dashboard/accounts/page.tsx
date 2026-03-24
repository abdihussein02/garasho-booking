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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("Bank");
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
      setType("Bank");
      setStartingBalance("");
      await loadAccounts();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add account.";
      setSubmitError(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Agency Banking Accounts</h1>
            <p className="mt-1 text-sm text-slate-600">Manage business account balances in one place.</p>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-sky-700 hover:text-sky-800">
            Back
          </Link>
        </div>

        <form onSubmit={handleAddAccount} className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Add New Account</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Account name"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
            />
            <input
              type="text"
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Type (Bank, EVC, Cash)"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
            />
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

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Account Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Current Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                    Loading accounts...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                    No accounts yet. Add your first account above.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{account.name}</td>
                    <td className="px-4 py-3 text-slate-600">{account.type}</td>
                    <td className="px-4 py-3 text-slate-800">${account.balance.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {submitError ? <p className="mt-3 text-xs font-medium text-rose-700">{submitError}</p> : null}
      </div>
    </main>
  );
}
