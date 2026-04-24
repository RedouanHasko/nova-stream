import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Maximize2, Play, Pause } from "lucide-react";
import Hls from "hls.js";
import { useFloatingPlayer } from "../context/FloatingPlayerContext";

export default function FloatingPlayer() {
  const navigate = useNavigate();
  const { floatingStream, closeMiniPlayer, miniCurrentTimeRef } =
    useFloatingPlayer();

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const currentTimeRef = useRef(0);

  // Start/restart playback whenever the stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !floatingStream?.url) return;

    // Tear down previous playback
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.pause();
    video.removeAttribute("src");
    video.load();

    const proxied = `${window.location.origin}/api/proxy?url=${encodeURIComponent(floatingStream.url)}`;
    const startTime = miniCurrentTimeRef.current ?? 0;

    const onReady = () => {
      if (startTime > 1) {
        try {
          video.currentTime = startTime;
        } catch {}
      }
      video.play().catch(() => {});
    };

    const ext = (floatingStream.extension || "").toLowerCase();
    const isM3U8 =
      ext === "m3u8" ||
      floatingStream.url.includes(".m3u8") ||
      floatingStream.url.includes("/live/") ||
      floatingStream.url.includes("/hls/");

    if (isM3U8 && Hls.isSupported()) {
      let fatalRecoveryAttempts = 0;
      const hls = new Hls({
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
        startFragPrefetch: false,
        progressive: true,
        fragLoadingMaxRetry: 5,
        levelLoadingMaxRetry: 3,
        manifestLoadingMaxRetry: 3,
        fragLoadingTimeOut: 60_000,
        manifestLoadingTimeOut: 45_000,
        levelLoadingTimeOut: 45_000,
      });
      hlsRef.current = hls;
      hls.loadSource(proxied);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => onReady());
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
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
        hlsRef.current = null;
      });
    } else if (isM3U8 && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxied;
      video.addEventListener("loadedmetadata", onReady, { once: true });
    } else {
      // Native video (mp4, mkv, ts, etc.)
      video.src = proxied;
      video.addEventListener("loadedmetadata", onReady, { once: true });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute("src");
    };
  }, [floatingStream?.url]);

  // Track current time so we can hand it back when expanding
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      currentTimeRef.current = video.currentTime;
    };
    const onPlaying = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  const handleExpand = () => {
    const video = videoRef.current;
    const t = video ? video.currentTime : currentTimeRef.current;

    // Pause the mini player before navigating so there's no audio overlap
    if (video) {
      video.pause();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Navigate to the full player, restoring the saved state + current time
    navigate("/player", {
      state: {
        ...(floatingStream?.playerState ?? {}),
        startTime: t,
      },
    });

    closeMiniPlayer();
  };

  const handleClose = () => {
    const video = videoRef.current;
    if (video) video.pause();
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    closeMiniPlayer();
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  if (!floatingStream) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] w-80 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black flex flex-col"
      style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.8)" }}
    >
      {/* Video */}
      <div className="relative aspect-video bg-black cursor-pointer" onClick={togglePlay}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          muted={false}
          poster={
            floatingStream.poster
              ? `${window.location.origin}/api/proxy?url=${encodeURIComponent(floatingStream.poster)}`
              : undefined
          }
        />
        {/* Play/pause overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="w-5 h-5 fill-white text-white ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900">
        <p className="flex-1 text-sm font-semibold text-white truncate">
          {floatingStream.title}
        </p>
        {/* Expand to full player */}
        <button
          onClick={handleExpand}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors shrink-0"
          title="Expand to full player"
        >
          <Maximize2 className="w-4 h-4 text-white/70" />
        </button>
        {/* Close */}
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors shrink-0"
          title="Close"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>
      </div>
    </div>
  );
}
