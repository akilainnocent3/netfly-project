"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "framer-motion";
import { CloudOff, Wifi } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Thin banner while the connection is down; refetches stale data once it's back. */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const queryClient = useQueryClient();
  const [recovered, setRecovered] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setRecovered(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    void queryClient.invalidateQueries();
    setRecovered(true);
    const t = setTimeout(() => setRecovered(false), 2500);
    return () => clearTimeout(t);
  }, [online, queryClient]);

  const show = !online || recovered;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100]"
    >
      <AnimatePresence>
        {show && (
          <m.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`text-meta flex items-center justify-center gap-2 px-4 py-2 pt-[max(8px,env(safe-area-inset-top))] font-semibold ${online ? "bg-[#46D369] text-black" : "bg-[#232323] text-white"}`}
          >
            {online ? <Wifi className="size-4" /> : <CloudOff className="size-4" />}
            {online ? "Back online" : "You're offline. We'll reconnect automatically."}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
