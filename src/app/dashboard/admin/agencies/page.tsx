"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { fetchAgencyProfile, normalizeAgencySlug } from "@/lib/agencyProfile";
import { formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type AgencyRow = {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  created_at: string;
};

const fieldClass =
  "mt-1 block w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-[#0f172a] outline-none ring-1 ring-slate-200/80 transition placeholder:text-slate-400 focus:border-[#0f172a]/25 focus:ring-2 focus:ring-[#0f172a]/15";

export default function AdminAgenciesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const formId = useId();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [rows, setRows] = useState<AgencyRow[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshList = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("agencies")
      .select("id, name, slug, contact_email, created_at")
      .order("name", { ascending: true });
    if (error) {
      toast("error", formatSupabaseUserMessage(error.message));
      setRows([]);
      return;
    }
    setRows((data as AgencyRow[]) ?? []);
  }, [toast]);

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
      const profile = await fetchAgencyProfile(supabase).catch(() => null);
      if (!profile?.is_platform_admin) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);
      await refreshList();
      setLoading(false);
    }
    void gate();
  }, [router, refreshList]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const s = normalizeAgencySlug(slug || name);
    const em = email.trim();
    if (!n || !s || !em) {
      toast("error", "Fill in name, slug, and contact email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast("error", "Enter a valid contact email.");
      return;
    }
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.refreshSession().catch(() => {});
      const profile = await fetchAgencyProfile(supabase);
      if (!profile?.is_platform_admin) {
        toast("error", "You are not allowed to create agencies.");
        return;
      }
      const { error } = await supabase.from("agencies").insert({
        name: n,
        slug: s,
        contact_email: em,
      });
      if (error) throw error;
      toast("success", "Agency created.");
      setName("");
      setSlug("");
      setEmail("");
      await refreshList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save agency.";
      toast("error", formatSupabaseUserMessage(msg));
    } finally {
      setSaving(false);
    }
  }

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

  if (!authorized) {
    return (
      <main className="flex min-h-screen bg-slate-100/80">
        <AgencySidebar />
        <section className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-8 sm:py-8">
          <h1 className="text-xl font-semibold text-[#0f172a]">Agencies</h1>
          <p className="max-w-xl text-sm leading-relaxed text-slate-600">
            Only platform administrators can create agencies and see this list. In the Supabase SQL editor, run:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
              update public.profiles set is_platform_admin = true where id = &apos;YOUR_USER_UUID&apos;;
            </code>{" "}
            Then assign each staff member to an agency:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
              update public.profiles set agency_id = &apos;AGENCY_UUID&apos; where id = &apos;…&apos;;
            </code>
          </p>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-sky-800 underline decoration-sky-800/30 underline-offset-2 hover:decoration-sky-800"
          >
            Back to dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <AgencySidebar />

      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <header className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Admin</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#0f172a] sm:text-2xl">Agencies</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Create tenant workspaces. Users see only bookings and banking tied to their profile&apos;s{" "}
            <span className="font-medium text-slate-800">agency_id</span> (and platform admins see everything).
          </p>
        </header>

        <div className="grid gap-8 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  New agency
                </p>
                <p className="mt-0.5 text-xs text-slate-600">Slug is used in URLs and must be unique (lowercase).</p>
              </div>
              <form id={formId} onSubmit={(ev) => void handleSubmit(ev)} className="space-y-4 p-4 sm:p-5">
                <div>
                  <label htmlFor={`${formId}-name`} className="block text-xs font-medium text-slate-700">
                    Name
                  </label>
                  <input
                    id={`${formId}-name`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="e.g. Prime Time Travel"
                    autoComplete="organization"
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-slug`} className="block text-xs font-medium text-slate-700">
                    Slug
                  </label>
                  <input
                    id={`${formId}-slug`}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className={fieldClass}
                    placeholder="e.g. prime-time (auto-filled from name if empty)"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-email`} className="block text-xs font-medium text-slate-700">
                    Contact email
                  </label>
                  <input
                    id={`${formId}-email`}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={fieldClass}
                    placeholder="ops@agency.com"
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" disabled={saving} variant="primary" className="w-full sm:w-auto">
                  {saving ? "Saving…" : "Add agency"}
                </Button>
              </form>
            </div>
          </div>

          <div className="xl:col-span-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  All agencies
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {rows.length === 0 ? "No agencies yet." : `${rows.length} registered.`}
                </p>
              </div>
              {rows.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">
                  Use the form to add your first agency.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Slug</th>
                        <th className="px-4 py-3">Contact</th>
                        <th className="hidden px-4 py-3 sm:table-cell">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => (
                        <tr key={r.id} className="text-slate-800">
                          <td className="px-4 py-3 font-medium text-[#0f172a]">{r.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.slug}</td>
                          <td className="px-4 py-3 text-slate-700">{r.contact_email}</td>
                          <td className="hidden px-4 py-3 text-xs text-slate-500 sm:table-cell">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
