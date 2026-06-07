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
import { useTvLazyImage } from "../lib/imageOptimization";
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
import { trySwitchPlatformAudioTrack, trySwitchPlatformSubtitleTrack, getPlatformName, startPlatformPlayback, webosRegisterTrack, webosUnregisterTrack, webosGetTracks, normalizePlatformTracks, webosReadNativeTracks, readShakaTracks, trySelectShakaAudioTrack, trySelectShakaSubtitleTrack, destroyShakaPlayer } from "../lib/platformPlayer";
import { getMediaApiBaseUrl } from "../lib/activationApi";
import { focusNext, useTVRemote, handleHeaderZoneKey, focusHeader } from "../lib/remote";
import { xtreamLiveUrl } from "../lib/xtreamUrls";
import { wrapPlaybackUrlsForPlatform } from "../lib/streamPlaybackUrl";
import {
  resolveFavoriteLiveStreams,
  readLiveFavSnapshots,
  saveLiveFavSnapshot,
  removeLiveFavSnapshot,
} from "../lib/liveFavoriteSnapshots";
import { getThumbnailUrl } from "../lib/imageOptimization";

/** Which Live TV panel owns D-pad navigation. */
type LiveNavZone = "sidebar" | "channels" | "preview";
const MAX_SEEN_LIVE_CHANNELS = 500;

