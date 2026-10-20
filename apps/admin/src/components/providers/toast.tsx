"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}
type Show = (message: string, tone?: Toast["tone"]) => void;
const ToastContext = createContext<Show>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const id = useRef(1);
  const show = useCallback<Show>((message, tone = "success") => {
    const next = id.current++;
    setToasts((t) => [...t.slice(-3), { id: next, message, tone }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== next)),
      tone === "error" ? 6000 : 2400,
    );
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[200] flex flex-col items-end gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              className="border-line bg-panel pointer-events-auto flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-lg"
            >
              {t.tone === "error" ? (
                <CircleAlert className="size-4 text-red-500" />
              ) : (
                <Check className="size-4 text-emerald-500" />
              )}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
