"use client";

import { FormEvent, useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const [agencyName, setAgencyName] = useState("Your Travel Agency");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedName = window.localStorage.getItem("agency_name");
    const storedLogo = window.localStorage.getItem("agency_logo");
    if (storedName) setAgencyName(storedName);
    if (storedLogo) setLogoPreview(storedLogo);
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
          setSubmitError(msg || "Could not save agency profile to the server.");
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("agency_name", agencyName);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Something went wrong while saving.";
      setSubmitError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-slate-50 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-lg shadow-slate-200 sm:p-8">
        <div className="border-b border-slate-100 pb-5">
          <BackButton className="-ml-1 mb-4 px-2 py-1" />
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
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
                <p className="text-xs font-medium text-slate-700">
                  Agency logo
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Square PNG or JPG, at least 256×256px.
                </p>
                <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700">
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
            <label className="block text-xs font-medium text-slate-700">
              Agency name
            </label>
            <input
              type="text"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-sky-200 focus:bg-white focus:ring-2"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              This name appears in the dashboard and at the top of printed
              itineraries.
            </p>
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
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

