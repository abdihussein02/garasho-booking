import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-10 shadow-lg shadow-slate-200">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-500">
          GARASHO Booking
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Travel agency booking platform
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Manage itineraries, travelers, and documents in one professional
          dashboard. Built for modern travel agencies.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth"
            className="inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700"
          >
            Login / Signup
          </Link>
          <Link
            href="/auth"
            className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-sky-200 hover:bg-sky-50"
          >
            Explore dashboard
          </Link>
        </div>

        <div className="mt-6 grid gap-4 text-xs text-slate-600 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-900">Booking overview</p>
            <p>See all upcoming trips in one glance.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Dynamic itineraries</p>
            <p>Add flights and layovers on the fly.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Branded PDFs</p>
            <p>Send polished itineraries to travelers.</p>
          </div>
        </div>
      </div>
    </main>
  );
}

