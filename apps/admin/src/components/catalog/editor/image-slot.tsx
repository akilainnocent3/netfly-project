"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crop, ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useToast } from "@/components/providers/toast";
import { IconButton, useConfirm } from "@/components/ui/actions";
import { Button } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { AdminImage } from "@/lib/types";

type Kind = "poster" | "backdrop" | "logo" | "thumbnail" | "artwork";
const ASPECT: Record<Kind, number | undefined> = {
  poster: 2 / 3,
  backdrop: 16 / 9,
  thumbnail: 16 / 9,
  artwork: 16 / 9,
  logo: undefined,
};

export async function uploadImage(file: File, kind: Kind): Promise<AdminImage> {
  return unwrap(
    api.POST("/api/v1/admin/images", {
      body: { file: file as unknown as string, kind },
      bodySerializer: (body) => {
        const form = new FormData();
        form.append("kind", body.kind);
        form.append("file", file);
        return form;
      },
    }),
  );
}

/** Poll an image until it has been rendered. */
export function useImage(id: string | null | undefined, initial?: AdminImage | null) {
  return useQuery({
    queryKey: ["image", id],
    enabled: !!id,
    initialData: initial && initial.id === id ? initial : undefined,
    queryFn: () => unwrap(api.GET("/api/v1/admin/images/{id}", { params: { path: { id: id! } } })),
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 1200 : false),
  });
}

/** Shows the crop of `image` (from the original) exactly as the variants will render it. */
export function CropPreview({
  image,
  className,
  children,
  label,
}: {
  image: AdminImage;
  className?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  const c = (image.crop ?? { x: 0, y: 0, w: 1, h: 1 }) as {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  const style: React.CSSProperties = image.original_url
    ? {
        backgroundImage: `url("${image.original_url}")`,
        backgroundSize: `${100 / c.w}% ${100 / c.h}%`,
        backgroundPosition: `${c.w < 1 ? (c.x / (1 - c.w)) * 100 : 0}% ${c.h < 1 ? (c.y / (1 - c.h)) * 100 : 0}%`,
        backgroundColor: image.dominant_color || undefined,
      }
    : {};
  return (
    <div
      className={cn("bg-raised relative overflow-hidden bg-no-repeat", className)}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function ImageSlot({
  kind,
  label,
  image,
  onAttach,
  disabled,
  titleText,
  hint,
}: {
  kind: Kind;
  label: string;
  image: AdminImage | null | undefined;
  onAttach: (id: string | null) => Promise<void>;
  disabled?: boolean;
  titleText?: string;
  hint?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const live = useImage(image?.id, image);
  const confirm = useConfirm();
  const current = live.data ?? image ?? null;

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploading(true);
      try {
        const uploaded = await uploadImage(file, kind);
        queryClient.setQueryData(["image", uploaded.id], uploaded);
        await onAttach(uploaded.id);
        toast(`${label} uploaded — processing`);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "Upload failed", "error");
      } finally {
        setUploading(false);
      }
    },
    [kind, label, onAttach, queryClient, toast],
  );

  const aspectClass =
    kind === "poster" ? "aspect-[2/3]" : kind === "logo" ? "aspect-[3/1]" : "aspect-video";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium">{label}</span>
        {hint && <span className="text-subtle text-[11.5px]">{hint}</span>}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) void handleFile(e.dataTransfer.files[0]);
        }}
        className={cn(
          "group relative overflow-hidden rounded-lg border border-dashed transition-colors",
          aspectClass,
          dragging ? "border-accent bg-accent/5" : "border-line",
          kind === "logo" &&
            "bg-[repeating-conic-gradient(var(--a-raised)_0_25%,transparent_0_50%)] bg-[length:16px_16px]",
        )}
      >
        {current ? (
          <CropPreview image={current} className="absolute inset-0" />
        ) : (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => input.current?.click()}
            className="text-muted hover:text-fg absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[12.5px]"
          >
            <ImagePlus className="size-5" />
            Drop or click to upload
          </button>
        )}
        {(uploading || current?.status === "processing") && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-[12px] font-medium text-white backdrop-blur-[1px]">
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />{" "}
              {uploading ? "Uploading…" : "Rendering sizes…"}
            </span>
          </div>
        )}
        {current?.status === "failed" && (
          <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1 text-[11.5px] text-white">
            Processing failed: {current.error}
          </div>
        )}
        {current && !disabled && (
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {ASPECT[kind] && current.status !== "processing" && (
              <IconButton
                tone="overlay"
                size="sm"
                label="Adjust crop"
                onClick={() => setCropOpen(true)}
              >
                <Crop className="size-3.5" />
              </IconButton>
            )}
            <IconButton
              tone="overlay"
              size="sm"
              label="Replace"
              onClick={() => input.current?.click()}
            >
              <RefreshCw className="size-3.5" />
            </IconButton>
            <IconButton
              tone="overlay"
              size="sm"
              label="Remove"
              onClick={() =>
                confirm({
                  title: `Remove the ${label.toLowerCase()}?`,
                  body: "The image file stays in storage; you can upload a new one any time.",
                  confirmLabel: "Remove",
                  destructive: true,
                  success: `${label} removed`,
                  action: () => onAttach(null),
                })
              }
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>
      {current && (kind === "poster" || kind === "backdrop") && current.status === "ready" && (
        <PlacementPreview kind={kind} image={current} titleText={titleText} />
      )}
      {current && ASPECT[kind] && (
        <CropDialog
          open={cropOpen}
          onOpenChange={setCropOpen}
          image={current}
          aspect={ASPECT[kind]!}
          kind={kind}
        />
      )}
    </div>
  );
}

