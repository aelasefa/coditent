"use client";

import { useToast } from "@/hooks/use-toast";

function toastStyle(type: "error" | "success" | "info"): string {
  if (type === "error") {
    return "border-rose-300 bg-rose-50 text-rose-900";
  }

  if (type === "success") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }

  return "border-slate-300 bg-white text-slate-900";
}

export function ToastProvider() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-xl border p-3 shadow-lg ${toastStyle(toast.type)}`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description ? <p className="mt-1 text-xs opacity-80">{toast.description}</p> : null}
            </div>
            <button
              aria-label="Close notification"
              className="rounded px-1 text-xs opacity-60 hover:opacity-100"
              onClick={() => removeToast(toast.id)}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
