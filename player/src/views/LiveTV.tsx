import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useDeferredValue,
  startTransition,
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
  Settings,
  PictureInPicture2,
  Monitor,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { List } from "react-window";
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
  url,
  poster,
  title,
  onNext,
  onPrev,
  videoRef: externalVideoRef,
}: {
  url: string;
  poster: string;
  title: string;
  onNext?: () => void;
  onPrev?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) => {
  const { settings, updateSettings } = usePlaylist();
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalVideoRef || internalVideoRef;
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

  const fallbackCountRef = useRef(0);
  const lastBaseUrlRef = useRef("");
  const lastVolumeRef = useRef(0.8);

  // HLS State
  const [levels, setLevels] = useState<any[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [subtitleTracks, setSubtitleTracks] = useState<any[]>([]);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1);
  const [activeMenu, setActiveMenu] = useState<
    | "none"
    | "quality"
    | "audio"
    | "subtitle"
    | "aspect"
    | "format"
    | "stability"
  >("none");
  const [stabilityMode, setStabilityMode] = useState<"stable" | "ultra">(
    "stable",
  );

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (!videoRef.current || !url) return;
    const video = videoRef.current;
    setIsLoading(true);
    setIsPlaying(true);
    setLevels([]);
    setAudioTracks([]);
    setSubtitleTracks([]);
    const baseUrl = url.substring(0, url.lastIndexOf("."));
    if (lastBaseUrlRef.current !== baseUrl) {
      fallbackCountRef.current = 0;
      lastBaseUrlRef.current = baseUrl;
    }

    const proxiedUrl = `${window.location.origin}/api/proxy?url=${encodeURIComponent(url)}`;

    const isM3U8 = url.includes(".m3u8") || !url.includes(".ts");
    const isTS =
      !isM3U8 && (url.includes(".ts") || settings.streamFormat === "ts");

    const tryMpegts = () => {
      if (
        mpegts.getFeatureList().mseLivePlayback ||
        mpegts.getFeatureList().msePlayback
      ) {
        try {
          if (mpegtsRef.current) {
            mpegtsRef.current.destroy();
          }

          mpegtsRef.current = mpegts.createPlayer(
            {
              type: "mpegts",
              url: proxiedUrl,
              isLive: true,
              cors: true,
              withCredentials: false,
            },
            {
              enableWorker: true,
              stashInitialSize:
                stabilityMode === "ultra" ? 1024 * 1024 : 1024 * 256,
              enableStashBuffer: true,
              autoCleanupSourceBuffer: true,
              liveBufferLatencyChasing: stabilityMode === "stable",
              liveBufferLatencyChasingOnPaused: true,
              lazyLoad: false,
              deferLoadAfterSourceOpen: false,
            },
          );

          mpegtsRef.current.attachMediaElement(video);
          mpegtsRef.current.load();

          const playPromise = mpegtsRef.current.play();
          if (playPromise instanceof Promise) {
            playPromise.catch((e) => {
              if (e.name !== "AbortError")
                console.log("mpegts.js play failed:", e);
            });
          }

          mpegtsRef.current.on(
            mpegts.Events.ERROR,
            (type: string, detail: string, info: any) => {
              console.error("mpegts.js error:", type, detail, info);
              if (fallbackCountRef.current < 2) {
                fallbackCountRef.current += 1;
                console.log(
                  `mpegts error, retrying... (attempt ${fallbackCountRef.current}/2)`,
                );
                try {
                  if (mpegtsRef.current) {
                    mpegtsRef.current.unload();
                    mpegtsRef.current.load();
                    mpegtsRef.current.play().catch(() => {});
                  }
                } catch (e) {
                  if (mpegtsRef.current) {
                    mpegtsRef.current.destroy();
                    mpegtsRef.current = null;
                  }
                  video.src = proxiedUrl;
                  video.play().catch(() => {});
                }
              } else {
                console.log(
                  "mpegts failed after retries, falling back to native playback...",
                );
                if (mpegtsRef.current) {
                  mpegtsRef.current.destroy();
                  mpegtsRef.current = null;
                }
                video.src = proxiedUrl;
                video.play().catch(() => {});
              }
            },
          );

          mpegtsRef.current.on(mpegts.Events.METADATA_ARRIVED, () => {
            setIsLoading(false);
          });
        } catch (e) {
          console.error("Failed to initialize mpegts.js:", e);
          // Fallback
          video.src = proxiedUrl;
          video.play().catch(() => {});
        }
      } else {
        // No MSE support, try native
        video.src = proxiedUrl;
        video.play().catch(() => {});
      }
    };

    if (isM3U8) {
      if (Hls.isSupported()) {
        if (hlsRef.current) hlsRef.current.destroy();

        const isUltra = stabilityMode === "ultra";
        const hls = new Hls({
          // Worker & crypto (native Web Crypto API = hardware AES decrypt)
          enableWorker: true,
          enableSoftwareAES: false,

          // Low-latency live sync
          lowLatencyMode: true,
          backBufferLength: isUltra ? 20 : 6,
          liveSyncDurationCount: isUltra ? 5 : 2,
          liveMaxLatencyDurationCount: isUltra ? 12 : 6,

          // Buffer tuning
          startLevel: -1,
          maxBufferLength: isUltra ? 20 : 6,
          maxMaxBufferLength: isUltra ? 40 : 12,
          maxBufferSize: (isUltra ? 40 : 16) * 1000 * 1000,
          maxBufferHole: 0.25,
          highBufferWatchdogPeriod: 2,
          nudgeMaxRetry: 4,

          // ABR
          capLevelToPlayerSize: true,
          abrEwmaDefaultEstimate: 1_000_000,
          abrBandWidthFactor: 0.95,
          abrBandWidthUpFactor: 0.9,
          testBandwidth: true,

          // Loading
          autoStartLoad: true,
          startFragPrefetch: false,
          progressive: true,
          fragLoadingMaxRetry: 12,
          manifestLoadingMaxRetry: 12,
          levelLoadingMaxRetry: 12,
        });

        hlsRef.current = hls;
        hls.loadSource(proxiedUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false);
          setLevels(hls.levels || []);
          setCurrentLevel(hls.currentLevel);
          setAudioTracks(hls.audioTracks || []);
          setCurrentAudioTrack(hls.audioTrack);
          setSubtitleTracks(hls.subtitleTracks || []);
          setCurrentSubtitleTrack(hls.subtitleTrack);
          video.play().catch(() => setIsPlaying(false));
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          setCurrentLevel(data.level);
        });

        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
          setCurrentAudioTrack(data.id);
        });

        hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (event, data) => {
          setCurrentSubtitleTrack(data.id);
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (!data.fatal) return;
          console.error(
            "Fatal HLS error in MiniPlayer:",
            data.type,
            data.details,
          );
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (fallbackCountRef.current < 3) {
                fallbackCountRef.current++;
                console.log(
                  `HLS network error, retrying (${fallbackCountRef.current}/3)...`,
                );
                hls.startLoad();
              } else {
                console.log(
                  "HLS network failed after retries, falling back to mpegts...",
                );
                hls.destroy();
                hlsRef.current = null;
                tryMpegts();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (fallbackCountRef.current < 2) {
                fallbackCountRef.current++;
                console.log(
                  `HLS media error, recovering (${fallbackCountRef.current}/2)...`,
                );
                hls.recoverMediaError();
              } else {
                console.log(
                  "HLS media error unrecoverable, falling back to native...",
                );
                hls.destroy();
                hlsRef.current = null;
                video.src = proxiedUrl;
                video.play().catch(() => {});
              }
              break;
            default:
              console.log("HLS fatal error, falling back to native...");
              hls.destroy();
              hlsRef.current = null;
              video.src = proxiedUrl;
              video.play().catch(() => {});
              break;
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = proxiedUrl;
        video.addEventListener("loadedmetadata", () => {
          setIsLoading(false);
          video.play().catch(() => setIsPlaying(false));
        });
      }
    } else if (isTS) {
      tryMpegts();
    } else {
      video.src = proxiedUrl;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        video.play().catch(() => setIsPlaying(false));
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
    };
  }, [url, settings.streamFormat, stabilityMode]);

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

                {/* Stream Format */}
                <div className="relative">
                  <button
                    onClick={() => handleMenuClick("format")}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      activeMenu === "format"
                        ? "bg-primary text-white"
                        : "hover:bg-white/10 text-white",
                    )}
                    title="Change Stream Format"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {activeMenu === "format" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[140px] shadow-2xl"
                      >
                        <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                          Stream Format
                        </div>
                        {(["hls"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            onClick={() => {
                              updateSettings({ streamFormat: fmt });
                              setActiveMenu("none");
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-xs uppercase transition-colors",
                              settings.streamFormat === fmt
                                ? "bg-primary text-white"
                                : "hover:bg-white/10 text-white/80",
                            )}
                          >
                            {fmt}
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
                                if (hlsRef.current)
                                  hlsRef.current.audioTrack = idx;
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
                              if (hlsRef.current)
                                hlsRef.current.subtitleTrack = -1;
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
                                if (hlsRef.current)
                                  hlsRef.current.subtitleTrack = idx;
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

                {/* Quality */}
                {levels.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => handleMenuClick("quality")}
                      className={cn(
                        "p-2 rounded-full transition-colors",
                        activeMenu === "quality"
                          ? "bg-primary text-white"
                          : "hover:bg-white/10 text-white",
                      )}
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                    <AnimatePresence>
                      {activeMenu === "quality" && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[140px] shadow-2xl"
                        >
                          <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                            Quality
                          </div>
                          <button
                            onClick={() => {
                              if (hlsRef.current)
                                hlsRef.current.currentLevel = -1;
                              setActiveMenu("none");
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                              currentLevel === -1
                                ? "bg-primary text-white"
                                : "hover:bg-white/10 text-white/80",
                            )}
                          >
                            Auto
                          </button>
                          {levels.map((level, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                if (hlsRef.current)
                                  hlsRef.current.currentLevel = idx;
                                setActiveMenu("none");
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                                currentLevel === idx
                                  ? "bg-primary text-white"
                                  : "hover:bg-white/10 text-white/80",
                              )}
                            >
                              {level.height}p
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

const toProxyAssetUrl = (src?: string) => {
  if (!src || src.trim() === "") return "";
  if (/^https?:\/\//i.test(src)) {
    return `${window.location.origin}/api/proxy?url=${encodeURIComponent(src)}`;
  }
  return src;
};

const ChannelIcon = ({ src, alt }: { src: string; alt: string }) => {
  const resolvedSrc = toProxyAssetUrl(src);
  const [error, setError] = useState(
    () => !resolvedSrc || failedImageCache.has(resolvedSrc),
  );

  // Virtual lists reuse component instances with new props — the useState
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

const ChannelRow = ({ index, style, ...props }: any) => {
  const {
    filteredChannels,
    selectedChannelId,
    favorites,
    setSelectedChannel,
    setHoveredChannel,
  } = props;
  const channel = filteredChannels[index];
  if (!channel) return null;

  const isSelected = selectedChannelId === channel.stream_id;

  return (
    <div style={style}>
      <button
        onMouseEnter={() => setHoveredChannel?.(channel)}
        onFocus={() => setHoveredChannel?.(channel)}
        onClick={() => {
          setSelectedChannel(channel);
        }}
        className={cn(
          "flex items-center gap-4 w-full h-full px-6 text-left transition-all",
          "hover:bg-white/5 border-b border-white/5",
          isSelected && "bg-primary/20",
        )}
      >
        <div className="w-12 h-8 bg-white/5 rounded overflow-hidden flex-shrink-0">
          <ChannelIcon src={channel.stream_icon} alt={channel.name} />
        </div>
        <span
          className={cn(
            "text-lg font-medium truncate flex-1",
            isSelected ? "text-white" : "text-white/80",
          )}
        >
          {channel.name}
        </span>
        <div className="flex items-center gap-2">
          {isSelected && (
            <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded text-[10px] text-primary font-bold uppercase">
              <Play className="w-3 h-3 fill-primary" />
              Playing
            </div>
          )}
          {favorites.includes(channel.stream_id) && (
            <Star className="w-4 h-4 fill-primary text-primary" />
          )}
        </div>
      </button>
    </div>
  );
};

export default function LiveTV() {
  const navigate = useNavigate();
  const t = useT();
  const {
    activePlaylist,
    isConnected,
    playlistData,
    isFetchingLive,
    favorites,
    toggleFavorite,
    settings,
    isParentalUnlocked,
    unlockParental,
    lockParental,
  } = usePlaylist();

  // Default to first real category on first render
  const [activeCategory, setActiveCategory] = useState(() => {
    const cats = playlistData.liveCategories || [];
    return cats.length > 0 ? cats[0].category_id : "all";
  });
  const [selectedChannel, setSelectedChannel] = useState<LiveStream | null>(
    null,
  );
  const [hoveredChannel, setHoveredChannel] = useState<LiveStream | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const playerRef = useRef<HTMLVideoElement>(null);
  const warmedChannelUrlsRef = useRef<Set<string>>(new Set());
  const warmAbortRef = useRef<AbortController | null>(null);
  const [epgData, setEpgData] = useState<EpgProgram[]>([]);
  const [isEpgLoading, setIsEpgLoading] = useState(false);
  const [guideNow, setGuideNow] = useState(() => Date.now());
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pendingLockedCategoryId, setPendingLockedCategoryId] = useState<
    string | null
  >(null);
  const epgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // EPG is best-effort — many channels simply don't have it; swallow silently
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
    return cats.filter(
      (cat) => !settings.hiddenCategories.live.includes(cat.category_id),
    );
  }, [
    playlistData.liveCategories,
    settings.hiddenCategories.live,
    isParentalUnlocked,
  ]);

  const streams = useMemo(() => {
    const allStreams = playlistData.liveStreams || [];
    if (isParentalUnlocked) return allStreams;
    return allStreams.filter(
      (s) => !settings.hiddenCategories.live.includes(s.category_id),
    );
  }, [
    playlistData.liveStreams,
    settings.hiddenCategories.live,
    isParentalUnlocked,
  ]);

  const filteredChannels = useMemo(() => {
    if (!Array.isArray(streams)) return [];
    let filtered = streams.filter((c) => {
      // Filter out category divider rows (e.g., names like '##### General #####')
      if (/^#+\s*[^#]+\s*#+$/.test(c.name.trim())) return false;
      const matchesSearch = c.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        activeCategory === "all" || c.category_id === activeCategory;
      const matchesFav =
        activeCategory === "fav" ? favorites.live.includes(c.stream_id) : true;
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
  }, [streams, searchQuery, activeCategory, favorites.live, settings.liveSort]);

  // When categories load and we're still on "all", switch to first real category
  useEffect(() => {
    if (activeCategory === "all" && categories.length > 0) {
      setActiveCategory(categories[0].category_id);
    }
  }, [categories]);

  // Clear selected channel when category changes (don't auto-select)
  useEffect(() => {
    setSelectedChannel(null);
  }, [activeCategory]);

  const [listHeight, setListHeight] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  // TV navigation state
  const [focusIndex, setFocusIndex] = useState(0);
  // Color button action feedback
  const [colorAction, setColorAction] = useState<string>("");

  useEffect(() => {
    if (containerRef.current) {
      setListHeight(containerRef.current.offsetHeight);
    }

    const handleResize = () => {
      if (containerRef.current) {
        setListHeight(containerRef.current.offsetHeight);
      }
    };

    window.addEventListener("resize", handleResize);

    // TV remote navigation
    const onTVKey = (e) => {
      const key = e.detail?.key;
      if (!deferredChannels.length) return;
      if (["down", "up"].includes(key)) {
        setFocusIndex((prev) => {
          let next = key === "down" ? prev + 1 : prev - 1;
          if (next < 0) next = 0;
          if (next >= deferredChannels.length)
            next = deferredChannels.length - 1;
          setHoveredChannel(deferredChannels[next]);
          return next;
        });
      } else if (key === "enter") {
        setSelectedChannel(deferredChannels[focusIndex]);
      } else if (key === "red") {
        // Add/remove favorite
        const ch = deferredChannels[focusIndex];
        if (ch) {
          toggleFavorite("live", ch.stream_id);
          setColorAction(
            favorites.live.includes(ch.stream_id)
              ? "Removed from Favorites"
              : "Added to Favorites",
          );
          setTimeout(() => setColorAction(""), 1200);
        }
      } else if (["green", "yellow", "blue"].includes(key)) {
        setColorAction("Coming soon");
        setTimeout(() => setColorAction(""), 1200);
      }
    };
    window.addEventListener("tv-remote-key", onTVKey);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("tv-remote-key", onTVKey);
    };
  }, [filteredChannels.length, deferredChannels, focusIndex, favorites.live]);

  const deferredChannels = useDeferredValue(filteredChannels);

  const buildLiveChannelUrl = useCallback(
    (channel: LiveStream | null) => {
      if (
        !channel ||
        !activePlaylist?.host ||
        !activePlaylist?.username ||
        !activePlaylist?.password
      ) {
        return "";
      }
      return `${activePlaylist.host}/live/${activePlaylist.username}/${activePlaylist.password}/${channel.stream_id}.m3u8`;
    },
    [activePlaylist],
  );

  useEffect(() => {
    const currentIndex = selectedChannel
      ? filteredChannels.findIndex(
          (c) => c.stream_id === selectedChannel.stream_id,
        )
      : -1;

    const channelToWarm =
      hoveredChannel ||
      (currentIndex >= 0 ? (filteredChannels[currentIndex + 1] ?? null) : null);

    const url = buildLiveChannelUrl(channelToWarm);
    if (!url || warmedChannelUrlsRef.current.has(url)) return;

    warmedChannelUrlsRef.current.add(url);
    const controller = new AbortController();
    warmAbortRef.current?.abort();
    warmAbortRef.current = controller;

    fetch(
      `${window.location.origin}/api/proxy?url=${encodeURIComponent(url)}`,
      {
        signal: controller.signal,
        cache: "force-cache",
      },
    ).catch(() => {});

    return () => controller.abort();
  }, [hoveredChannel, selectedChannel, filteredChannels, buildLiveChannelUrl]);

  const itemData = useMemo(
    () => ({
      filteredChannels: deferredChannels,
      selectedChannelId: selectedChannel?.stream_id,
      favorites: favorites.live,
      setSelectedChannel,
      setHoveredChannel,
      focusIndex,
    }),
    [deferredChannels, selectedChannel?.stream_id, favorites.live, focusIndex],
  );

  const sidebarItems = useMemo(() => {
    if (!Array.isArray(streams))
      return [
        { id: "all", name: t.allChannels, count: 0 },
        { id: "fav", name: t.favorites, count: favorites.live.length },
      ];
    const counts: Record<string, number> = {};
    for (let i = 0; i < streams.length; i++) {
      const catId = streams[i].category_id;
      counts[catId] = (counts[catId] || 0) + 1;
    }

    return [
      { id: "all", name: t.allChannels, count: streams.length },
      { id: "fav", name: t.favorites, count: favorites.live.length },
      ...(categories || []).map((cat) => ({
        id: cat.category_id,
        name: cat.category_name,
        count: counts[cat.category_id] || 0,
        locked:
          (settings.parentalLockedCategories?.live || []).includes(
            cat.category_id,
          ) && !isParentalUnlocked,
      })),
    ];
  }, [streams, categories, favorites.live.length]);

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
    const locked = settings.parentalLockedCategories?.live || [];
    if (locked.includes(catId) && !isParentalUnlocked && settings.parentalPin) {
      setPendingLockedCategoryId(catId);
      setShowPinModal(true);
    } else {
      setActiveCategory(catId);
    }
  };

  const VirtualList = List as any;

  return (
    <div className="flex flex-col h-screen relative">
      {/* TV Color Buttons Bar */}
      <div className="fixed bottom-4 left-4 z-[100] flex flex-col items-start gap-2 pointer-events-none select-none">
        <div className="flex gap-2">
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-red-600" />
            <span className="text-xs text-white/80 font-bold">
              Add/Remove Fav
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-green-600" />
            <span className="text-xs text-white/60 font-bold">Action</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-yellow-400" />
            <span className="text-xs text-white/60 font-bold">Action</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 h-4 rounded bg-blue-600" />
            <span className="text-xs text-white/60 font-bold">Action</span>
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
                    className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-3xl tracking-[1em] text-center w-full focus:outline-none focus:border-primary"
                    placeholder="••••"
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
      <header className="flex items-center justify-between px-6 py-4 bg-black/40 border-b border-white/5">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="p-1 hover:bg-white/10 rounded-full"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <WeatherWidget />
            <nav className="flex items-center gap-6">
              <button
                onClick={() => navigate("/")}
                className="text-white/60 hover:text-white font-medium"
              >
                {t.home}
              </button>
              <button className="text-primary font-bold border-b-2 border-primary">
                {t.live}
              </button>
              <button
                onClick={() => navigate("/movies")}
                className="text-white/60 hover:text-white font-medium"
              >
                {t.movies}
              </button>
              <button
                onClick={() => navigate("/series")}
                className="text-white/60 hover:text-white font-medium"
              >
                {t.series}
              </button>
              <button
                onClick={() => navigate("/radio")}
                className="text-white/60 hover:text-white font-medium"
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
                "p-2 rounded-full transition-all",
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder={t.search}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-primary w-64"
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
          className="w-72"
        />

        {/* Channel List */}
        <div
          ref={containerRef}
          className="flex-1 bg-black/10 flex flex-col overflow-hidden border-r border-white/5"
        >
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
            <div className="flex-1">
              <VirtualList
                height={listHeight}
                width="100%"
                rowCount={deferredChannels.length}
                rowHeight={72}
                rowProps={itemData}
                rowComponent={ChannelRow}
                className="scrollbar-hide"
              />
            </div>
          ) : (
            <div className="p-8 text-center text-white/40">
              {t.noChannelsFound}
            </div>
          )}
        </div>

        {/* Preview Player */}
        <div className="w-[40%] flex flex-col bg-black/30">
          {isConnected ? (
            <>
              <div className="aspect-video w-full bg-black relative">
                {selectedChannel ? (
                  <MiniPlayer
                    videoRef={playerRef}
                    url={`${activePlaylist?.host}/live/${activePlaylist?.username}/${activePlaylist?.password}/${selectedChannel.stream_id}.m3u8`}
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
                        if (playerRef.current.requestFullscreen) {
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
                              {" — "}
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
