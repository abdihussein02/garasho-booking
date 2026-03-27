"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardNewBookingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/tickets");
  }, [router]);

  return null;
}

