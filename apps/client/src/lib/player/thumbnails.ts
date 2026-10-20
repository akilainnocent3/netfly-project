export interface ThumbCue {
  start: number;
  end: number;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function seconds(ts: string): number {
  const parts = ts.trim().split(":").map(Number);
  return parts.reduce((acc, v) => acc * 60 + v, 0);
}

/** Parse a sprite-sheet thumbnails VTT (`url#xywh=x,y,w,h` cues). */
export function parseThumbnails(text: string, base: string): ThumbCue[] {
  const cues: ThumbCue[] = [];
  const blocks = text.replace(/\r/g, "").split("\n\n");
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const timing = lines.find((l) => l.includes("-->"));
    const target = lines[lines.indexOf(timing ?? "") + 1];
    if (!timing || !target) continue;
    const [from, to] = timing.split("-->");
    const [url, frag] = target.split("#xywh=");
    const [x, y, w, h] = (frag ?? "0,0,0,0").split(",").map(Number);
    cues.push({ start: seconds(from!), end: seconds(to!), url: new URL(url!, base).toString(), x: x!, y: y!, w: w!, h: h! });
  }
  return cues;
}

export function cueAt(cues: ThumbCue[], time: number): ThumbCue | null {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid]!;
    if (time < cue.start) hi = mid - 1;
    else if (time >= cue.end) lo = mid + 1;
    else return cue;
  }
  return null;
}
