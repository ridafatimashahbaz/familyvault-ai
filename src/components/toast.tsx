"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CircleCheck, Info, OctagonX, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Transient feedback for mutations.
 *
 * Kept deliberately small: a stack of toasts in the corner with an id, a tone
 * and an auto-dismiss. Server-rendered errors use <Alert> inline instead,
 * because those need to stay on screen while the user reads them.
 */

type ToastTone = "success" | "error" | "warning" | "info";

type Toast = { id: number; tone: ToastTone; message: string };

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION: Record<ToastTone, number> = {
  success: 3500,
  info: 4000,
  warning: 6000,
  error: 7000,
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-success-border bg-surface text-success-ink",
  info: "border-info-border bg-surface text-info-ink",
  warning: "border-warning-border bg-surface text-warning-ink",
  error: "border-danger-border bg-surface text-danger-ink",
};

const TONE_ICONS = {
  success: { Icon: CircleCheck, className: "text-success" },
  info: { Icon: Info, className: "text-info" },
  warning: { Icon: TriangleAlert, className: "text-warning" },
  error: { Icon: OctagonX, className: "text-danger" },
} as const;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-3), { id, tone, message }]);
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message) => void toast(message, "success"),
      error: (message) => void toast(message, "error"),
      warning: (message) => void toast(message, "warning"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DURATION[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast.id, toast.tone, onDismiss]);

  const { Icon, className } = TONE_ICONS[toast.tone];

  return (
    <div
      className={cn(
        "animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-raised",
        TONE_STYLES[toast.tone],
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm leading-relaxed">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-mr-1 shrink-0 rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}
