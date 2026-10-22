"use client";

import { formatBytes } from "@netfly/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, Pause, Play, UploadCloud, X } from "lucide-react";
import { useEffect } from "react";
import { useUploads } from "@/stores/uploads";
import { IconButton, useConfirm } from "../ui/actions";

/** Floating progress panel for all running uploads (survives navigation). */
export function UploadDock() {
  const items = useUploads((s) => s.items);
  const completedVersion = useUploads((s) => s.completedVersion);
  const { pause, resume, cancel, dismiss, loadPending } = useUploads();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = Object.values(items);

  useEffect(() => {
    loadPending();
  }, [loadPending]);
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
    <div className="fixed bottom-[calc(var(--tabbar-h)+1rem)] left-4 z-[120] w-[min(340px,calc(100vw-2rem))] space-y-2 md:right-4 md:bottom-16 md:left-auto">
      <AnimatePresence initial={false}>
        {list.map((item) => {
          const pct = item.size ? Math.round((item.loaded / item.size) * 100) : 0;
          const eta = item.speed > 0 ? Math.max(0, (item.size - item.loaded) / item.speed) : 0;
          return (
            <motion.div
              key={item.key}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="border-line bg-panel rounded-lg border p-3 shadow-xl"
            >
              <div className="flex items-center gap-2">
                {item.state === "error" ? (
                  <CircleAlert className="size-4 shrink-0 text-red-500" />
                ) : (
                  <UploadCloud className="text-accent size-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{item.filename}</p>
                  <p className="text-muted truncate text-[12px]">
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
                {item.state === "uploading" && (
                  <IconButton size="sm" label="Pause" onClick={() => pause(item.key)}>
                    <Pause className="size-3.5" />
                  </IconButton>
                )}
                {item.state === "paused" && (
                  <IconButton size="sm" label="Resume" onClick={() => resume(item.key)}>
                    <Play className="size-3.5" />
                  </IconButton>
                )}
                <IconButton
                  size="sm"
                  label={
                    item.state === "done" || item.state === "error" ? "Dismiss" : "Cancel upload"
                  }
                  onClick={() =>
                    item.state === "done" || item.state === "error"
                      ? dismiss(item.key)
                      : confirm({
                          title: `Cancel uploading ${item.filename}?`,
                          body: "Parts already sent to S3 are discarded.",
                          confirmLabel: "Cancel upload",
                          destructive: true,
                          success: "Upload cancelled",
                          action: async () => cancel(item.key),
                        })
                  }
                >
                  <X className="size-3.5" />
                </IconButton>
              </div>
              <div className="bg-raised mt-2 h-1 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${item.state === "error" ? "bg-red-500" : item.state === "done" ? "bg-emerald-500" : "bg-accent"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
