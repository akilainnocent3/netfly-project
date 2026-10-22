"use client";

import { LazyLogoLoader } from "@netfly/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";
import { LimitOverlay } from "@/components/billing/usage-limit";
import { Player } from "@/components/player/player";
import { useAuth } from "@/components/providers/auth";
import { StateMessage } from "@/components/ui/state-message";
import { loadPlayback, type PlaybackResult } from "@/lib/playback";

function Watch({ slug }: { slug: string }) {
  const params = useSearchParams();
  const episode = params.get("episode");
  const autoplayed = params.get("autoplay") === "1";
  const { status } = useAuth();
  const router = useRouter();
  const [result, setResult] = useState<PlaybackResult | undefined>(undefined);

  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    setResult(undefined);
    void loadPlayback(slug, { episode: episode ? Number(episode) : null }).then(
      (data) => alive && setResult(data),
    );
    return () => {
      alive = false;
    };
  }, [slug, episode, status]);

  if (result && !result.ok && result.limit) {
    return (
      <main className="fixed inset-0 bg-black">
        <LimitOverlay snapshot={result.limit} onBack={() => router.push("/browse")} />
      </main>
    );
  }
  if (result && !result.ok) {
    return (
      <main className="grid min-h-dvh place-items-center bg-black">
        <StateMessage tone="error" title="This title can't be played right now">
          It may still be processing.{" "}
          <Link href={`/title/${slug}`} className="text-white underline">
            Back to details
          </Link>
        </StateMessage>
      </main>
    );
  }
  if (!result) {
    return (
      <main className="fixed inset-0 grid place-items-center bg-black" aria-busy>
        <LazyLogoLoader size="lg" label="Loading player" />
      </main>
    );
  }
  return <Player key={result.info.session_id} info={result.info} autoplayed={autoplayed} />;
}

export default function WatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <Suspense>
      <Watch slug={slug} />
    </Suspense>
  );
}
