"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "error" | "success" | "info";

type ToastItem = { id: string; variant: ToastVariant; message: string };

type ToastContextValue = {
  toast: (variant: ToastVariant, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (_variant: ToastVariant, message: string) => {
        if (typeof window !== "undefined") window.alert(message);
      },
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((variant: ToastVariant, message: string) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now());
    setToasts((prev) => [...prev, { id, variant, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 7000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[200] flex max-w-sm flex-col gap-2 p-2 sm:max-w-md"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm ${
              t.variant === "error"
                ? "border-rose-200/80 bg-rose-50/95 text-rose-900"
                : t.variant === "success"
                  ? "border-emerald-200/80 bg-emerald-50/95 text-emerald-900"
                  : "border-slate-200/80 bg-[#0f172a]/95 text-white"
            }`}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