/** How the art will look on a home-row card / in the hero billboard. */
function PlacementPreview({
  kind,
  image,
  titleText,
}: {
  kind: "poster" | "backdrop";
  image: AdminImage;
  titleText?: string;
}) {
  if (kind === "poster") {
    return (
      <div
        className="mt-2 flex items-end gap-1.5 rounded-md bg-[#141414] p-2"
        role="img"
        aria-label="Card preview"
      >
        {[0, 1, 2].map((i) =>
          i === 1 ? (
            <CropPreview
              key={i}
              image={image}
              className="aspect-[2/3] w-14 rounded ring-1 ring-white/20"
            />
          ) : (
            <div key={i} className="aspect-[2/3] w-11 rounded bg-white/10" />
          ),
        )}
        <span className="ml-1 self-center text-[11px] text-white/50">Row card</span>
      </div>
    );
  }
  return (
    <CropPreview image={image} className="mt-2 aspect-[21/9] rounded-md" label="Hero preview">
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#141414] to-transparent" />
      <div className="absolute bottom-3 left-3 max-w-[55%]">
        <p className="truncate text-[15px] font-black text-white">{titleText || "Title"}</p>
        <div className="mt-1.5 flex gap-1">
          <span className="h-4 w-10 rounded bg-white" />
          <span className="h-4 w-12 rounded bg-white/30" />
        </div>
      </div>
      <span className="absolute top-2 right-2 rounded bg-black/50 px-1.5 text-[10px] text-white/70">
        Hero
      </span>
    </CropPreview>
  );
}

function CropDialog({
  open,
  onOpenChange,
  image,
  aspect,
  kind,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  image: AdminImage;
  aspect: number;
  kind: Kind;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const initial = image.crop as { x: number; y: number; w: number; h: number } | undefined;

  const save = async () => {
    if (!area) return;
    setSaving(true);
    try {
      const updated = await unwrap(
        api.PATCH("/api/v1/admin/images/{id}", {
          params: { path: { id: image.id } },
          body: {
            crop: { x: area.x / 100, y: area.y / 100, w: area.width / 100, h: area.height / 100 },
          },
        }),
      );
      queryClient.setQueryData(["image", image.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["title"] });
      toast("Crop saved — re-rendering");
      onOpenChange(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save the crop", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/60" />
        <Dialog.Content className="border-line bg-panel fixed top-1/2 left-1/2 z-[151] w-[min(900px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border shadow-2xl">
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <Dialog.Title className="font-semibold">Adjust {kind} crop</Dialog.Title>
            <span className="text-muted text-[12px]">
              {kind === "poster" ? "2:3" : "16:9"} · drag to reposition, scroll to zoom
            </span>
          </div>
          <div className="relative h-[60vh] bg-black">
            {image.original_url && (
              <Cropper
                image={image.original_url}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(a) => setArea(a)}
                initialCroppedAreaPercentages={
                  initial
                    ? {
                        x: initial.x * 100,
                        y: initial.y * 100,
                        width: initial.w * 100,
                        height: initial.h * 100,
                      }
                    : undefined
                }
                objectFit="contain"
              />
            )}
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="flex-1 accent-[var(--accent)]"
            />
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={saving}>
              Save crop
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
