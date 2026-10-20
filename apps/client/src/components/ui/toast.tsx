"use client";

import { AnimatePresence, m } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: "default" | "success" | "error";
}

type ShowToast = (toast: Omit<Toast, "id">, durationMs?: number) => void;

const ToastContext = createContext<ShowToast>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ShowToast>(
    (toast, durationMs = 5000) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { ...toast, id }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-8"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <m.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className="border-line bg-elevated/95 pointer-events-auto flex items-center gap-4 rounded-full border px-5 py-3 text-sm shadow-2xl shadow-black/50 backdrop-blur-xl"
            >
              {toast.tone === "success" && <span className="text-emerald-400">✓</span>}
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                  className="text-accent font-semibold hover:underline"
                >
                  {toast.action.label}
                </button>
              )}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
