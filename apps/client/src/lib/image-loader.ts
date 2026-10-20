// Images are pre-rendered by the backend at fixed widths. `src` is an image
// key like "images/3f2a…"; the API redirects to a signed S3/CDN URL for the
// closest width (AVIF or WebP by Accept header) and that redirect is cached.
export const IMAGE_WIDTHS = [160, 320, 480, 640, 960, 1280, 1920, 2560] as const;

export default function netflyImageLoader({ src, width }: { src: string; width: number }): string {
  if (src.startsWith("http") || src.startsWith("data:") || src.startsWith("/")) return src;
  const w = IMAGE_WIDTHS.find((candidate) => candidate >= width) ?? 2560;
  return `/api/v1/img/${src}/w${w}`;
}