const EpgItem = ({
  program,
  timeFormat,
}: {
  program: EpgProgram;
  timeFormat: "12h" | "24h";
}) => {
  const t = useT();
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
    <button
      type="button"
      data-tv-focusable
      className={cn(
        "tv-channel-row tv-epg-guide-row flex items-center gap-3 w-full min-h-[82px] px-4 text-left transition-all mx-2 my-1 overflow-hidden",
        "hover:bg-white/6",
        isNowPlaying && "tv-channel-row--selected",
        !isNowPlaying && !isUpcoming && "opacity-55",
      )}
    >
      <div className="w-[72px] shrink-0 flex flex-col text-xs font-mono">
        <span className={cn("font-bold", isNowPlaying ? "text-primary" : "text-white/50")}>
          {startTime}
        </span>
        <span className="text-white/35">{endTime}</span>
        {durationMin > 0 && (
          <span className="text-white/25 text-[10px] mt-0.5">{durationMin}m</span>
        )}
      </div>
      <div className="flex-1 min-w-0 py-1">
        <span
          className={cn(
            "block text-lg font-medium truncate",
            isNowPlaying ? "text-white" : "text-white/80",
          )}
        >
          {safeDecode(program.title)}
        </span>
        <span className="block text-[11px] text-white/35 uppercase tracking-wide">
          {isNowPlaying ? t.nowPlaying : isUpcoming ? t.upNext : t.program}
        </span>
        {program.description && (
          <p className="tv-epg-description tv-epg-description--one text-sm text-white/40 mt-0.5">
            {safeDecode(program.description)}
          </p>
        )}
        {isNowPlaying && (
          <div className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      {isNowPlaying && (
        <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded text-[10px] text-primary font-bold uppercase shrink-0">
          <Play className="w-3 h-3 fill-primary" />
          Now
        </div>
      )}
    </button>
  );
};

const MiniPlayer = ({
  urls,
  poster,
  title,
  onNext,
  onPrev,
  startupPreferenceKey,
  videoRef: externalVideoRef,
}: {
  urls: string[];
  poster: string;
  title: string;
  onNext?: () => void;
  onPrev?: () => void;
  startupPreferenceKey?: string;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) => {
  const { settings } = usePlaylist();
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
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
  const activeUrlRef = useRef<string>("");

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
  const mountedRef = useRef(true);
  const platform = getPlatformName();
  const isNativeTvPlayer = platform === "webos" || platform === "tizen";

  const forceStopCurrentPlayback = useCallback(() => {
    if (startupTimerRef.current) {
      clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {}
      try {
        video.removeAttribute("src");
        video.load();
        video.preload = "none"; // Prevent preloading to reduce memory usage
      } catch {}
    }
  }, [videoRef]);

  const streamCandidates = useMemo(
    () => wrapPlaybackUrlsForPlatform(Array.isArray(urls) ? urls : []),
    [urls],
  );
  const streamCandidatesKey = useMemo(
    () => streamCandidates.join("|"),
    [streamCandidates],
  );

  useEffect(() => {
    setStreamAttemptIndex(0);
  }, [streamCandidatesKey]);

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      forceStopCurrentPlayback();
    };
  }, [forceStopCurrentPlayback]);

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

  // ========== SIMPLE WEBOS PLAYBACK ENGINE ==========
  useEffect(() => {
    const activeUrl = streamCandidates[streamAttemptIndex] || "";
    if (!activeUrl || !videoRef.current || !mountedRef.current) return;

    const video = videoRef.current;
    const isM3U8 = activeUrl.toLowerCase().includes(".m3u8");

    // Store current URL for cleanup check
    activeUrlRef.current = activeUrl;

    // Reset state
    setIsLoading(true);
    setIsBuffering(false);
    setIsPlaying(true);

    // Clean up previous playback
    forceStopCurrentPlayback();

    // Timeout for startup
    startupTimerRef.current = setTimeout(() => {
      if (mountedRef.current && activeUrlRef.current === activeUrl) {
        setIsLoading(false);
        setIsBuffering(false);
      }
    }, isNativeTvPlayer ? 5000 : 10000);

    const refreshNativeTracks = () => {
      if (!isNativeTvPlayer || !video) return;
      const { audios, subtitles } = webosReadNativeTracks(video);
      if (audios.length > 0) {
        setAudioTracks(audios);
        const nativeList = (video as HTMLVideoElement & { audioTracks?: { enabled: boolean }[] }).audioTracks;
        let active = 0;
        if (nativeList?.length) {
          for (let i = 0; i < nativeList.length; i++) {
            if (nativeList[i]?.enabled) {
              active = i;
              break;
            }
          }
        }
        setCurrentAudioTrack(active);
      }
      if (subtitles.length > 0) {
        setSubtitleTracks(subtitles);
      }
    };

    const onCanPlay = () => {
      if (!mountedRef.current || activeUrlRef.current !== activeUrl) return;
      setIsLoading(false);
      setIsBuffering(false);
      refreshNativeTracks();
    };
    const onPlaying = () => {
      if (!mountedRef.current || activeUrlRef.current !== activeUrl) return;
      setIsLoading(false);
      setIsBuffering(false);
    };
    const onError = () => {
      if (!mountedRef.current || activeUrlRef.current !== activeUrl) return;
      console.error("Video error:", video.error);
      setIsLoading(false);
      setIsBuffering(false);
      setIsPlaying(false);
      // Try next extension/URL candidate (m3u8 → ts → mp4) when panel blocks one format.
      if (streamAttemptIndex < streamCandidates.length - 1) {
        setStreamAttemptIndex((i) => i + 1);
        return;
      }
    };
    const onWaiting = () => {
      if (!mountedRef.current || activeUrlRef.current !== activeUrl) return;
      setIsBuffering(true);
    };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    video.addEventListener("waiting", onWaiting);

    // ===== Native TV: hardware decode (HLS .m3u8 or MPEG-TS .ts / .mp4) =====
    if (isNativeTvPlayer) {
      const startNativeTvPlayback = () => {
        try {
          video.pause();
          video.removeAttribute("src");
          while (video.firstChild) video.removeChild(video.firstChild);
          const source = document.createElement("source");
          source.src = activeUrl;
          const lower = activeUrl.toLowerCase();
          if (lower.includes(".m3u8")) {
            source.type = "application/vnd.apple.mpegurl";
          } else if (lower.includes(".ts")) {
            source.type = "video/mp2t";
          } else {
            source.type = "video/mp4";
          }
          video.appendChild(source);
          video.load();
        } catch {
      video.src = activeUrl;
      video.load();
        }
        const tryPlay = () => {
      video.play().catch((err) => {
        console.error("Native TV live play failed:", err);
            if (!mountedRef.current || activeUrlRef.current !== activeUrl) return;
          setIsLoading(false);
          setIsBuffering(false);
          setIsPlaying(false);
            if (streamAttemptIndex < streamCandidates.length - 1) {
              setStreamAttemptIndex((i) => i + 1);
        }
      });
        };
        tryPlay();
        video.addEventListener("loadedmetadata", tryPlay, { once: true });
      };
      startNativeTvPlayback();
      return () => {
        if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("error", onError);
        video.removeEventListener("waiting", onWaiting);
        try {
        video.pause();
        video.removeAttribute("src");
          while (video.firstChild) video.removeChild(video.firstChild);
        video.load();
        } catch {}
      };
    }

    // ===== DESKTOP: hls.js =====
    if (!isNativeTvPlayer && isM3U8 && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        enableSoftwareAES: false,
        lowLatencyMode: false,
        initialLiveManifestSize: 1,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        backBufferLength: 20,
        maxBufferSize: 12 * 1000 * 1000,
        capLevelToPlayerSize: true,
        autoStartLoad: true,
      });
      hlsRef.current = hls;
      hls.loadSource(activeUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!mountedRef.current || activeUrlRef.current !== activeUrl) return;
        setIsLoading(false);
        setAudioTracks(hls.audioTracks || []);
        setCurrentAudioTrack(hls.audioTrack);
        setSubtitleTracks(hls.subtitleTracks || []);
        setCurrentSubtitleTrack(hls.subtitleTrack);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
        if (!mountedRef.current || !data.fatal) return;
        hls.destroy();
        hlsRef.current = null;
        if (streamAttemptIndex < streamCandidates.length - 1) {
          setStreamAttemptIndex((i) => i + 1);
        }
      });
    } else if (!isNativeTvPlayer && video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = activeUrl;
      video.load();
      video.play().catch(() => {});
    } else {
      // Direct playback for other formats
      video.src = activeUrl;
      video.load();
      video.play().catch(() => {});
    }

    // Cleanup function
    return () => {
      if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      video.removeEventListener("waiting", onWaiting);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [
    streamAttemptIndex,
    streamCandidates.length,
    streamCandidatesKey,
    isNativeTvPlayer,
  ]);

  /** Switch live audio (native webOS/Tizen APIs or hls.js on desktop). */
  const switchLiveAudioTrack = (trackIndex: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (isNativeTvPlayer) {
      if (trySwitchPlatformAudioTrack(video, trackIndex)) {
        setCurrentAudioTrack(trackIndex);
        return;
      }
      const nativeAudio = (video as HTMLVideoElement & { audioTracks?: { enabled: boolean; label?: string }[] }).audioTracks;
      if (nativeAudio && typeof nativeAudio.length === "number") {
        for (let i = 0; i < nativeAudio.length; i++) {
          nativeAudio[i].enabled = i === trackIndex;
        }
        setCurrentAudioTrack(trackIndex);
      }
      return;
    }
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackIndex;
      setCurrentAudioTrack(trackIndex);
    }
  };

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
        "w-full h-full relative group overflow-hidden bg-black rounded-3xl border border-white/5 shadow-2xl",
        isLoading ? "cursor-wait" : "cursor-default",
      )}
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      <video
        ref={videoRef}
        className={cn(
          "w-full h-full transition-transform duration-700",
          aspectRatio === "contain" && "object-contain",
          aspectRatio === "cover" && "object-cover",
          aspectRatio === "fill" && "object-fill",
        )}
        poster={poster || undefined}
        autoPlay
        playsInline
        preload={isNativeTvPlayer ? "metadata" : "auto"}
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

      {/* Modern Loading State */}
      {(isLoading || isBuffering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] z-20">
          <div className="flex flex-col items-center gap-4">
             <Loader2 className="w-16 h-16 text-primary animate-spin" />
             <span className="text-xs font-black uppercase tracking-widest text-white/60">Optimizing Stream...</span>
          </div>
        </div>
      )}

      {/* Premium TV Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-between transition-all duration-500 z-10",
          showControls || !isPlaying
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none",
        )}
      >
        {/* Top Info Bar (Netflix Style) */}
        <div className="bg-linear-to-b from-black/80 via-black/20 to-transparent p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-md">
                    {title}
                  </h2>
                  <div className="flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-0.5 shadow-[0_0_15px_rgba(220,38,38,0.5)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] font-black uppercase text-white">Live</span>
                  </div>
                </div>
              </div>
            </div>
            
            {isFullscreen && (
              <div className="flex items-center gap-4">
                 <button data-tv-focusable onClick={toggleFullscreen} className="bg-white/10 hover:bg-white/20 p-3 rounded-2xl backdrop-blur-xl border border-white/5 text-white transition-all focus:scale-110">
                   <ArrowLeft className="w-6 h-6" />
                 </button>
                 <Logo size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* Center Navigation Arrows (Visible on Hover/Focus) */}
        {!isLocked && isFullscreen && (
          <div className="flex-1 flex items-center justify-between px-10">
             <button data-tv-focusable onClick={(e) => { e.stopPropagation(); onPrev?.(); }} className="p-6 bg-black/40 hover:bg-primary/80 rounded-full backdrop-blur-md border border-white/5 text-white transition-all focus:scale-125 focus:bg-primary">
               <ChevronLeft className="w-10 h-10" />
             </button>
             <button data-tv-focusable onClick={(e) => { e.stopPropagation(); onNext?.(); }} className="p-6 bg-black/40 hover:bg-primary/80 rounded-full backdrop-blur-md border border-white/5 text-white transition-all focus:scale-125 focus:bg-primary">
               <ChevronRight className="w-10 h-10" />
             </button>
          </div>
        )}

        {/* Bottom Control Bar */}
        <div className="bg-linear-to-t from-black/90 via-black/40 to-transparent p-6 pt-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
               <button data-tv-focusable onClick={togglePlay} className="bg-white text-black p-4 rounded-2xl transition-all focus:scale-110 focus:ring-4 focus:ring-white/40">
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
               </button>
               
               <button data-tv-focusable onClick={toggleMuteButton} className="bg-white/10 text-white p-4 rounded-2xl transition-all focus:bg-white/20 focus:scale-110">
                  {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
               </button>
            </div>

            <div className="flex items-center gap-3">
               {/* Horizontal Quick Actions */}
               <button data-tv-focusable onClick={() => handleMenuClick("aspect")} className={cn("flex items-center gap-2 px-5 py-3 rounded-2xl transition-all", activeMenu === "aspect" ? "bg-primary text-white" : "bg-white/10 text-white/60 focus:bg-white/20")}>
                  <Monitor className="w-5 h-5" />
                  <span className="text-xs font-black uppercase">{aspectRatio}</span>
               </button>

               <button data-tv-focusable onClick={() => handleMenuClick("stability")} className={cn("flex items-center gap-2 px-5 py-3 rounded-2xl transition-all", activeMenu === "stability" ? "bg-primary text-white" : "bg-white/10 text-white/60 focus:bg-white/20")}>
                  <Clock className="w-5 h-5" />
                  <span className="text-xs font-black uppercase">{stabilityMode === "ultra" ? "Ultra" : "Stable"}</span>
               </button>

               {audioTracks.length > 1 && (
                 <button data-tv-focusable onClick={() => handleMenuClick("audio")} className={cn("flex items-center gap-2 px-5 py-3 rounded-2xl transition-all", activeMenu === "audio" ? "bg-green-600 text-white" : "bg-white/10 text-white/60 focus:bg-green-600/30")}>
                    <Music className="w-5 h-5" />
                    <span className="text-xs font-black uppercase">Audio</span>
                 </button>
               )}

               {!isFullscreen && (
                  <button data-tv-focusable onClick={toggleFullscreen} className="bg-white/10 text-white p-4 rounded-2xl focus:bg-white/20">
                     <Maximize2 className="w-5 h-5" />
                  </button>
               )}

               {isPipAvailable && !isFullscreen && (
                  <button data-tv-focusable onClick={togglePip} className="bg-white/10 text-white p-4 rounded-2xl focus:bg-white/20">
                     <PictureInPicture2 className="w-5 h-5" />
                  </button>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Menus (TV Style) */}
      <AnimatePresence>
        {activeMenu !== "none" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-md p-10">
            <div className="w-full max-w-lg bg-zinc-900/90 border border-white/10 rounded-3xl p-8 shadow-2xl">
               <div className="flex items-center justify-between mb-8">
                  <h3 className="text-3xl font-black text-white uppercase tracking-tighter">
                     {activeMenu === "aspect" ? "Display Ratio" : activeMenu === "stability" ? "Stability Mode" : "Audio Track"}
                  </h3>
                  <button data-tv-focusable onClick={() => setActiveMenu("none")} className="p-3 rounded-full bg-white/5 text-white">
                     <ArrowLeft className="w-6 h-6" />
                  </button>
               </div>

               <div className="flex flex-col gap-3">
                  {activeMenu === "aspect" && (["contain", "cover", "fill"] as const).map((ratio) => (
                    <button key={ratio} data-tv-focusable onClick={() => { setAspectRatio(ratio); setActiveMenu("none"); }} className={cn("w-full py-5 rounded-2xl text-xl font-bold uppercase transition-all", aspectRatio === ratio ? "bg-primary text-white scale-105" : "bg-white/5 text-white/40 hover:bg-white/10")}>
                       {ratio}
                    </button>
                  ))}

                  {activeMenu === "stability" && (["stable", "ultra"] as const).map((mode) => (
                    <button key={mode} data-tv-focusable onClick={() => { setStabilityMode(mode); setActiveMenu("none"); }} className={cn("w-full py-5 rounded-2xl text-xl font-bold uppercase transition-all", stabilityMode === mode ? "bg-primary text-white scale-105" : "bg-white/5 text-white/40")}>
                       {mode === "stable" ? "Balanced" : "Maximum Stability"}
                    </button>
                  ))}

                  {activeMenu === "audio" && audioTracks.map((track, idx) => (
                    <button key={idx} data-tv-focusable onClick={() => { switchLiveAudioTrack(idx); setActiveMenu("none"); }} className={cn("w-full py-5 rounded-2xl text-xl font-bold uppercase transition-all", currentAudioTrack === idx ? "bg-primary text-white scale-105" : "bg-white/5 text-white/40")}>
                       {track.name || track.label || `Track ${idx + 1}`}
                    </button>
                  ))}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Module-level cache of image URLs that have failed to load.
// Persists across component mounts so failed logos are never retried.
// Bounded to 500 entries to prevent unbounded memory growth.
const failedImageCache = new Set<string>();
const FAILED_IMAGE_CACHE_MAX = 500;
const failedImageCacheAdd = (url: string) => {
  if (failedImageCache.size >= FAILED_IMAGE_CACHE_MAX) {
    const first = failedImageCache.values().next().value;
    if (first) failedImageCache.delete(first);
  }
  failedImageCache.add(url);
};

const CHANNEL_BATCH_SIZE = 50;
// webOS sliding window: max rendered DOM rows to prevent OOM on low-RAM TVs.
// Items above/below the window are unmounted; scroll position is maintained via padding.
const MAX_VISIBLE_ROWS = 60;
const WINDOW_OVERSCAN = 15;
const ITEM_HEIGHT = 82;
const CATEGORY_DIVIDER_PATTERN = /^#+\s*[^#]+\s*#+$/;

const normalizeCategoryId = (value: unknown) => String(value ?? "").trim();

const isListableLiveChannel = (channel: LiveStream) => {
  const name = String(channel?.name ?? "").trim();
  return Boolean(channel?.stream_id) && !CATEGORY_DIVIDER_PATTERN.test(name);
};

const ChannelIcon = ({ src, alt }: { src: string; alt: string }) => {
  const { activePlaylist } = usePlaylist();
  const resolvedSrc = getThumbnailUrl(src, activePlaylist?.host || "");
  const imgRef = useRef<HTMLImageElement>(null);
  const iconLoaded = useTvLazyImage(imgRef, resolvedSrc || "", 300);
  const [error, setError] = useState(
    () => !resolvedSrc || failedImageCache.has(resolvedSrc),
  );

  // Virtual lists reuse component instances with new props — the useState
  // initializer only runs on mount, so we must sync `error` whenever `src` changes.
  useEffect(() => {
    if (!resolvedSrc || failedImageCache.has(resolvedSrc)) {
      setError(true);
    }
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
      ref={imgRef}
      alt={alt}
      className="w-full h-full object-contain"
      referrerPolicy="no-referrer"
      onError={() => {
        failedImageCacheAdd(resolvedSrc);
        setError(true);
      }}
    />
  );
};

const ChannelRow = memo(({ channel, isSelected, isFavorite, isTVFocused, onSelect, onHover, style }: {
  channel: any;
  isSelected: boolean;
  isFavorite: boolean;
  isTVFocused?: boolean;
  onSelect: (ch: any) => void;
  onHover: (ch: any) => void;
  style?: React.CSSProperties;
}) => {
  const t = useT();
  return (
    <div style={style}>
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
        style={{ contentVisibility: "auto", containIntrinsicSize: "82px" }}
      >
        <div className="w-10 text-xs text-white/40 font-semibold tabular-nums">{channel.num ?? "-"}</div>
        <div className="tv-channel-logo-shell w-12 h-8 flex-shrink-0">
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
            {t.liveChannel}
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
    fetchLiveByCategory,
    isFetchingLive,
    favorites,
    toggleFavorite,
    settings,
    updateSettings,
    isParentalUnlocked,
    unlockParental,
    lockParental,
    setLiveStreams,
    categoryCounts: indexedCategoryCounts,
  } = usePlaylist();

  // MUST be defined early - used throughout the component
  const isWebOS = document.documentElement.dataset.tv === "true";
  const platform = getPlatformName();

  // Desktop defaults to "all"; webOS loads one category at a time to stay within RAM.
  const [activeCategory, setActiveCategory] = useState(() =>
    isWebOS ? "" : "all",
  );
  const [selectedChannel, setSelectedChannel] = useState<LiveStream | null>(
    null,
  );
  const selectedChannelRef = useRef<LiveStream | null>(null);
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);
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
  const epgAbortRef = useRef<AbortController | null>(null);
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

    if (!isWebOS && (playlistData.liveStreams?.length || 0) > 0) {
      liveRetryStateRef.current = { playlistKey, attempts: 0 };
      return;
    }

    if (isWebOS && (playlistData.liveCategories?.length || 0) > 0) {
      liveRetryStateRef.current = { playlistKey, attempts: 0 };
      return;
    }

    if (liveRetryStateRef.current.attempts >= 3) {
      return;
    }

    // Recover from partial prefetch: categories without streams (desktop) or missing categories (webOS).
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
    isWebOS,
    playlistData.liveCategories?.length,
    playlistData.liveStreams?.length,
  ]);

  useEffect(() => {
    if (epgTimerRef.current) clearTimeout(epgTimerRef.current);
    epgAbortRef.current?.abort();
    const abortController = new AbortController();
    epgAbortRef.current = abortController;
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
          abortController.signal,
        );
        const listings = Array.isArray(response?.epg_listings)
          ? [...response.epg_listings].sort(
              (a, b) =>
                new Date(a.start).getTime() - new Date(b.start).getTime(),
            )
          : [];
        setEpgData(listings);
      } catch {
        if (!abortController.signal.aborted) {
          setEpgData([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsEpgLoading(false);
        }
      }
    }, 1500);
    return () => {
      if (epgTimerRef.current) clearTimeout(epgTimerRef.current);
      if (epgAbortRef.current === abortController) {
        epgAbortRef.current = null;
      }
      abortController.abort();
    };
  }, [selectedChannel?.stream_id, selectedChannel?.epg_channel_id, activePlaylist?.id]);

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

  // webOS: default to first real category only when nothing is selected yet (keep Favorites).
  useEffect(() => {
    if (!isWebOS || categories.length === 0) return;
    const normalized = normalizeCategoryId(activeCategory);
    if (normalized) return;
    const firstId = normalizeCategoryId(categories[0].category_id);
    if (firstId) setActiveCategory(firstId);
  }, [isWebOS, categories, activeCategory]);

  const [favLiveStreams, setFavLiveStreams] = useState<LiveStream[]>([]);
  const seenLiveChannelsRef = useRef<Map<number, LiveStream>>(new Map());

  const reloadFavoriteLiveStreams = useCallback(() => {
    if (!activePlaylist?.id) {
      setFavLiveStreams([]);
      return;
    }

    const legacy = readLiveFavSnapshots(activePlaylist.id);
    const mergedById = {
      ...legacy,
      ...(favorites.liveById || {}),
    };

    const memoryChannels = [
      ...seenLiveChannelsRef.current.values(),
      ...(playlistData.liveStreams || []),
    ];

    const resolved = resolveFavoriteLiveStreams(
      activePlaylist.id,
      favorites.live,
      mergedById,
      memoryChannels,
    );
    setFavLiveStreams(resolved);
  }, [
    activePlaylist?.id,
    favorites.live,
    favorites.liveById,
    playlistData.liveStreams,
  ]);

  useEffect(() => {
    if (normalizeCategoryId(activeCategory) !== "fav") return;
    reloadFavoriteLiveStreams();
  }, [activeCategory, reloadFavoriteLiveStreams]);

  const toggleLiveFavorite = useCallback(
    (channel: LiveStream) => {
      if (!activePlaylist?.id || !channel?.stream_id) return;
      const id = Number(channel.stream_id);
      const isFav = favorites.live.some((fid) => Number(fid) === id);

      seenLiveChannelsRef.current.set(id, channel);
      if (isFav) {
        removeLiveFavSnapshot(activePlaylist.id, id);
      } else {
        saveLiveFavSnapshot(activePlaylist.id, channel);
      }
      toggleFavorite("live", id, channel);

      if (isFav) {
        setFavLiveStreams((list) =>
          list.filter((row) => Number(row.stream_id) !== id),
        );
      } else {
        setFavLiveStreams((list) => {
          const without = list.filter((row) => Number(row.stream_id) !== id);
          return [...without, channel];
        });
      }
      queueMicrotask(() => reloadFavoriteLiveStreams());
    },
    [
      activePlaylist?.id,
      favorites.live,
      toggleFavorite,
      reloadFavoriteLiveStreams,
    ],
  );

  // webOS: load channels for the active category only (never the full live catalog).
  useEffect(() => {
    if (!isWebOS || !activePlaylist) return;
    const catId = normalizeCategoryId(activeCategory);
    if (!catId || catId === "all" || catId === "fav") return;
    fetchLiveByCategory(catId).catch((error) => {
      console.error("Live category fetch failed:", error);
    });
  }, [isWebOS, activeCategory, activePlaylist?.id, fetchLiveByCategory]);

  const streams = useMemo(() => {
    if (normalizeCategoryId(activeCategory) === "fav") {
      return favLiveStreams;
    }
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
    activeCategory,
    favLiveStreams,
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
      const fallback = isWebOS
        ? normalizeCategoryId(categories[0]?.category_id) || "all"
        : "all";
      setActiveCategory(fallback);
      setFocusIndex(0);
      setHoveredChannel(null);
    }
  }, [activeCategory, categories, isWebOS]);

  const listableChannels = useMemo(
    () => streams.filter(isListableLiveChannel),
    [streams],
  );

  const categoryCounts = useMemo(() => {
    if (isWebOS) return indexedCategoryCounts.live;
    const counts: Record<string, number> = { ...indexedCategoryCounts.live };
    for (let index = 0; index < listableChannels.length; index += 1) {
      const categoryId = normalizeCategoryId(listableChannels[index].category_id);
      if (!categoryId) continue;
      counts[categoryId] = (counts[categoryId] || 0) + 1;
    }
    return counts;
  }, [isWebOS, indexedCategoryCounts.live, listableChannels]);

  const favoriteIdSet = useMemo(
    () => new Set(favorites.live.map((id) => Number(id))),
    [favorites.live],
  );

  const filteredChannels = useMemo(() => {
    if (!Array.isArray(listableChannels)) return [];
    const isFavCategory = normalizeCategoryId(activeCategory) === "fav";
    let filtered = listableChannels.filter((channel) => {
      const matchesSearch = channel.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        activeCategory === "all" ||
        isFavCategory ||
        normalizeCategoryId(channel.category_id) ===
          normalizeCategoryId(activeCategory);
      const matchesFav = !isFavCategory || favoriteIdSet.has(Number(channel.stream_id));
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
    favoriteIdSet,
    settings.liveSort,
  ]);

  // Defer rendering of the channel list for UI responsiveness
  const deferredChannels = useDeferredValue(filteredChannels);

  const [displayLimit, setDisplayLimit] = useState(CHANNEL_BATCH_SIZE);
  const [windowStart, setWindowStart] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const shouldFocusListAfterCategorySelectRef = useRef(false);
  const focusSidebarCategoryAtRef = useRef<(index?: number) => void>(() => {});

  // Reset display limit and window when category or search changes
  useEffect(() => {
    setDisplayLimit(CHANNEL_BATCH_SIZE);
    setWindowStart(0);
    setFocusIndex(0);
    setHoveredChannel(null);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [activeCategory, searchQuery]);

  // On webOS: sliding window cap to limit DOM nodes. On desktop: batched loading.
  const displayedChannels = useMemo(() => {
    if (isWebOS) {
      const end = Math.min(windowStart + MAX_VISIBLE_ROWS, deferredChannels.length);
      return deferredChannels.slice(windowStart, end);
    }
    return deferredChannels.slice(0, displayLimit);
  }, [deferredChannels, displayLimit, windowStart, isWebOS]);

  useEffect(() => {
    for (const ch of playlistData.liveStreams || []) {
      const id = Number(ch.stream_id);
      if (Number.isFinite(id) && id > 0) {
        seenLiveChannelsRef.current.set(id, ch);
      }
    }
    for (const ch of displayedChannels) {
      const id = Number(ch.stream_id);
      if (Number.isFinite(id) && id > 0) {
        seenLiveChannelsRef.current.set(id, ch);
      }
    }
    while (seenLiveChannelsRef.current.size > MAX_SEEN_LIVE_CHANNELS) {
      const oldestKey = seenLiveChannelsRef.current.keys().next().value;
      if (oldestKey == null) break;
      seenLiveChannelsRef.current.delete(oldestKey);
    }
  }, [playlistData.liveStreams, displayedChannels]);

  const loadMoreChannels = useCallback(() => {
    setDisplayLimit((previous) =>
      Math.min(previous + CHANNEL_BATCH_SIZE, deferredChannels.length),
    );
  }, [deferredChannels.length]);

  const handleChannelListScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isWebOS) return; // webOS uses D-pad controlled sliding window
      const element = event.currentTarget;
      // Desktop: batched loading, grow displayLimit on scroll
      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (remaining <= 240 && displayLimit < deferredChannels.length) {
        loadMoreChannels();
      }
    },
    [deferredChannels.length, displayLimit, loadMoreChannels, isWebOS],
  );

  // IntersectionObserver to load more when sentinel comes into view (desktop only)
  useEffect(() => {
    if (isWebOS) return;
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
  }, [displayLimit, deferredChannels.length, loadMoreChannels, isWebOS]);
  // TV navigation state
  const [focusIndex, setFocusIndex] = useState(0);
  const [navZone, setNavZone] = useState<LiveNavZone>("channels");
  // Color button action feedback
  const [colorAction, setColorAction] = useState<string>("");

  const handleSelectChannel = useCallback((channel: LiveStream | null) => {
    if (!channel) return;
    const current = selectedChannelRef.current;
    if (current?.stream_id === channel.stream_id) {
      if (isWebOS && playerRef.current) {
        const video = playerRef.current;
        if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          video.play().catch(() => {});
        }
      }
      return;
    }
    // Synchronous update on TV keeps video.play() inside the remote "enter" gesture.
    if (isWebOS) {
      setSelectedChannel(channel);
    } else {
    startTransition(() => {
      setSelectedChannel(channel);
    });
    }
  }, [isWebOS]);

  const focusChannelListAt = useCallback(
    (targetIndex = 0) => {
      const total = displayedChannels.length;
      if (total <= 0) return false;

      const nextIndex = Math.max(0, Math.min(targetIndex, total - 1));
      setNavZone("channels");
      setFocusIndex(nextIndex);
      setHoveredChannel(displayedChannels[nextIndex]);

      requestAnimationFrame(() => {
        const root = scrollContainerRef.current;
        if (!root) return;
        const rows = root.querySelectorAll<HTMLButtonElement>("button[data-tv-focusable]");
        const row = rows[nextIndex] || rows[0];
        row?.focus({ preventScroll: true });
        if (row) {
          const targetTop =
            row.offsetTop - root.clientHeight / 2 + row.offsetHeight / 2;
          root.scrollTo({
            top: Math.max(0, targetTop),
            behavior: "smooth",
          });
        }
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
    if (normalizeCategoryId(activeCategory) === "fav") {
      const last = normalizeCategoryId(lastNonFavoriteCategoryRef.current);
      const fallbackCategory =
        last &&
        last !== "fav" &&
        last !== "all" &&
        categories.some((c) => normalizeCategoryId(c.category_id) === last)
          ? last
          : normalizeCategoryId(categories[0]?.category_id) || "all";
      setActiveCategory(fallbackCategory);
      setNavZone("channels");
      showColorAction("Favorites filter off");
      return;
    }

    if (normalizeCategoryId(activeCategory) !== "all") {
      lastNonFavoriteCategoryRef.current = activeCategory;
    }
    setActiveCategory("fav");
    reloadFavoriteLiveStreams();
    shouldFocusListAfterCategorySelectRef.current = true;
    setNavZone("channels");
    showColorAction("Favorites filter on");
  }, [
    activeCategory,
    categories,
    showColorAction,
    reloadFavoriteLiveStreams,
  ]);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    showColorAction(searchQuery ? "Search focused" : "Search ready");
  }, [searchQuery, showColorAction]);

  const focusLiveHeader = useCallback(() => {
    setNavZone("channels");
    requestAnimationFrame(() => {
      focusHeader();
    });
  }, []);

  const focusFirstPreviewControl = useCallback(() => {
    const root = previewPanelRef.current;
    if (!root) return false;
    const first = root.querySelector<HTMLElement>(
      "[data-tv-focusable], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    );
    if (!first) return false;
    setNavZone("preview");
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
        if (navZone !== "preview") setNavZone("preview");
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
          if (document.activeElement === before) {
            setNavZone("channels");
            focusChannelListAt(focusIndex);
          }
          return;
        }
        if (key === "back") {
          active?.blur();
          return;
        }
      }

      // Header zone: left/right navigate within navbar; down escapes to channel list
      if (handleHeaderZoneKey(key, { 
        onBack: () => navigate('/'),
        onEscapeDown: () => {
          setNavZone("sidebar");
          requestAnimationFrame(() => focusSidebarCategoryAtRef.current());
        }
      })) return;

      // Sidebar owns focus — channel list stays frozen (Sidebar handles keys in capture phase).
      if (navZone === "sidebar") {
        if (key === "channelup") {
          focusLiveHeader();
          return;
        }
        if (key === "back") {
          setNavZone("channels");
          focusChannelListAt(focusIndex);
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
        const rows = scrollContainerRef.current?.querySelectorAll<HTMLButtonElement>("button[data-tv-focusable]");
        const activeRow = document.activeElement as HTMLElement | null;
        const firstVisibleRow = rows?.[0] || null;
        if (focusIndex === 0 || (firstVisibleRow && activeRow === firstVisibleRow)) {
          // Escape channel list upward to the header navbar.
          focusLiveHeader();
          return;
        }
        setFocusIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          setHoveredChannel(displayedChannels[next]);
          // Slide window up if we're at the top edge
          if (isWebOS && next < 5 && windowStart > 0) {
            const slideBy = MAX_VISIBLE_ROWS / 2;
            const newWindowStart = Math.max(0, windowStart - slideBy);
            // Calculate new relative focusIndex that keeps the same absolute channel
            const absoluteIdx = windowStart + next;
            const newRelativeIdx = absoluteIdx - newWindowStart;
            setWindowStart(newWindowStart);
            return Math.max(0, Math.min(newRelativeIdx, MAX_VISIBLE_ROWS - 1));
          }
          setHoveredChannel(displayedChannels[next]);
          return next;
        });
      } else if (key === "down") {
        setFocusIndex((prev) => {
          let next = prev + 1;
          if (next >= displayedChannels.length)
            next = displayedChannels.length - 1;
          if (isWebOS) {
            // Slide window down if we're near the bottom edge
            if (next >= displayedChannels.length - 5 && windowStart + MAX_VISIBLE_ROWS < deferredChannels.length) {
              const slideBy = MAX_VISIBLE_ROWS / 2;
              const newWindowStart = Math.min(windowStart + slideBy, Math.max(0, deferredChannels.length - MAX_VISIBLE_ROWS));
              // Calculate new relative focusIndex that keeps the same absolute channel
              const absoluteIdx = windowStart + next;
              const newRelativeIdx = absoluteIdx - newWindowStart;
              setWindowStart(newWindowStart);
              setHoveredChannel(deferredChannels[absoluteIdx]);
              return Math.max(0, Math.min(newRelativeIdx, MAX_VISIBLE_ROWS - 1));
            }
          } else {
            // Load more on desktop
            if (next >= displayLimit - 5 && displayLimit < deferredChannels.length) {
              loadMoreChannels();
            }
          }
          setHoveredChannel(displayedChannels[next]);
          return next;
        });
      } else if (key === "left") {
        setNavZone("sidebar");
        requestAnimationFrame(() => focusSidebarCategoryAtRef.current());
      } else if (key === "right") {
        setNavZone("preview");
        focusFirstPreviewControl();
      } else if (key === "enter" || key === "select") {
        handleSelectChannel(displayedChannels[focusIndex]);
      } else if (key === "red") {
        const ch = displayedChannels[focusIndex];
        if (ch) {
          toggleLiveFavorite(ch);
          showColorAction(
            favoriteIdSet.has(Number(ch.stream_id))
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
    handleSelectChannel,
    displayedChannels,
    deferredChannels.length,
    displayLimit,
    favorites.live,
    focusIndex,
    focusSearch,
    focusLiveHeader,
    focusFirstPreviewControl,
    navigate,
    selectedChannel,
    showPinModal,
    navZone,
    showColorAction,
    toggleFavoriteFilter,
    toggleLiveFavorite,
    focusChannelListAt,
    windowStart,
    isWebOS,
    loadMoreChannels,
  ]);

  // TV navigation should be highlight-only. Starting playback on every focused
  // row creates decoder/network churn on low-memory webOS devices.
  useEffect(() => {
    if (!isWebOS || navZone === "sidebar" || showPinModal) return;
    const ch = displayedChannels[focusIndex];
    if (!ch) return;
    setHoveredChannel(ch);
  }, [focusIndex, displayedChannels, navZone, showPinModal, isWebOS]);

  useEffect(() => {
    if (activeCategory !== "fav") {
      lastNonFavoriteCategoryRef.current = normalizeCategoryId(activeCategory);
    }
  }, [activeCategory]);

    // Keep the focused channel centered while D-pad navigation moves through long lists.
    useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const rows = container.querySelectorAll<HTMLElement>("button[data-tv-focusable]");
      const row = rows[focusIndex];
      if (!row) return;
      const targetTop =
        row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    }, [focusIndex]);

  useEffect(() => {
    return () => {
      if (colorActionTimerRef.current) clearTimeout(colorActionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showPinModal) return;
    setNavZone("channels");
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
          ? ["m3u8", "ts", "mp4"]
          : ["m3u8", "ts", "mp4"];
      // webOS: native `<video>` only — try multiple extensions on error (see MiniPlayer).
      if (platform === "webos") {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
        const simulator = /simulator|emulator/i.test(ua);
        const exts = simulator
          ? ["ts", "m3u8", "mp4"]
          : ["m3u8", "ts", "mp4"];
        return exts.map((ext) =>
          xtreamLiveUrl(
            activePlaylist.host,
            activePlaylist.username,
            activePlaylist.password,
            channel.stream_id,
            ext,
          ),
        );
      }

      // On other platforms, use flexible format fallback
      const rememberedExt = (() => {
        if (!activePlaylist?.id) return null;
        try {
          const saved = localStorage.getItem(
            `nova_live_ext_pref_${activePlaylist.id}`,
          );
          return ["ts", "m3u8", "mp4"].includes(String(saved || ""))
            ? String(saved)
            : null;
        } catch {
          return null;
        }
      })();

      const orderedExts = Array.from(
        new Set([preferredExt, ...baseOrder].filter(Boolean)),
      );
      if (rememberedExt) {
        const rememberedIndex = orderedExts.indexOf(rememberedExt);
        if (rememberedIndex > 0) {
          orderedExts.splice(rememberedIndex, 1);
          orderedExts.unshift(rememberedExt);
        }
      }

      return orderedExts.map((ext) =>
        xtreamLiveUrl(
          activePlaylist.host,
          activePlaylist.username,
          activePlaylist.password,
          channel.stream_id,
          ext,
        ),
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

    const items: Array<{ id: string; name: string; count: number; locked?: boolean }> = [];

    if (!isWebOS) {
      items.push({
        id: "all",
        name: t.allChannels,
        count: listableChannels.length,
      });
    }
    items.push({
      id: "fav",
      name: t.favorites,
      count: favorites.live.length,
    });

    items.push(...(categories || []).map((cat) => ({
      id: normalizeCategoryId(cat.category_id),
      name: cat.category_name,
      count: categoryCounts[normalizeCategoryId(cat.category_id)] || 0,
      locked:
        (settings.parentalLockedCategories?.live || []).includes(
          normalizeCategoryId(cat.category_id),
        ) && !isParentalUnlocked,
    })));

    return items;
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

  useEffect(() => {
    focusSidebarCategoryAtRef.current = (index?: number) => {
      const idx =
        index ??
        sidebarItems.findIndex((item) => item.id === activeCategory);
      const list = document.querySelector(
        ".tv-category-rail .flex-1.overflow-y-auto",
      );
      const btn = list?.children[
        idx >= 0 ? idx : 0
      ] as HTMLElement | undefined;
      btn?.focus({ preventScroll: true });
      btn?.scrollIntoView({ block: "nearest", behavior: "auto" });
    };
  }, [sidebarItems, activeCategory]);

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
      // Only clear active channel on explicit user category switch.
      // Avoid stopping live playback from background/category sync churn.
      setSelectedChannel(null);
      shouldFocusListAfterCategorySelectRef.current = true;
      setNavZone("channels");
      setActiveCategory(normalizedCategoryId);
      if (normalizedCategoryId === "fav") {
        reloadFavoriteLiveStreams();
      }
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
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
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
                      data-tv-focusable
                      type="button"
                      onClick={() => setShowPinModal(false)}
                      className="tv-channel-row flex-1 px-6 py-4 font-bold mx-0"
                    >
                      Cancel
                    </button>
                    <button
                      data-tv-focusable
                      type="submit"
                      className="tv-channel-row tv-channel-row--selected flex-1 px-6 py-4 font-bold mx-0"
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
            <button data-tv-focusable
              onClick={() => navigate("/")}
              className="tv-header-back-btn rounded-full p-2"
              title="Back to Home"
              aria-label="Back to Home"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <WeatherWidget />
            <nav className="tv-nav-tabs flex items-center gap-1">
              <button data-tv-focusable
                onClick={() => navigate("/")}
                className="tv-nav-tab"
              >
                {t.home}
              </button>
              <button data-tv-focusable className="tv-nav-tab tv-nav-tab--active">
                {t.live}
              </button>
              <button data-tv-focusable
                onClick={() => navigate("/movies")}
                className="tv-nav-tab"
              >
                {t.movies}
              </button>
              <button data-tv-focusable
                onClick={() => navigate("/series")}
                className="tv-nav-tab"
              >
                {t.series}
              </button>
              <button data-tv-focusable
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
            <button data-tv-focusable
              onClick={() =>
                isParentalUnlocked ? lockParental() : setShowPinModal(true)
              }
              className={cn(
                "tv-header-icon-btn rounded-full p-2 transition-all",
                isParentalUnlocked
                  ? "tv-header-icon-btn--on text-white"
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
      <div className="flex flex-1 overflow-hidden relative bg-zinc-950">
        {/* Sidebar (Premium Integrated) */}
        <Sidebar
          items={sidebarItems}
          activeId={activeCategory}
          onSelect={handleCategorySelect}
          hasTVFocus={navZone === "sidebar" && !showPinModal}
          onTVFocusAcquire={() => setNavZone("sidebar")}
          onTVFocusRelease={() => {
            setNavZone("channels");
            requestAnimationFrame(() => focusChannelListAt(focusIndex));
          }}
          onTVFocusEscapeUp={() => {
            focusLiveHeader();
          }}
        />

        {/* Channel List (Professional Grid/List) */}
        <div
          ref={containerRef}
          className="tv-live-column flex-1 flex flex-col overflow-hidden border-r border-white/5 bg-black/20"
        >
          <div className="flex items-center justify-between px-8 py-6 bg-linear-to-b from-white/[0.02] to-transparent">
            <div className="flex flex-col gap-1">
              <h2 className="text-3xl font-black text-white tracking-tight uppercase">
                {sidebarItems.find((item) => item.id === activeCategory)?.name || t.allChannels}
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-black text-white/30 tracking-[0.2em] uppercase">
                  {deferredChannels.length} {t.channels}
                </span>
                <div className="h-1 w-1 rounded-full bg-white/20" />
                <span
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                    navZone === "sidebar"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : navZone === "preview"
                        ? "bg-white/10 text-white/50"
                        : "bg-primary/10 text-primary",
                  )}
                >
                  {navZone === "sidebar"
                    ? t.choosingCategory
                    : navZone === "preview"
                      ? t.preview
                      : t.browsingList}
                </span>
              </div>
            </div>
          </div>

          {!isConnected ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-6">
              <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center border border-white/10 rotate-12">
                <Tv className="w-12 h-12 text-white/20 -rotate-12" />
              </div>
              <div className="max-w-xs flex flex-col gap-2">
                <h3 className="text-2xl font-black text-white">{t.noPlaylistLiveMsg}</h3>
                <p className="text-white/40 leading-relaxed">
                  Connect your IPTV provider to start watching live television.
                </p>
              </div>
              <button
                data-tv-focusable
                onClick={() => navigate("/playlist-setup")}
                className="tv-channel-row tv-channel-row--selected px-10 py-4 mx-0 font-black uppercase tracking-widest text-sm"
              >
                {t.addPlaylistBtn}
              </button>
            </div>
          ) : deferredChannels.length > 0 ? (
            <div
              ref={scrollContainerRef}
              onScroll={handleChannelListScroll}
              className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-10"
            >
              <div
                className="flex flex-col gap-2"
                style={isWebOS ? {
                  paddingTop: windowStart * ITEM_HEIGHT,
                  paddingBottom: Math.max(0, deferredChannels.length - windowStart - MAX_VISIBLE_ROWS) * ITEM_HEIGHT,
                } : undefined}
              >
                {displayedChannels.map((channel, index) => (
                  <ChannelRow
                    key={channel.stream_id}
                    channel={channel}
                    isSelected={selectedChannel?.stream_id === channel.stream_id}
                    isTVFocused={index === focusIndex}
                    isFavorite={favoriteIdSet.has(Number(channel.stream_id))}
                    onSelect={handleSelectChannel}
                    onHover={setHoveredChannel}
                  />
                ))}
              </div>
              {!isWebOS && displayLimit < deferredChannels.length && (
                <div ref={sentinelRef} className="flex flex-col items-center justify-center py-12 gap-2 opacity-40">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Loading More...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4 max-w-md mx-auto">
              <p className="text-white/20 uppercase tracking-[0.2em] font-black text-sm">
                {normalizeCategoryId(activeCategory) === "fav" &&
                favorites.live.length > 0
                  ? "Favorite channels are missing details — open a category, highlight a channel, press Red to save again."
                  : t.noChannelsFound}
              </p>
            </div>
          )}
        </div>

        {/* Right Panel: Preview & EPG */}
        <div
          ref={previewPanelRef}
          className="tv-live-column w-[42%] flex flex-col bg-black/20 overflow-hidden"
        >
          {isConnected ? (
            <div className="flex flex-col h-full">
              <div className="px-8 py-5 border-b border-white/5 bg-linear-to-b from-white/[0.02] to-transparent">
                <h2 className="text-2xl font-black text-white tracking-tight uppercase">
                  {t.preview}
                </h2>
                <span
                  className={cn(
                    "mt-1 inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                    navZone === "preview" ? "bg-primary/10 text-primary" : "text-white/30",
                  )}
                >
                  {navZone === "preview" ? t.browsingPreview : t.ready}
                </span>
              </div>
              <div className="p-8 pb-0">
                <div className="aspect-video w-full rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative bg-black/40 group">
                  {selectedChannel ? (
                    <MiniPlayer
                      videoRef={playerRef}
                      urls={buildLiveChannelUrls(selectedChannel)}
                      startupPreferenceKey={
                        activePlaylist?.id
                          ? `nova_live_ext_pref_${activePlaylist.id}`
                          : undefined
                      }
                      poster={getThumbnailUrl(
                        selectedChannel.stream_icon,
                        activePlaylist?.host,
                      )}
                      title={selectedChannel.name}
                      onNext={() => {
                        const currentIndex = filteredChannels.findIndex(
                          (c) => c.stream_id === selectedChannel.stream_id,
                        );
                        if (currentIndex < filteredChannels.length - 1) {
                          handleSelectChannel(filteredChannels[currentIndex + 1]);
                        }
                      }}
                      onPrev={() => {
                        const currentIndex = filteredChannels.findIndex(
                          (c) => c.stream_id === selectedChannel.stream_id,
                        );
                        if (currentIndex > 0) {
                          handleSelectChannel(filteredChannels[currentIndex - 1]);
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                      <div className="p-6 bg-white/5 rounded-full border border-white/5">
                        <Tv className="w-16 h-16 text-white/10" />
                      </div>
                      <span className="text-white/20 font-black uppercase tracking-[0.2em] text-sm">
                        {t.selectChannel}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hide p-4 flex flex-col gap-4">
                {selectedChannel && (
                  <>
                    <div className="tv-channel-row tv-channel-row--selected flex items-center gap-3 h-[82px] px-4 mx-2 my-1">
                      <div className="tv-channel-logo-shell w-12 h-8 flex-shrink-0">
                        <ChannelIcon
                          src={selectedChannel.stream_icon}
                          alt={selectedChannel.name}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-lg font-medium text-white truncate uppercase">
                          {selectedChannel.name}
                        </span>
                        <span className="block text-[11px] text-white/35 uppercase tracking-wide">
                          CH {selectedChannel.num ?? "—"} · {t.liveLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded text-[10px] text-primary font-bold uppercase shrink-0">
                        <Play className="w-3 h-3 fill-primary" />
                        {t.nowPlaying}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 px-2">
                      <button
                        data-tv-focusable
                        onClick={() => {
                          if (playerRef.current) {
                            if (playerRef.current.requestFullscreen) {
                              playerRef.current.requestFullscreen();
                            } else if ((playerRef.current as any).webkitRequestFullscreen) {
                              (playerRef.current as any).webkitRequestFullscreen();
                            }
                          }
                        }}
                        className="tv-channel-row flex items-center gap-3 w-full h-[82px] px-4 text-left mx-0 my-1 hover:bg-white/6"
                      >
                        <Maximize2 className="w-5 h-5 text-white/50 shrink-0" />
                        <span className="text-lg font-medium text-white/85">{t.watchFullScreen}</span>
                      </button>
                      <button
                        data-tv-focusable
                        onClick={() => toggleLiveFavorite(selectedChannel)}
                        className={cn(
                          "tv-channel-row flex items-center gap-3 w-full h-[82px] px-4 text-left mx-0 my-1 hover:bg-white/6",
                          favoriteIdSet.has(Number(selectedChannel.stream_id)) &&
                            "tv-channel-row--selected",
                        )}
                      >
                        <Star
                          className={cn(
                            "w-5 h-5 shrink-0",
                            favoriteIdSet.has(Number(selectedChannel.stream_id))
                              ? "fill-primary text-primary"
                              : "text-white/45",
                          )}
                        />
                        <span className="text-lg font-medium text-white/85">
                          {favoriteIdSet.has(Number(selectedChannel.stream_id))
                            ? t.removeFavorite
                            : t.addToFavorite}
                        </span>
                      </button>
                    </div>

                    {/* Current Program (Highlight) */}
                    {currentProgram ? (
                      <div className="tv-channel-row tv-channel-row--selected tv-epg-current-card flex items-start gap-3 min-h-[82px] px-4 py-4 mx-2 my-1 overflow-hidden">
                        <Clock className="w-5 h-5 text-primary shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <span className="tv-epg-title block text-lg font-medium text-white leading-snug">
                            {decodeGuideText(currentProgram.title)}
                          </span>
                          <span className="block text-[11px] text-white/35 uppercase tracking-wide mt-1">
                            {new Date(currentProgram.start).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: settings.timeFormat === "12h",
                            })}
                            {" — "}
                            {new Date(currentProgram.end).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: settings.timeFormat === "12h",
                            })}
                          </span>
                          {currentProgram.description && (
                            <p className="tv-epg-description tv-epg-description--two text-sm text-white/55 mt-2 leading-relaxed">
                              {decodeGuideText(currentProgram.description)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded text-[10px] text-primary font-bold uppercase shrink-0">
                          {t.nowPlaying}
                        </div>
                      </div>
                    ) : (
                      <div className="tv-channel-row flex items-center gap-3 h-[82px] px-4 mx-2 my-1 opacity-60">
                        <Clock className="w-5 h-5 text-white/30" />
                        <span className="text-lg font-medium text-white/50">{t.noProgramData}</span>
                      </div>
                    )}

                    <div className="px-6 py-2 flex items-center justify-between">
                      <h4 className="text-xs font-black text-white/30 tracking-[0.2em] uppercase">
                        {t.programGuide}
                      </h4>
                      {isEpgLoading && (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pb-6">
                      {epgData.length > 0 ? (
                        epgData.map((program, idx) => (
                          <EpgItem
                            key={idx}
                            program={program}
                            timeFormat={settings.timeFormat}
                          />
                        ))
                      ) : (
                        <div className="tv-channel-row flex items-center justify-center h-[82px] mx-2 my-1 text-white/25 font-bold uppercase tracking-widest text-xs">
                          {isEpgLoading ? t.loadingGuide : t.noGuideInfo}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center gap-6 opacity-20">
              <Tv className="w-32 h-32" />
              <span className="text-2xl font-black uppercase tracking-[0.5em]">{t.preview}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
