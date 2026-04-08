"use client";

import { useCallback, useEffect, useState } from "react";

export type ToastType = "error" | "success" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ApiErrorEventDetail {
  title: string;
  description?: string;
}

const TOAST_LIFETIME_MS = 4500;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...toast, id }]);
      window.setTimeout(() => removeToast(id), TOAST_LIFETIME_MS);
    },
    [removeToast]
  );

  useEffect(() => {
    const handleApiError = (event: Event) => {
      const detail = (event as CustomEvent<ApiErrorEventDetail>).detail;
      pushToast({
        type: "error",
        title: detail?.title || "Request failed",
        description: detail?.description,
      });
    };

    window.addEventListener("api:error", handleApiError as EventListener);

    return () => {
      window.removeEventListener("api:error", handleApiError as EventListener);
    };
  }, [pushToast]);

  return {
    toasts,
    pushToast,
    removeToast,
  };
}
