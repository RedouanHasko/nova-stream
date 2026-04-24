import { findActiveSubtitleCue, type SubtitleCueItem } from "../lib/subtitles";

interface SubtitleOverlayProps {
  cues: SubtitleCueItem[];
  currentTime: number;
  size: "small" | "medium" | "large";
  className?: string;
}

const sizeClassMap = {
  small: "text-base md:text-lg",
  medium: "text-lg md:text-2xl",
  large: "text-xl md:text-3xl",
} as const;

export default function SubtitleOverlay({
  cues,
  currentTime,
  size,
  className,
}: SubtitleOverlayProps) {
  const activeCue = findActiveSubtitleCue(cues, currentTime);
  if (!activeCue) return null;

  return (
    <div
      className={[
        "pointer-events-none absolute inset-x-0 bottom-[11%] z-20 flex justify-center px-6",
        className || "",
      ].join(" ")}
      aria-hidden="true"
    >
      <div
        className={[
          "nova-subtitle-overlay max-w-[min(90vw,960px)] rounded-2xl px-4 py-2 text-center font-semibold leading-tight md:px-5 md:py-3",
          sizeClassMap[size],
        ].join(" ")}
      >
        {activeCue.text.split("\n").map((line, index) => (
          <div key={`${activeCue.start}-${index}`}>{line}</div>
        ))}
      </div>
    </div>
  );
}