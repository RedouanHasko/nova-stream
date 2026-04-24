export interface SubtitleCueItem {
  start: number;
  end: number;
  text: string;
}

const TEXT_SUBTITLE_CODECS = new Set([
  "subrip",
  "srt",
  "ass",
  "ssa",
  "webvtt",
  "mov_text",
  "tx3g",
  "text",
  "ttml",
  "stl",
]);

const TIMESTAMP_RE = /(\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})/;

function parseTimestamp(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

function normalizeCueText(lines: string[]): string {
  return lines
    .join("\n")
    .replace(/<\/?c(?:\.[^>]+)?>/g, "")
    .replace(/<\d{2}:\d{2}:\d{2}[.,]\d{3}>/g, "")
    .trim();
}

function parseWebVtt(input: string): SubtitleCueItem[] {
  const blocks = input.replace(/^\uFEFF/, "").split(/\r?\n\r?\n+/);
  const cues: SubtitleCueItem[] = [];

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    if (!lines.length || lines[0] === "WEBVTT") continue;

    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) continue;

    const timingLine = lines[timingIndex];
    const [rawStart, rawEndWithSettings] = timingLine.split("-->");
    if (!rawStart || !rawEndWithSettings) continue;

    const endMatch = rawEndWithSettings.trim().match(TIMESTAMP_RE);
    if (!endMatch) continue;

    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(endMatch[0]);
    const text = normalizeCueText(lines.slice(timingIndex + 1));

    if (!text || end <= start) continue;
    cues.push({ start, end, text });
  }

  return cues;
}

function parseSrt(input: string): SubtitleCueItem[] {
  const blocks = input.replace(/^\uFEFF/, "").split(/\r?\n\r?\n+/);
  const cues: SubtitleCueItem[] = [];

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    if (!lines.length) continue;

    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) continue;

    const [rawStart, rawEnd] = timingLine.split("-->");
    if (!rawStart || !rawEnd) continue;

    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd.trim().split(/\s+/)[0]);
    const timingIndex = lines.indexOf(timingLine);
    const text = normalizeCueText(lines.slice(timingIndex + 1));

    if (!text || end <= start) continue;
    cues.push({ start, end, text });
  }

  return cues;
}

export function parseSubtitleText(input: string): SubtitleCueItem[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (/^WEBVTT/m.test(trimmed)) return parseWebVtt(trimmed);
  return parseSrt(trimmed);
}

export function isTextSubtitleCodec(codec?: string | null): boolean {
  const normalized = (codec || "").trim().toLowerCase();
  if (!normalized) return true;
  if (TEXT_SUBTITLE_CODECS.has(normalized)) return true;
  return normalized.includes("eia_608") || normalized.includes("cea_608");
}

export function findActiveSubtitleCue(
  cues: SubtitleCueItem[],
  currentTime: number,
): SubtitleCueItem | null {
  let low = 0;
  let high = cues.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cue = cues[mid];
    if (currentTime < cue.start) {
      high = mid - 1;
    } else if (currentTime > cue.end) {
      low = mid + 1;
    } else {
      return cue;
    }
  }

  return null;
}