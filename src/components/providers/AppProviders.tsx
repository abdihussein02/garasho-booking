"use client";

import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { ToastProvider } from "@/components/providers/ToastProvider";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GlobalErrorBoundary>
      <ToastProvider>{children}</ToastProvider>
    </GlobalErrorBoundary>
  );
}
