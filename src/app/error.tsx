"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-slate-50 px-6 py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f172a]">GARASHO</p>
      <h1 className="text-xl font-semibold text-slate-900">We couldn&apos;t load this page</h1>
      <p className="max-w-md text-sm text-slate-600">
        {error.message || "An unexpected error occurred. Try again or contact support."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
      >
        Try again
      </button>
    </div>
  );
}
