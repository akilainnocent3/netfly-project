"use client";

import { unwrap } from "@netfly/api-client";
import { create } from "zustand";
import { api } from "@/lib/api";
import { fingerprintOf, MultipartUpload, type UploadState } from "@/lib/uploader";

export type UploadTarget =
  | { type: "title"; id: number; field: "video_id" | "trailer_id"; label: string }
  | { type: "episode"; id: number; label: string };

export interface UploadItem {
  key: string;
  filename: string;
  size: number;
  loaded: number;
  state: UploadState;
  error?: string;
  target: UploadTarget;
  speed: number;
  upload: MultipartUpload;
}

interface PendingRecord {
  fingerprint: string;
  filename: string;
  size: number;
  target: UploadTarget;
}

const STORAGE_KEY = "netfly-pending-uploads";

function readPending(): PendingRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as PendingRecord[];
  } catch {
    return [];
  }
}

function writePending(records: PendingRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* storage unavailable */
  }
}

interface UploadsStore {
  items: Record<string, UploadItem>;
  pending: PendingRecord[];
  completedVersion: number;
  add: (file: File, kind: "feature" | "episode" | "trailer", target: UploadTarget) => void;
  pause: (key: string) => void;
  resume: (key: string) => void;
  cancel: (key: string) => void;
  dismiss: (key: string) => void;
  loadPending: () => void;
  forgetPending: (fingerprint: string) => void;
}

/** Uploads live outside React pages so they keep going while staff navigate. */
export const useUploads = create<UploadsStore>((set, get) => ({
  items: {},
  pending: [],
  completedVersion: 0,
  loadPending: () => set({ pending: readPending() }),
  forgetPending: (fingerprint) => {
    const next = readPending().filter((p) => p.fingerprint !== fingerprint);
    writePending(next);
    set({ pending: next });
  },
  add: (file, kind, target) => {
    const key = fingerprintOf(file);
    if (get().items[key] && !["done", "error"].includes(get().items[key]!.state)) return;
    const record: PendingRecord = { fingerprint: key, filename: file.name, size: file.size, target };
    writePending([...readPending().filter((p) => p.fingerprint !== key), record]);
    let lastBytes = 0;
    let lastAt = performance.now();
    const patch = (p: Partial<UploadItem>) => set((s) => (s.items[key] ? { items: { ...s.items, [key]: { ...s.items[key]!, ...p } } } : s));
    const upload = new MultipartUpload(file, kind, {
      onProgress: (loaded) => {
        const now = performance.now();
        if (now - lastAt > 800) {
          patch({ loaded, speed: ((loaded - lastBytes) / (now - lastAt)) * 1000 });
          lastBytes = loaded;
          lastAt = now;
        } else patch({ loaded });
      },
      onState: (state, error) => patch({ state, error }),
    });
    set((s) => ({
      pending: readPending(),
      items: { ...s.items, [key]: { key, filename: file.name, size: file.size, loaded: 0, state: "preparing", target, speed: 0, upload } },
    }));
    upload
      .start()
      .then(async (assetId) => {
        if (target.type === "title") {
          await unwrap(api.PATCH("/api/v1/admin/titles/{id}", { params: { path: { id: target.id } }, body: { [target.field]: assetId } }));
        } else {
          await unwrap(api.PATCH("/api/v1/admin/episodes/{id}", { params: { path: { id: target.id } }, body: { video_id: assetId } }));
        }
        get().forgetPending(key);
        set((s) => ({ completedVersion: s.completedVersion + 1 }));
      })
      .catch((e: unknown) => patch({ state: "error", error: e instanceof Error ? e.message : "Upload failed" }));
  },
  pause: (key) => get().items[key]?.upload.pause(),
  resume: (key) => get().items[key]?.upload.resume(),
  cancel: (key) => {
    void get().items[key]?.upload.abort();
    get().forgetPending(key);
    get().dismiss(key);
  },
  dismiss: (key) =>
    set((s) => {
      const items = { ...s.items };
      delete items[key];
      return { items };
    }),
}));
