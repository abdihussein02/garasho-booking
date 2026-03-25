"use client";

import { BackButton } from "@/components/BackButton";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { hasError: boolean };

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("GARASHO UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 bg-slate-50 px-6 py-16 text-center">
          <BackButton fallbackHref="/dashboard" className="mb-1" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f172a]">
            GARASHO
          </p>
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="max-w-md text-sm text-slate-600">
            This view hit an unexpected error. Reload the page or return to the dashboard.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-[#0f172a] shadow-sm hover:bg-slate-50"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
