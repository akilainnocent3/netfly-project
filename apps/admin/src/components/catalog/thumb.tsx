import { cn } from "@netfly/ui";
import Image from "next/image";
import type { AdminImage } from "@/lib/types";

/** Small poster/backdrop preview for tables and pickers. */
export function Thumb({ image, className, aspect = "poster" }: { image?: AdminImage | null; className?: string; aspect?: "poster" | "wide" }) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded bg-raised",
        aspect === "poster" ? "aspect-[2/3] w-8" : "aspect-video w-16",
        className,
      )}
      style={image?.dominant_color ? { backgroundColor: image.dominant_color } : undefined}
    >
      {image?.status === "ready" && (
        <Image src={image.key} alt="" fill sizes="64px" className="object-cover" placeholder={image.blur_data_url ? "blur" : "empty"} blurDataURL={image.blur_data_url || undefined} />
      )}
    </div>
  );
}
