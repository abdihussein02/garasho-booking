"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const navLink =
  "flex items-center rounded-lg px-3 py-2 text-slate-700 transition hover:bg-slate-100";
const navLinkActive =
  "flex items-center justify-between rounded-lg bg-[#0f172a]/5 px-3 py-2 font-medium text-[#0f172a] ring-1 ring-[#0f172a]/10";

export function AgencySidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const dashboardActive = pathname === "/dashboard";
  const newTicketActive = pathname === "/dashboard/tickets" || pathname === "/bookings/new";
  const ticketHistoryActive = pathname === "/dashboard/tickets/history";
  const ticketDetailActive =
    /^\/dashboard\/tickets\/.+/.test(pathname) &&
    pathname !== "/dashboard/tickets/history" &&
    pathname !== "/dashboard/tickets";
  const visaActive = pathname === "/dashboard/visa" || pathname.startsWith("/dashboard/visa/");
  const financeActive = pathname === "/dashboard/finance" || pathname.startsWith("/dashboard/finance/");
  const bankingActive =
    pathname === "/dashboard/accounts" || pathname.startsWith("/dashboard/accounts/");
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
  const teamActive = pathname === "/dashboard/team";

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/auth");
  }

  return (
    <aside className="hidden w-64 flex-col border-r border-slate-200/90 bg-white p-6 shadow-sm sm:flex">
      <div className="mb-8">
        <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[#0f172a]">GARASHO</p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Prime Time
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-900">Agency OS</p>
      </div>
      <nav className="space-y-4 text-sm">
        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Operations
          </p>
          <div className="space-y-1">
            <Link href="/dashboard" className={dashboardActive ? navLinkActive : navLink}>
              Dashboard
              {dashboardActive ? (
                <span className="rounded-full bg-[#0f172a]/10 px-2 text-[10px] font-semibold text-[#0f172a]">
                  Hub
                </span>
              ) : null}
            </Link>
            <Link href="/dashboard/tickets" className={newTicketActive ? navLinkActive : navLink}>
              New ticket
            </Link>
            <Link
              href="/dashboard/tickets/history"
              className={ticketHistoryActive || ticketDetailActive ? navLinkActive : navLink}
            >
              All tickets
            </Link>
            <Link href="/dashboard/visa" className={visaActive ? navLinkActive : navLink}>
              Visa
            </Link>
          </div>
        </div>
        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Treasury &amp; brand
          </p>
          <div className="space-y-1">
            <Link href="/dashboard/finance" className={financeActive ? navLinkActive : navLink}>
              Finance
            </Link>
            <Link href="/dashboard/accounts" className={bankingActive ? navLinkActive : navLink}>
              Banking
            </Link>
            <Link href="/settings" className={settingsActive ? navLinkActive : navLink}>
              Settings
            </Link>
          </div>
        </div>
        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Admin
          </p>
          <div className="space-y-1">
            <Link href="/dashboard/team" className={teamActive ? navLinkActive : navLink}>
              Team
            </Link>
          </div>
        </div>
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        className="mt-auto inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Logout
      </button>
    </aside>
  );
}
