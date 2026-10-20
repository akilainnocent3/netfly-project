"use client";

import Image from "next/image";
import type { ImageRef } from "@/lib/types";

/** Next/Image over the API's fixed-width AVIF/WebP renders, with blur placeholder. */
export function NetflyImage({
  image,
  alt,
  sizes,
  priority,
  className,
  fallback,
}: {
  image: ImageRef | null | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  fallback?: React.ReactNode;
}) {
  if (!image) return <>{fallback ?? null}</>;
  return (
    <Image
      src={image.key}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      fetchPriority={priority ? "high" : undefined}
      placeholder={image.blur ? "blur" : "empty"}
      blurDataURL={image.blur || undefined}
      className={className}
      style={{ backgroundColor: image.color || undefined }}
    />
  );
}
