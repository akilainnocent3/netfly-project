"use client";

import { formatBytes } from "@netfly/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, Pause, Play, UploadCloud, X } from "lucide-react";
import { useEffect } from "react";
import { useUploads } from "@/stores/uploads";

/** Floating progress panel for all running uploads (survives navigation). */
export function UploadDock() {
  const items = useUploads((s) => s.items);
  const completedVersion = useUploads((s) => s.completedVersion);
  const { pause, resume, cancel, dismiss, loadPending } = useUploads();
  const queryClient = useQueryClient();
  const list = Object.values(items);

  useEffect(() => loadPending(), [loadPending]);
  useEffect(() => {
    if (completedVersion) {
      void queryClient.invalidateQueries({ queryKey: ["title"] });
      void queryClient.invalidateQueries({ queryKey: ["seasons"] });
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    }
  }, [completedVersion, queryClient]);
  useEffect(() => {
    const busy = list.some((i) => ["uploading", "preparing", "completing"].includes(i.state));
    const warn = (e: BeforeUnloadEvent) => {
      if (busy) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [list]);

  return (
    <div className="fixed bottom-4 left-4 z-[120] w-[340px] space-y-2 md:left-auto md:right-4 md:bottom-16">
      <AnimatePresence initial={false}>
        {list.map((item) => {
          const pct = item.size ? Math.round((item.loaded / item.size) * 100) : 0;
          const eta = item.speed > 0 ? Math.max(0, (item.size - item.loaded) / item.speed) : 0;
          return (
            <motion.div key={item.key} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="rounded-lg border border-line bg-panel p-3 shadow-xl">
              <div className="flex items-center gap-2">
                {item.state === "error" ? <CircleAlert className="size-4 shrink-0 text-red-500" /> : <UploadCloud className="size-4 shrink-0 text-accent" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{item.filename}</p>
                  <p className="truncate text-[11.5px] text-muted">
                    {item.target.label} ·{" "}
                    {item.state === "done"
                      ? "Uploaded — transcoding queued"
                      : item.state === "error"
                        ? item.error
                        : item.state === "paused"
                          ? `Paused at ${pct}%`
                          : item.state === "completing"
                            ? "Finishing…"
                            : `${pct}% · ${formatBytes(item.speed)}/s${eta ? ` · ${Math.ceil(eta / 60)} min left` : ""}`}
                  </p>
                </div>
                {item.state === "uploading" && <IconBtn label="Pause" onClick={() => pause(item.key)}><Pause className="size-3.5" /></IconBtn>}
                {item.state === "paused" && <IconBtn label="Resume" onClick={() => resume(item.key)}><Play className="size-3.5" /></IconBtn>}
                <IconBtn label={item.state === "done" || item.state === "error" ? "Dismiss" : "Cancel upload"} onClick={() => (item.state === "done" ? dismiss(item.key) : cancel(item.key))}>
                  <X className="size-3.5" />
                </IconBtn>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-raised">
                <div className={`h-full rounded-full transition-[width] duration-300 ${item.state === "error" ? "bg-red-500" : item.state === "done" ? "bg-emerald-500" : "bg-accent"}`} style={{ width: `${pct}%` }} />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-6 place-items-center rounded text-muted hover:bg-hover hover:text-fg">
      {children}
    </button>
  );
}
