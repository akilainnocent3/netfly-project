"use client";

import type Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

/** A direct file or an HLS stream, played like the title editor's PreviewPlayer (hls.js where
 * MSE exists, native HLS only as a fallback). */
export function PreviewPlayer({
  kind,
  src,
  title,
}: {
  kind: "mp4" | "hls";
  src: string;
  title: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: Hls | null = null;
    if (kind === "mp4") {
      video.src = src;
      return;
    }
    void import("hls.js").then(({ default: HlsCtor }) => {
      if (HlsCtor.isSupported()) {
        hls = new HlsCtor({ startLevel: -1, capLevelToPlayerSize: true });
        hls.on(HlsCtor.Events.ERROR, (_e, data) => data.fatal && setFailed(true));
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      } else {
        setFailed(true);
      }
    });
    return () => hls?.destroy();
  }, [kind, src]);
  return (
    <>
      <video
        ref={ref}
        controls
        playsInline
        preload="metadata"
        aria-label={title || "Video preview"}
        data-testid="extraction-preview-video"
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full bg-black"
      />
      {failed && (
        <p
          role="alert"
          className="absolute inset-x-0 bottom-12 mx-auto w-fit rounded bg-black/80 px-3 py-1.5 text-[12.5px]"
        >
          The preview failed to load in this browser.
        </p>
      )}
    </>
  );
}
