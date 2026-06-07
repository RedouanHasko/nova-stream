import { memo, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { getThumbnailUrl, useTvLazyImage } from "../lib/imageOptimization";
import { cn } from "../lib/utils";
import { usePlaylist } from "../context/PlaylistContext";
import { useT } from "../lib/i18n";

const failedImageCache = new Set<string>();

interface MovieCardProps {
  title: string;
  poster?: string;
  onClick?: () => void;
  progress?: number;
  progressLabel?: string;
  /** TV list row: show index in the left column (like channel number). */
  rowIndex?: number;
  /** Subtitle under the title on TV list rows. */
  mediaKind?: "movie" | "series";
}

const MovieCard = memo(function MovieCard({
  title,
  poster,
  onClick,
  progress,
  progressLabel,
  rowIndex,
  mediaKind = "movie",
}: MovieCardProps) {
  const { activePlaylist } = usePlaylist();
  const t = useT();
  const panelHost = activePlaylist?.host || "";
  const resolvedPoster = getThumbnailUrl(poster, panelHost);
  const isTV = document.documentElement.dataset.tv === "true";
  const imgRef = useRef<HTMLImageElement>(null);
  const posterLoaded = useTvLazyImage(imgRef, resolvedPoster || "", 600);
  const [imgError, setImgError] = useState(
    () => !resolvedPoster || failedImageCache.has(resolvedPoster),
  );

  useEffect(() => {
    setImgError(!resolvedPoster || failedImageCache.has(resolvedPoster));
  }, [resolvedPoster]);

  const posterBody =
    resolvedPoster && !imgError ? (
      <img
        ref={imgRef}
        alt={title}
        src={isTV ? resolvedPoster : undefined}
        loading="lazy"
        decoding="async"
        className={cn(
          "w-full h-full object-cover transition-opacity duration-200",
          isTV || posterLoaded ? "opacity-100" : "opacity-0",
        )}
        referrerPolicy="no-referrer"
        onError={() => {
          if (resolvedPoster) failedImageCache.add(resolvedPoster);
          setImgError(true);
        }}
      />
    ) : (
      <div className="w-full h-full bg-white/5 flex items-center justify-center">
        <span className="text-white/20 text-[10px] text-center px-1 line-clamp-3">
          {title}
        </span>
      </div>
    );

  const kindLabel = mediaKind === "series" ? t.series : t.movie;

  if (isTV) {
    return (
      <button
        data-tv-focusable
        onClick={onClick}
        className={cn(
          "tv-channel-row flex items-center gap-3 w-full h-[82px] px-4 text-left transition-all mx-2 my-1",
          "hover:bg-white/6 focus:outline-none focus-visible:outline-none",
        )}
      >
        <div className="w-10 text-xs text-white/40 font-semibold tabular-nums shrink-0">
          {rowIndex ?? "—"}
        </div>
        <div className="tv-channel-logo-shell w-12 h-[58px] flex-shrink-0">
          {posterBody}
        </div>
        <div className="flex-1 min-w-0">
          <span className="block text-lg font-medium text-white/85 truncate">
            {title}
          </span>
          <span className="block text-[11px] text-white/35 uppercase tracking-wide">
            {kindLabel}
            {progressLabel ? ` · ${progressLabel}` : ""}
          </span>
          {progress !== undefined && progress > 0 && (
            <div className="mt-1.5 h-1 w-full max-w-[200px] bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${Math.min(progress * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
        <Play className="w-4 h-4 text-white/35 shrink-0" />
      </button>
    );
  }

  return (
    <button
      data-tv-focusable
      onClick={onClick}
      className="flex flex-col group text-left w-full focus:outline-none focus-visible:outline-none transition-transform duration-200 hover:scale-105 active:scale-95"
    >
      <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden border-2 border-white/0 group-hover:shadow-[0_0_30px_rgba(66,133,244,0.4)] group-focus-visible:shadow-[0_0_40px_rgba(66,133,244,0.6)] group-focus-visible:scale-[1.03] transition-all duration-200 shadow-lg">
        {posterBody}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <div className="bg-primary p-3 rounded-full">
            <Play className="w-6 h-6 fill-white text-white" />
          </div>
        </div>
        <div className="absolute top-2 right-2 bg-primary px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
          HD
        </div>
        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0">
            {progressLabel && (
              <div className="px-2 pb-1">
                <span className="text-[9px] font-bold text-white/80 bg-black/60 px-1.5 py-0.5 rounded">
                  {progressLabel}
                </span>
              </div>
            )}
            <div className="h-1 bg-white/20">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(progress * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <p className="w-full text-xs font-medium text-white/80 mt-1.5 leading-snug break-words">
        {title}
      </p>
    </button>
  );
});

export default MovieCard;
