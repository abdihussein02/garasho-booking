"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  /** Used when there is no prior history entry (e.g. opened in a new tab). */
  fallbackHref?: string;
  className?: string;
  label?: string;
};

export function BackButton({
  fallbackHref = "/dashboard",
  className = "",
  label = "Back",
}: BackButtonProps) {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-[#0f172a] transition hover:bg-slate-100 hover:text-slate-900 ${className}`}
    >
      <span aria-hidden className="text-base leading-none">
        ←
      </span>
      {label}
    </button>
  );
}
