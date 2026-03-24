"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg shadow-slate-200">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-500">
          Garahso Booking
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {mode === "login" ? "Welcome back" : "Create your agency account"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {mode === "login"
            ? "Log in to manage your agency bookings."
            : "Sign up to start managing itineraries for your travelers."}
        </p>

        <div className="mt-6 flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full px-3 py-1.5 transition ${
              mode === "login"
                ? "bg-white text-slate-900 shadow-sm"
                : "hover:text-slate-900"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full px-3 py-1.5 transition ${
              mode === "signup"
                ? "bg-white text-slate-900 shadow-sm"
                : "hover:text-slate-900"
            }`}
          >
            Signup
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-200 focus:bg-white focus:ring-2"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-200 focus:bg-white focus:ring-2"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Login"
              : "Create account"}
          </button>

          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Authentication is powered by Supabase. Make sure you have{" "}
            <span className="font-semibold">
              NEXT_PUBLIC_SUPABASE_URL
            </span>{" "}
            and{" "}
            <span className="font-semibold">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </span>{" "}
            configured in your environment before using this page.
          </p>
        </form>
      </div>
    </main>
  );
}

