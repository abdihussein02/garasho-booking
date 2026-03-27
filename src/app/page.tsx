import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200/80 px-4 py-12">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200/90 bg-white p-10 shadow-xl shadow-slate-900/10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#0f172a]">
          GARASHO · Prime Time
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          One workspace for travel agencies
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Issue tickets, store traveler and passport details, print branded itineraries, track visa cases, reconcile
          deposits in <strong className="font-medium text-slate-800">Banking</strong>, and invite your team — without
          juggling spreadsheets and five different apps.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth"
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#0f172a] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800"
          >
            Sign in to your agency
          </Link>
          <Link
            href="/auth"
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
          >
            Create account
          </Link>
        </div>

        <div className="mt-10 grid gap-4 border-t border-slate-100 pt-8 text-sm text-slate-600 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50/80 p-4">
            <p className="font-semibold text-[#0f172a]">Tickets &amp; travelers</p>
            <p className="mt-1 text-xs leading-relaxed">
              Confirmation codes, flight segments, layovers, and notes in one record — edit anytime.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50/80 p-4">
            <p className="font-semibold text-[#0f172a]">Finance &amp; branding</p>
            <p className="mt-1 text-xs leading-relaxed">
              Deposit tracking per account, professional itineraries and receipts with your logo and contact details.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
