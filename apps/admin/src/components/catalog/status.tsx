import { Badge } from "../ui/primitives";

const STATUS_TONE = { draft: "neutral", processing: "amber", published: "green", archived: "red" } as const;

export function StatusChip({ status = "draft" }: { status?: string }) {
  const tone = STATUS_TONE[status as keyof typeof STATUS_TONE] ?? "neutral";
  return (
    <Badge tone={tone}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}

export function TranslationChip({ value, translator }: { value: string; translator?: string | null }) {
  return value === "translated" ? (
    <Badge tone="accent" className="max-w-40 truncate">Translated{translator ? ` · ${translator}` : ""}</Badge>
  ) : (
    <Badge>Not translated</Badge>
  );
}

const VIDEO_TONE = { ready: "green", failed: "red", transcoding: "amber", queued: "blue", uploaded: "blue", uploading: "blue" } as const;

export function VideoChip({ status }: { status?: string | null }) {
  if (!status) return <span className="text-subtle">—</span>;
  return <Badge tone={VIDEO_TONE[status as keyof typeof VIDEO_TONE] ?? "neutral"}>{status}</Badge>;
}
