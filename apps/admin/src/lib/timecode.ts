/**
 * Times typed by editors: "7:00", "07:00", "420", "1:07:00", "7m", "7m30s", "1h7m", "4.5".
 * Returns seconds, or null when the text isn't a time.
 */
export function parseTimecode(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);

  const units = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(text);
  if (units && (units[1] || units[2] || units[3])) {
    const [, h = "0", m = "0", s = "0"] = units;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }

  const clock = /^(\d+)(?::(\d{1,2}))?:(\d{1,2}(?:\.\d+)?)$/.exec(text);
  if (clock) {
    const [, first = "0", middle, last = "0"] = clock;
    const seconds = Number(last);
    if (seconds >= 60) return null;
    if (middle === undefined) return Number(first) * 60 + seconds;
    if (Number(middle) >= 60) return null;
    return Number(first) * 3600 + Number(middle) * 60 + seconds;
  }
  return null;
}

/** m:ss, or h:mm:ss past an hour; tenths only when the time has them ("7:00.5"). */
export function formatTimecode(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const whole = Math.floor(tenths / 10);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  const frac = tenths % 10 ? `.${tenths % 10}` : "";
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}${frac}` : `${m}:${s}${frac}`;
}

/** For screen readers: "7 minutes 0 seconds", "1 hour 7 minutes 0 seconds". */
export function spokenTime(seconds: number): string {
  const whole = Math.round(Math.max(0, seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return [h ? part(h, "hour") : "", h || m ? part(m, "minute") : "", part(s, "second")]
    .filter(Boolean)
    .join(" ");
}
