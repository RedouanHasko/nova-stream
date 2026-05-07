import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useDeferredValue,
  startTransition,
  memo,
} from "react";
import {
  ArrowLeft,
  Search,
  Play,
  Pause,
  Star,
  Loader2,
  Tv,
  Heart,
  Maximize2,
  Clock,
  Volume2,
  VolumeX,
  Music,
  Subtitles,
  PictureInPicture2,
  Monitor,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Logo from "../components/Logo";
import WeatherWidget from "../components/WeatherWidget";
import DigitalClock from "../components/DigitalClock";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";
import { toast } from "sonner";
import { usePlaylist } from "../context/PlaylistContext";
import {
  IPTVService,
  Category,
  LiveStream,
  EpgProgram,
} from "../services/iptvService";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { trySwitchPlatformAudioTrack, trySwitchPlatformSubtitleTrack, getPlatformName, startPlatformPlayback, webosRegisterTrack, webosUnregisterTrack, webosGetTracks, normalizePlatformTracks, webosReadNativeTracks } from "../lib/platformPlayer";
import { getMediaApiBaseUrl } from "../lib/activationApi";
import { focusNext, useTVRemote, handleHeaderZoneKey, focusHeader } from "../lib/remote";

const EpgItem = ({
  program,
  timeFormat,
}: {
  program: EpgProgram;
  timeFormat: "12h" | "24h";
}) => {
  const now = Date.now();
  const startMs = new Date(program.start).getTime();
  const endMs = new Date(program.end).getTime();
  const isNowPlaying = now >= startMs && now < endMs;
  const isUpcoming = startMs > now;
  const progress =
    isNowPlaying && endMs > startMs
      ? Math.min(((now - startMs) / (endMs - startMs)) * 100, 100)
      : 0;

  const durationMin = Math.round((endMs - startMs) / 60000);

  const startTime = new Date(program.start).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: timeFormat === "12h",
  });
  const endTime = new Date(program.end).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: timeFormat === "12h",
  });

  const safeDecode = (str: string) => {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      return str;
    }
  };

  return (
    <div
      className={cn(
        "relative flex gap-4 py-3 px-3 rounded-xl border-b border-white/5 last:border-0 group transition-colors",
        isNowPlaying && "bg-primary/10 border-primary/20",
        !isNowPlaying && !isUpcoming && "opacity-50",
      )}
    >
      {/* Time column */}
      <div className="flex flex-col items-center justify-start min-w-[70px] text-sm font-mono pt-0.5">
        <span
          className={cn(
            "font-bold",
            isNowPlaying ? "text-primary" : "text-white/50",
          )}
        >
          {startTime}
        </span>
        <span className="text-white/30 text-xs">{endTime}</span>
        {durationMin > 0 && (
          <span className="text-white/20 text-[10px] mt-1">
            {durationMin} min
          </span>
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {isNowPlaying && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 rounded-full text-[10px] font-bold text-primary uppercase tracking-wider shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              Now
            </span>
          )}
          {!isNowPlaying && isUpcoming && (
            <span className="px-2 py-0.5 bg-white/5 rounded-full text-[10px] font-bold text-white/40 uppercase tracking-wider shrink-0">
              Up Next
            </span>
          )}
          <h4
            className={cn(
              "font-bold truncate",
              isNowPlaying
                ? "text-white"
                : "text-white/70 group-hover:text-white transition-colors",
            )}
          >
            {safeDecode(program.title)}
          </h4>
        </div>
        {program.description && (
          <p
            className={cn(
              "text-sm line-clamp-2 mt-1 leading-relaxed",
              isNowPlaying ? "text-white/60" : "text-white/30",
            )}
          >
            {safeDecode(program.description)}
          </p>
        )}
        {/* Progress bar for currently playing */}
        {isNowPlaying && (
          <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const MiniPlayer = ({
  urls,
  poster,
  title,
  onNext,
  onPrev,
  videoRef: externalVideoRef,
}: {
  urls: string[];
  poster: string;
  title: string;
  onNext?: () => void;
  onPrev?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) => {
  const { settings } = usePlaylist();
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const platformPlayerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"contain" | "cover" | "fill">(
    "contain",
  );
  const [isPipAvailable, setIsPipAvailable] = useState(false);

  const lastVolumeRef = useRef(0.8);
  const startupTimerRef = useRef<NodeJS.Timeout | null>(null);

  // HLS State
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [subtitleTracks, setSubtitleTracks] = useState<any[]>([]);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1);
  const [activeMenu, setActiveMenu] = useState<
    | "none"
    | "audio"
    | "subtitle"
    | "aspect"
    | "stability"
  >("none");
  const [stabilityMode, setStabilityMode] = useState<"stable" | "ultra">(
    "stable",
  );
  const [streamAttemptIndex, setStreamAttemptIndex] = useState(0);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const streamCandidates = useMemo(() => {
    const sanitized = (Array.isArray(urls) ? urls : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return Array.from(new Set(sanitized));
  }, [urls]);

  useEffect(() => {
    setStreamAttemptIndex(0);
  }, [streamCandidates.join("|")]);

  const resetControlsTimeout = useCallback(() => {
    if (isLocked) return;
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying, isLocked]);

  useEffect(() => {
    setIsPipAvailable(document.pictureInPictureEnabled);
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      resetControlsTimeout();
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControlsTimeout]);

  // TV remote control â€” only active when the player is fullscreen so keys
  // don't conflict with the channel-list navigation in the parent view.
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (!key) return;
      // Consume the event so the parent onTVKey doesn't also react.
      e.stopImmediatePropagation();
      resetControlsTimeout();
      if (key === "back") {
        document.exitFullscreen();
        return;
      }
      if (key === "enter" || key === "playpause") {
        if (!isLocked) {
          if (videoRef.current) {
            if (isPlaying) { videoRef.current.pause(); setIsPlaying(false); setShowControls(true); }
            else { videoRef.current.play().catch(() => {}); setIsPlaying(true); }
          }
        }
        return;
      }
      if ((key === "left" || key === "rewind") && !isLocked) { onPrev?.(); return; }
      if ((key === "right" || key === "fastforward") && !isLocked) { onNext?.(); return; }
      if (key === "up" && !isLocked) { setVolume((v) => Math.min(100, v + 5)); return; }
      if (key === "down" && !isLocked) { setVolume((v) => Math.max(0, v - 5)); return; }
      if (key === "red" && !isLocked) {
        setIsMuted((m) => !m);
        return;
      }
    };
    window.addEventListener("tv-remote-key", handler);
    return () => window.removeEventListener("tv-remote-key", handler);
  }, [isFullscreen, isPlaying, isLocked, onPrev, onNext, resetControlsTimeout, videoRef]);

  useEffect(() => {
    const activeUrl = streamCandidates[streamAttemptIndex] || "";
    if (!activeUrl || !videoRef.current) return;
    const video = videoRef.current;
    const platform = getPlatformName();
    const base = getMediaApiBaseUrl() || window.location.origin;
    const proxiedUrl = `${base.replace(/\/$/, "")}/api/proxy?url=${encodeURIComponent(activeUrl)}`;
    const isPackagedMode = window.location.protocol === "file:";
    const isDefaultFallbackMediaBase = /192\.168\.56\.1:(4000|5000)/i.test(base);
    const canUseProxyFallback = !(isPackagedMode && isDefaultFallbackMediaBase);
    const canTryNextCandidate = streamAttemptIndex < streamCandidates.length - 1;
    const tryNextCandidate = () => {
      if (!canTryNextCandidate) return false;
      setStreamAttemptIndex((previous) => previous + 1);
      return true;
    };
    // â”€â”€â”€ NEW CLEAN PLAYBACK ENGINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Reset state for new channel
    setIsLoading(true);
    setIsBuffering(false);
    setIsPlaying(true);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setCurrentAudioTrack(-1);
    setCurrentSubtitleTrack(-1);

    // Tear down previous engine
    if (startupTimerRef.current) { clearTimeout(startupTimerRef.current); startupTimerRef.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null; }

    let cleaned = false;
    let nativeErrorHandler: (() => void) | null = null;

    const onCanPlay = () => { setIsLoading(false); setIsBuffering(false); };
    const onPlaying = () => { setIsLoading(false); setIsBuffering(false); };
    const onWaiting = () => setIsBuffering(true);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (startupTimerRef.current) { clearTimeout(startupTimerRef.current); startupTimerRef.current = null; }
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null; }
      if (nativeErrorHandler) { video.removeEventListener("error", nativeErrorHandler); nativeErrorHandler = null; }
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
    };

    // Browser-parity playback path for all platforms, including webOS.
    // This keeps stream handling consistent across desktop and TV.
    const ext = activeUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
    const isM3U8 = ext === "m3u8" || !["ts", "mp4", "mkv", "avi"].includes(ext);
    const isTS = ext === "ts";
    // In packaged TV mode, prefer backend proxy first (same as browser parity
    // workflow) to avoid provider CORS/playlist issues on device engines.
    const preferProxyFirst =
      window.location.protocol === "file:" &&
      canUseProxyFallback &&
      platform !== "webos";
    const primaryUrl = preferProxyFirst ? proxiedUrl : activeUrl;
    const secondaryUrl = preferProxyFirst ? activeUrl : (canUseProxyFallback ? proxiedUrl : activeUrl);

    if (isM3U8 && Hls.isSupported()) {
      const isUltra = stabilityMode === "ultra";
      const hls = new Hls({
        enableWorker: true,
        enableSoftwareAES: false,
        lowLatencyMode: false,
        startLevel: -1,
        maxBufferLength: isUltra ? 30 : 15,
        maxMaxBufferLength: isUltra ? 60 : 30,
        maxBufferSize: (isUltra ? 48 : 24) * 1000 * 1000,
        fragLoadingMaxRetry: 10,
        manifestLoadingMaxRetry: 5,
        levelLoadingMaxRetry: 5,
        fragLoadingTimeOut: 30_000,
        manifestLoadingTimeOut: 20_000,
        levelLoadingTimeOut: 20_000,
        capLevelToPlayerSize: true,
        autoStartLoad: true,
      });
      hlsRef.current = hls;
      let switchedToSecondary = false;
      hls.loadSource(primaryUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setAudioTracks(hls.audioTracks || []);
        setCurrentAudioTrack(hls.audioTrack);
        setSubtitleTracks(hls.subtitleTracks || []);
        setCurrentSubtitleTrack(hls.subtitleTrack);
        video.play().catch(() => setIsPlaying(false));
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e: any, data: any) => setCurrentAudioTrack(data.id));
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_e: any, data: any) => setCurrentSubtitleTrack(data.id));
      let hlsRetries = 0;
      hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !switchedToSecondary && secondaryUrl !== primaryUrl) {
          switchedToSecondary = true;
          hlsRetries = 0;
          hls.loadSource(secondaryUrl);
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsRetries < 3) {
          hlsRetries++;
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsRetries < 2) {
          hlsRetries++;
          hls.recoverMediaError();
        } else {
          if (tryNextCandidate()) return;
          hls.destroy();
          hlsRef.current = null;
          video.src = secondaryUrl;
          video.load();
          video.play().catch(() => {});
        }
      });
    } else if (isM3U8 && video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari / native HLS
      let switchedToSecondary = false;
      const nativeErr = () => {
        if (switchedToSecondary || cleaned) return;
        switchedToSecondary = true;
        if (secondaryUrl === primaryUrl) {
          // No usable proxy fallback for this environment.
          if (tryNextCandidate()) return;
          setIsPlaying(false);
          return;
        }
        video.src = secondaryUrl;
        video.load();
        video.play().catch(() => setIsPlaying(false));
      };
      video.addEventListener("error", nativeErr, { once: true });
      video.src = primaryUrl;
      video.load();
      video.play().catch(() => setIsPlaying(false));
    } else if (isTS && (mpegts.getFeatureList().mseLivePlayback || mpegts.getFeatureList().msePlayback)) {
      let switchedToSecondary = false;
      const player = mpegts.createPlayer(
        { type: "mpegts", url: primaryUrl, isLive: true, cors: true, withCredentials: false },
        {
          enableWorker: true,
          enableStashBuffer: true,
          stashInitialSize: stabilityMode === "ultra" ? 1024 * 1024 : 1024 * 256,
          autoCleanupSourceBuffer: true,
          liveBufferLatencyChasing: stabilityMode === "stable",
        },
      );
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();
      const _pp = player.play();
      if (_pp instanceof Promise) _pp.catch(() => {});
      player.on(mpegts.Events.ERROR, () => {
        if (!switchedToSecondary && secondaryUrl !== primaryUrl) {
          switchedToSecondary = true;
          player.destroy();
          mpegtsRef.current = null;
          const fallbackPlayer = mpegts.createPlayer(
            { type: "mpegts", url: secondaryUrl, isLive: true, cors: true, withCredentials: false },
            {
              enableWorker: true,
              enableStashBuffer: true,
              stashInitialSize: stabilityMode === "ultra" ? 1024 * 1024 : 1024 * 256,
              autoCleanupSourceBuffer: true,
              liveBufferLatencyChasing: stabilityMode === "stable",
            },
          );
          mpegtsRef.current = fallbackPlayer;
          fallbackPlayer.attachMediaElement(video);
          fallbackPlayer.load();
          const p = fallbackPlayer.play();
          if (p instanceof Promise) p.catch(() => {});
          return;
        }
        player.destroy();
        mpegtsRef.current = null;
        if (tryNextCandidate()) return;
        video.src = secondaryUrl;
        video.play().catch(() => {});
      });
    } else {
      let switchedToSecondary = false;
      const nativeErr = () => {
        if (switchedToSecondary || cleaned) return;
        switchedToSecondary = true;
        if (secondaryUrl === primaryUrl) {
          // No usable proxy fallback for this environment.
          if (tryNextCandidate()) return;
          setIsPlaying(false);
          return;
        }
        video.src = secondaryUrl;
        video.load();
        video.play().catch(() => setIsPlaying(false));
      };
      video.addEventListener("error", nativeErr, { once: true });
      video.src = primaryUrl;
      video.load();
      video.play().catch(() => setIsPlaying(false));
    }

    return cleanup;
  }, [stabilityMode, streamAttemptIndex, streamCandidates]);

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isLocked) return;
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
        setShowControls(true);
      } else {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
        resetControlsTimeout();
      }
    }
  };

  const toggleFullscreen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isLocked) return;
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        toast.error(
          `Error attempting to enable full-screen mode: ${err.message}`,
        );
      });
    } else {
      document.exitFullscreen();
    }
  };

  const togglePip = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isLocked) return;
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (error) {
      toast.error("Picture-in-Picture failed");
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(volume / 100, 1));
    video.muted = isMuted || volume === 0;
  }, [videoRef, volume, isMuted]);

  const toggleMuteButton = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isLocked) return;

    if (isMuted || volume === 0) {
      const restoredVolume = Math.max(
        1,
        Math.round(lastVolumeRef.current * 100),
      );
      setVolume(restoredVolume);
      setIsMuted(false);
    } else {
      if (volume > 0) lastVolumeRef.current = volume / 100;
      setIsMuted(true);
    }
  };

  const handleMenuClick = (menu: typeof activeMenu) => {
    if (isLocked) return;
    setActiveMenu((prev) => (prev === menu ? "none" : menu));
    resetControlsTimeout();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full h-full relative group bg-black overflow-hidden",
        isFullscreen ? "flex items-center justify-center" : "",
      )}
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      {/* Subtitle Styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        video::cue {
          background-color: rgba(0, 0, 0, 0.6);
          color: ${settings.subtitleColor};
          font-size: ${settings.subtitleSize === "small" ? "0.8em" : settings.subtitleSize === "large" ? "1.2em" : "1em"};
          font-family: sans-serif;
        }
      `,
        }}
      />

      <video
        ref={videoRef}
        className={cn(
          "w-full h-full transition-all duration-300",
          aspectRatio === "contain" && "object-contain",
          aspectRatio === "cover" && "object-cover",
          aspectRatio === "fill" && "object-fill",
          isFullscreen ? "max-h-screen" : "",
        )}
        style={{ transform: "translateZ(0)", willChange: "transform" }}
        poster={poster || undefined}
        playsInline
        preload="auto"
        onPlay={() => {
          setIsPlaying(true);
          setIsBuffering(false);
        }}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsLoading(false);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onStalled={() => setIsBuffering(true)}
      />

      {/* Loading / Buffering Indicator */}
      {(isLoading || isBuffering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
      )}

      {/* Lock Overlay */}
      {isLocked && showControls && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-black/60 p-4 rounded-full backdrop-blur-md"
          >
            <Lock className="w-12 h-12 text-white/40" />
          </motion.div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/60 via-transparent to-black/60 transition-opacity duration-300 z-10",
          showControls || !isPlaying
            ? "opacity-100"
            : "opacity-0 pointer-events-none",
        )}
      >
        {/* Top Bar */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isFullscreen && (
              <button
                onClick={toggleFullscreen}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <ArrowLeft className="w-6 h-6 text-white" />
              </button>
            )}
            <div className="flex flex-col">
              <h2
                className={cn(
                  "font-bold text-white truncate",
                  isFullscreen ? "text-xl" : "text-sm",
                )}
              >
                {title}
              </h2>
              {isFullscreen && (
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-red-500 font-bold uppercase tracking-widest text-[10px]">
                    Live
                  </span>
                </div>
              )}
              {stabilityMode === "ultra" && (
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-[8px] text-blue-400 font-bold uppercase tracking-wider">
                    Ultra Stable Mode
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLocked(!isLocked);
              }}
              className={cn(
                "p-2 rounded-full transition-colors",
                isLocked
                  ? "bg-red-500 text-white"
                  : "hover:bg-white/10 text-white",
              )}
            >
              {isLocked ? (
                <Lock className="w-5 h-5" />
              ) : (
                <Unlock className="w-5 h-5" />
              )}
            </button>
            {isFullscreen && <Logo size="sm" />}
          </div>
        </div>

        {/* Center Controls */}
        <div className="flex-1 flex items-center justify-center gap-12">
          {!isLocked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPrev?.();
              }}
              className="p-4 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm transition-all hover:scale-110"
            >
              <ChevronLeft className="w-8 h-8 text-white" />
            </button>
          )}

          <button
            onClick={togglePlay}
            className={cn(
              "bg-primary/80 hover:bg-primary p-6 rounded-full shadow-2xl transition-all hover:scale-110 backdrop-blur-sm",
              !isPlaying && "scale-125",
              isLocked && "opacity-50 cursor-not-allowed",
            )}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white fill-white" />
            ) : (
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            )}
          </button>

          {!isLocked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNext?.();
              }}
              className="p-4 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm transition-all hover:scale-110"
            >
              <ChevronRight className="w-8 h-8 text-white" />
            </button>
          )}
        </div>

        {/* Bottom Bar */}
        <div className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Volume */}
            <div className="flex items-center gap-2 group/volume">
              <button
                onClick={toggleMuteButton}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title={isMuted || volume === 0 ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>
              {!isLocked && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setVolume(val);
                    if (val > 0) lastVolumeRef.current = val / 100;
                    setIsMuted(val === 0 ? true : false);
                  }}
                  className="w-0 group-hover/volume:w-20 transition-all duration-300 accent-primary"
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isLocked && (
              <>
                {/* Aspect Ratio */}
                <div className="relative">
                  <button
                    onClick={() => handleMenuClick("aspect")}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      activeMenu === "aspect"
                        ? "bg-primary text-white"
                        : "hover:bg-white/10 text-white",
                    )}
                  >
                    <Monitor className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {activeMenu === "aspect" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[140px] shadow-2xl"
                      >
                        <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                          Aspect Ratio
                        </div>
                        {(["contain", "cover", "fill"] as const).map(
                          (ratio) => (
                            <button
                              key={ratio}
                              onClick={() => {
                                setAspectRatio(ratio);
                                setActiveMenu("none");
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-xs capitalize transition-colors",
                                aspectRatio === ratio
                                  ? "bg-primary text-white"
                                  : "hover:bg-white/10 text-white/80",
                              )}
                            >
                              {ratio}
                            </button>
                          ),
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Stability Mode */}
                <div className="relative">
                  <button
                    onClick={() => handleMenuClick("stability")}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      activeMenu === "stability"
                        ? "bg-primary text-white"
                        : "hover:bg-white/10 text-white",
                    )}
                    title="Stability Mode"
                  >
                    <Clock className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {activeMenu === "stability" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[160px] shadow-2xl"
                      >
                        <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                          Stability Mode
                        </div>
                        {(["stable", "ultra"] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => {
                              setStabilityMode(mode);
                              setActiveMenu("none");
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-xs capitalize transition-colors",
                              stabilityMode === mode
                                ? "bg-primary text-white"
                                : "hover:bg-white/10 text-white/80",
                            )}
                          >
                            <div className="font-bold">
                              {mode === "stable" ? "Stable" : "Ultra Stable"}
                            </div>
                            <div className="text-[10px] opacity-60">
                              {mode === "stable"
                                ? "Balanced buffer"
                                : "Maximum buffering"}
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* PiP */}
                {isPipAvailable && (
                  <button
                    onClick={togglePip}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
                  >
                    <PictureInPicture2 className="w-5 h-5" />
                  </button>
                )}

                {/* Audio Tracks */}
                {audioTracks.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => handleMenuClick("audio")}
                      className={cn(
                        "p-2 rounded-full transition-colors",
                        activeMenu === "audio"
                          ? "bg-primary text-white"
                          : "hover:bg-white/10 text-white",
                      )}
                    >
                      <Music className="w-5 h-5" />
                    </button>
                    <AnimatePresence>
                      {activeMenu === "audio" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[140px] shadow-2xl"
                        >
                          <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                            Audio
                          </div>
                          {audioTracks.map((track, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                const v = (document.querySelector('video') as HTMLVideoElement) || null;
                                // Try platform API first (Tizen AVPlay)
                                if (trySwitchPlatformAudioTrack(v, idx)) {
                                  setActiveMenu("none");
                                  setCurrentAudioTrack(idx);
                                  return;
                                }
                                if (hlsRef.current) hlsRef.current.audioTrack = idx;
                                setActiveMenu("none");
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                                currentAudioTrack === idx
                                  ? "bg-primary text-white"
                                  : "hover:bg-white/10 text-white/80",
                              )}
                            >
                              {track.name || `Track ${idx + 1}`}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Subtitles */}
                {subtitleTracks.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => handleMenuClick("subtitle")}
                      className={cn(
                        "p-2 rounded-full transition-colors",
                        activeMenu === "subtitle"
                          ? "bg-primary text-white"
                          : "hover:bg-white/10 text-white",
                      )}
                    >
                      <Subtitles className="w-5 h-5" />
                    </button>
                    <AnimatePresence>
                      {activeMenu === "subtitle" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[140px] shadow-2xl"
                        >
                          <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                            Subtitles
                          </div>
                          <button
                            onClick={() => {
                              const v = (document.querySelector('video') as HTMLVideoElement) || null;
                              if (trySwitchPlatformSubtitleTrack(v, -1)) {
                                setActiveMenu("none");
                                setCurrentSubtitleTrack(-1);
                                return;
                              }
                              if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
                              setActiveMenu("none");
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                              currentSubtitleTrack === -1
                                ? "bg-primary text-white"
                                : "hover:bg-white/10 text-white/80",
                            )}
                          >
                            Off
                          </button>
                          {subtitleTracks.map((track, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                const v = (document.querySelector('video') as HTMLVideoElement) || null;
                                if (trySwitchPlatformSubtitleTrack(v, idx)) {
                                  setActiveMenu("none");
                                  setCurrentSubtitleTrack(idx);
                                  return;
                                }
                                if (hlsRef.current) hlsRef.current.subtitleTrack = idx;
                                setActiveMenu("none");
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                                currentSubtitleTrack === idx
                                  ? "bg-primary text-white"
                                  : "hover:bg-white/10 text-white/80",
                              )}
                            >
                              {track.name || `Track ${idx + 1}`}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}


              </>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Module-level cache of image URLs that have failed to load.
// Persists across component mounts so failed logos are never retried.
const failedImageCache = new Set<string>();

// Images in <img> tags load cross-origin natively without CORS proxying.
const toProxyAssetUrl = (src?: string) => (src?.trim() || "");

const CHANNEL_BATCH_SIZE = 50;
const CATEGORY_DIVIDER_PATTERN = /^#+\s*[^#]+\s*#+$/;

const normalizeCategoryId = (value: unknown) => String(value ?? "").trim();

const isListableLiveChannel = (channel: LiveStream) => {
  const name = String(channel?.name ?? "").trim();
  return Boolean(channel?.stream_id) && !CATEGORY_DIVIDER_PATTERN.test(name);
};

const ChannelIcon = ({ src, alt }: { src: string; alt: string }) => {
  const resolvedSrc = toProxyAssetUrl(src);
  const [error, setError] = useState(
    () => !resolvedSrc || failedImageCache.has(resolvedSrc),
  );

  // Virtual lists reuse component instances with new props â€” the useState
  // initializer only runs on mount, so we must sync `error` whenever `src` changes.
  useEffect(() => {
    setError(!resolvedSrc || failedImageCache.has(resolvedSrc));
  }, [resolvedSrc]);

  const getInitials = (name: string) => {
    return name.trim().charAt(0).toUpperCase();
  };

  const getBgColor = (name: string) => {
    const colors = [
      "bg-red-500/20 text-red-400",
      "bg-blue-500/20 text-blue-400",
      "bg-green-500/20 text-green-400",
      "bg-purple-500/20 text-purple-400",
      "bg-orange-500/20 text-orange-400",
      "bg-pink-500/20 text-pink-400",
      "bg-cyan-500/20 text-cyan-400",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (error) {
    return (
      <div
        className={cn(
          "w-full h-full flex items-center justify-center font-bold text-xs",
          getBgColor(alt),
        )}
      >
        {getInitials(alt)}
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className="w-full h-full object-contain"
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => {
        failedImageCache.add(resolvedSrc);
        setError(true);
      }}
    />
  );
};

const ChannelRow = memo(({ channel, isSelected, isFavorite, isTVFocused, onSelect, onHover }: {
  channel: any;
  isSelected: boolean;
  isFavorite: boolean;
  isTVFocused?: boolean;
  onSelect: (ch: any) => void;
  onHover: (ch: any) => void;
}) => {
  return (
    <div>
      <button
        data-tv-focusable
        onMouseEnter={() => onHover(channel)}
        onFocus={() => onHover(channel)}
        onClick={() => onSelect(channel)}
        className={cn(
          "tv-channel-row flex items-center gap-3 w-full h-[82px] px-4 text-left transition-all mx-2 my-1",
          "hover:bg-white/6",
          isSelected && "tv-channel-row--selected",
          isTVFocused && !isSelected && "tv-channel-row--focus",
        )}
      >
        <div className="w-10 text-xs text-white/40 font-semibold tabular-nums">{channel.num ?? "-"}</div>
        <div className="w-12 h-8 bg-white/5 rounded overflow-hidden flex-shrink-0">
          <ChannelIcon src={channel.stream_icon} alt={channel.name} />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className={cn(
              "block text-lg font-medium truncate",
              isSelected ? "text-white" : "text-white/80",
            )}
          >
            {channel.name}
          </span>
          <span className="block text-[11px] text-white/35 uppercase tracking-wide">
            Live Channel
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isSelected && (
            <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded text-[10px] text-primary font-bold uppercase">
              <Play className="w-3 h-3 fill-primary" />
              Playing
            </div>
          )}
          {isFavorite && (
            <Star className="w-4 h-4 fill-primary text-primary" />
          )}
        </div>
      </button>
    </div>
  );
});

export default function LiveTV() {
  const navigate = useNavigate();
  const t = useT();
  const {
    activePlaylist,
    isConnected,
    playlistData,
    fetchLive,
    isFetchingLive,
    favorites,
    toggleFavorite,
    settings,
    updateSettings,
    isParentalUnlocked,
    unlockParental,
    lockParental,
  } = usePlaylist();

  // Default to first real category on first render
  const [activeCategory, setActiveCategory] = useState(() => {
    const cats = playlistData.liveCategories || [];
    return cats.length > 0 ? normalizeCategoryId(cats[0].category_id) : "all";
  });
  const [selectedChannel, setSelectedChannel] = useState<LiveStream | null>(
    null,
  );
  const [hoveredChannel, setHoveredChannel] = useState<LiveStream | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const playerRef = useRef<HTMLVideoElement>(null);
  const [epgData, setEpgData] = useState<EpgProgram[]>([]);
  const [isEpgLoading, setIsEpgLoading] = useState(false);
  const [guideNow, setGuideNow] = useState(() => Date.now());
  const [showPinModal, setShowPinModal] = useState(false);
  const pinModalRef = useRef<HTMLDivElement | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pendingLockedCategoryId, setPendingLockedCategoryId] = useState<
    string | null
  >(null);
  const epgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNonFavoriteCategoryRef = useRef(activeCategory);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const liveRetryStateRef = useRef<{
    playlistKey: string | null;
    attempts: number;
  }>({ playlistKey: null, attempts: 0 });

  useEffect(() => {
    const playlistKey = activePlaylist?.id || null;
    const hasAnyLiveData =
      (playlistData.liveStreams?.length || 0) > 0 ||
      (playlistData.liveCategories?.length || 0) > 0;

    if (!isConnected || !playlistKey || isFetchingLive) {
      if (!playlistKey) {
        liveRetryStateRef.current = { playlistKey: null, attempts: 0 };
      }
      return;
    }

    if (liveRetryStateRef.current.playlistKey !== playlistKey) {
      liveRetryStateRef.current = { playlistKey, attempts: 0 };
    }

    if ((playlistData.liveStreams?.length || 0) > 0) {
      liveRetryStateRef.current = { playlistKey, attempts: 0 };
      return;
    }

    if (liveRetryStateRef.current.attempts >= 3) {
      return;
    }

    // Recover from partial prefetch states where categories loaded but live streams did not.
    // Also covers first-open cases where live data has not been requested yet.
    liveRetryStateRef.current = {
      playlistKey,
      attempts: liveRetryStateRef.current.attempts + 1,
    };

    fetchLive().catch((error) => {
      console.error("Live channel retry failed:", error);
      if (hasAnyLiveData) {
        toast.error("Live channels could not be refreshed.");
      }
    });
  }, [
    activePlaylist?.id,
    fetchLive,
    isConnected,
    isFetchingLive,
    playlistData.liveCategories?.length,
    playlistData.liveStreams?.length,
  ]);

  useEffect(() => {
    if (epgTimerRef.current) clearTimeout(epgTimerRef.current);
    epgTimerRef.current = setTimeout(async () => {
      if (
        !selectedChannel ||
        !activePlaylist?.host ||
        !activePlaylist?.username ||
        !activePlaylist?.password
      ) {
        setEpgData([]);
        return;
      }
      setIsEpgLoading(true);
      try {
        const response = await IPTVService.getShortEpg(
          activePlaylist.host,
          activePlaylist.username,
          activePlaylist.password,
          selectedChannel.stream_id,
          selectedChannel.epg_channel_id,
          selectedChannel.name,
        );
        const listings = Array.isArray(response?.epg_listings)
          ? [...response.epg_listings].sort(
              (a, b) =>
                new Date(a.start).getTime() - new Date(b.start).getTime(),
            )
          : [];
        setEpgData(listings);
      } catch {
        // EPG is best-effort â€” many channels simply don't have it; swallow silently
        setEpgData([]);
      } finally {
        setIsEpgLoading(false);
      }
    }, 400);
    return () => {
      if (epgTimerRef.current) clearTimeout(epgTimerRef.current);
    };
  }, [selectedChannel, activePlaylist]);

  useEffect(() => {
    const timer = setInterval(() => setGuideNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const decodeGuideText = (str?: string) => {
    if (!str) return "";
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch {
      return str;
    }
  };

  const currentProgram = useMemo(
    () =>
      epgData.find((program) => {
        const startMs = new Date(program.start).getTime();
        const endMs = new Date(program.end).getTime();
        return guideNow >= startMs && guideNow < endMs;
      }) ?? null,
    [epgData, guideNow],
  );

  const upcomingPrograms = useMemo(
    () =>
      epgData
        .filter((program) => new Date(program.start).getTime() > guideNow)
        .slice(0, 3),
    [epgData, guideNow],
  );

  const categories = useMemo(() => {
    const cats = playlistData.liveCategories || [];
    if (isParentalUnlocked) return cats;

    const hidden = new Set(
      (settings.hiddenCategories.live || []).map((id) =>
        normalizeCategoryId(id),
      ),
    );
    const visible = cats.filter(
      (cat) => !hidden.has(normalizeCategoryId(cat.category_id)),
    );

    // If all categories were effectively hidden (or ids mismatched), avoid rendering an empty Live UI.
    return visible.length > 0 ? visible : cats;
  }, [
    playlistData.liveCategories,
    settings.hiddenCategories.live,
    isParentalUnlocked,
  ]);

  const streams = useMemo(() => {
    const allStreams = playlistData.liveStreams || [];
    if (isParentalUnlocked) return allStreams;

    const hidden = new Set(
      (settings.hiddenCategories.live || []).map((id) =>
        normalizeCategoryId(id),
      ),
    );
    const visible = allStreams.filter(
      (stream) => !hidden.has(normalizeCategoryId(stream.category_id)),
    );

    // Prevent accidental full hide from leaving channels list empty.
    return visible.length > 0 ? visible : allStreams;
  }, [
    playlistData.liveStreams,
    settings.hiddenCategories.live,
    isParentalUnlocked,
  ]);

  useEffect(() => {
    const normalizedActive = normalizeCategoryId(activeCategory);
    if (normalizedActive === "all" || normalizedActive === "fav") return;

    const stillExists = categories.some(
      (category) =>
        normalizeCategoryId(category.category_id) === normalizedActive,
    );

    if (!stillExists) {
      setActiveCategory("all");
      setFocusIndex(0);
      setHoveredChannel(null);
    }
  }, [activeCategory, categories]);

  const listableChannels = useMemo(
    () => streams.filter(isListableLiveChannel),
    [streams],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (let index = 0; index < listableChannels.length; index += 1) {
      const categoryId = normalizeCategoryId(listableChannels[index].category_id);
      if (!categoryId) continue;
      counts[categoryId] = (counts[categoryId] || 0) + 1;
    }
    return counts;
  }, [listableChannels]);

  const filteredChannels = useMemo(() => {
    if (!Array.isArray(listableChannels)) return [];
    let filtered = listableChannels.filter((channel) => {
      const matchesSearch = channel.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        activeCategory === "all" ||
        normalizeCategoryId(channel.category_id) ===
          normalizeCategoryId(activeCategory);
      const matchesFav =
        activeCategory === "fav"
          ? favorites.live.includes(channel.stream_id)
          : true;
      return matchesSearch && matchesCategory && matchesFav;
    });

    // Apply sorting
    switch (settings.liveSort) {
      case "az":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "za":
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "added":
        filtered.sort((a, b) => (b.stream_id || 0) - (a.stream_id || 0));
        break;
      default:
        // Default order
        break;
    }

    return filtered;
  }, [
    listableChannels,
    searchQuery,
    activeCategory,
    favorites.live,
    settings.liveSort,
  ]);

  // Defer rendering of the channel list for UI responsiveness
  const deferredChannels = useDeferredValue(filteredChannels);

  // When categories load and we're still on "all", switch to first real category
  useEffect(() => {
    if (activeCategory === "all" && categories.length > 0) {
      setActiveCategory(normalizeCategoryId(categories[0].category_id));
    }
  }, [categories]);

  // Clear selected channel when category changes (don't auto-select)
  useEffect(() => {
    setSelectedChannel(null);
  }, [activeCategory]);

  const [displayLimit, setDisplayLimit] = useState(CHANNEL_BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const shouldFocusListAfterCategorySelectRef = useRef(false);

  // Reset display limit when category or search changes
  useEffect(() => {
    setDisplayLimit(CHANNEL_BATCH_SIZE);
    setFocusIndex(0);
    setHoveredChannel(null);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [activeCategory, searchQuery]);

  const displayedChannels = useMemo(
    () => deferredChannels.slice(0, displayLimit),
    [deferredChannels, displayLimit],
  );

  const loadMoreChannels = useCallback(() => {
    setDisplayLimit((previous) =>
      Math.min(previous + CHANNEL_BATCH_SIZE, deferredChannels.length),
    );
  }, [deferredChannels.length]);

  const handleChannelListScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (remaining <= 240 && displayLimit < deferredChannels.length) {
        loadMoreChannels();
      }
    },
    [deferredChannels.length, displayLimit, loadMoreChannels],
  );

  // IntersectionObserver to load more when sentinel comes into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayLimit < deferredChannels.length) {
          loadMoreChannels();
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayLimit, deferredChannels.length, loadMoreChannels]);
  // TV navigation state
  const [focusIndex, setFocusIndex] = useState(0);
  // Which panel owns D-pad focus: sidebar categories or channel list
  const [sidebarTVFocus, setSidebarTVFocus] = useState(false);
  // Color button action feedback
  const [colorAction, setColorAction] = useState<string>("");

  const focusChannelListAt = useCallback(
    (targetIndex = 0) => {
      const total = displayedChannels.length;
      if (total <= 0) return false;

      const nextIndex = Math.max(0, Math.min(targetIndex, total - 1));
      setSidebarTVFocus(false);
      setFocusIndex(nextIndex);
      setHoveredChannel(displayedChannels[nextIndex]);

      requestAnimationFrame(() => {
        const root = scrollContainerRef.current;
        if (!root) return;
        const rows = root.querySelectorAll<HTMLButtonElement>("button[data-tv-focusable]");
        const row = rows[nextIndex] || rows[0];
        row?.focus();
        row?.scrollIntoView({ block: "nearest", behavior: "auto" });
      });

      return true;
    },
    [displayedChannels],
  );

  useEffect(() => {
    if (!shouldFocusListAfterCategorySelectRef.current) return;
    if (!displayedChannels.length) return;
    shouldFocusListAfterCategorySelectRef.current = false;
    focusChannelListAt(0);
  }, [displayedChannels, focusChannelListAt]);

  const showColorAction = useCallback((message: string) => {
    setColorAction(message);
    if (colorActionTimerRef.current) clearTimeout(colorActionTimerRef.current);
    colorActionTimerRef.current = setTimeout(() => {
      setColorAction("");
      colorActionTimerRef.current = null;
    }, 1400);
  }, []);

  const cycleLiveSort = useCallback(() => {
    const nextSort =
      settings.liveSort === "default"
        ? "az"
        : settings.liveSort === "az"
          ? "za"
          : settings.liveSort === "za"
            ? "added"
            : "default";
    updateSettings({ liveSort: nextSort });

    const sortLabel =
      nextSort === "default"
        ? "Default order"
        : nextSort === "az"
          ? "Sort: A-Z"
          : nextSort === "za"
            ? "Sort: Z-A"
            : "Sort: Recently added";
    showColorAction(sortLabel);
  }, [settings.liveSort, showColorAction, updateSettings]);

  const toggleFavoriteFilter = useCallback(() => {
    if (activeCategory === "fav") {
      const fallbackCategory =
        lastNonFavoriteCategoryRef.current &&
        (lastNonFavoriteCategoryRef.current === "all" ||
          categories.some(
            (category) =>
              category.category_id === lastNonFavoriteCategoryRef.current,
          ))
          ? lastNonFavoriteCategoryRef.current
          : categories[0]?.category_id || "all";
      setActiveCategory(fallbackCategory);
      showColorAction("Favorites filter off");
      return;
    }

    if (activeCategory !== "all") {
      lastNonFavoriteCategoryRef.current = activeCategory;
    }
    setActiveCategory("fav");
    showColorAction("Favorites filter on");
  }, [activeCategory, categories, showColorAction]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    showColorAction(searchQuery ? "Search focused" : "Search ready");
  }, [searchQuery, showColorAction]);

  const focusFirstPreviewControl = useCallback(() => {
    const root = previewPanelRef.current;
    if (!root) return false;
    const first = root.querySelector<HTMLElement>(
      "[data-tv-focusable], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    );
    if (!first) return false;
    first.focus();
    return true;
  }, []);

  useEffect(() => {
    // TV remote navigation
    const onTVKey = (e: Event) => {
      const key = (e as CustomEvent).detail?.key;
      const active = document.activeElement as HTMLElement | null;
      const inPreviewPanel = !!(
        previewPanelRef.current &&
        active &&
        previewPanelRef.current.contains(active)
      );

      if (showPinModal) {
        return;
      }

      // When focus is in the right preview panel, navigate controls spatially.
      if (inPreviewPanel) {
        if (key === "enter" || key === "select") {
          active?.click();
          return;
        }
        if (key === "up" || key === "down" || key === "right") {
          focusNext(key, { root: previewPanelRef.current });
          return;
        }
        if (key === "left") {
          const before = document.activeElement as HTMLElement | null;
          focusNext("left", { root: previewPanelRef.current });
          // If there is no more control to the left in preview panel,
          // hand control back to the channel list navigation.
          if (document.activeElement === before) {
            before?.blur();
          }
          return;
        }
        if (key === "back") {
          active?.blur();
          return;
        }
      }

      // Header zone: left/right navigate within navbar; down escapes to channel list
      if (handleHeaderZoneKey(key, { onBack: () => navigate('/') })) return;

      // While sidebar owns focus, channel-list navigation must remain frozen.
      if (sidebarTVFocus) {
        if (key === "back") {
          setSidebarTVFocus(false);
          return;
        }
        return;
      }

      if (key === "green") {
        focusSearch();
        return;
      }
      if (key === "yellow") {
        toggleFavoriteFilter();
        return;
      }
      if (key === "blue") {
        cycleLiveSort();
        return;
      }
      if (key === "back") {
        if (selectedChannel) {
          setSelectedChannel(null);
        } else {
          navigate("/");
        }
        return;
      }

      if (!displayedChannels.length) return;

      if (key === "up") {
        if (focusIndex === 0) {
          // Escape channel list upward to the header navbar
          focusHeader();
          return;
        }
        setFocusIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          setHoveredChannel(displayedChannels[next]);
          return next;
        });
      } else if (key === "down") {
        setFocusIndex((prev) => {
          let next = prev + 1;
          if (next >= displayedChannels.length)
            next = displayedChannels.length - 1;
          // Load more if navigating near the end
          if (next >= displayLimit - 5 && displayLimit < deferredChannels.length) {
            loadMoreChannels();
          }
          setHoveredChannel(displayedChannels[next]);
          return next;
        });
      } else if (key === "left") {
        setSidebarTVFocus(true);
      } else if (key === "right") {
        focusFirstPreviewControl();
      } else if (key === "enter" || key === "select") {
        setSelectedChannel(displayedChannels[focusIndex]);
      } else if (key === "red") {
        const ch = displayedChannels[focusIndex];
        if (ch) {
          toggleFavorite("live", ch.stream_id);
          showColorAction(
            favorites.live.includes(ch.stream_id)
              ? "Removed from Favorites"
              : "Added to Favorites",
          );
        }
      }
    };
    window.addEventListener("tv-remote-key", onTVKey);
    return () => {
      window.removeEventListener("tv-remote-key", onTVKey);
    };
  }, [
    cycleLiveSort,
    displayedChannels,
    deferredChannels.length,
    displayLimit,
    favorites.live,
    focusIndex,
    focusSearch,
    focusFirstPreviewControl,
    navigate,
    selectedChannel,
    showPinModal,
    sidebarTVFocus,
    showColorAction,
    toggleFavoriteFilter,
  ]);

  useEffect(() => {
    if (activeCategory !== "fav") {
      lastNonFavoriteCategoryRef.current = normalizeCategoryId(activeCategory);
    }
  }, [activeCategory]);

    // Scroll focused channel into view when d-pad navigation changes the index
    useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const row = container.children[focusIndex] as HTMLElement | undefined;
      row?.scrollIntoView({ block: "nearest", behavior: "auto" });
    }, [focusIndex]);

  useEffect(() => {
    return () => {
      if (colorActionTimerRef.current) clearTimeout(colorActionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showPinModal) return;
    setSidebarTVFocus(false);
    const first = pinModalRef.current?.querySelector<HTMLElement>(
      "[data-tv-focusable], button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])",
    );
    setTimeout(() => first?.focus(), 20);
  }, [showPinModal]);

  useTVRemote((key, event) => {
    if (!showPinModal || !pinModalRef.current) return;
    event?.stopImmediatePropagation();

    if (key === "back") {
      setShowPinModal(false);
      return;
    }

    if (key === "left" || key === "right" || key === "up" || key === "down") {
      focusNext(key, { root: pinModalRef.current });
      return;
    }

    if (key === "enter" || key === "select") {
      const active = document.activeElement as HTMLElement | null;
      if (active && pinModalRef.current.contains(active)) {
        active.click();
      }
    }
  });

  const buildLiveChannelUrls = useCallback(
    (channel: LiveStream | null) => {
      if (
        !channel ||
        !activePlaylist?.host ||
        !activePlaylist?.username ||
        !activePlaylist?.password
      ) {
        return [] as string[];
      }

      const preferredExt =
        settings.streamFormat === "ts"
          ? "ts"
          : settings.streamFormat === "mp4"
            ? "mp4"
            : "m3u8";

      // Based on webOS AV specs, keep live playback in this extension set and
      // use deterministic fallback order per platform.
      const platform = getPlatformName();
      const baseOrder =
        platform === "webos"
          ? ["ts", "m3u8", "mp4"]
          : ["m3u8", "ts", "mp4"];
      const orderedExts = Array.from(
        new Set([preferredExt, ...baseOrder].filter(Boolean)),
      );

      return orderedExts.map(
        (ext) =>
          `${activePlaylist.host}/live/${activePlaylist.username}/${activePlaylist.password}/${channel.stream_id}.${ext}`,
      );
    },
    [activePlaylist, settings.streamFormat],
  );

  const sidebarItems = useMemo(() => {
    if (!Array.isArray(listableChannels))
      return [
        { id: "all", name: t.allChannels, count: 0 },
        { id: "fav", name: t.favorites, count: favorites.live.length },
      ];

    return [
      { id: "all", name: t.allChannels, count: listableChannels.length },
      { id: "fav", name: t.favorites, count: favorites.live.length },
      ...(categories || []).map((cat) => ({
        id: normalizeCategoryId(cat.category_id),
        name: cat.category_name,
        count: categoryCounts[normalizeCategoryId(cat.category_id)] || 0,
        locked:
          (settings.parentalLockedCategories?.live || []).includes(
            normalizeCategoryId(cat.category_id),
          ) && !isParentalUnlocked,
      })),
    ];
  }, [
    listableChannels,
    t.allChannels,
    t.favorites,
    favorites.live.length,
    categories,
    categoryCounts,
    settings.parentalLockedCategories?.live,
    isParentalUnlocked,
  ]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockParental(pinInput)) {
      toast.success("Parental content unlocked");
      setShowPinModal(false);
      if (pendingLockedCategoryId) {
        setActiveCategory(pendingLockedCategoryId);
        setPendingLockedCategoryId(null);
      }
      setPinInput("");
    } else {
      toast.error("Incorrect PIN");
      setPinInput("");
    }
  };

  const handleCategorySelect = (catId: string) => {
    const normalizedCategoryId = normalizeCategoryId(catId);
    const locked = settings.parentalLockedCategories?.live || [];
    if (
      locked.includes(normalizedCategoryId) &&
      !isParentalUnlocked &&
      settings.parentalPin
    ) {
      setPendingLockedCategoryId(normalizedCategoryId);
      setShowPinModal(true);
    } else {
      shouldFocusListAfterCategorySelectRef.current = true;
      setSidebarTVFocus(false);
      setActiveCategory(normalizedCategoryId);
    }
  };

  return (
    <div className="tv-browser-shell flex flex-col h-screen relative">
      {/* TV Color Buttons Bar */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2 pointer-events-none select-none">
        <div className="tv-key-hints flex flex-wrap justify-end gap-2 rounded-2xl px-3 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-red-600" />
            <span className="text-xs text-white/80 font-bold">
              Favorite
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-green-600" />
            <span className="text-xs text-white/80 font-bold">Search</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-yellow-400" />
            <span className="text-xs text-white/80 font-bold">Favorites</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-blue-600" />
            <span className="text-xs text-white/80 font-bold">Sort</span>
          </div>
        </div>
        {colorAction && (
          <div className="mt-2 px-3 py-1 rounded bg-black/80 text-white/90 text-xs font-bold shadow-lg animate-pulse">
            {colorAction}
          </div>
        )}
      </div>
      {/* PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowPinModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              ref={pinModalRef}
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center gap-6">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                  <Lock className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold">Parental Control</h3>
                  <p className="text-white/40 mt-1">
                    Enter your 4-digit PIN to unlock restricted categories.
                  </p>
                </div>
                <form
                  onSubmit={handlePinSubmit}
                  className="w-full flex flex-col gap-4"
                >
                  <input
                    type="password"
                    maxLength={4}
                    autoFocus
                    value={pinInput}
                    onChange={(e) =>
                      setPinInput(e.target.value.replace(/\D/g, ""))
                    }
                    className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-3xl tracking-[1em] text-center w-full focus:outline-none focus:bg-gradient-to-br focus:from-primary/10 focus:to-transparent focus:border-primary/40 focus:shadow-[0_0_20px_rgba(66,133,244,0.25)] transition-all"
                    placeholder="â€¢â€¢â€¢â€¢"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPinModal(false)}
                      className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-6 py-4 bg-primary hover:bg-primary/90 rounded-2xl font-bold transition-colors"
                    >
                      Unlock
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header data-tv-zone="header" className="tv-browser-header flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="tv-header-back-btn rounded-full p-2"
              title="Back to Home"
              aria-label="Back to Home"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <WeatherWidget />
            <nav className="tv-nav-tabs flex items-center gap-1">
              <button
                onClick={() => navigate("/")}
                className="tv-nav-tab"
              >
                {t.home}
              </button>
              <button className="tv-nav-tab tv-nav-tab--active">
                {t.live}
              </button>
              <button
                onClick={() => navigate("/movies")}
                className="tv-nav-tab"
              >
                {t.movies}
              </button>
              <button
                onClick={() => navigate("/series")}
                className="tv-nav-tab"
              >
                {t.series}
              </button>
              <button
                onClick={() => navigate("/radio")}
                className="tv-nav-tab"
              >
                {t.radio}
              </button>
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {settings.parentalPin && (
            <button
              onClick={() =>
                isParentalUnlocked ? lockParental() : setShowPinModal(true)
              }
              className={cn(
                "tv-header-icon-btn rounded-full p-2 transition-all",
                isParentalUnlocked
                  ? "bg-primary text-white"
                  : "bg-white/5 text-white/40 hover:bg-white/10",
              )}
              title={
                isParentalUnlocked
                  ? "Lock Parental Content"
                  : "Unlock Parental Content"
              }
            >
              {isParentalUnlocked ? (
                <Unlock className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </button>
          )}
          <div className="tv-search-shell w-[320px] md:w-[360px]">
            <Search className="tv-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t.search}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="tv-search-input"
            />
          </div>
          <DigitalClock />
          <Logo size="sm" />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar
          items={sidebarItems}
          activeId={activeCategory}
          onSelect={handleCategorySelect}
          hasTVFocus={sidebarTVFocus && !showPinModal}
          onTVFocusRelease={() => {
            focusChannelListAt(focusIndex);
          }}
          onTVFocusEscapeUp={() => {
            setSidebarTVFocus(false);
            focusHeader();
          }}
        />

        {/* Channel List */}
        <div
          ref={containerRef}
          className="tv-browser-content flex-1 flex flex-col overflow-hidden border-r border-white/10"
        >
          <div className="tv-nav-strip mx-3 mt-3 mb-2 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Category</span>
              <span className="tv-browser-stat px-3 py-1 text-sm font-semibold text-white/90">
                {sidebarItems.find((item) => item.id === activeCategory)?.name || t.allChannels}
              </span>
              <span className="tv-browser-stat px-3 py-1 text-sm font-semibold text-white/80">
                {deferredChannels.length} channels
              </span>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
                sidebarTVFocus ? "bg-emerald-500/20 text-emerald-200" : "bg-cyan-500/20 text-cyan-100",
              )}
            >
              {sidebarTVFocus ? "Categories Focus" : "Channel List Focus"}
            </span>
          </div>
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
              <div className="p-6 bg-white/5 rounded-full">
                <Play className="w-12 h-12 text-white/20" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-bold">No Playlist Connected</h3>
                <p className="text-white/40 max-w-xs">{t.noPlaylistLiveMsg}</p>
              </div>
              <button
                onClick={() => navigate("/playlist-setup")}
                className="bg-primary px-8 py-3 rounded-xl font-bold hover:bg-primary-hover transition-colors"
              >
                {t.addPlaylistBtn}
              </button>
            </div>
          ) : deferredChannels.length > 0 ? (
            <div
              ref={scrollContainerRef}
              onScroll={handleChannelListScroll}
              className="flex-1 overflow-y-auto scrollbar-hide min-h-0 px-2 pb-3"
            >
              {displayedChannels.map((channel, index) => (
                <ChannelRow
                  key={channel.stream_id}
                  channel={channel}
                  isSelected={selectedChannel?.stream_id === channel.stream_id}
                  isTVFocused={index === focusIndex}
                  isFavorite={favorites.live.includes(channel.stream_id)}
                  onSelect={setSelectedChannel}
                  onHover={setHoveredChannel}
                />
              ))}
              {displayLimit < deferredChannels.length && (
                <div ref={sentinelRef} className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                  <span className="ml-2 text-xs text-white/40">
                    {displayedChannels.length} / {deferredChannels.length}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-white/40">
              {t.noChannelsFound}
            </div>
          )}
        </div>

        {/* Preview Player */}
        <div ref={previewPanelRef} className="tv-browser-content w-[40%] flex flex-col bg-black/25">
          {isConnected ? (
            <>
              <div className="aspect-video w-full bg-black relative">
                {selectedChannel ? (
                  <MiniPlayer
                    key={selectedChannel.stream_id}
                    videoRef={playerRef}
                    urls={buildLiveChannelUrls(selectedChannel)}
                    poster={toProxyAssetUrl(selectedChannel.stream_icon)}
                    title={selectedChannel.name}
                    onNext={() => {
                      const currentIndex = filteredChannels.findIndex(
                        (c) => c.stream_id === selectedChannel.stream_id,
                      );
                      if (currentIndex < filteredChannels.length - 1) {
                        setSelectedChannel(filteredChannels[currentIndex + 1]);
                      }
                    }}
                    onPrev={() => {
                      const currentIndex = filteredChannels.findIndex(
                        (c) => c.stream_id === selectedChannel.stream_id,
                      );
                      if (currentIndex > 0) {
                        setSelectedChannel(filteredChannels[currentIndex - 1]);
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-white/[0.03] to-transparent gap-4">
                    <div className="p-5 bg-white/5 rounded-full border border-white/10">
                      <Tv className="w-12 h-12 text-white/20" />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-white/50 font-semibold text-sm">
                        Select a Channel
                      </span>
                      <span className="text-white/25 text-xs">
                        Browse the list and click a channel to start watching
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 flex flex-col gap-6 overflow-y-auto scrollbar-hide flex-1">
                {selectedChannel ? (
                  <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-bold">
                      {selectedChannel?.name}
                    </h2>
                    <div className="flex items-center gap-2 text-white/40 text-sm">
                      <Tv className="w-4 h-4" />
                      <span>Channel {selectedChannel?.num}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                    <span className="text-white/30 text-sm">
                      No channel selected
                    </span>
                    <span className="text-white/15 text-xs">
                      Pick a channel from the list to see details and EPG
                    </span>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      if (playerRef.current) {
                        if (playerRef.current.requestFullscreen) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
                          playerRef.current.requestFullscreen();
                        } else if (
                          (playerRef.current as any).webkitRequestFullscreen
                        ) {
                          (playerRef.current as any).webkitRequestFullscreen();
                        }
                      }
                    }}
                    className="flex-1 bg-primary hover:bg-primary-hover py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Maximize2 className="w-5 h-5" />
                    {t.watchFullScreen}
                  </button>
                  <button
                    onClick={() =>
                      selectedChannel &&
                      toggleFavorite("live", selectedChannel.stream_id)
                    }
                    className={cn(
                      "flex-1 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2",
                      selectedChannel &&
                        favorites.live.includes(selectedChannel.stream_id)
                        ? "bg-white/20"
                        : "bg-white/10 hover:bg-white/20",
                    )}
                  >
                    <Star
                      className={cn(
                        "w-5 h-5",
                        selectedChannel &&
                          favorites.live.includes(selectedChannel.stream_id) &&
                          "fill-primary text-primary",
                      )}
                    />
                    {selectedChannel &&
                    favorites.live.includes(selectedChannel.stream_id)
                      ? t.favorited
                      : t.addToFavorite}
                  </button>
                </div>

                {selectedChannel &&
                  (currentProgram || upcomingPrograms.length > 0) && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80 mb-2">
                          Live Now
                        </div>
                        {currentProgram ? (
                          <>
                            <div className="text-lg font-bold text-white">
                              {decodeGuideText(currentProgram.title)}
                            </div>
                            <div className="text-sm text-white/60 mt-1">
                              {new Date(
                                currentProgram.start,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: settings.timeFormat === "12h",
                              })}
                              {" â€” "}
                              {new Date(currentProgram.end).toLocaleTimeString(
                                [],
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: settings.timeFormat === "12h",
                                },
                              )}
                            </div>
                            {currentProgram.description && (
                              <p className="text-sm text-white/70 mt-2 line-clamp-3">
                                {decodeGuideText(currentProgram.description)}
                              </p>
                            )}
                          </>
                        ) : (
                          <div className="text-sm text-white/50">
                            No current program metadata available.
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50 mb-2">
                          Coming Up
                        </div>
                        {upcomingPrograms.length > 0 ? (
                          <div className="space-y-3">
                            {upcomingPrograms.map((program, idx) => (
                              <div
                                key={`${program.epg_id}-${idx}`}
                                className="flex items-start justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-white truncate">
                                    {decodeGuideText(program.title)}
                                  </div>
                                  {program.description && (
                                    <div className="text-xs text-white/45 line-clamp-2 mt-0.5">
                                      {decodeGuideText(program.description)}
                                    </div>
                                  )}
                                </div>
                                <div className="shrink-0 text-xs font-mono text-white/50">
                                  {new Date(program.start).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: settings.timeFormat === "12h",
                                    },
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-white/50">
                            No upcoming program metadata available.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                {/* EPG Section */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" />
                      {t.programGuide}
                    </h3>
                    {isEpgLoading && (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    )}
                  </div>

                  <div className="bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                    {epgData.length > 0 ? (
                      <div className="flex flex-col max-h-[400px] overflow-y-auto p-3 gap-1">
                        {epgData.map((program, idx) => (
                          <EpgItem
                            key={idx}
                            program={program}
                            timeFormat={settings.timeFormat}
                          />
                        ))}
                      </div>
                    ) : isEpgLoading ? (
                      <div className="py-8 text-center text-white/20">
                        {t.loadingGuide}
                      </div>
                    ) : (
                      <div className="py-8 px-4 text-center text-white/30 space-y-2">
                        <div>{t.noGuideInfo}</div>
                        <div className="text-xs text-white/20">
                          Provider is not returning guide data for this channel
                          right now.
                        </div>
                        {selectedChannel?.epg_channel_id && (
                          <div className="text-[11px] text-white/20 font-mono">
                            EPG ID: {selectedChannel.epg_channel_id}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-center text-white/20">
              Select a channel to preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
