"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AgencySidebar } from "@/components/dashboard/AgencySidebar";
import { useToast } from "@/components/providers/ToastProvider";
import { formatSupabaseUserMessage } from "@/lib/bookingsQuery";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const { toast } = useToast();
  const [agencyName, setAgencyName] = useState("Your Travel Agency");
  const [agencyPhone, setAgencyPhone] = useState("");
  const [agencyAddress, setAgencyAddress] = useState("");
  const [agencyTagline, setAgencyTagline] = useState("Your journey, expertly arranged.");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedName = window.localStorage.getItem("agency_name");
    const storedLogo = window.localStorage.getItem("agency_logo");
    const storedPhone = window.localStorage.getItem("agency_phone");
    const storedAddress = window.localStorage.getItem("agency_address");
    const storedTagline = window.localStorage.getItem("agency_tagline");
    if (storedName) setAgencyName(storedName);
    if (storedLogo) setLogoPreview(storedLogo);
    if (storedPhone) setAgencyPhone(storedPhone);
    if (storedAddress) setAgencyAddress(storedAddress);
    if (storedTagline) setAgencyTagline(storedTagline);
  }, []);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result?.toString() || null;
      setLogoPreview(result);
      if (typeof window !== "undefined" && result) {
        window.localStorage.setItem("agency_logo", result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSubmitError(null);
    try {
      const supabase = getSupabaseBrowserClient();

      const { error: rpcError } = await supabase.rpc("upsert_agency_profile", {
        name: agencyName,
      });

      if (rpcError) {
        const msg = rpcError.message?.trim() ?? "";
        const optionalMissing =
          rpcError.code === "PGRST202" ||
          /could not find|does not exist|schema cache/i.test(msg);
        if (!optionalMissing) {
          const shown = msg || "Could not save agency profile to the server.";
          setSubmitError(shown);
          toast("error", formatSupabaseUserMessage(shown));
          return;
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("agency_name", agencyName);
        window.localStorage.setItem("agency_phone", agencyPhone.trim());
        window.localStorage.setItem("agency_address", agencyAddress.trim());
        window.localStorage.setItem("agency_tagline", agencyTagline.trim());
      }
      toast("success", "Agency branding saved.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Something went wrong while saving.";
      setSubmitError(msg);
      toast("error", formatSupabaseUserMessage(msg));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-slate-100/80">
      <AgencySidebar />
      <section className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <div className="border-b border-slate-100 pb-5">
          <Link
            href="/dashboard"
            className="mb-4 inline-block text-xs font-medium text-slate-500 transition hover:text-[#0f172a]"
          >
            ← Dashboard
          </Link>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f172a]">GARASHO</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#0f172a] sm:text-2xl">
            Agency settings
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Customize your agency branding for dashboards and PDF itineraries.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreview}
                    alt="Agency logo preview"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                    Logo
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-700">Agency logo</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Square PNG or JPG, at least 256×256px.
                </p>
                <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#0f172a]/20 hover:bg-white hover:text-[#0f172a]">
                  <span>Upload logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Agency name</label>
            <input
              type="text"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              This name appears in the dashboard and at the top of printed itineraries.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Phone / WhatsApp</label>
            <input
              type="text"
              value={agencyPhone}
              onChange={(e) => setAgencyPhone(e.target.value)}
              placeholder="+252 …"
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
            />
            <p className="mt-1 text-[11px] text-slate-500">Shown on itineraries and receipts for travelers.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Address / location</label>
            <textarea
              rows={2}
              value={agencyAddress}
              onChange={(e) => setAgencyAddress(e.target.value)}
              placeholder="Street, city, country"
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Tagline (optional)</label>
            <input
              type="text"
              value={agencyTagline}
              onChange={(e) => setAgencyTagline(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-1 ring-slate-200/80 focus:ring-2 focus:ring-[#0f172a]/20"
            />
            <p className="mt-1 text-[11px] text-slate-500">Short line under your name on PDFs and shared itineraries.</p>
          </div>

          {submitError ? (
            <p className="text-sm text-rose-600" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
      </section>
    </main>
  );
}