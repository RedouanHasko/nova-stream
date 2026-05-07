import { memo, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Play } from "lucide-react";
import { getThumbnailUrl } from "../lib/imageOptimization";
import { shouldAnimate } from "../lib/animationControl";

const failedImageCache = new Set<string>();

// Use optimized image URLs for TV (smaller filesize, lazy-loaded)
const toProxyAssetUrl = (src?: string) => getThumbnailUrl(src || undefined);

interface MovieCardProps {
  title: string;
  poster?: string;
  onClick?: () => void;
  progress?: number; // 0-1, undefined = no progress bar
  progressLabel?: string; // e.g. "S2E5"
}

const MovieCard = memo(function MovieCard({
  title,
  poster,
  onClick,
  progress,
  progressLabel,
}: MovieCardProps) {
  const resolvedPoster = toProxyAssetUrl(poster);
  const isTV = document.documentElement.dataset.tv === "true";
  const [imgError, setImgError] = useState(
    () => !resolvedPoster || failedImageCache.has(resolvedPoster),
  );

  useEffect(() => {
    setImgError(!resolvedPoster || failedImageCache.has(resolvedPoster));
  }, [resolvedPoster]);

  if (isTV) {
    return (
      <button
        data-tv-focusable
        onClick={onClick}
        className="tv-media-card flex flex-col group text-left w-full focus:outline-none focus-visible:outline-none"
      >
        <div className="tv-media-poster relative aspect-[2/3] w-full rounded-xl overflow-hidden border border-white/15 bg-black/35 transition-transform duration-150">
          {resolvedPoster && !imgError ? (
            <img
              src={resolvedPoster}
              alt={title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => {
                failedImageCache.add(resolvedPoster);
                setImgError(true);
              }}
            />
          ) : (
            <div className="w-full h-full bg-white/5 flex items-center justify-center">
              <span className="text-white/20 text-xs text-center px-2">
                {title}
              </span>
            </div>
          )}
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
        <p className="tv-media-title w-full text-sm font-semibold text-white/85 mt-2 leading-snug break-words line-clamp-2 min-h-[2.9rem]">
          {title}
        </p>
      </button>
    );
  }

  return (
    <motion.button
      data-tv-focusable
      whileHover={shouldAnimate() ? { scale: 1.05 } : {}}
      whileTap={shouldAnimate() ? { scale: 0.95 } : {}}
      onClick={onClick}
      className="flex flex-col group text-left w-full focus:outline-none focus-visible:outline-none"
    >
      <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden border-2 border-white/0 group-hover:shadow-[0_0_30px_rgba(66,133,244,0.4)] group-focus-visible:shadow-[0_0_40px_rgba(66,133,244,0.6)] group-focus-visible:scale-[1.03] transition-all duration-200 shadow-lg">
        {resolvedPoster && !imgError ? (
          <img
            src={resolvedPoster}
            alt={title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            referrerPolicy="no-referrer"
            onError={() => {
              failedImageCache.add(resolvedPoster);
              setImgError(true);
            }}
          />
        ) : (
          <div className="w-full h-full bg-white/5 flex items-center justify-center">
            <span className="text-white/20 text-xs text-center px-2">
              {title}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
    </motion.button>
  );
});

export default MovieCard;
