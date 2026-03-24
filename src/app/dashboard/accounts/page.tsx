"use client";

import Link from "next/link";
import { useState } from "react";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: string;
};

const DEFAULT_ACCOUNTS: Account[] = [
  { id: "hormoud-evc", name: "Hormoud EVC", type: "Mobile Money", balance: "" },
  { id: "salaam-bank", name: "Salaam Bank", type: "Bank", balance: "" },
  { id: "premier-bank", name: "Premier Bank", type: "Bank", balance: "" },
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>(() => {
    if (typeof window === "undefined") return DEFAULT_ACCOUNTS;
    const raw = window.localStorage.getItem("agency_accounts");
    if (!raw) return DEFAULT_ACCOUNTS;
    try {
      const parsed = JSON.parse(raw) as Account[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      return DEFAULT_ACCOUNTS;
    } catch {
      return DEFAULT_ACCOUNTS;
    }
  });
  const [saved, setSaved] = useState(false);

  function updateBalance(id: string, value: string) {
    setSaved(false);
    setAccounts((prev) => prev.map((account) => (account.id === id ? { ...account, balance: value } : account)));
  }

  function saveAccounts() {
    window.localStorage.setItem("agency_accounts", JSON.stringify(accounts));
    setSaved(true);
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
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{account.name}</td>
                  <td className="px-4 py-3 text-slate-600">{account.type}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 15,000"
                      value={account.balance}
                      onChange={(e) => updateBalance(account.id, e.target.value)}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          {saved ? <p className="text-xs text-emerald-700">Saved</p> : null}
          <button
            onClick={saveAccounts}
            className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-700"
          >
            Save accounts
          </button>
        </div>
      </div>
    </main>
  );
}
