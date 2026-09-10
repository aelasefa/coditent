"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (title: string, opts?: { description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const variantStyles: Record<ToastVariant, string> = {
  success: "border-success/30",
  error: "border-danger/30",
  warning: "border-warning/30",
  info: "border-primary/30",
};

const dotStyles: Record<ToastVariant, string> = {
  success: "bg-success",
  error: "bg-danger",
  warning: "bg-warning",
  info: "bg-primary",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(1);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (title: string, opts?: { description?: string; variant?: ToastVariant }) => {
      const id = idRef.current++;
      const variant = opts?.variant ?? "info";
      setItems((prev) => [...prev.slice(-3), { id, title, description: opts?.description, variant }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? (createPortal(
            <div
              aria-live="polite"
              className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
            >
              {items.map((t) => (
                <div
                  key={t.id}
                  role={t.variant === "error" ? "alert" : "status"}
                  className={cn(
                    "pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-3.5 text-foreground shadow-md",
                    "animate-[ct-toast-in_var(--duration-normal)_var(--ease-standard)] motion-reduce:animate-none",
                    variantStyles[t.variant]
                  )}
                >
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotStyles[t.variant])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">{t.title}</p>
                    {t.description ? (
                      <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{t.description}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="rounded-md p-1 text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <style>{`@keyframes ct-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
            </div>,
            document.body
          ) as unknown as React.ReactNode)
        : null}
    </ToastContext.Provider>
  );
}
