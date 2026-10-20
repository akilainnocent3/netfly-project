"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";
import { Player } from "@/components/player/player";
import { useAuth } from "@/components/providers/auth";
import { StateMessage } from "@/components/ui/state-message";
import { getPlayback, type PlaybackInfo } from "@/lib/playback";

function Watch({ slug }: { slug: string }) {
  const params = useSearchParams();
  const episode = params.get("episode");
  const autoplayed = params.get("autoplay") === "1";
  const { status } = useAuth();
  const [info, setInfo] = useState<PlaybackInfo | null | undefined>(undefined);

  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    setInfo(undefined);
    void getPlayback(slug, { episode: episode ? Number(episode) : null }).then((data) => alive && setInfo(data));
    return () => {
      alive = false;
    };
  }, [slug, episode, status]);

  if (info === null) {
    return (
      <main className="grid min-h-dvh place-items-center bg-black">
        <StateMessage tone="error" title="This title can't be played right now">
          It may still be processing. <Link href={`/title/${slug}`} className="text-white underline">Back to details</Link>
        </StateMessage>
      </main>
    );
  }
  if (!info) {
    return (
      <main className="fixed inset-0 grid place-items-center bg-black" aria-busy>
        <div className="size-16 animate-spin rounded-full border-[3px] border-white/20 border-t-accent" />
      </main>
    );
  }
  return <Player key={info.session_id} info={info} autoplayed={autoplayed} />;
}

export default function WatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <Suspense>
      <Watch slug={slug} />
    </Suspense>
  );
}
