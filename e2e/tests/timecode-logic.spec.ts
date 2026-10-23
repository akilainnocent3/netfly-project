/** Unit tests (no browser) for the time fields in Studio's "Generate trailer from video". */
import { expect, test } from "@playwright/test";
import { formatTimecode, parseTimecode, spokenTime } from "../../apps/admin/src/lib/timecode";

test("parses the ways editors type a time", () => {
  expect(parseTimecode("7:00")).toBe(420);
  expect(parseTimecode("07:00")).toBe(420);
  expect(parseTimecode("420")).toBe(420);
  expect(parseTimecode("1:07:00")).toBe(4020);
  expect(parseTimecode("7m")).toBe(420);
  expect(parseTimecode("7m30s")).toBe(450);
  expect(parseTimecode("1h7m")).toBe(4020);
  expect(parseTimecode("90s")).toBe(90);
  expect(parseTimecode(" 0:05 ")).toBe(5);
  expect(parseTimecode("4.5")).toBe(4.5);
  expect(parseTimecode("7:00.5")).toBe(420.5);
});

test("rejects what isn't a time", () => {
  for (const bad of ["", "abc", "7:60", "1:60:00", "7::00", "-5", "7:00:00:00", "m", "1:2:3:4", "7 minutes"]) {
    expect(parseTimecode(bad), bad).toBeNull();
  }
});

test("normalises to m:ss, or h:mm:ss past an hour", () => {
  expect(formatTimecode(0)).toBe("0:00");
  expect(formatTimecode(5)).toBe("0:05");
  expect(formatTimecode(420)).toBe("7:00");
  expect(formatTimecode(4020)).toBe("1:07:00");
  expect(formatTimecode(420.5)).toBe("7:00.5");
  expect(formatTimecode(parseTimecode("7m")!)).toBe("7:00");
});

test("speaks times for screen readers", () => {
  expect(spokenTime(420)).toBe("7 minutes 0 seconds");
  expect(spokenTime(61)).toBe("1 minute 1 second");
  expect(spokenTime(4020)).toBe("1 hour 7 minutes 0 seconds");
  expect(spokenTime(9)).toBe("9 seconds");
});
