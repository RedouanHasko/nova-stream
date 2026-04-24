import { memo, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Play } from "lucide-react";
import { cn } from "../lib/utils";

const failedImageCache = new Set<string>();

const toProxyAssetUrl = (src?: string) => {
  if (!src || src.trim() === "") return "";
  if (/^https?:\/\//i.test(src)) {
    return `${window.location.origin}/api/proxy?url=${encodeURIComponent(src)}`;
  }
  return src;
};

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
  const [imgError, setImgError] = useState(
    () => !resolvedPoster || failedImageCache.has(resolvedPoster),
  );

  useEffect(() => {
    setImgError(!resolvedPoster || failedImageCache.has(resolvedPoster));
  }, [resolvedPoster]);

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex flex-col gap-2 group text-left w-full"
    >
      <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-all shadow-lg">
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
        <div className="absolute bottom-2 right-2 bg-primary px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
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
      <div className="bg-white/5 group-hover:bg-primary/20 p-2 rounded-md transition-colors">
        <span className="text-sm font-medium text-white/80 group-hover:text-white truncate block">
          {title}
        </span>
      </div>
    </motion.button>
  );
});

export default MovieCard;
