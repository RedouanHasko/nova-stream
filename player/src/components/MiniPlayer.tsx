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
      let fatalRecoveryAttempts = 0;
      hls = new Hls({
        enableWorker: true,
        enableSoftwareAES: false,
        lowLatencyMode: false,
        backBufferLength: 45,
        startLevel: -1,
        maxBufferLength: 40,
        maxMaxBufferLength: 80,
        maxBufferSize: 24 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 3,
        nudgeMaxRetry: 5,
        abrEwmaDefaultEstimate: 900_000,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.65,
        testBandwidth: false,
        fragLoadingMaxRetry: 5,
        levelLoadingMaxRetry: 3,
        manifestLoadingMaxRetry: 3,
        fragLoadingTimeOut: 60_000,
        manifestLoadingTimeOut: 45_000,
        levelLoadingTimeOut: 45_000,
      });
      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        if (fatalRecoveryAttempts < 3) {
          fatalRecoveryAttempts++;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
        }
        hls.destroy();
        hls = null;
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
