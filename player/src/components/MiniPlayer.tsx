import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface MiniPlayerProps {
  url: string;
  poster?: string;
}

export default function MiniPlayer({ url, poster }: MiniPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current || !url) return;
    const video = videoRef.current;
    let hls: Hls | null = null;

    const proxiedUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const isM3u8 = url.includes(".m3u8");

    if (!isM3u8) {
      video.src = proxiedUrl;
      video.play().catch(() => {});
      return;
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });
      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxiedUrl;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [url]);

  return (
    <video
      ref={videoRef}
      className="w-full h-full object-contain bg-black"
      poster={poster || undefined}
      muted
      autoPlay
      playsInline
    />
  );
}
