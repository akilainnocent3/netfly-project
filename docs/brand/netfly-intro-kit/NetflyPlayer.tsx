'use client';
/**
 * NetflyPlayer — plays the NETFLY intro ident, then the film.
 *
 * Put netfly-intro.js in /public and add once in app/layout.tsx:
 *   <Script src="/netfly-intro.js" strategy="beforeInteractive" />
 *
 * The intro is drawn in code (no extra video download, ~8 KB) while the
 * film buffers underneath, so the film starts the moment the ident ends.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    NetflyIntro?: {
      frame: (t: number) => string;
      playSound: (ctx: AudioContext, when?: number) => void;
      DURATION: number;
    };
  }
}

type Props = {
  src: string;            // HLS/MP4 url of the film or episode
  poster?: string;
  titleId: string;        // used so the intro plays once per title per session
  skipIntro?: boolean;    // e.g. true when autoplaying the next episode
};

export default function NetflyPlayer({ src, poster, titleId, skipIntro }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [phase, setPhase] = useState<'idle' | 'intro' | 'film'>('idle');

  const startFilm = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setPhase('film');
    videoRef.current?.play().catch(() => {});
  }, []);

  const start = useCallback(() => {
    const intro = window.NetflyIntro;
    const key = `netfly-intro-seen:${titleId}`;
    let seen = false;
    try { seen = sessionStorage.getItem(key) === '1'; } catch {}
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    videoRef.current?.load(); // begin buffering the film now
    if (!intro || skipIntro || seen || reduced) return startFilm();
    try { sessionStorage.setItem(key, '1'); } catch {}

    setPhase('intro');
    // Sound must start from the user's tap (browser autoplay rules)
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      intro.playSound(new Ctx());
    } catch {}

    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      if (stageRef.current) stageRef.current.innerHTML = intro.frame(Math.min(t, intro.DURATION));
      if (t >= intro.DURATION) return startFilm();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [titleId, skipIntro, startFilm]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        controls={phase === 'film'}
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />

      {phase === 'intro' && (
        <>
          <div ref={stageRef} aria-hidden style={{ position: 'absolute', inset: 0 }} />
          <button
            onClick={startFilm}
            style={{
              position: 'absolute', right: 24, bottom: 24, padding: '10px 18px',
              background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.35)',
              borderRadius: 6, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Skip intro
          </button>
        </>
      )}

      {phase === 'idle' && (
        <button
          onClick={start}
          aria-label="Play"
          style={{
            position: 'absolute', inset: 0, margin: 'auto', width: 84, height: 84, borderRadius: '50%',
            background: '#E50914', color: '#fff', border: 0, fontSize: 30, cursor: 'pointer',
          }}
        >
          ▶
        </button>
      )}
    </div>
  );
}
