import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  SkipBack,
  SkipForward,
  Settings,
  ChevronLeft,
  Monitor,
  Music,
  Subtitles,
  PictureInPicture2,
  Gauge,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate, useLocation } from "react-router-dom";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { cn } from "../lib/utils";

export default function VideoPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    title: initialTitle = "Unknown",
    url: initialUrl = "",
    poster = "",
    extension = "" as string,
    seriesId = null as string | null,
    playlistId = null as string | null,
    episodeSeason = null as number | null,
    episodeNum = null as number | null,
    episodeTitle = null as string | null,
    seriesName = null as string | null,
  } = location.state || {};

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const previewHlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation counter: incremented on every effect cleanup so any pending
  // async callbacks (timers, HLS error handlers) can detect staleness and abort.
  const playbackGenRef = useRef(0);
  // When true, the global video `onError` handler is suppressed.
  const suppressNativeErrors = useRef(false);
  // Auto-retry counter for series 551 connection limit errors
  const autoRetryRef = useRef(0);
  const lastUrlForRetryRef = useRef<string>("");
  // Series progress tracking
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const lastVolumeRef = useRef(1);
  // Seek thumbnail preview
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const previewSeekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const previewPendingTimeRef = useRef<number | null>(null);
  const previewSeekingRef = useRef(false);
  const previewReadyRef = useRef(false);
  // Frame cache: key = rounded second, value = jpeg data-url
  const frameCacheRef = useRef<Map<number, string>>(new Map());

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [qualities, setQualities] = useState<
    { height: number; label: string }[]
  >([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<
    { id: number; name: string }[]
  >([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
  const [subtitleTracks, setSubtitleTracks] = useState<
    { id: number; name: string }[]
  >([]);
  const [currentSubtitle, setCurrentSubtitle] = useState(-1);
  const [aspectRatio, setAspectRatio] = useState<"contain" | "cover" | "fill">(
    "contain",
  );
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPipAvailable, setIsPipAvailable] = useState(false);
  const [activeMenu, setActiveMenu] = useState<
    "quality" | "audio" | "subtitle" | "aspect" | "speed" | "none"
  >("none");
  const [seekPreview, setSeekPreview] = useState<{
    x: number;
    time: number;
    dataUrl: string | null;
  } | null>(null);

  const proxiedUrl = initialUrl
    ? `${window.location.origin}/api/proxy?url=${encodeURIComponent(initialUrl)}`
    : "";

  const isLiveStream = initialUrl.includes("/live/");
  const isHlsStream =
    initialUrl.includes(".m3u8") ||
    initialUrl.includes("/hls/") ||
    isLiveStream;

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  // Mount / remount player on URL change or retry
  useEffect(() => {
    if (!videoRef.current || !proxiedUrl) return;
    const video = videoRef.current;
    setIsLoading(true);
    setError(null);
    setLoadingHint(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setQualities([]);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setCurrentAudioTrack(-1);
    setCurrentSubtitle(-1);
    setActiveMenu("none");

    const cleanUrl = initialUrl.split("?")[0].toLowerCase();
    const sourceExt = (
      extension ||
      cleanUrl.match(/\.([a-z0-9]+)$/)?.[1] ||
      ""
    ).toLowerCase();
    const isM3U8 = sourceExt === "m3u8" || cleanUrl.includes("/hls/");
    const isTS = sourceExt === "ts";
    const nativeFormats = new Set([
      "mp4",
      "webm",
      "ogg",
      "mkv",
      "avi",
      "mov",
      "m4v",
    ]);
    const isNative = nativeFormats.has(sourceExt);
    const isMovie = /\/movie\//.test(initialUrl);
    const isSeries = /\/series\//.test(initialUrl);
    // Reset auto-retry counter when a genuinely new URL is loaded (new episode/movie).
    // retryKey increments don't reset this — they're part of the same episode's retry loop.
    if (initialUrl !== lastUrlForRetryRef.current) {
      lastUrlForRetryRef.current = initialUrl;
      autoRetryRef.current = 0;
    }
    let destroyed = false;
    // Generation-counter guard against React StrictMode double-invocation.
    // Each mount gets a snapshot of the counter; cleanup increments it, making
    // any timer/callback from a previous mount a no-op.
    const myGen = ++playbackGenRef.current;
    const isStale = () => playbackGenRef.current !== myGen;
    let startTimer: ReturnType<typeof setTimeout> | null = null;

    const stopCurrentPlayback = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      try {
        video.pause();
      } catch {}
      video.removeAttribute("src");
      video.load();
    };

    // Shared transient-error handler: connection limit / busy upstream / ECONNRESET.
    const MAX_AUTO_RETRIES = 3;
    const handle551 = () => {
      if (isStale()) return;
      if (autoRetryRef.current < MAX_AUTO_RETRIES) {
        autoRetryRef.current++;
        const attempt = autoRetryRef.current;
        const waitSec = 8;
        let remaining = waitSec;
        stopCurrentPlayback();
        setIsLoading(true);
        setError(null);
        setLoadingHint(
          `Server busy or connection limit reached — retrying in ${remaining}s (${attempt}/${MAX_AUTO_RETRIES})`,
        );
        const countInterval = setInterval(() => {
          remaining--;
          if (remaining <= 0 || isStale()) {
            clearInterval(countInterval);
            return;
          }
          setLoadingHint(
            `Server busy or connection limit reached — retrying in ${remaining}s (${attempt}/${MAX_AUTO_RETRIES})`,
          );
        }, 1000);
        setTimeout(() => {
          clearInterval(countInterval);
          if (!isStale()) {
            setLoadingHint(null);
            setRetryKey((k) => k + 1);
          }
        }, waitSec * 1000);
      } else {
        autoRetryRef.current = 0;
        setLoadingHint(null);
        setError(
          "Connection limit reached. Close other active streams, then press Retry.",
        );
        setIsLoading(false);
      }
    };

    // Helper: try HLS.js with a given source URL
    const tryHls = (sourceUrl: string, onFail?: () => void) => {
      if (!Hls.isSupported()) {
        onFail?.();
        return;
      }
      stopCurrentPlayback();
      const proxied = `${window.location.origin}/api/proxy?url=${encodeURIComponent(sourceUrl)}`;
      const hls = new Hls({
        enableWorker: true,
        enableSoftwareAES: false,
        startLevel: -1,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.3,
        highBufferWatchdogPeriod: 3,
        nudgeMaxRetry: 3,
        abrEwmaDefaultEstimate: 1_000_000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.9,
        startFragPrefetch: false,
        progressive: true,
        fragLoadingMaxRetry: 0,
        levelLoadingMaxRetry: 0,
        manifestLoadingMaxRetry: 0,
        fragLoadingTimeOut: 45000,
        manifestLoadingTimeOut: 30000,
        levelLoadingTimeOut: 30000,
      });
      hlsRef.current = hls;
      hls.loadSource(proxied);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels.map((l, i) => ({
          height: l.height || i,
          label: l.height ? `${l.height}p` : `Track ${i + 1}`,
        }));
        setQualities(levels);
        setCurrentQuality(hls.currentLevel);
        setAudioTracks(
          (hls.audioTracks || []).map((t, i) => ({
            id: i,
            name: t.name || `Track ${i + 1}`,
          })),
        );
        setCurrentAudioTrack(hls.audioTrack);
        setSubtitleTracks(
          (hls.subtitleTracks || []).map((t, i) => ({
            id: i,
            name: t.name || `Track ${i + 1}`,
          })),
        );
        setCurrentSubtitle(hls.subtitleTrack);
        suppressNativeErrors.current = false;
        setIsLoading(false);
        video.play().catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) =>
        setCurrentQuality(data.level),
      );
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) =>
        setCurrentAudioTrack(data.id),
      );
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_e, data) =>
        setCurrentSubtitle(data.id),
      );

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        hls.destroy();
        hlsRef.current = null;
        if (isStale()) return;
        // 551 = connection limit: don't cascade to next format, auto-retry instead
        if (data.response?.code === 551) {
          handle551();
          return;
        }
        if (onFail) {
          setTimeout(() => {
            if (!isStale()) onFail();
          }, 3000);
        } else {
          setError(
            "Stream failed to load. The server may be unavailable or the format is unsupported.",
          );
          setIsLoading(false);
        }
      });
    };

    // Helper: try mpegts.js for MPEG-TS or any format the browser can't handle
    const tryMpegts = (
      urlOverride?: string | (() => void),
      onFail?: () => void,
    ) => {
      // Support old call signature tryMpegts(onFail?) where first arg is callback
      let streamUrl: string = proxiedUrl;
      let failCb = onFail;
      if (typeof urlOverride === "function") {
        failCb = urlOverride;
      } else if (typeof urlOverride === "string") {
        streamUrl = urlOverride;
      }
      if (
        !mpegts.getFeatureList().mseLivePlayback &&
        !mpegts.getFeatureList().msePlayback
      ) {
        setError("This format is not supported by your browser.");
        setIsLoading(false);
        return;
      }
      try {
        stopCurrentPlayback();
        mpegtsRef.current = mpegts.createPlayer(
          {
            type: "mpegts",
            url: streamUrl,
            isLive: false,
            cors: true,
            withCredentials: false,
          },
          {
            enableWorker: true,
            stashInitialSize: 1024 * 512,
            enableStashBuffer: true,
            autoCleanupSourceBuffer: true,
            lazyLoad: false,
            deferLoadAfterSourceOpen: false,
          },
        );
        mpegtsRef.current.attachMediaElement(video);
        mpegtsRef.current.load();
        const p = mpegtsRef.current.play();
        if (p instanceof Promise) p.catch(() => {});

        mpegtsRef.current.on(
          mpegts.Events.ERROR,
          (type: string, detail: string, ...errArgs: any[]) => {
            console.error("mpegts.js error:", type, detail);
            if (mpegtsRef.current) {
              mpegtsRef.current.destroy();
              mpegtsRef.current = null;
            }
            if (isStale()) return;
            // 551 = connection limit: errArgs[0] may be {code, msg}
            const errInfo = errArgs[0] as
              | { code?: number; msg?: string }
              | undefined;
            const is551 =
              errInfo?.code === 551 || String(detail).includes("551");
            if (is551) {
              handle551();
              return;
            }
            if (failCb) {
              setTimeout(() => {
                if (!isStale()) failCb!();
              }, 3000);
            } else {
              setError(
                "Stream failed to load. The server may be unavailable or the format is unsupported.",
              );
              setIsLoading(false);
            }
          },
        );
        mpegtsRef.current.on(mpegts.Events.METADATA_ARRIVED, () => {
          suppressNativeErrors.current = false;
          setIsLoading(false);
        });
      } catch (e) {
        console.error("Failed to initialize mpegts.js:", e);
        // Last resort native fallback
        video.src = proxiedUrl;
        video.load();
      }
    };

    // Helper: try native video element with a proxied URL, with delay before calling onFail
    const tryNative = (sourceUrl: string, onFail?: () => void) => {
      if (isStale()) return;
      suppressNativeErrors.current = true;
      stopCurrentPlayback();
      const proxied = `${window.location.origin}/api/proxy?url=${encodeURIComponent(sourceUrl)}`;
      let failed = false;
      const onError = () => {
        if (failed || isStale()) return;
        failed = true;
        video.removeEventListener("error", onError);
        video.removeAttribute("src");
        video.load();
        if (onFail) {
          setTimeout(() => {
            if (!isStale()) onFail();
          }, 3000);
        } else {
          setError(
            "Stream failed to load. The server may be unavailable or the format is unsupported.",
          );
          setIsLoading(false);
        }
      };
      video.addEventListener("error", onError);
      video.src = proxied;
      video.load();
    };

    startTimer = setTimeout(() => {
      startTimer = null;
      if (isStale()) return;

      if (isM3U8 && Hls.isSupported()) {
        tryHls(initialUrl);
      } else if (isM3U8 && video.canPlayType("application/vnd.apple.mpegurl")) {
        stopCurrentPlayback();
        video.src = proxiedUrl;
        video.load();
      } else if (isTS) {
        tryMpegts();
      } else if (isNative || isMovie || isSeries) {
        tryNative(initialUrl, () => {
          handle551();
        });
      } else {
        tryNative(initialUrl, () => tryMpegts());
      }
    }, 0);

    return () => {
      destroyed = true;
      suppressNativeErrors.current = false;
      setLoadingHint(null);
      // Increment generation: all pending callbacks for this mount become no-ops
      playbackGenRef.current++;
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        mpegtsRef.current.destroy();
        mpegtsRef.current = null;
      }
      video.src = "";
    };
  }, [proxiedUrl, retryKey, initialUrl]);

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onTimeUpdate = () => {
      currentTimeRef.current = video.currentTime;
      setCurrentTime(video.currentTime);
    };
    const onDurationChange = () => {
      if (isFinite(video.duration)) {
        durationRef.current = video.duration;
        setDuration(video.duration);
      }
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const onError = () => {
      // Suppress while a fallback chain is managing video errors internally
      if (suppressNativeErrors.current) return;
      const err = video.error;
      if (err) {
        setError(
          `Playback error (${err.code}): ${err.message || "The format or source is unsupported."}`,
        );
        setIsLoading(false);
      }
    };
    const onLoadedMetadata = () => {
      setIsLoading(false);
      if (isFinite(video.duration)) setDuration(video.duration);
      video.play().catch(() => {});
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("error", onError);
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("error", onError);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // PiP support detection
  useEffect(() => {
    setIsPipAvailable(!!document.pictureInPictureEnabled);
  }, []);

  // Prepare a hidden preview video so hovering can fetch a frame even from unwatched parts.
  // It lazy-loads only when needed and keeps one seek in flight at a time.
  useEffect(() => {
    frameCacheRef.current.clear();
    previewReadyRef.current = false;
    previewSeekingRef.current = false;
    previewPendingTimeRef.current = null;

    if (previewSeekTimeoutRef.current) {
      clearTimeout(previewSeekTimeoutRef.current);
      previewSeekTimeoutRef.current = null;
    }

    if (previewHlsRef.current) {
      previewHlsRef.current.destroy();
      previewHlsRef.current = null;
    }

    const preview = previewVideoRef.current;
    if (!preview) return;

    preview.pause();
    preview.removeAttribute("src");
    preview.load();
    preview.preload = "metadata";
    preview.muted = true;

    const flushPendingSeek = () => {
      if (
        !previewReadyRef.current ||
        previewSeekingRef.current ||
        previewPendingTimeRef.current == null
      ) {
        return;
      }
      const target = previewPendingTimeRef.current;
      previewPendingTimeRef.current = null;
      previewSeekingRef.current = true;
      try {
        preview.currentTime = target;
      } catch {
        previewSeekingRef.current = false;
      }
    };

    const capturePreview = () => {
      const canvas = thumbCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      try {
        ctx.drawImage(preview, 0, 0, 160, 90);
        const key = Math.round(preview.currentTime);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        frameCacheRef.current.set(key, dataUrl);
        setSeekPreview((prev) => {
          if (!prev) return null;
          if (Math.abs(prev.time - key) <= 1.5 || !prev.dataUrl) {
            return { ...prev, dataUrl };
          }
          return prev;
        });
      } catch {}
    };

    const onLoadedMetadata = () => {
      previewReadyRef.current = true;
      flushPendingSeek();
    };

    const onSeeked = () => {
      previewSeekingRef.current = false;
      capturePreview();
      flushPendingSeek();
    };

    const onError = () => {
      previewSeekingRef.current = false;
    };

    preview.addEventListener("loadedmetadata", onLoadedMetadata);
    preview.addEventListener("seeked", onSeeked);
    preview.addEventListener("error", onError);

    return () => {
      preview.removeEventListener("loadedmetadata", onLoadedMetadata);
      preview.removeEventListener("seeked", onSeeked);
      preview.removeEventListener("error", onError);
      if (previewHlsRef.current) {
        previewHlsRef.current.destroy();
        previewHlsRef.current = null;
      }
      preview.pause();
      preview.removeAttribute("src");
      preview.load();
    };
  }, [proxiedUrl]);

  // Capture frames from the main video as it plays for instant local previews.
  useEffect(() => {
    if (isHlsStream) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = thumbCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.seeking) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      try {
        ctx.drawImage(video, 0, 0, 160, 90);
        const key = Math.round(video.currentTime);
        frameCacheRef.current.set(key, canvas.toDataURL("image/jpeg", 0.65));
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [isHlsStream]);

  // Cleanup controls timer on unmount
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // Series watch progress — save every 5s and on unmount
  useEffect(() => {
    if (!seriesId || !playlistId) return;

    const saveProgress = () => {
      const ct = currentTimeRef.current;
      const dur = durationRef.current;
      if (!dur || ct < 3) return; // don't save if barely started
      const completed = dur > 0 && ct / dur > 0.95;
      const key = `nova_progress_series_${playlistId}`;
      try {
        const raw = localStorage.getItem(key);
        const store: Record<string, any> = raw ? JSON.parse(raw) : {};
        if (completed) {
          // Remove entry so series is no longer shown as in-progress
          delete store[String(seriesId)];
        } else {
          store[String(seriesId)] = {
            episodeId: initialUrl.split("/").pop()?.split(".")[0] ?? "",
            season: episodeSeason,
            episodeNum,
            episodeTitle,
            seriesName,
            currentTime: Math.floor(ct),
            duration: Math.floor(dur),
            updatedAt: Date.now(),
          };
        }
        localStorage.setItem(key, JSON.stringify(store));
      } catch {}
    };

    progressIntervalRef.current = setInterval(saveProgress, 5000);

    return () => {
      if (progressIntervalRef.current)
        clearInterval(progressIntervalRef.current);
      saveProgress(); // save on unmount
    };
  }, [
    seriesId,
    playlistId,
    episodeSeason,
    episodeNum,
    episodeTitle,
    seriesName,
    initialUrl,
  ]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;

    if (v.muted || v.volume === 0) {
      const restoredVolume =
        lastVolumeRef.current > 0 ? lastVolumeRef.current : 1;
      v.volume = restoredVolume;
      v.muted = false;
      setVolume(restoredVolume);
      setIsMuted(false);
    } else {
      lastVolumeRef.current = v.volume > 0 ? v.volume : lastVolumeRef.current;
      v.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    if (val > 0) lastVolumeRef.current = val;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = parseFloat(e.target.value);
  };

  const skip = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(
      0,
      Math.min(v.currentTime + seconds, v.duration || 0),
    );
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const changeQuality = (level: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level;
      setCurrentQuality(level);
    }
    setActiveMenu("none");
  };

  const changeAudioTrack = (id: number) => {
    if (hlsRef.current) hlsRef.current.audioTrack = id;
    setCurrentAudioTrack(id);
    setActiveMenu("none");
  };

  const changeSubtitle = (id: number) => {
    if (hlsRef.current) hlsRef.current.subtitleTrack = id;
    setCurrentSubtitle(id);
    setActiveMenu("none");
  };

  const changeSpeed = (speed: number) => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setPlaybackSpeed(speed);
    setActiveMenu("none");
  };

  const togglePip = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (_) {}
  };

  const toggleMenu = (menu: typeof activeMenu) => {
    setActiveMenu((prev) => (prev === menu ? "none" : menu));
  };

  const canChangeQuality = qualities.length > 1;

  const requestPreviewFrame = useCallback(
    (time: number) => {
      if (isLiveStream || !duration || !proxiedUrl) return;
      const bucket = Math.round(time);
      if (frameCacheRef.current.has(bucket)) return;

      const preview = previewVideoRef.current;
      if (!preview) return;

      if (!preview.currentSrc && !preview.src) {
        preview.muted = true;
        preview.preload = "metadata";

        if (isHlsStream) {
          if (Hls.isSupported()) {
            if (!previewHlsRef.current) {
              const previewHls = new Hls({
                enableWorker: true,
                startFragPrefetch: false,
                maxBufferLength: 8,
                maxMaxBufferLength: 12,
                maxBufferSize: 8 * 1000 * 1000,
                manifestLoadingMaxRetry: 0,
                levelLoadingMaxRetry: 0,
                fragLoadingMaxRetry: 0,
              });
              previewHls.on(Hls.Events.MANIFEST_PARSED, () => {
                previewReadyRef.current = true;
                if (
                  previewPendingTimeRef.current != null &&
                  !previewSeekingRef.current
                ) {
                  const target = previewPendingTimeRef.current;
                  previewPendingTimeRef.current = null;
                  previewSeekingRef.current = true;
                  try {
                    preview.currentTime = target;
                  } catch {
                    previewSeekingRef.current = false;
                  }
                }
              });
              previewHlsRef.current = previewHls;
              previewHls.loadSource(proxiedUrl);
              previewHls.attachMedia(preview);
            }
          } else if (preview.canPlayType("application/vnd.apple.mpegurl")) {
            preview.src = proxiedUrl;
            preview.load();
          } else {
            return;
          }
        } else {
          preview.src = proxiedUrl;
          preview.load();
        }
      }

      previewPendingTimeRef.current = Math.max(
        0,
        Math.min(bucket, Math.max(0, duration - 0.2)),
      );

      if (previewSeekTimeoutRef.current) {
        clearTimeout(previewSeekTimeoutRef.current);
      }

      previewSeekTimeoutRef.current = setTimeout(() => {
        previewSeekTimeoutRef.current = null;
        const previewEl = previewVideoRef.current;
        if (
          !previewEl ||
          !previewReadyRef.current ||
          previewSeekingRef.current ||
          previewPendingTimeRef.current == null
        ) {
          return;
        }
        const target = previewPendingTimeRef.current;
        previewPendingTimeRef.current = null;
        previewSeekingRef.current = true;
        try {
          previewEl.currentTime = target;
        } catch {
          previewSeekingRef.current = false;
        }
      }, 120);
    },
    [duration, isHlsStream, isLiveStream, proxiedUrl],
  );

  const handleSeekBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const bar = seekBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const raw = e.clientX - rect.left;
    // Clamp preview x so the 160px thumbnail never overflows the bar edges
    const HALF = 80;
    const x = Math.max(HALF, Math.min(raw, rect.width - HALF));
    const time = Math.max(0, Math.min((raw / rect.width) * duration, duration));

    // Find nearest cached frame — instant when available.
    const cache = frameCacheRef.current;
    let dataUrl: string | null = null;
    if (cache.size > 0) {
      let bestKey = 0;
      let bestDist = Infinity;
      for (const key of cache.keys()) {
        const dist = Math.abs(key - time);
        if (dist < bestDist) {
          bestDist = dist;
          bestKey = key;
        }
      }
      if (bestDist <= 2) dataUrl = cache.get(bestKey) ?? null;
    }

    setSeekPreview({ x, time, dataUrl });

    if (!isLiveStream) {
      requestPreviewFrame(time);
    }
  };

  const handleSeekBarMouseLeave = () => {
    if (previewSeekTimeoutRef.current) {
      clearTimeout(previewSeekTimeoutRef.current);
      previewSeekTimeoutRef.current = null;
    }
    previewPendingTimeRef.current = null;
    setSeekPreview(null);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col w-full h-screen bg-black text-white overflow-hidden"
      onMouseMove={resetControlsTimer}
      onClick={() => {
        resetControlsTimer();
        setActiveMenu("none");
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 w-full h-full bg-black",
          aspectRatio === "contain" && "object-contain",
          aspectRatio === "cover" && "object-cover",
          aspectRatio === "fill" && "object-fill",
        )}
        style={{ transform: "translateZ(0)", willChange: "transform" }}
        playsInline
        poster={poster || undefined}
      />

      {/* Loading overlay */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none gap-3">
          <Loader2 className="w-14 h-14 text-primary animate-spin drop-shadow-lg" />
          {loadingHint && (
            <p className="text-white/70 text-sm max-w-xs text-center px-4">
              {loadingHint}
            </p>
          )}
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 gap-6 bg-black/80 p-8 text-center">
          <p className="text-red-400 text-lg max-w-lg">{error}</p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                setRetryKey((k) => k + 1);
              }}
              className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl font-bold transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-between z-10 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.85) 100%)",
        }}
      >
        {/* Top bar */}
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 bg-black/30 hover:bg-white/20 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold truncate drop-shadow">
            {initialTitle}
          </h1>
        </div>

        {/* Centre click zone — toggle play */}
        <div
          className="flex-1 flex items-center justify-center cursor-pointer"
          onClick={togglePlay}
        >
          {!isLoading && !isPlaying && (
            <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-10 h-10 fill-white text-white ml-1" />
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col gap-2 px-4 pb-4">
          {/* Seek bar with thumbnail preview */}
          <div className="flex items-center gap-3 text-sm">
            <span className="w-14 text-right font-mono text-white/80">
              {formatTime(currentTime)}
            </span>
            <div
              ref={seekBarRef}
              className="flex-1 relative"
              onMouseMove={handleSeekBarMouseMove}
              onMouseLeave={handleSeekBarMouseLeave}
            >
              {/* Thumbnail popup */}
              {seekPreview && (
                <div
                  className="absolute bottom-full mb-3 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1 z-50"
                  style={{ left: seekPreview.x }}
                >
                  {seekPreview.dataUrl ? (
                    <img
                      src={seekPreview.dataUrl}
                      className="w-40 h-[90px] rounded-lg border border-white/20 shadow-2xl object-cover"
                      alt=""
                    />
                  ) : (
                    <div className="w-40 h-[90px] rounded-lg border border-white/20 shadow-2xl bg-black/85 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-white/70" />
                    </div>
                  )}
                  <span className="bg-black/80 text-white text-xs font-mono px-2 py-0.5 rounded shadow">
                    {formatTime(seekPreview.time)}
                  </span>
                </div>
              )}
              <input
                type="range"
                className="w-full accent-primary h-1.5 cursor-pointer"
                min={0}
                max={duration || 100}
                step={0.5}
                value={currentTime}
                onChange={handleSeek}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <span className="w-14 font-mono text-white/80">
              {formatTime(duration)}
            </span>
          </div>

          {/* Buttons row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 fill-white" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skip(-10);
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skip(10);
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <SkipForward className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                className="w-24 accent-primary h-1.5 cursor-pointer"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Quality */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canChangeQuality) toggleMenu("quality");
                  }}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold",
                    canChangeQuality
                      ? activeMenu === "quality"
                        ? "bg-primary text-white"
                        : "bg-white/10 hover:bg-white/20"
                      : "bg-white/5 text-white/45 cursor-not-allowed",
                  )}
                  title={
                    canChangeQuality
                      ? "Quality"
                      : "This movie or series has only one source quality"
                  }
                  disabled={!canChangeQuality}
                >
                  <Settings className="w-4 h-4" />
                  {canChangeQuality
                    ? currentQuality === -1
                      ? "Auto"
                      : (qualities[currentQuality]?.label ?? "Auto")
                    : "Source"}
                </button>
                <AnimatePresence>
                  {canChangeQuality && activeMenu === "quality" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[130px] shadow-2xl z-30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                        Quality
                      </div>
                      <button
                        onClick={() => changeQuality(-1)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                          currentQuality === -1
                            ? "bg-primary text-white"
                            : "hover:bg-white/10 text-white/80",
                        )}
                      >
                        Auto
                      </button>
                      {qualities.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => changeQuality(i)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                            currentQuality === i
                              ? "bg-primary text-white"
                              : "hover:bg-white/10 text-white/80",
                          )}
                        >
                          {q.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Audio Tracks */}
              {audioTracks.length > 1 && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMenu("audio");
                    }}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      activeMenu === "audio"
                        ? "bg-primary text-white"
                        : "hover:bg-white/10",
                    )}
                    title="Audio Track"
                  >
                    <Music className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {activeMenu === "audio" && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[140px] shadow-2xl z-30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                          Audio
                        </div>
                        {audioTracks.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => changeAudioTrack(t.id)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                              currentAudioTrack === t.id
                                ? "bg-primary text-white"
                                : "hover:bg-white/10 text-white/80",
                            )}
                          >
                            {t.name}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMenu("subtitle");
                    }}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      activeMenu === "subtitle"
                        ? "bg-primary text-white"
                        : "hover:bg-white/10",
                    )}
                    title="Subtitles"
                  >
                    <Subtitles className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {activeMenu === "subtitle" && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[140px] shadow-2xl z-30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                          Subtitles
                        </div>
                        <button
                          onClick={() => changeSubtitle(-1)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                            currentSubtitle === -1
                              ? "bg-primary text-white"
                              : "hover:bg-white/10 text-white/80",
                          )}
                        >
                          Off
                        </button>
                        {subtitleTracks.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => changeSubtitle(t.id)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                              currentSubtitle === t.id
                                ? "bg-primary text-white"
                                : "hover:bg-white/10 text-white/80",
                            )}
                          >
                            {t.name}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Aspect Ratio */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMenu("aspect");
                  }}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    activeMenu === "aspect"
                      ? "bg-primary text-white"
                      : "hover:bg-white/10",
                  )}
                  title="Aspect Ratio"
                >
                  <Monitor className="w-5 h-5" />
                </button>
                <AnimatePresence>
                  {activeMenu === "aspect" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[130px] shadow-2xl z-30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                        Aspect Ratio
                      </div>
                      {(["contain", "cover", "fill"] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            setAspectRatio(r);
                            setActiveMenu("none");
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm capitalize transition-colors",
                            aspectRatio === r
                              ? "bg-primary text-white"
                              : "hover:bg-white/10 text-white/80",
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Playback Speed */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMenu("speed");
                  }}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    activeMenu === "speed"
                      ? "bg-primary text-white"
                      : "hover:bg-white/10",
                  )}
                  title="Playback Speed"
                >
                  <Gauge className="w-5 h-5" />
                </button>
                <AnimatePresence>
                  {activeMenu === "speed" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-xl p-2 min-w-[130px] shadow-2xl z-30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[10px] font-bold text-white/40 uppercase px-3 py-1">
                        Speed
                      </div>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                        <button
                          key={s}
                          onClick={() => changeSpeed(s)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                            playbackSpeed === s
                              ? "bg-primary text-white"
                              : "hover:bg-white/10 text-white/80",
                          )}
                        >
                          {s === 1 ? "Normal" : `${s}×`}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* PiP */}
              {isPipAvailable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePip();
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Picture in Picture"
                >
                  <PictureInPicture2 className="w-5 h-5" />
                </button>
              )}

              {/* Fullscreen */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5" />
                ) : (
                  <Maximize2 className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden preview elements for frame capture */}
      <video
        ref={previewVideoRef}
        className="absolute -left-[9999px] top-0 w-px h-px opacity-0 pointer-events-none"
        muted
        playsInline
        preload="metadata"
      />
      <canvas
        ref={thumbCanvasRef}
        className="absolute -left-[9999px] top-0 w-px h-px opacity-0 pointer-events-none"
        width={160}
        height={90}
      />
    </div>
  );
}
