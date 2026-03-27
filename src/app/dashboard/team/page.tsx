"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { readAgencyBrandingFromStorage } from "@/lib/agencyBranding";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function TeamPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [agencyName, setAgencyName] = useState("");

  useEffect(() => {
    setAgencyName(readAgencyBrandingFromStorage().name);
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/auth");
        return;
      }
      setEmail(session.user.email ?? null);
      const at = session.user.last_sign_in_at;
      setLastSignIn(
        at
          ? new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(at))
          : null
      );
      setLoading(false);
    }
    void load();
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen bg-slate-100/80">
        <AgencySidebar />
        <section className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">
          Loading…
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <AgencySidebar />
      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-8 max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">Agency OS</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0f172a]">Team &amp; access</h1>
          <p className="mt-2 text-sm text-slate-600">
            {agencyName ? (
              <>
                Staff who can log into <span className="font-medium text-slate-800">{agencyName}</span> are managed
                alongside your Supabase project. This screen shows your session; inviting colleagues is done in the
                cloud console.
              </>
            ) : (
              <>
                See who is signed in and how to add agents or back-office staff to your workspace.
              </>
            )}
          </p>
        </header>

        <div className="grid max-w-3xl gap-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#0f172a]">Signed in now</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Email</dt>
                <dd className="mt-0.5 font-mono text-slate-900">{email ?? "—"}</dd>
              </div>
              {lastSignIn ? (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Last sign-in</dt>
                  <dd className="mt-0.5 text-slate-800">{lastSignIn}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-6">
            <h2 className="text-sm font-semibold text-[#0c4a6e]">Add or remove team members</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Garasho uses Supabase Authentication. To invite agents, open your{" "}
              <strong>Supabase Dashboard</strong> → <strong>Authentication</strong> → <strong>Users</strong>, then add
              users by email or enable your preferred sign-in provider (email OTP, Google, etc.). Anyone you add there
              can use this same app URL to record tickets, print itineraries, and work banking — subject to your Row
              Level Security policies.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              For production, restrict which data each role sees using Supabase RLS policies on{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs">bookings</code>,{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs">banking_accounts</code>, and related tables.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#0f172a]">Branding &amp; agency profile</h2>
            <p className="mt-2 text-sm text-slate-600">
              Logo, phone, and address on printed and shared itineraries are configured under Settings.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              Open agency settings
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
