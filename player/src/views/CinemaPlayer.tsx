import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Loader2, Maximize2, Minimize2, Pause, Play, Settings, SkipBack, SkipForward, VolumeX, Volume2, Music, Subtitles } from "lucide-react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { trySwitchPlatformAudioTrack, trySwitchPlatformSubtitleTrack, startPlatformPlayback, platformSupportsEngine, webosRegisterTrack, webosUnregisterTrack, webosGetTracks, normalizePlatformTracks, getPlatformName, webosReadNativeTracks } from "../lib/platformPlayer";
import { findActiveSubtitleCue } from "../lib/subtitles";
import { isLowPowerTV } from "../lib/tv";
import { reportPlaybackDebug } from "../lib/playbackDebug";
import { getMediaApiBaseUrl } from "../lib/activationApi";
import { usePlaylist } from "../context/PlaylistContext";
import { cn } from "../lib/utils";

type TrackItem = {
  id: number;
  name: string;
  codec?: string;
  lang?: string;
  absIndex?: number;
};

type SubtitleCueItem = {
  start: number;
  end: number;
  text: string;
};

type TrackSummaryItem = {
  idx: number;
  type: string;
  codec: string | null;
  lang: string | null;
  title: string | null;
  default: number;
  forced: number;
};

type SubtitleLanguageItem = {
  code: string;
  label: string;
  trackIds: number[];
};

type SettingsTab = "audio" | "subtitle" | "display";
type PlaybackMode = "proxy-range" | "stream-ts-fallback" | "remux-fallback";

const resolveTrackIndex = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isTimeBuffered = (
  video: HTMLVideoElement,
  time: number,
  tolerance = 0.75,
): boolean => {
  const ranges = video.buffered;
  for (let index = 0; index < ranges.length; index += 1) {
    const start = ranges.start(index) - tolerance;
    const end = ranges.end(index) + tolerance;
    if (time >= start && time <= end) {
      return true;
    }
  }
  return false;
};

const parseDurationToSeconds = (raw: unknown): number => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    const iso = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
    if (iso) {
      const h = parseFloat(iso[1] || "0");
      const m = parseFloat(iso[2] || "0");
      const sec = parseFloat(iso[3] || "0");
      return h * 3600 + m * 60 + sec;
    }
    if (s.includes(":")) {
      const parts = s.split(":").map((p) => parseFloat(p.replace(",", ".")));
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 1) return parts[0];
    }
    const f = parseFloat(s);
    return Number.isFinite(f) && f > 0 ? f : 0;
  }
  return 0;
};

const toLanguageLabel = (code: string): string => {
  if (!code) return "Unknown";
  const normalized = String(code || "").trim().toLowerCase();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    if (/^[a-z]{2}$/.test(normalized)) {
      return dn.of(normalized) || code;
    }
    const map3to2: Record<string, string> = {
      eng: "en",
      chi: "zh",
      zho: "zh",
      fre: "fr",
      ger: "de",
      spa: "es",
      kor: "ko",
      jpn: "ja",
      por: "pt",
      rus: "ru",
      ita: "it",
    };
    const maybe = map3to2[normalized];
    if (maybe) return dn.of(maybe) || code;
    return code;
  } catch {
    return code;
  }
};

const parseClock = (input: string): number => {
  if (!input) return 0;
  const s = String(input).trim().replace(/,/g, ".");
  const parts = s.split(":").map((p) => parseFloat(p));
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : 0;
};

const cleanSubtitleText = (raw: string): string => {
  if (!raw) return "";
  let t = String(raw).replace(/\r/g, "").trim();
  t = t.replace(/^WEBVTT[^\n]*\n?/, "");
  t = t.replace(/^\d+\s*\n/, "");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/\n{2,}/g, "\n");
  t = t.split("\n").map((l) => l.trim()).join("\n");
  return t;
};

const getAvailableSubtitleLanguages = (
  summary: TrackSummaryItem[],
): SubtitleLanguageItem[] => {
  const byLang = new Map<string, number[]>();
  for (const stream of summary) {
    if (stream.type !== "subtitle") continue;
    const code = String(stream.lang || "und").toUpperCase();
    const list = byLang.get(code) || [];
    list.push(stream.idx);
    byLang.set(code, list);
  }

  return Array.from(byLang.entries())
    .map(([code, trackIds]) => ({
      code,
      label: toLanguageLabel(code),
      trackIds,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const getPreferredAudioTrackId = (tracks: TrackItem[], selectedId: number): number => {
  if (tracks.length === 0) return -1;
  if (selectedId >= 0 && tracks.some((track) => track.id === selectedId)) {
    return selectedId;
  }
  return tracks[0]?.id ?? -1;
};

const parseVttOrSrt = (input: string): SubtitleCueItem[] => {
  const text = (input || "").replace(/^\uFEFF/, "");
  const re = /((?:\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{2,3})(?:[^\n]*)\n([\s\S]*?)(?=\n\n|$)/g;
  const cues: SubtitleCueItem[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const start = parseClock(m[1]);
    const end = parseClock(m[2]);
    const body = cleanSubtitleText(m[3].replace(/^\d+\s*\n/, ""));
    if (!body) continue;
    cues.push({ start, end: Math.max(end, start + 0.03), text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
};

const parseAss = (input: string): SubtitleCueItem[] => {
  const lines = (input || "").replace(/\r/g, "").split("\n");
  const cues: SubtitleCueItem[] = [];
  for (const line of lines) {
    if (!line.startsWith("Dialogue:")) continue;
    const payload = line.slice("Dialogue:".length).trim();
    const parts = payload.split(",");
    if (parts.length < 10) continue;
    const start = parseClock(parts[1]);
    const end = parseClock(parts[2]);
    const text = cleanSubtitleText(parts.slice(9).join(","));
    if (!text) continue;
    cues.push({ start, end: Math.max(end, start + 0.03), text });
  }
  return cues.sort((a, b) => a.start - b.start);
};

const parseSubtitlePayload = (payload: string): SubtitleCueItem[] => {
  const text = payload || "";
  if (text.includes("Dialogue:") || text.includes("[Script Info]")) {
    const ass = parseAss(text);
    if (ass.length > 0) return ass;
  }
  return parseVttOrSrt(text);
};

const getCueIndexBinary = (cues: SubtitleCueItem[], time: number): number => {
  let lo = 0;
  let hi = cues.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid];
    if (cue.end < time) lo = mid + 1;
    else {
      ans = mid;
      hi = mid - 1;
    }
  }
  return ans;
};

const waitWithAbort = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

export default function CinemaPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const closePlayer = useCallback(() => {
    try {
      const s = (location.state || {}) as any;
      const from = typeof s?.from === "string" ? s.from : null;
      const returnCategory = s?.returnCategory;
      if (from) {
        navigate(from, { state: { returnCategory } });
      } else {
        navigate(-1);
      }
    } catch {
      navigate(-1);
    }
  }, [location, navigate]);
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
    streamInfo = null as any,
    episodes = null as any[] | null,
    currentIndex = null as number | null,
  } = location.state || {};

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);
  const platformPlayerRef = useRef<any>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitlePointerRef = useRef(0);
  const subtitleLastTimeRef = useRef(0);
  const subtitleLastTextRef = useRef("");
  const subtitleRafRef = useRef<number | null>(null);
  const subtitleFetchAbortRef = useRef<AbortController | null>(null);
  const subtitleLoadingRef = useRef(false);
  const subtitleLastFetchMetaRef = useRef<{trackId:number,cuesCount:number,chars:number,ts:number,forceFull:boolean}|null>(null);
  // Stable ref so event handlers (useEffect with []) can always call the latest version.
  const fetchSubtitleCuesRef = useRef<((trackId: number, seekOverride?: number) => Promise<any>) | null>(null);
  const subtitleResumeAfterLoadRef = useRef(false);
  const subtitleSwitchSeqRef = useRef(0);
  const subtitleInterruptionRef = useRef(false);
  const nextEpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seek offset for TS streams started via startFastTsPlayback.
  // Because we removed -copyts from the backend, the TS output PTS always starts from 0.
  // This ref stores the content position where the current TS stream began so that
  // effectiveCurrentTime = video.currentTime + streamSeekOffsetRef.current.
  const streamSeekOffsetRef = useRef(0);
  // Subtitle refs mirror the corresponding state values so the RAF loop can
  // read fresh values without being recreated on every state change.
  const selectedSubtitleRef = useRef(-1);
  const subtitleCuesRef = useRef<SubtitleCueItem[]>([]);
  const nativeSubtitleActiveRef = useRef(false);
  const subtitleOffsetMsRef = useRef(0);
  const fastTsFallbackRef = useRef(false);
  const ffprobeAvailable = useRef(false);
  const originalStreamUrl = useRef(initialUrl);
  const lastVolumeRef = useRef(1);
  const settingsOpenRef = useRef(false);
  const inferredDurationRef = useRef(0);
  const remuxFallbackTriedRef = useRef(false);
  const startNativePlaybackRef = useRef<(
    seekSec?: number,
    preferProxy?: boolean,
  ) => void>(() => {});
  const startFastTsPlaybackRef = useRef<(seekSec?: number, audioIdx?: number) => void>(() => {});
  const isLiveStreamRef = useRef(false);
  const forceProxyPlaybackRef = useRef(false);
  const usingDirectPlaybackRef = useRef(false);
  const userPausedRef = useRef(false);
  const failingOverToProxyRef = useRef(false);
  const selectedAudioRef = useRef(-1);
  const currentFastTsAudioRef = useRef(-1);
  const audioTracksRef = useRef<TrackItem[]>([]);
  const subtitleTracksRef = useRef<TrackItem[]>([]);
  const remuxSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMkvSourceRef = useRef(false);
  const preferNativeMkvRef = useRef(false);
  const playbackModeRef = useRef<PlaybackMode | null>(null);

  const { settings, updateSettings, activePlaylist } = usePlaylist();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioTracks, setAudioTracks] = useState<TrackItem[]>([]);
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackItem[]>([]);
  const [trackSummary, setTrackSummary] = useState<TrackSummaryItem[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [nativeSubtitleActive, setNativeSubtitleActive] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCueItem[]>([]);
  const [subtitleText, setSubtitleText] = useState("");
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  const [audioOffsetMs, setAudioOffsetMs] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("audio");
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const settingsCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsAsideRef = useRef<HTMLElement | null>(null);
  const audioCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const subtitleCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);

  const proxiedUrl = useMemo(() => {
    if (!initialUrl) return "";
    const base = getMediaApiBaseUrl() || window.location.origin;
    return `${base.replace(/\/$/, "")}/api/proxy?url=${encodeURIComponent(initialUrl)}&owner=1`;
  }, [initialUrl]);

  const fastTsBaseUrl = useMemo(() => {
    if (!initialUrl) return "";
    const base = getMediaApiBaseUrl() || window.location.origin;
    return `${base.replace(/\/$/, "")}/api/stream-ts?url=${encodeURIComponent(initialUrl)}&owner=1`;
  }, [initialUrl]);

  const isLiveStream = initialUrl.includes("/live/");
  const isHlsStream =
    initialUrl.includes(".m3u8") || initialUrl.includes("/hls/") || isLiveStream;

  const reportPlaybackMode = useCallback(
    (mode: PlaybackMode, level: "info" | "warn" = "info") => {
      if (playbackModeRef.current === mode) return;
      playbackModeRef.current = mode;
      reportPlaybackDebug(
        "player.playbackMode",
        {
          mode,
          extension,
          url: initialUrl,
          isLiveStream,
          isHlsStream,
        },
        level,
      );
    },
    [extension, initialUrl, isHlsStream, isLiveStream],
  );

  useEffect(() => {
    if (!initialUrl) return;
    reportPlaybackDebug("player.sessionStart", {
      title: initialTitle,
      url: initialUrl,
      extension,
      isLiveStream,
      isHlsStream,
      seriesId,
      playlistId,
      episodeSeason,
      episodeNum,
      episodeTitle,
      currentIndex,
    });
  }, [
    currentIndex,
    episodeNum,
    episodeSeason,
    episodeTitle,
    extension,
    fastTsBaseUrl,
    initialTitle,
    initialUrl,
    isHlsStream,
    isLiveStream,
    location.state,
    playlistId,
    proxiedUrl,
    seriesId,
  ]);

  const inferredDuration = useMemo(() => {
    const candidates = [
      streamInfo?.duration_secs,
      streamInfo?.duration,
      streamInfo?.video?.duration,
      streamInfo?.movie_data?.duration_secs,
      streamInfo?.movie_data?.duration,
    ];
    for (const candidate of candidates) {
      const sec = parseDurationToSeconds(candidate);
      if (sec > 0) return sec;
    }
    return 0;
  }, [streamInfo]);

  const effectiveDuration =
    Number.isFinite(duration) && duration > 0 ? duration : inferredDuration;

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const resetControlsVisibility = useCallback(() => {
    setShowControls(true);
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !settingsOpenRef.current) setShowControls(false);
    }, 3500);
  }, []);

  const teardownPlayers = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      try {
        if (typeof mpegtsRef.current.pause === "function") {
          mpegtsRef.current.pause();
        }
      } catch {}
      try {
        if (typeof mpegtsRef.current.unload === "function") {
          mpegtsRef.current.unload();
        }
      } catch {}
      try {
        if (typeof mpegtsRef.current.detachMediaElement === "function") {
          mpegtsRef.current.detachMediaElement();
        }
      } catch {}
      try {
        mpegtsRef.current.destroy();
      } catch {}
      mpegtsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    // Stop platform engine playback if active
    try {
      if (platformPlayerRef.current && typeof platformPlayerRef.current.stop === 'function') {
        try { platformPlayerRef.current.stop(); } catch {}
      }
      platformPlayerRef.current = null;
    } catch {}
  }, []);


  const startNativePlayback = useCallback(
    (seekSec = 0, preferProxy = false) => {
      const video = videoRef.current;
      if (!video) return;
      teardownPlayers();
      setIsLoading(true);

      let sourceUrl = proxiedUrl;
      if (!isLiveStream && !isHlsStream) {
        // Prefer proxy playback when the original URL is cross-origin or when
        // the caller/requested preferences indicate proxy usage. Cross-origin
        // direct playback often fails due to CORS or blocked range requests.
        let originMismatch = false;
        try {
          const parsed = new URL(initialUrl);
          originMismatch = parsed.origin !== window.location.origin;
        } catch {
          originMismatch = true;
        }

        const isPackagedWebOS =
          window.location.protocol === "file:" && getPlatformName() === "webos";

        const mustUseProxy =
          preferProxy ||
          forceProxyPlaybackRef.current ||
          (!isPackagedWebOS && originMismatch);

        sourceUrl = mustUseProxy ? proxiedUrl : initialUrl;
        usingDirectPlaybackRef.current = !mustUseProxy && sourceUrl === initialUrl;
      } else {
        usingDirectPlaybackRef.current = false;
      }

      if (!sourceUrl) return;
      const directFallbackToProxy =
        window.location.protocol === "file:" &&
        getPlatformName() === "webos" &&
        sourceUrl === initialUrl &&
        Boolean(proxiedUrl);

      if (directFallbackToProxy) {
        const onNativeError = () => {
          video.removeEventListener("error", onNativeError);
          if (video.src === proxiedUrl) return;
          try {
            usingDirectPlaybackRef.current = false;
            video.src = proxiedUrl;
            video.load();
            video.play().catch(() => {});
          } catch {}
        };
        video.addEventListener("error", onNativeError, { once: true });
      }

      video.src = sourceUrl;
      video.load();
      const waitForBufferTarget = async (targetSeconds: number, maxWaitMs = 9000) => {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
          if (!video) return false;
          try {
            if (isTimeBuffered(video, (video.currentTime || 0) + targetSeconds, 0.75)) return true;
          } catch {}
          // small delay
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 200));
        }
        return false;
      };

      const onLoaded = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        if (seekSec > 0 && Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = clamp(seekSec, 0, video.duration);
        }
        (async () => {
          // Try to prebuffer 30s (up to ~9s) before starting playback for smooth experience
          const ok = await waitForBufferTarget(30, 9000);
          if (!ok) {
            // fallback: start playback anyway
            try { await video.play(); } catch {}
            return;
          }
          try { await video.play(); } catch {}
        })();
      };
      video.addEventListener("loadedmetadata", onLoaded);
    },
    [initialUrl, isHlsStream, isLiveStream, proxiedUrl, teardownPlayers],
  );

  const startRemuxPlayback = useCallback(
    (
      seekSec: number,
      audioId: number,
      subtitleId: number | null,
      delayMs = 0,
    ) => {
      const video = videoRef.current;
      if (!video || !initialUrl) return;
      reportPlaybackMode("remux-fallback", "warn");

      teardownPlayers(); // Ensure HLS/mpegts players are destroyed
      setIsLoading(true);

      const safeAudioId = getPreferredAudioTrackId(audioTracksRef.current, audioId);
      const safeAudioTrack = audioTracksRef.current.find((track) => track.id === safeAudioId) || null;
      const audioStreamIndex = resolveTrackIndex(
        safeAudioTrack?.absIndex,
        resolveTrackIndex(safeAudioTrack?.id, Math.max(0, safeAudioId)),
      );
      const subtitleTrack =
        subtitleId != null && subtitleId >= 0
          ? subtitleTracksRef.current.find((track) => track.id === subtitleId) || null
          : null;
      const subtitleStreamIndex =
        subtitleTrack && subtitleId != null && subtitleId >= 0
          ? resolveTrackIndex(subtitleTrack.absIndex, resolveTrackIndex(subtitleTrack.id, subtitleId))
          : -1;
      const subtitleCodec = subtitleTrack?.codec ? String(subtitleTrack.codec).toLowerCase() : "";

      const baseRemux = getMediaApiBaseUrl() || window.location.origin;
      const remuxedUrl = `${baseRemux.replace(/\/$/, "")}/api/remux?url=${encodeURIComponent(initialUrl)}&audio=${audioStreamIndex >= 0 ? audioStreamIndex : 0}&subtitle=${subtitleStreamIndex >= 0 ? subtitleStreamIndex : -1}&seek=${seekSec.toFixed(3)}&audioDelayMs=${delayMs}&subCodec=${encodeURIComponent(subtitleCodec)}`;

      // Give aborted MSE/proxy requests a brief moment to fully close before
      // opening the next remux stream (helps single-connection providers).
      if (remuxSwitchTimerRef.current) {
        clearTimeout(remuxSwitchTimerRef.current);
        remuxSwitchTimerRef.current = null;
      }
      remuxSwitchTimerRef.current = setTimeout(() => {
        remuxSwitchTimerRef.current = null;
        const currentVideo = videoRef.current;
        if (!currentVideo) return;
        currentVideo.src = remuxedUrl;
        currentVideo.load();
        currentVideo.play().catch(() => {});
      }, 160);

      setSelectedAudio(safeAudioId);
      setSelectedSubtitle(subtitleId != null ? subtitleId : -1);
      // Remuxed MP4 subtitles should be consumed as native textTracks when present.
      setNativeSubtitleActive(subtitleId != null && subtitleId >= 0);
      setSubtitleCues([]); // Clear custom cues if remuxing
      setSubtitleText("");
    }, [initialUrl, reportPlaybackMode, teardownPlayers]);

  const parseTrackInfo = useCallback((streams: any[]) => {
    const streamList = streams.map((s, idx) => ({ ...s, __idx: idx }));

    const audioStreams = streamList.filter((s) => s.codec_type === "audio");
    const audios = audioStreams.map((s) => {
      const lang = (s.tags?.language || "und").toUpperCase();
      const codec = (s.codec_name || "audio").toUpperCase();
      const title = s.tags?.title || `${lang} ${codec}`;
      return {
        id: s.__idx,
        name: title,
        lang,
        codec,
        absIndex: typeof s.index === "number" ? Number(s.index) : s.__idx,
      } as TrackItem;
    });

    const subtitleStreams = streamList.filter((s) => s.codec_type === "subtitle");
    const subtitles = subtitleStreams.map((s) => {
      const lang = (s.tags?.language || "und").toUpperCase();
      const codec = (s.codec_name || "subtitle").toUpperCase();
      const title = s.tags?.title || `${lang} ${codec}`;
      return { id: s.__idx, name: title, lang, codec, absIndex: typeof s.index === 'number' ? Number(s.index) : s.__idx } as TrackItem;
    });

    const defaultAudioStream =
      audioStreams.find((s) => Number(s?.disposition?.default) === 1) ||
      audioStreams[0] ||
      null;
    const defaultAudioId = defaultAudioStream ? defaultAudioStream.__idx : -1;

    setAudioTracks(audios);
    setSubtitleTracks(subtitles);
    setSelectedAudio(defaultAudioId);
    setSelectedSubtitle(-1); // Default to no subtitle
    return defaultAudioId;
  }, []);

  const loadTrackMetadata = useCallback(async (): Promise<number | null> => {
    if (!initialUrl || isHlsStream || isLiveStream) return null;
    try {
      const baseTracks = getMediaApiBaseUrl() || window.location.origin;
      const res = await fetch(`${baseTracks.replace(/\/$/, "")}/api/tracks?url=${encodeURIComponent(initialUrl)}`);
      if (!res.ok) {
        ffprobeAvailable.current = false; // Explicitly set to false on failure
        return null;
      }
      const data = await res.json();
      if (!data.available || !Array.isArray(data.streams)) { ffprobeAvailable.current = false; return null; }
      ffprobeAvailable.current = true; // Set to true only on success

      const summary = data.streams.map((s: any, idx: number) => ({
        idx,
        type: s.codec_type,
        codec: s.codec_name,
        lang: s?.tags?.language || null,
        title: s?.tags?.title || null,
        default: s?.disposition?.default || 0,
        forced: s?.disposition?.forced || 0,
      }));
      setTrackSummary(summary);
      reportPlaybackDebug("player.trackMetadata", {
        url: initialUrl,
        streamCount: data.streams.length,
        audioCount: summary.filter((s: any) => s.type === "audio").length,
        subtitleCount: summary.filter((s: any) => s.type === "subtitle").length,
        summary,
      });

      return parseTrackInfo(data.streams);
    } catch {
      return null;
    }
  }, [initialUrl, isHlsStream, isLiveStream, parseTrackInfo]);


  const subtitleLanguages = useMemo(() => {
    if (trackSummary.length > 0) {
      return getAvailableSubtitleLanguages(trackSummary);
    }

    const byLang = new Map<string, number[]>();
    for (const track of subtitleTracks) {
      const code = String(track.lang || "und").toUpperCase();
      const list = byLang.get(code) || [];
      list.push(track.id);
      byLang.set(code, list);
    }
    return Array.from(byLang.entries())
      .map(([code, trackIds]) => ({
        code,
        label: toLanguageLabel(code),
        trackIds,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [subtitleTracks, trackSummary]);

  const trySwitchNativeAudioTrack = useCallback((trackId: number): boolean => {
    const v = videoRef.current as any;
    if (!v) return false;

    // Try platform-specific API first (Tizen AVPlay etc.)
    try {
      if (trySwitchPlatformAudioTrack(v, trackId)) {
        try { setSelectedAudio(trackId); } catch {}
        return true;
      }
    } catch {}

    const nativeAudioTracks = v?.audioTracks;
    if (!nativeAudioTracks || typeof nativeAudioTracks.length !== "number") {
      return false;
    }

    const safeIndex = clamp(trackId, 0, Math.max(0, nativeAudioTracks.length - 1));

    try {
      for (let i = 0; i < nativeAudioTracks.length; i++) {
        nativeAudioTracks[i].enabled = i === safeIndex;
      }
      setSelectedAudio(safeIndex);
      return true;
    } catch {
      return false;
    }
  }, []);

  const trySwitchNativeSubtitleTrack = useCallback((trackId: number): boolean => {
    const v = videoRef.current as any;
    if (!v) return false;

    // Try platform-specific API first
    try {
      if (trySwitchPlatformSubtitleTrack(v, trackId)) {
        try {
          setNativeSubtitleActive(trackId >= 0);
          setSubtitleCues([]);
          setSubtitleText("");
        } catch {}
        return true;
      }
    } catch {}

    const textTracks = v?.textTracks;
    if (!textTracks || typeof textTracks.length !== "number" || textTracks.length === 0) {
      return false;
    }

    if (trackId < 0) {
      try {
        for (let i = 0; i < textTracks.length; i++) {
          textTracks[i].mode = "disabled";
        }
        setNativeSubtitleActive(false);
        setSubtitleText("");
        return true;
      } catch {
        return false;
      }
    }

    const safeIndex = clamp(trackId, 0, Math.max(0, textTracks.length - 1));
    try {
      for (let i = 0; i < textTracks.length; i++) {
        textTracks[i].mode = i === safeIndex ? "hidden" : "disabled";
      }
      setNativeSubtitleActive(true);
      setSubtitleCues([]);
      setSubtitleText("");
      subtitlePointerRef.current = 0;
      return true;
    } catch {
      return false;
    }
  }, []);

  const failoverToProxy = useCallback((seekSec = 0) => {
    if (forceProxyPlaybackRef.current || failingOverToProxyRef.current) return;
    if (isLiveStreamRef.current || hlsRef.current) return;
    failingOverToProxyRef.current = true;
    forceProxyPlaybackRef.current = true;
    usingDirectPlaybackRef.current = false;
    reportPlaybackDebug(
      "player.failoverToProxy",
      { seekSec, url: initialUrl },
      "warn",
    );
    startNativePlaybackRef.current(Math.max(0, seekSec));
    setTimeout(() => {
      failingOverToProxyRef.current = false;
    }, 1200);
  }, [initialUrl]);

  const startFastTsPlayback = useCallback(
    (seekSec = 0, audioIdx = 0) => {
      const video = videoRef.current;
      if (!video || !fastTsBaseUrl) return;
      reportPlaybackMode("stream-ts-fallback", "warn");
      if (!(mpegts.getFeatureList().msePlayback || mpegts.getFeatureList().mseLivePlayback)) {
        startNativePlayback(seekSec);
        return;
      }

      // Record the content offset for this stream instance. Because -copyts is
      // NOT used in the backend, the TS output PTS always starts from 0. All
      // effective-time calculations add streamSeekOffsetRef.current to
      // video.currentTime to get the real playback position.
      streamSeekOffsetRef.current = Math.max(0, seekSec);
      setIsLoading(true);
      teardownPlayers();
      const requestedAudio = audioIdx >= 0 ? audioIdx : selectedAudioRef.current;
      const fallbackAudio = getPreferredAudioTrackId(audioTracksRef.current, selectedAudioRef.current);
      const safeAudio = requestedAudio >= 0 ? requestedAudio : fallbackAudio >= 0 ? fallbackAudio : 0;
      currentFastTsAudioRef.current = safeAudio;
      const url = `${fastTsBaseUrl}&seek=${Math.max(0, seekSec).toFixed(3)}&audio=${safeAudio}`;
      const player = mpegts.createPlayer(
        { type: "mpegts", url, isLive: false },
        {
          enableWorker: true,
          autoCleanupSourceBuffer: true,
          lazyLoad: isLowPowerTV,
          lazyLoadMaxDuration: isLowPowerTV ? 30 : 120,
          lazyLoadRecoverDuration: isLowPowerTV ? 10 : 30,
          stashInitialSize: isLowPowerTV ? 96 * 1024 : 256 * 1024,
          enableStashBuffer: true,
          fixAudioTimestampGap: true,
        },
      );
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();
      // Try to prebuffer 30s before starting playback for smooth continuous play.
      (async () => {
        const waitForBufferTarget = async (targetSeconds: number, maxWaitMs = 9000) => {
          const start = Date.now();
          while (Date.now() - start < maxWaitMs) {
            if (!video) return false;
            try {
              if (isTimeBuffered(video, (video.currentTime || 0) + targetSeconds, 0.75)) return true;
            } catch {}
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 200));
          }
          return false;
        };
        const ok = await waitForBufferTarget(30, 9000);
        try {
          const playRet = player.play();
          if (playRet && typeof (playRet as Promise<void>).catch === "function") {
            (playRet as Promise<void>).catch(() => {});
          }
        } catch {}
        if (!ok) {
          // if we couldn't prebuffer enough, ensure playback continues; mpegts player will keep loading
        }
      })();
      player.on(mpegts.Events.ERROR, () => {
        if (!fastTsFallbackRef.current) {
          fastTsFallbackRef.current = true;
          setTimeout(() => {
            fastTsFallbackRef.current = false;
            startFastTsPlayback(seekSec, audioIdx);
          }, 450);
          return;
        }
        // If TS transmux fails repeatedly, recover with native proxy playback.
        startNativePlaybackRef.current(Math.max(0, seekSec), true);
      });
    },
    [fastTsBaseUrl, reportPlaybackMode, startNativePlayback, teardownPlayers],
  );

  const initPlayback = useCallback(async () => { // Made async
    const video = videoRef.current;
    if (!video || (!proxiedUrl && !initialUrl)) return;
    setError(null);
    setIsLoading(true);
    remuxFallbackTriedRef.current = false;
    userPausedRef.current = false;
    originalStreamUrl.current = initialUrl;
    ffprobeAvailable.current = false;
    teardownPlayers();
    const cleanUrl = initialUrl.split("?")[0].toLowerCase();
    const ext = (extension || cleanUrl.match(/\.([a-z0-9]+)$/)?.[1] || "").toLowerCase();
    const isMkvSource = ext === "mkv";
    isMkvSourceRef.current = isMkvSource;
    const platform = getPlatformName();
    // webOS HTML5 player natively handles MKV via hardware decoder (H.264/H.265 + AAC/AC3/EAC3).
    // Use native playback instead of FastTS transmuxing on webOS.
    preferNativeMkvRef.current = platform === 'webos';

    if (isHlsStream && Hls.isSupported()) {
      // Rebuild proxied URL at playback time so that probeAndSelectApiBase()
      // results are reflected even if the component mounted before the probe finished.
      const currentBase = getMediaApiBaseUrl() || window.location.origin;
      const currentProxiedUrl = `${currentBase.replace(/\/$/, "")}/api/proxy?url=${encodeURIComponent(initialUrl)}&owner=1`;
      const preferDirectFirst =
        window.location.protocol === "file:" && platform === "webos";
      const primaryHlsUrl = preferDirectFirst ? initialUrl : currentProxiedUrl;
      const secondaryHlsUrl = preferDirectFirst ? currentProxiedUrl : initialUrl;
      const hlsFallbackTried = { current: false };

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 45,
        maxMaxBufferLength: 90,
      });
      hlsRef.current = hls;
      hls.loadSource(primaryHlsUrl);
      usingDirectPlaybackRef.current = false;
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const hlsAudio = (hls.audioTracks || []).map((t, i) => ({ id: i, name: t.name || t.lang || `Audio ${i + 1}`, lang: t.lang }));
        const hlsSubs = (hls.subtitleTracks || []).map((t, i) => ({ id: i, name: t.name || t.lang || `Subtitle ${i + 1}`, lang: t.lang }));
        setAudioTracks(hlsAudio);
        setSubtitleTracks(hlsSubs);
        if (hlsAudio.length > 0) {
          const safeHlsAudio = clamp(hls.audioTrack, 0, hlsAudio.length - 1);
          try {
            hls.audioTrack = safeHlsAudio;
          } catch {}
          setSelectedAudio(safeHlsAudio);
        } else {
          setSelectedAudio(-1);
        }
        setIsLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => setSelectedAudio(data.id));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try {
            hls.startLoad();
            return;
          } catch {}
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            hls.recoverMediaError();
            return;
          } catch {}
        }
        // Retry with secondary URL (proxy/direct pair) before failing.
        if (!hlsFallbackTried.current && secondaryHlsUrl && secondaryHlsUrl !== primaryHlsUrl) {
          hlsFallbackTried.current = true;
          try { hls.destroy(); } catch {}
          hlsRef.current = null;
          const directHls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
          hlsRef.current = directHls;
          directHls.loadSource(secondaryHlsUrl);
          directHls.attachMedia(video);
          directHls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            video.play().catch(() => {});
          });
          directHls.on(Hls.Events.ERROR, (_e2: any, data2: any) => {
            if (!data2.fatal) return;
            setError("Stream playback failed");
            setIsLoading(false);
          });
          return;
        }
        setError("Stream playback failed");
        setIsLoading(false);
      });
      return;
    }

    // TS sources use mpegts.js directly.
    if (ext === "ts") {
      if (mpegts.getFeatureList().msePlayback || mpegts.getFeatureList().mseLivePlayback) {
        const player = mpegts.createPlayer(
          { type: "mpegts", url: proxiedUrl, isLive: false },
          { enableWorker: true, autoCleanupSourceBuffer: true, lazyLoad: false },
        );
        usingDirectPlaybackRef.current = false;
        mpegtsRef.current = player;
        player.attachMediaElement(video);
        player.load();
        player.play();
        player.on(mpegts.Events.ERROR, () => {
          setError("MPEG-TS playback failed");
          setIsLoading(false);
        });
      }
      return;
    }

    // Dedicated MKV path: use backend stream-ts transmux for compatibility and
    // lower memory pressure on constrained TVs while keeping subtitle/audio
    // metadata fetched separately.
    if (!isLiveStream && !isHlsStream && isMkvSource) {
      const defaultAudioId = await loadTrackMetadata();

      // If the device supports platform native engines (Tizen AVPlay), prefer
      // to hand off MKV playback to that engine so embedded audio/subtitle
      // tracks are handled natively.
      if (platformSupportsEngine()) {
        try {
          // Use proxied URL to avoid CORS/range issues where possible
          const source = proxiedUrl || initialUrl;
          const handle = startPlatformPlayback(source, 0, (ev) => {
            if (ev?.type === 'ended') {
              try { video.pause(); } catch {}
            }
            // Forward other events to debugger
            reportPlaybackDebug('player.platformEvent', { ev });
          });
          if (handle) {
            platformPlayerRef.current = handle;
            // Try to populate available tracks from platform using the
            // normalization helper (works for AVPlay and webOS Luna results).
            try {
              const rawTracks = (handle.getTracks && typeof handle.getTracks === 'function') ? handle.getTracks() : [];
              const norm = normalizePlatformTracks(rawTracks || []);
              const audios = (norm.audios || []).map((a: any, i: number) => ({ id: a.index ?? i, name: a.name || `Audio ${i + 1}`, lang: (a.lang || '').toUpperCase() } as TrackItem));
              const subtitles = (norm.subtitles || []).map((s: any, i: number) => ({ id: s.index ?? i, name: s.name || `Subtitle ${i + 1}`, lang: (s.lang || '').toUpperCase(), absIndex: s.index } as TrackItem));
              if (audios.length > 0) setAudioTracks(audios);
              if (subtitles.length > 0) setSubtitleTracks(subtitles);
              if (audios.length > 0) setSelectedAudio(defaultAudioId ?? audios[0].id ?? -1);
            } catch (e) {}

            setIsLoading(false);
            reportPlaybackMode('proxy-range');
            return; // Platform playback started
          }
        } catch (e) {
          // Fall through to existing handling on failure
          reportPlaybackDebug('player.platformStartFailed', { error: String(e) }, 'warn');
        }
      }

        // webOS: the Chromium-based HTML5 player handles MKV natively with hardware decode.
        // Supported: H.264 / H.265 video, AAC / AC3 / EAC3 / DTS audio, embedded SRT/VTT subs.
        if (platform === 'webos') {
          // Best-effort: register with audio service for proper volume routing on the platform.
          webosRegisterTrack('default').then((trackId) => {
            if (trackId) {
              platformPlayerRef.current = {
                stop: () => { try { webosUnregisterTrack(trackId); } catch {} },
                webosTrackId: trackId,
              };
            }
          }).catch(() => {});

          usingDirectPlaybackRef.current = false;
          reportPlaybackMode('proxy-range');
          video.src = proxiedUrl;
          video.load();

          // After metadata loads, read native audio/text tracks exposed by the webOS browser.
          video.addEventListener('loadedmetadata', () => {
            try {
              const { audios, subtitles } = webosReadNativeTracks(video);
              if (audios.length > 0) {
                const audioItems = audios.map((a, i) => ({
                  id: a.index ?? i,
                  name: a.name,
                  lang: (a.lang || '').toUpperCase(),
                } as TrackItem));
                setAudioTracks(audioItems);
                setSelectedAudio(audioItems[0]?.id ?? -1);
              } else if (defaultAudioId !== null && defaultAudioId >= 0) {
                setSelectedAudio(defaultAudioId);
              }
              if (subtitles.length > 0) {
                const subItems = subtitles.map((s, i) => ({
                  id: s.index ?? i,
                  name: s.name,
                  lang: (s.lang || '').toUpperCase(),
                  absIndex: s.index,
                } as TrackItem));
                setSubtitleTracks(subItems);
              }
            } catch {}
            setIsLoading(false);
            video.play().catch(() => {});
          }, { once: true });
          return;
        }

      if (preferNativeMkvRef.current) {
        usingDirectPlaybackRef.current = false;
        reportPlaybackMode("proxy-range");
        video.src = proxiedUrl;
        video.load();
        return;
      }
      // Use FastTS (MPEG-TS) which is more "IPTV-safe" for 1-connection accounts
      startFastTsPlayback(0, defaultAudioId ?? selectedAudioRef.current);
      return;
    }

    if (!isLiveStream && !isHlsStream) {
      // Prefer proxy playback for cross-origin VOD to avoid CORS/range issues.
      let originMismatch = false;
      try {
        const parsed = new URL(initialUrl);
        originMismatch = parsed.origin !== window.location.origin;
      } catch {
        originMismatch = true;
      }

      const mustUseProxy =
        forceProxyPlaybackRef.current || originMismatch || (isMkvSourceRef.current && preferNativeMkvRef.current);

      const sourceUrl = mustUseProxy ? proxiedUrl : initialUrl;
      usingDirectPlaybackRef.current = !mustUseProxy && sourceUrl === initialUrl;
      if (sourceUrl === proxiedUrl) reportPlaybackMode("proxy-range");

      video.src = sourceUrl;
      video.load();
      void loadTrackMetadata();
      return;
    }

    usingDirectPlaybackRef.current = false;
    video.src = proxiedUrl;
    video.load();
  }, [
    extension,
    startFastTsPlayback,
    initialUrl,
    isHlsStream,
    isLiveStream,
    proxiedUrl,
    loadTrackMetadata,
    reportPlaybackMode,
    startRemuxPlayback,
    teardownPlayers,
  ]);

  useEffect(() => {
    startNativePlaybackRef.current = startNativePlayback;
  }, [startNativePlayback]);

  useEffect(() => {
    startFastTsPlaybackRef.current = startFastTsPlayback;
  }, [startFastTsPlayback]);

  useEffect(() => {
    isLiveStreamRef.current = isLiveStream;
  }, [isLiveStream]);

  // TV remote handler: allow closing/opening sidebars and focusing their top Close buttons.
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string | undefined;
      if (!key) return;

      if (key === "back") {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (audioMenuOpen) {
          setAudioMenuOpen(false);
          return;
        }
        if (subtitleMenuOpen) {
          setSubtitleMenuOpen(false);
          return;
        }
      }

      if (key === "select") {
        // If a sidebar/panel is open but focus is not inside it, move focus
        // to the panel's top Close button so the remote can press it.
        const active = document.activeElement as HTMLElement | null;

        if (settingsOpen && settingsAsideRef.current) {
          if (!settingsAsideRef.current.contains(active)) {
            settingsCloseButtonRef.current?.focus();
            return;
          }
          if (active === settingsCloseButtonRef.current) {
            settingsCloseButtonRef.current.click();
            return;
          }
        }

        if (audioMenuOpen) {
          if (audioCloseButtonRef.current && document.body.contains(audioCloseButtonRef.current)) {
            if (document.activeElement !== audioCloseButtonRef.current) {
              audioCloseButtonRef.current.focus();
              return;
            }
            audioCloseButtonRef.current.click();
            return;
          }
        }

        if (subtitleMenuOpen) {
          if (subtitleCloseButtonRef.current && document.body.contains(subtitleCloseButtonRef.current)) {
            if (document.activeElement !== subtitleCloseButtonRef.current) {
              subtitleCloseButtonRef.current.focus();
              return;
            }
            subtitleCloseButtonRef.current.click();
            return;
          }
        }
      }
    };

    window.addEventListener("tv-remote-key", handler as EventListener);
    return () => window.removeEventListener("tv-remote-key", handler as EventListener);
  }, [settingsOpen, audioMenuOpen, subtitleMenuOpen]);

  useEffect(() => {
    // Reset direct/proxy preference on each new title/episode.
    forceProxyPlaybackRef.current = false;
    usingDirectPlaybackRef.current = false;
    userPausedRef.current = false;
    failingOverToProxyRef.current = false;
    isMkvSourceRef.current = false;
    preferNativeMkvRef.current = false;
    playbackModeRef.current = null;
    streamSeekOffsetRef.current = 0;
  }, [initialUrl]);

  useEffect(() => {
    selectedAudioRef.current = selectedAudio;
  }, [selectedAudio]);

  useEffect(() => {
    audioTracksRef.current = audioTracks;
  }, [audioTracks]);

  useEffect(() => {
    subtitleTracksRef.current = subtitleTracks;
  }, [subtitleTracks]);

  useEffect(() => {
    subtitleLoadingRef.current = subtitleLoading;
  }, [subtitleLoading]);

  // Keep subtitle-related refs in sync with state so the RAF loop can read
  // them without being recreated (avoids stale-closure subtitle display bugs).
  useEffect(() => { selectedSubtitleRef.current = selectedSubtitle; }, [selectedSubtitle]);
  useEffect(() => { subtitleCuesRef.current = subtitleCues; }, [subtitleCues]);
  useEffect(() => { nativeSubtitleActiveRef.current = nativeSubtitleActive; }, [nativeSubtitleActive]);
  useEffect(() => { subtitleOffsetMsRef.current = subtitleOffsetMs; }, [subtitleOffsetMs]);

  // RAF subtitle engine — uses refs exclusively so the loop NEVER needs to
  // restart when selectedSubtitle / subtitleCues / offsets change.
  const runSubtitleEngineFrame = useCallback(() => {
    if (nativeSubtitleActiveRef.current) {
      subtitleRafRef.current = requestAnimationFrame(runSubtitleEngineFrame);
      return;
    }
    const v = videoRef.current;
    const cues = subtitleCuesRef.current;
    if (!v || selectedSubtitleRef.current < 0 || cues.length === 0) {
      if (subtitleLastTextRef.current !== "") {
        subtitleLastTextRef.current = "";
        setSubtitleText("");
      }
      subtitleRafRef.current = requestAnimationFrame(runSubtitleEngineFrame);
      return;
    }
    // Use effective time: video.currentTime + stream seek offset + subtitle offset
    const now = v.currentTime + streamSeekOffsetRef.current + subtitleOffsetMsRef.current / 1000;
    const last = subtitleLastTimeRef.current;
    subtitleLastTimeRef.current = now;
    let idx = subtitlePointerRef.current;
    if (Math.abs(now - last) > 1.2 || idx >= cues.length) {
      idx = getCueIndexBinary(cues, now);
      subtitlePointerRef.current = idx < 0 ? 0 : idx;
    } else {
      while (idx < cues.length && cues[idx].end < now) idx++;
      while (idx > 0 && cues[idx - 1].start > now) idx--;
      subtitlePointerRef.current = idx;
    }
    let nextText = "";
    if (idx >= 0 && idx < cues.length) {
      const cue = cues[idx];
      if (now >= cue.start && now <= cue.end) nextText = cue.text;
    }
    if (nextText !== subtitleLastTextRef.current) {
      subtitleLastTextRef.current = nextText;
      setSubtitleText(nextText);
    }
    subtitleRafRef.current = requestAnimationFrame(runSubtitleEngineFrame);
  }, []); // Empty deps — reads all values from refs, never stale

  const stopSubtitleEngine = useCallback(() => {
    if (subtitleRafRef.current != null) {
      cancelAnimationFrame(subtitleRafRef.current);
      subtitleRafRef.current = null;
    }
  }, []);

  const startSubtitleEngine = useCallback(() => {
    stopSubtitleEngine();
    subtitlePointerRef.current = 0;
    subtitleLastTimeRef.current = 0;
    subtitleLastTextRef.current = "";
    subtitleRafRef.current = requestAnimationFrame(runSubtitleEngineFrame);
  }, [runSubtitleEngineFrame, stopSubtitleEngine]);

  const fetchSubtitleCues = useCallback(async (trackId: number, seekOverride?: number, forceFull = false, registerAbort = true): Promise<"success" | "failed_extraction" | "not_text_based" | "aborted"> => {
    console.debug(`[subtitle] fetchSubtitleCues start track=${trackId} forceFull=${forceFull} registerAbort=${registerAbort}`);
    if (registerAbort) subtitleFetchAbortRef.current?.abort();
    const controller = new AbortController();
    if (registerAbort) subtitleFetchAbortRef.current = controller;

    if (trackId < 0) {
      setSubtitleCues([]);
      setSubtitleText("");
      return "success";
    }

    const v = videoRef.current;
    const effectiveSeek = seekOverride ?? (v && Number.isFinite(v.currentTime) ? Math.floor(v.currentTime + streamSeekOffsetRef.current) : 0);
    const trackMeta = subtitleTracks.find(t => t.id === trackId);
    const absIndex = trackMeta?.absIndex != null ? Number(trackMeta.absIndex) : trackId;
    const codecHint = trackMeta?.codec ? `&codec=${encodeURIComponent(trackMeta.codec)}` : "";

    // Avoid server-side full-file download fallback by default (prevents long stalls).
    // If caller requested a forced full extraction while we intentionally interrupted
    // playback to free the upstream connection, allow full-download behavior.
    const allowFullDownload = forceFull && subtitleInterruptionRef.current;
    const subtitleBaseUrl = `${(getMediaApiBaseUrl() || window.location.origin).replace(/\/$/, "")}/api/subtitle?url=${encodeURIComponent(originalStreamUrl.current)}&index=${absIndex}&format=vtt&delayMs=0&title=${encodeURIComponent(initialTitle)}${codecHint}${effectiveSeek > 2 ? `&seek=${effectiveSeek}` : ""}${allowFullDownload ? "" : "&noFullDownload=1"}`;

    const applyPayload = (payload: string): boolean => {
      const normalized = (payload || "").trim();
      const hasTimelineData = normalized.includes("-->") || normalized.includes("Dialogue:") || normalized.includes("[Script Info]");
      if (!normalized || !hasTimelineData) return false;
      const cues = parseSubtitlePayload(normalized);
      console.debug(`[subtitle] applyPayload track=${trackId} cues=${cues.length} chars=${normalized.length} forceFull=${forceFull}`);
      if (cues.length === 0) return false;
      subtitleLastFetchMetaRef.current = { trackId, cuesCount: cues.length, chars: normalized.length, ts: Date.now(), forceFull };
      setSubtitleCues(cues);
      try {
        const now = v ? v.currentTime + streamSeekOffsetRef.current + subtitleOffsetMsRef.current / 1000 : 0;
        const active = findActiveSubtitleCue(cues, now);
        if (active) setSubtitleText(active.text);
        else setSubtitleText("");
      } catch {}
      subtitlePointerRef.current = 0;
      subtitleLastTimeRef.current = 0;
      subtitleLastTextRef.current = "";
      return true;
    };

    const fetchText = async (url: string): Promise<string> => {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    };

    setSubtitleLoading(true);
    subtitleLoadingRef.current = true;
    setSubtitleText("Fetching subtitles...");
    try {
      // If caller requests the full extraction immediately, skip quick checks
      // and polling and go straight to the full fetch. This is used when the
      // player is allowed to block playback to obtain complete subtitles.
      if (forceFull) {
        console.debug(`[subtitle] forceFull immediate fetch for track=${trackId}`);
        try {
          const fullPayload = await fetchText(`${subtitleBaseUrl}&t=${Date.now()}`);
          if (applyPayload(fullPayload)) return "success";
          return "failed_extraction";
        } catch (e: any) {
          if (e?.name === "AbortError") return "aborted";
          return "failed_extraction";
        }
      }

      // Quick server-side check for cached/partial result
      try {
        const checkRes = await fetch(`${subtitleBaseUrl}&check=1`, { signal: controller.signal, cache: "no-store" });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData?.cached || checkData?.partial) {
            const payload = await fetchText(`${subtitleBaseUrl}&t=${Date.now()}`);
            if (applyPayload(payload)) return "success";
          }
        }
      } catch (e) {}

      // Try a low-bandwidth blocking extraction which should return text quickly
      try {
        const lowRes = await fetch(`${subtitleBaseUrl}&lowBandwidth=1`, { signal: controller.signal, cache: "no-store" });
        if (lowRes.ok) {
          const payload = await lowRes.text();
          if (applyPayload(payload)) return "success";
        }
      } catch (e) {}

      // Short poll (10s) for background extraction producing partial/full result
      const pollDeadline = Date.now() + 10_000;
      while (Date.now() < pollDeadline && !controller.signal.aborted) {
        try {
          const checkRes2 = await fetch(`${subtitleBaseUrl}&check=1`, { signal: controller.signal, cache: "no-store" });
          if (checkRes2.ok) {
            const data = await checkRes2.json();
            if (data?.cached || data?.partial) {
              const payload = await fetchText(`${subtitleBaseUrl}&t=${Date.now()}`);
              if (applyPayload(payload)) return "success";
            }
          }
        } catch (e) {}
        await waitWithAbort(800, controller.signal).catch(() => {});
      }

      // Final attempt: blocking full fetch (server may take longer)
      try {
        const fullPayload = await fetchText(`${subtitleBaseUrl}&t=${Date.now()}`);
        if (applyPayload(fullPayload)) return "success";
        return "failed_extraction";
      } catch (e: any) {
        if (e?.name === "AbortError") return "aborted";
        return "failed_extraction";
      }
    } finally {
      subtitleLoadingRef.current = false;
      setSubtitleLoading(false);
    }
  }, [initialTitle, subtitleTracks]);

  // Keep a stable ref so event handlers in empty-dep useEffects can call latest version.
  useEffect(() => { fetchSubtitleCuesRef.current = fetchSubtitleCues; }, [fetchSubtitleCues]);

  const switchAudioTrack = useCallback((trackId: number) => {
    const v = videoRef.current;
    if (!v || trackId < 0) return;
    const hls = hlsRef.current;
    if (hls) {
      try {
        hls.audioTrack = trackId;
        setSelectedAudio(trackId);
        reportPlaybackDebug("player.audioTrackSelected", {
          mode: "hls",
          trackId,
          track: audioTracks.find((t) => t.id === trackId) || null,
        });
      } catch {
        setError("Failed to switch HLS audio track");
      }
      return;
    }

    if (mpegtsRef.current) {
      // Use effective time so the restarted stream begins at the right position.
      const seek = Number.isFinite(v.currentTime) ? v.currentTime + streamSeekOffsetRef.current : 0;
      reportPlaybackDebug("player.audioTrackSelected", { mode: "fast-ts", trackId, seek });
      setSelectedAudio(trackId);
      startFastTsPlayback(seek, trackId);
      return;
    }

    if (trySwitchNativeAudioTrack(trackId)) {
      reportPlaybackDebug("player.audioTrackSelected", {
        mode: "native",
        trackId,
        track: audioTracks.find((t) => t.id === trackId) || null,
      });
      return;
    }

    // Fallback only when the browser cannot expose native audio-track switching.
    if (!isLiveStream && ffprobeAvailable.current) {
      const seek = Number.isFinite(v.currentTime) ? v.currentTime : 0;
      reportPlaybackDebug("player.audioTrackSelected", {
        mode: "remux-fallback",
        trackId,
        track: audioTracks.find((t) => t.id === trackId) || null,
        seek,
      });
      startRemuxPlayback(seek, trackId, -1, audioOffsetMs);
      return;
    }

    setSelectedAudio(trackId);
  }, [audioOffsetMs, audioTracks, isLiveStream, startRemuxPlayback, trySwitchNativeAudioTrack]);

  const handleSubtitleChange = useCallback(async (trackId: number) => {
    // If a previous subtitle extraction is running, abort it so the new
    // selection takes effect immediately instead of being silently dropped.
    if (subtitleLoadingRef.current) {
      subtitleFetchAbortRef.current?.abort();
      subtitleLoadingRef.current = false;
      setSubtitleLoading(false);
    }

    const requestSeq = ++subtitleSwitchSeqRef.current;
    setSelectedSubtitle(trackId);
    const v = videoRef.current as any;
    const platform = getPlatformName();
    const ua = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";
    const simulatorLike = /simulator|emulator/i.test(ua);
    const webosLikeUa = /webos|web0s/i.test(ua);
    const simulatorSafeNoExtract = simulatorLike && (platform === "webos" || webosLikeUa);
    const isNativeTvPlatform = platform === "webos" || platform === "tizen";
    const maxConns = Number(activePlaylist?.accountInfo?.user?.max_connections || 1);
    const singleConnection = !Number.isNaN(maxConns) && maxConns <= 1;

    reportPlaybackDebug("player.subtitleTrackSelected", {
      trackId,
      track: subtitleTracks.find((t) => t.id === trackId) || null,
    });

    if (trackId < 0) {
      subtitleFetchAbortRef.current?.abort();
      subtitleResumeAfterLoadRef.current = false;
      subtitleInterruptionRef.current = false;
      subtitleLoadingRef.current = false;
      setSubtitleLoading(false);
      setSubtitleCues([]);
      setSubtitleText("");
      subtitlePointerRef.current = 0;

      if (!isNativeTvPlatform && playbackModeRef.current === "remux-fallback" && !isLiveStream && ffprobeAvailable.current && v) {
        const seek = Number.isFinite(v.currentTime) ? v.currentTime : 0;
        const audioIdx = getPreferredAudioTrackId(
          audioTracksRef.current,
          selectedAudioRef.current,
        );
        startRemuxPlayback(seek, audioIdx, -1, audioOffsetMs);
        return;
      }

      if (trySwitchNativeSubtitleTrack(-1)) return;
      setNativeSubtitleActive(false);
      return;
    }

    if (hlsRef.current) {
      try {
        hlsRef.current.subtitleTrack = trackId >= 0 ? trackId : -1;
      } catch {}
      setNativeSubtitleActive(trackId >= 0);
      setSubtitleCues([]);
      setSubtitleText("");
      return;
    }

    // webOS MKV path: always use native text tracks in real time.
    // Do NOT trigger server-side subtitle extraction here.
    const isWebosMkvNative = getPlatformName() === "webos" && isMkvSourceRef.current;
    if (isWebosMkvNative) {
      subtitleFetchAbortRef.current?.abort();
      subtitleResumeAfterLoadRef.current = false;
      subtitleInterruptionRef.current = false;
      subtitleLoadingRef.current = false;
      setSubtitleLoading(false);
      setSubtitleCues([]);
      setSubtitleText("");

      // If the selected id already maps to a native text-track index, switch immediately.
      if (trySwitchNativeSubtitleTrack(trackId)) {
        setNativeSubtitleActive(trackId >= 0);
        return;
      }

      // Fallback mapping for cases where UI id doesn't equal native text-track index.
      try {
        const selectedMeta = subtitleTracks.find((track) => track.id === trackId);
        const v = videoRef.current as any;
        const textTracks = v?.textTracks;
        if (textTracks && typeof textTracks.length === "number" && textTracks.length > 0) {
          const targetLang = String(selectedMeta?.lang || "").toLowerCase();
          const targetName = String(selectedMeta?.name || "").toLowerCase();
          let matchedIndex = -1;
          for (let i = 0; i < textTracks.length; i++) {
            const t = textTracks[i] as any;
            const lang = String(t.language || t.lang || "").toLowerCase();
            const label = String(t.label || t.id || "").toLowerCase();
            if (targetLang && lang && targetLang === lang) {
              matchedIndex = i;
              break;
            }
            if (targetName && label && targetName === label) {
              matchedIndex = i;
              break;
            }
          }

          if (matchedIndex >= 0 && trySwitchNativeSubtitleTrack(matchedIndex)) {
            setSelectedSubtitle(matchedIndex);
            setNativeSubtitleActive(true);
            return;
          }
        }
      } catch {}

      // Keep playback running even if subtitle switching failed.
      toast.warning("Native subtitle track unavailable on this stream");
      return;
    }

    // For non-HLS streams, prefer using native in-stream textTracks when available
    // (this avoids pausing/stopping playback when the server extraction would
    // consume the single upstream connection). Fall back to custom extraction
    // only if no suitable native track is present.

    const selectedSubtitleMeta = subtitleTracks.find((track) => track.id === trackId);
    const codec = String(selectedSubtitleMeta?.codec || "").toLowerCase();
    const unsupportedSubtitleCodecs = new Set([
      "hdmv_pgs_subtitle",
      "pgs",
      "dvd_subtitle",
      "dvb_subtitle",
      "xsub",
      "vobsub",
      "eia_608",
      "eia_708",
      "arib_caption",
      "bin_data",
      "teletext",
    ]);
    if (codec && unsupportedSubtitleCodecs.has(codec)) {
      setNativeSubtitleActive(false);
      setSubtitleCues([]);
      setSubtitleText("");
      toast.warning(`Subtitle codec not supported for extraction: ${codec}`);
      return;
    }

    // Try to find a native textTrack that matches this subtitle by language
    // or label. If found, enable it and return without triggering extraction.
    try {
      const v = videoRef.current as any;
      const textTracks = v?.textTracks;
      if (textTracks && typeof textTracks.length === "number" && textTracks.length > 0) {
        const targetLang = (selectedSubtitleMeta?.lang || "").toLowerCase();
        const targetName = (selectedSubtitleMeta?.name || "").toLowerCase();
        let matchedIndex: number | null = null;
        for (let i = 0; i < textTracks.length; i++) {
          const t = textTracks[i] as any;
          const lang = String(t.language || t.lang || "").toLowerCase();
          const label = String(t.label || t.id || "").toLowerCase();
          if (targetLang && lang && targetLang === lang) { matchedIndex = i; break; }
          if (targetName && label && targetName === label) { matchedIndex = i; break; }
        }
        if (matchedIndex != null) {
          // Use native track — set selectedSubtitle to the native index so
          // existing native-handling effects operate correctly.
          setSelectedSubtitle(matchedIndex);
          setNativeSubtitleActive(true);
          setSubtitleCues([]);
          setSubtitleText("");
          // Ensure the browser track is enabled/hidden to let our overlay read cues
          try {
            for (let i = 0; i < textTracks.length; i++) {
              textTracks[i].mode = i === matchedIndex ? "hidden" : "disabled";
            }
          } catch {}
          return;
        }
      }
    } catch {}

    // Decide whether to perform a background extraction (keep playing)
    // or to teardown the active playback so the client can fetch subtitles
    // from the upstream when the account only allows a single connection.
    if (trackId >= 0) {
      // Start subtitle engine so overlay updates immediately
      try { startSubtitleEngine(); } catch {}

      // Simulator-safe mode: never run subtitle extraction, because it often
      // behaves like a browser and can interrupt playback on single-connection streams.
      // Keep playback running and rely on native tracks only.
      if (simulatorSafeNoExtract) {
        subtitleFetchAbortRef.current?.abort();
        subtitleResumeAfterLoadRef.current = false;
        subtitleInterruptionRef.current = false;
        subtitleLoadingRef.current = false;
        setSubtitleLoading(false);
        setSubtitleCues([]);
        setSubtitleText("");
        setNativeSubtitleActive(false);
        toast.warning("Simulator mode: native subtitles unavailable for this stream");
        return;
      }

      // Browser/non-native path: switch subtitle via single remux stream first.
      // This avoids /api/subtitle sidecar extraction requests that stall or time out
      // on remote MKV files and keeps playback continuity on IPTV providers.
      if (!isNativeTvPlatform && !isLiveStream && v) {
        const seek = Number.isFinite(v.currentTime) ? v.currentTime : 0;
        const audioIdx = getPreferredAudioTrackId(
          audioTracksRef.current,
          selectedAudioRef.current,
        );
        reportPlaybackDebug("player.subtitleTrackSelected", {
          mode: "remux-fallback",
          trackId,
          track: subtitleTracks.find((t) => t.id === trackId) || null,
          seek,
          reason: singleConnection ? "single-connection-browser" : "browser-remux-first",
        });
        startRemuxPlayback(seek, audioIdx, trackId, audioOffsetMs);
        return;
      }

      // For single-connection accounts on non-native platforms (browser/PC),
      // MKV subtitle extraction requires downloading/scanning the entire remote
      // file which is impractical while streaming. Skip teardown so video keeps
      // playing and inform the user instead.
      if (singleConnection && !isNativeTvPlatform) {
        subtitleFetchAbortRef.current?.abort();
        subtitleResumeAfterLoadRef.current = false;
        subtitleInterruptionRef.current = false;
        subtitleLoadingRef.current = false;
        setSubtitleLoading(false);
        setSubtitleCues([]);
        setSubtitleText("");
        toast.warning("Subtitles are not available in browser mode with a single-connection account");
        return;
      }

      // If provider only allows a single connection and we're using direct
      // playback on a native TV, teardown the stream to let the extractor open
      // a new connection. This will pause playback briefly but resume afterward.
      if (singleConnection && usingDirectPlaybackRef.current) {
        const v = videoRef.current as any;
        const effCurrent = v ? Math.max(0, (v.currentTime || 0) + streamSeekOffsetRef.current) : 0;

        // Mark that we should resume playback after extraction completes.
        subtitleResumeAfterLoadRef.current = true;
        subtitleInterruptionRef.current = true;

        // Stop and teardown live players to free the upstream connection.
        teardownPlayers();

        // Give the teardown a short moment to close sockets.
        await new Promise((r) => setTimeout(r, 250));

        // Perform blocking full extraction (stop playback to free upstream).
        setSubtitleLoading(true);
        subtitleLoadingRef.current = true;
        setSubtitleText("Fetching subtitles...");
        const extractionResult = await fetchSubtitleCues(trackId, undefined, true);

        // After extraction, resume playback from the saved effective time.
        subtitleLoadingRef.current = false;
        setSubtitleLoading(false);
        subtitleInterruptionRef.current = false;

        if (subtitleResumeAfterLoadRef.current) {
          subtitleResumeAfterLoadRef.current = false;
          try {
            // Prefer to restart in the same playback mode we were in.
            if (playbackModeRef.current === "stream-ts-fallback") {
              startFastTsPlaybackRef.current?.(effCurrent, selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0);
            } else {
              startNativePlaybackRef.current?.(effCurrent);
            }
          } catch {}
        }

        if (extractionResult === "success") {
          setNativeSubtitleActive(false);
          toast.success("Subtitles loaded");
        } else if (extractionResult === "aborted") {
          // Keep previous subtitle state
        } else {
          // extraction failed — try native as fallback
          if (trySwitchNativeSubtitleTrack(trackId)) {
            toast.success("Native subtitles enabled");
          } else {
            setSubtitleCues([]);
            setSubtitleText("");
            toast.error("Subtitle extraction failed");
          }
        }
      } else {
        // Background extraction — video keeps playing.
        // Uses the cache-check + low-bandwidth path (noFullDownload=1) to avoid
        // competing with playback. On a cache hit this returns almost immediately.
        // If the stream has no cached subtitles yet this will fail fast (~10s)
        // and queue a server-side background extraction so the NEXT selection
        // attempt can hit the cache.
        setSubtitleLoading(true);
        subtitleLoadingRef.current = true;
        setSubtitleText("Fetching subtitles...");

        const extractionResult = await fetchSubtitleCues(trackId);

        if (subtitleSwitchSeqRef.current === requestSeq) {
          setSubtitleLoading(false);
          subtitleLoadingRef.current = false;
          if (extractionResult === "success") {
            setNativeSubtitleActive(false);
            toast.success("Subtitles loaded");
          } else if (extractionResult === "aborted") {
            // keep previous subtitle state
          } else {
            if (trySwitchNativeSubtitleTrack(trackId)) {
              toast.success("Native subtitles enabled");
            } else {
              setSubtitleCues([]);
              setSubtitleText("");
              toast.warning("Subtitles unavailable — the stream may require a native TV device or a prior extraction pass");
            }
          }
        }
      }
    }
  }, [
    activePlaylist?.accountInfo?.user?.max_connections,
    audioOffsetMs,
    fetchSubtitleCues,
    isLiveStream,
    startRemuxPlayback,
    subtitleTracks,
    trySwitchNativeSubtitleTrack,
  ]);

  const switchSubtitleLanguage = useCallback(
    (langCode: string) => {
      const code = String(langCode || "und").toUpperCase();
      const candidates = subtitleTracks.filter(
        (track) => String(track.lang || "und").toUpperCase() === code,
      );
      if (candidates.length === 0) return;

      const preferred =
        candidates.find((track) => !/\b(sdh|cc|forced)\b/i.test(track.name)) ||
        candidates.find((track) => /\bforced\b/i.test(track.name)) ||
        candidates[0];

      void handleSubtitleChange(preferred.id);
    },
    [handleSubtitleChange, subtitleTracks],
  );

  useEffect(() => {
    if (selectedSubtitle < 0) return;
    if (!subtitleText) return;
    const preview = subtitleText.replace(/\s+/g, " ").trim().slice(0, 200);
    reportPlaybackDebug("player.subtitleCue", {
      trackId: selectedSubtitle,
      text: preview,
    });
  }, [selectedSubtitle, subtitleText]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (selectedSubtitle < 0) {
      try {
        hls.subtitleTrack = -1;
      } catch {}
      setNativeSubtitleActive(false);
      return;
    }
    try {
      hls.subtitleTrack = selectedSubtitle;
    } catch {}
    setNativeSubtitleActive(true);
  }, [selectedSubtitle]);

  useEffect(() => {
    if (!nativeSubtitleActive || selectedSubtitle < 0) return;
    const v = videoRef.current as any;
    const textTracks = v?.textTracks;
    if (!textTracks || typeof textTracks.length !== "number") return;

    const safeIndex = clamp(selectedSubtitle, 0, Math.max(0, textTracks.length - 1));

    for (let i = 0; i < textTracks.length; i++) {
      try {
        textTracks[i].mode = i === safeIndex ? "hidden" : "disabled";
      } catch {}
    }

    const updateFromNativeCue = () => {
      const track = textTracks[safeIndex];
      if (!track) {
        setSubtitleText("");
        return;
      }
      const active = track.activeCues;
      if (!active || active.length === 0) {
        setSubtitleText("");
        return;
      }
      const lines: string[] = [];
      for (let i = 0; i < active.length; i++) {
        const cue = active[i] as any;
        const text = cleanSubtitleText(String(cue?.text || cue?.payload || ""));
        if (text) lines.push(text);
      }
      setSubtitleText(lines.join("\n"));
    };

    const track = textTracks[safeIndex] as any;
    const prevCueChange = track?.oncuechange;
    if (track) {
      track.oncuechange = updateFromNativeCue;
    }
    const timer = window.setInterval(updateFromNativeCue, 200);
    updateFromNativeCue();

    return () => {
      window.clearInterval(timer);
      if (track) {
        track.oncuechange = prevCueChange || null;
      }
    };
  }, [nativeSubtitleActive, selectedSubtitle]);

  const updateAudioDelay = useCallback((nextMs: number) => {
    const clampedMs = clamp(Math.round(nextMs), -3000, 3000);
    setAudioOffsetMs(clampedMs);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      userPausedRef.current = false;
      if (mpegtsRef.current) {
        try {
          const playerPlay = mpegtsRef.current.play?.();
          if (playerPlay && typeof playerPlay.catch === "function") {
            playerPlay.catch(() => {});
          }
        } catch {}
        const playPromise = v.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            if (!isTimeBuffered(v, v.currentTime, 0.35) && v.readyState < 2) {
              const resumeAt = Number.isFinite(v.currentTime) ? v.currentTime + streamSeekOffsetRef.current : 0;
              const audioIdx = selectedAudio >= 0 ? selectedAudio : 0;
              setIsLoading(true);
              startFastTsPlayback(resumeAt, audioIdx);
            }
          });
        }
        return;
      }
      v.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      v.pause();
    }
  };

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    // Compute effective current time (video.currentTime + TS stream offset).
    const effCurrent = v.currentTime + streamSeekOffsetRef.current;
    const baseDuration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : effectiveDuration;
    const effTarget =
      baseDuration > 0
        ? clamp(effCurrent + delta, 0, baseDuration)
        : Math.max(0, effCurrent + delta);

    if (mpegtsRef.current) {
      // Convert to video-local time (0-based within this TS stream instance).
      const videoTarget = effTarget - streamSeekOffsetRef.current;
      if (videoTarget >= 0 && isTimeBuffered(v, videoTarget, 1.5)) {
        // Target is within buffered range — seek directly.
        v.currentTime = videoTarget;
        setCurrentTime(effTarget);
        if (!userPausedRef.current) v.play().catch(() => {});
        setIsLoading(false);
      } else {
        // Target is outside buffer — restart stream at the new effective position.
        const audioIdx = selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0;
        setCurrentTime(effTarget);
        startFastTsPlayback(effTarget, audioIdx);
      }
      return;
    }

    // Non-TS streams: seek natively.
    v.currentTime = effTarget;
    setCurrentTime(effTarget);
    if (isTimeBuffered(v, effTarget, 1.5)) {
      if (!userPausedRef.current) v.play().catch(() => {});
      setIsLoading(false);
      return;
    }
    if (!userPausedRef.current) v.play().catch(() => {});
    setIsLoading(true);
    if (seekApplyTimerRef.current) clearTimeout(seekApplyTimerRef.current);
    seekApplyTimerRef.current = setTimeout(() => {
      if (v.readyState >= 2) setIsLoading(false);
    }, 1500);
  };

  const handleSeekChange = (value: number) => {
    const v = videoRef.current;
    if (!v) return;
    // value is effective time (video.currentTime + stream offset space)
    const maxDuration = effectiveDuration || 0;
    const effTarget = maxDuration > 0 ? clamp(value, 0, maxDuration) : Math.max(0, value);

    if (mpegtsRef.current) {
      const videoTarget = effTarget - streamSeekOffsetRef.current;
      if (videoTarget >= 0 && isTimeBuffered(v, videoTarget, 1.5)) {
        v.currentTime = videoTarget;
        setCurrentTime(effTarget);
        if (!userPausedRef.current) v.play().catch(() => {});
        setIsLoading(false);
      } else {
        const audioIdx = selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0;
        setCurrentTime(effTarget);
        startFastTsPlayback(effTarget, audioIdx);
      }
      return;
    }

    // Non-TS streams: seek natively.
    v.currentTime = effTarget;
    setCurrentTime(effTarget);
    if (isTimeBuffered(v, effTarget, 1.5)) {
      if (!userPausedRef.current) v.play().catch(() => {});
      setIsLoading(false);
      return;
    }
    if (!userPausedRef.current) v.play().catch(() => {});
    setIsLoading(true);
    if (seekApplyTimerRef.current) clearTimeout(seekApplyTimerRef.current);
    seekApplyTimerRef.current = setTimeout(() => {
      if (v.readyState >= 2) setIsLoading(false);
    }, 1500);
    if (hlsRef.current) {
      try { hlsRef.current.startLoad(-1); } catch {}
    }
  };

  const handleSeekScrubStart = () => {
    setIsScrubbing(true);
    setScrubTime(currentTime);
  };

  const handleSeekScrubMove = (value: number) => {
    if (!Number.isFinite(value)) return;
    if (!isScrubbing) setIsScrubbing(true);
    setScrubTime(Math.max(0, value));
  };

  const handleSeekScrubCommit = () => {
    const target = scrubTime;
    setIsScrubbing(false);
    setScrubTime(null);
    if (target === null || !Number.isFinite(target)) return;
    handleSeekChange(target);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted || v.volume === 0) {
      const restore = lastVolumeRef.current > 0 ? lastVolumeRef.current : 1;
      v.muted = false;
      v.volume = restore;
      setVolume(restore);
      setIsMuted(false);
      return;
    }
    lastVolumeRef.current = v.volume > 0 ? v.volume : lastVolumeRef.current;
    v.muted = true;
    setIsMuted(true);
  };

  const setPlayerVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clampedVal = clamp(val, 0, 1);
    if (clampedVal > 0) lastVolumeRef.current = clampedVal;
    v.volume = clampedVal;
    v.muted = clampedVal === 0;
    setVolume(clampedVal);
    setIsMuted(clampedVal === 0);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const playNextEpisode = useCallback(() => {
    if (!episodes || currentIndex === null) return;
    const next = episodes[currentIndex + 1];
    if (!next) return;
    navigate("/watch", {
      replace: true,
      state: {
        title: next.fullTitle || next.title || "Episode",
        url: next.url,
        poster: next.info?.movie_image || poster,
        extension: next.container_extension || "mp4",
        seriesId,
        playlistId,
        episodeSeason: next.season,
        episodeNum: next.episode_num,
        episodeTitle: next.title,
        seriesName,
        streamInfo: next.info ?? null,
        episodes,
        currentIndex: currentIndex + 1,
      },
    });
  }, [currentIndex, episodes, navigate, playlistId, poster, seriesId, seriesName]);

  const persistSeriesProgress = useCallback(() => {
    if (!seriesId || !playlistId) return;
    const v = videoRef.current;
    if (!v) return;
    const ct = Math.floor((v.currentTime || 0) + streamSeekOffsetRef.current);
    const rawDuration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : effectiveDuration;
    const dur = Math.floor(rawDuration || 0);
    if (!Number.isFinite(dur) || dur <= 0) return;
    if (ct < 3) return;
    const key = `nova_progress_series_${playlistId}`;
    try {
      const raw = localStorage.getItem(key);
      const store: Record<string, any> = raw ? JSON.parse(raw) : {};
      const finished = dur > 0 && ct / dur > 0.95;
      if (finished) delete store[String(seriesId)];
      else {
        store[String(seriesId)] = {
          episodeId: initialUrl.split("/").pop()?.split(".")[0] ?? "",
          season: episodeSeason,
          episodeNum,
          episodeTitle,
          seriesName,
          currentTime: ct,
          duration: dur,
          updatedAt: Date.now(),
        };
      }
      localStorage.setItem(key, JSON.stringify(store));
    } catch {}
  }, [effectiveDuration, episodeNum, episodeSeason, episodeTitle, initialUrl, playlistId, seriesId, seriesName]);

  const handleTVKey = useCallback((e: Event) => {
    const key = (e as CustomEvent).detail?.key as string;
    if (!key) return;
    if (key === "back") {
      if (settingsOpen) setSettingsOpen(false);
      else closePlayer();
      return;
    }
    if (key === "green") {
      setSettingsOpen((p) => !p);
      return;
    }
    if (settingsOpen) {
      if (key === "left") {
        setFocusIndex((p) => Math.max(0, p - 1));
        return;
      }
      if (key === "right") {
        setFocusIndex((p) => p + 1);
        return;
      }
      if (key === "up") {
        if (settingsTab === "subtitle") setSubtitleOffsetMs((p) => clamp(p - 100, -8000, 8000));
        if (settingsTab === "audio") updateAudioDelay(audioOffsetMs - 100);
        return;
      }
      if (key === "down") {
        if (settingsTab === "subtitle") setSubtitleOffsetMs((p) => clamp(p + 100, -8000, 8000));
        if (settingsTab === "audio") updateAudioDelay(audioOffsetMs + 100);
        return;
      }
      if (key === "enter") {
        const audioLimit = Math.max(0, audioTracks.length - 1);
        const subtitleLimit = Math.max(0, subtitleTracks.length - 1);
        if (settingsTab === "audio" && audioTracks.length > 0) switchAudioTrack(clamp(focusIndex, 0, audioLimit));
        if (settingsTab === "subtitle") {
          if (focusIndex === 0) handleSubtitleChange(-1);
          else if (subtitleTracks.length > 0) handleSubtitleChange(clamp(focusIndex - 1, 0, subtitleLimit));
        }
        if (settingsTab === "display") {
          const entry = settingsEntries[focusIndex];
          if (entry === "Subtitle Top") updateSettings({ subtitlePosition: "top" });
          else if (entry === "Subtitle Bottom") updateSettings({ subtitlePosition: "bottom" });
          else if (entry === "Subtitle Large") updateSettings({ subtitleSize: "large" });
          else if (entry === "Subtitle Medium") updateSettings({ subtitleSize: "medium" });
          return;
        }
        return;
      }
      return;
    }
    if (key === "enter" || key === "playpause") {
      togglePlay();
      return;
    }
    if (key === "left" || key === "rewind") {
      seekBy(-10);
      return;
    }
    if (key === "right" || key === "fastforward") {
      seekBy(10);
      return;
    }
    if (key === "up") {
      setPlayerVolume(volume + 0.06);
      return;
    }
    if (key === "down") setPlayerVolume(volume - 0.06);
  }, [audioOffsetMs, audioTracks.length, focusIndex, handleSubtitleChange, navigate, settingsOpen, settingsTab, subtitleTracks.length, updateAudioDelay, volume, switchAudioTrack]);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    if (!streamInfo) return;
    const toArr = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
    const preAudio = toArr(streamInfo.audio).map((a: any, i: number) => {
      const lang = (a.tags?.language || "und").toUpperCase();
      const codec = (a.codec_name || "audio").toUpperCase();
      return { id: i, name: a.tags?.title || `${lang} ${codec}`, lang, codec } as TrackItem;
    });
    const preSub = toArr(streamInfo.sub).map((s: any, i: number) => {
      const lang = (s.tags?.language || "und").toUpperCase();
      const codec = (s.codec_name || "subtitle").toUpperCase();
      return { id: i, name: s.tags?.title || `${lang} ${codec}`, lang, codec } as TrackItem;
    });
    if (preAudio.length > 0) {
      setAudioTracks(preAudio);
      setSelectedAudio(preAudio[0]?.id ?? 0);
    }
    if (preSub.length > 0) setSubtitleTracks(preSub);
  }, [streamInfo]);

  useEffect(() => {
    inferredDurationRef.current = inferredDuration;
    if (inferredDuration > 0 && (!Number.isFinite(duration) || duration <= 0)) {
      setDuration(inferredDuration);
    }
  }, [duration, inferredDuration]);

  useEffect(() => {
    initPlayback(); // initPlayback now handles loadTrackMetadata internally
    resetControlsVisibility();
    return () => {
      if (seekApplyTimerRef.current) {
        clearTimeout(seekApplyTimerRef.current);
        seekApplyTimerRef.current = null;
      }
      teardownPlayers();
      clearHideTimer();
    };
  }, [initPlayback, resetControlsVisibility, teardownPlayers]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const clearWaitingTimer = () => {
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
        waitingTimerRef.current = null;
      }
    };
    const clearSeekRecoveryTimer = () => {
      if (seekRecoveryTimerRef.current) {
        clearTimeout(seekRecoveryTimerRef.current);
        seekRecoveryTimerRef.current = null;
      }
    };
    const recoverFromStall = () => {
      const hls = hlsRef.current;
      if (hls) {
        try {
          hls.startLoad(-1);
        } catch {}
        try {
          hls.recoverMediaError();
        } catch {}
      }
      if (v.readyState >= 2) {
        setIsLoading(false);
      }
      if (v.paused && !document.hidden) {
        v.play().catch(() => {});
      }
    };
    const onPlaying = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      if (seekApplyTimerRef.current) {
        clearTimeout(seekApplyTimerRef.current);
        seekApplyTimerRef.current = null;
      }
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onPause = () => setIsPlaying(false);
    const onSeeking = () => {
      if (subtitleInterruptionRef.current) return;
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      setIsLoading(true);
      seekRecoveryTimerRef.current = setTimeout(() => {
        if (v.readyState < 3) recoverFromStall();
      }, 5000);
    };
    const onSeeked = () => {
      if (subtitleInterruptionRef.current) return;
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      if (seekApplyTimerRef.current && v.readyState >= 2) {
        clearTimeout(seekApplyTimerRef.current);
        seekApplyTimerRef.current = null;
      }
      setIsLoading(false);
      if (v.paused && !document.hidden && !userPausedRef.current) {
        v.play().catch(() => {});
      }
      // Re-fetch subtitles if current cues don't cover the new seek position.
      // This handles the case where seek-based partial results don't reach the new position.
      const trackId = selectedSubtitleRef.current;
      if (trackId >= 0) {
        const effTime = v.currentTime + streamSeekOffsetRef.current;
        const cues = subtitleCuesRef.current;
        // Check if any cue exists near the current position (within 60s)
        const hasCoverageNearby = cues.some(c => c.end >= effTime - 5 && c.start <= effTime + 60);
        if (!hasCoverageNearby && cues.length > 0) {
          // Cues loaded but none cover current position — re-fetch from seek point
          console.log(`[subtitle] seek gap detected at ${effTime.toFixed(1)}s, re-fetching track ${trackId}`);
          fetchSubtitleCuesRef.current?.(trackId, Math.floor(effTime));
        }
      }
    };
    const onWaiting = () => {
      if (subtitleInterruptionRef.current) return;
      clearWaitingTimer();
      waitingTimerRef.current = setTimeout(() => {
        if (!v.paused && v.readyState < 3) {
          setIsLoading(true);
          clearSeekRecoveryTimer();
          seekRecoveryTimerRef.current = setTimeout(() => {
            if (v.readyState < 3) recoverFromStall();
          }, 5000);
        }
      }, 350);
    };
    const onCanPlay = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      setIsLoading(false);
    };
    const onCanPlayThrough = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      setIsLoading(false);
    };
    const onStalled = () => {
      if (subtitleInterruptionRef.current) return;
      if (
        usingDirectPlaybackRef.current &&
        !forceProxyPlaybackRef.current &&
        !failingOverToProxyRef.current
      ) {
        const seek = Number.isFinite(v.currentTime) ? v.currentTime + streamSeekOffsetRef.current : 0;
        failoverToProxy(seek);
        return;
      }
      setIsLoading(true);
      clearSeekRecoveryTimer();
      seekRecoveryTimerRef.current = setTimeout(() => {
        if (v.readyState < 3) recoverFromStall();
      }, 5000);
    };
    const onTimeUpdate = () => {
      // Effective time = video.currentTime (0-based per TS stream) + stream seek offset.
      setCurrentTime((v.currentTime || 0) + streamSeekOffsetRef.current);
    };
    const onDuration = () => {
      // Trust native duration only if it's not suspiciously short (e.g. < 1min) 
      // while the API tells us the file is actually long.
      const nativeDur = v.duration;
      if (Number.isFinite(nativeDur) && nativeDur > 0) {
        if (nativeDur < 60 && inferredDurationRef.current > 600) {
          setDuration(inferredDurationRef.current);
        } else {
          setDuration(nativeDur);
        }
      }
      else if (inferredDurationRef.current > 0) setDuration(inferredDurationRef.current);
    };
    const onVolume = () => {
      setVolume(v.volume);
      setIsMuted(v.muted || v.volume === 0);
    };
    const onLoadedMeta = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      setIsLoading(false);
      const nativeDur = v.duration;
      if (Number.isFinite(nativeDur) && nativeDur > 60) {
        setDuration(nativeDur);
      } else if (inferredDurationRef.current > 0) {
        setDuration(inferredDurationRef.current);
      }
      if (!userPausedRef.current) {
        v.play().catch(() => {});
      }
    };
    const onError = () => {
      if (subtitleInterruptionRef.current) return;
      clearWaitingTimer();
      clearSeekRecoveryTimer();

      if (
        isMkvSourceRef.current &&
        preferNativeMkvRef.current &&
        !mpegtsRef.current &&
        !remuxFallbackTriedRef.current
      ) {
        remuxFallbackTriedRef.current = true;
        const fallbackSeek = Number.isFinite(v.currentTime) ? v.currentTime + streamSeekOffsetRef.current : 0;
        startFastTsPlaybackRef.current(
          Math.max(0, fallbackSeek),
          selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0,
        );
        return;
      }

      if (
        !isLiveStreamRef.current &&
        !hlsRef.current &&
        usingDirectPlaybackRef.current &&
        !forceProxyPlaybackRef.current
      ) {
        // First failure on direct VOD playback: fail over to proxy for this
        // playback session without touching playlist/listing fetch behavior.
        const fallbackSeek = Number.isFinite(v.currentTime) ? v.currentTime + streamSeekOffsetRef.current : 0;
        failoverToProxy(fallbackSeek);
        return;
      }

      if (
        !isLiveStreamRef.current &&
        !hlsRef.current &&
        ffprobeAvailable.current &&
        !remuxFallbackTriedRef.current
      ) {
        remuxFallbackTriedRef.current = true;
        const fallbackSeek = Number.isFinite(v.currentTime) ? v.currentTime + streamSeekOffsetRef.current : 0;
        startNativePlaybackRef.current(Math.max(0, fallbackSeek));
        return;
      }
      setError("Playback failed. Please retry.");
      setIsLoading(false);
    };
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("canplaythrough", onCanPlayThrough);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("durationchange", onDuration);
    v.addEventListener("volumechange", onVolume);
    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("canplaythrough", onCanPlayThrough);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("durationchange", onDuration);
      v.removeEventListener("volumechange", onVolume);
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("error", onError);
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      if (remuxSwitchTimerRef.current) {
        clearTimeout(remuxSwitchTimerRef.current);
        remuxSwitchTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    startSubtitleEngine();
    return () => stopSubtitleEngine();
  }, [startSubtitleEngine, stopSubtitleEngine]);

  useEffect(() => {
    window.addEventListener("tv-remote-key", handleTVKey);
    return () => window.removeEventListener("tv-remote-key", handleTVKey);
  }, [handleTVKey]);

  useEffect(() => {
    if (!episodes || currentIndex === null || currentIndex + 1 >= episodes.length) return;
    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => {
      let c = 7;
      setNextEpisodeCountdown(c);
      nextEpTimerRef.current = setInterval(() => {
        c -= 1;
        if (c <= 0) {
          if (nextEpTimerRef.current) {
            clearInterval(nextEpTimerRef.current);
            nextEpTimerRef.current = null;
          }
          playNextEpisode();
        } else setNextEpisodeCountdown(c);
      }, 1000);
    };
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("ended", onEnded);
      if (nextEpTimerRef.current) {
        clearInterval(nextEpTimerRef.current);
        nextEpTimerRef.current = null;
      }
      setNextEpisodeCountdown(null);
    };
  }, [currentIndex, episodes, playNextEpisode]);

  useEffect(() => {
    if (!seriesId || !playlistId) return;
    const timer = setInterval(() => persistSeriesProgress(), 5000);
    return () => {
      clearInterval(timer);
      persistSeriesProgress();
    };
  }, [persistSeriesProgress, playlistId, seriesId]);

  useEffect(() => {
    if (selectedSubtitle < 0) {
      setSubtitleText("");
      subtitleLastTextRef.current = "";
    }
  }, [selectedSubtitle]);

  useEffect(() => {
    return () => {
      subtitleFetchAbortRef.current?.abort();
    };
  }, []);

  const formatTime = (s: number) => {
    if (!Number.isFinite(s)) return "--:--";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  // When scrubbing, show the drag position; otherwise show effective currentTime
  // (which already includes the stream seek offset via onTimeUpdate).
  const displayedSeekTime = isScrubbing && scrubTime !== null ? scrubTime : currentTime;

  const settingsEntries = useMemo(() => {
    if (settingsTab === "audio") return audioTracks.map((a) => a.name);
    if (settingsTab === "subtitle") return ["Off", ...subtitleTracks.map((s) => s.name)];
    return ["Subtitle Top", "Subtitle Bottom", "Subtitle Large", "Subtitle Medium"];
  }, [audioTracks, settingsTab, subtitleTracks]);

  useEffect(() => {
    setFocusIndex(0);
  }, [settingsTab]);

  return (
    <div ref={containerRef} className="relative h-screen w-full overflow-hidden bg-black" onMouseMove={resetControlsVisibility} onClick={resetControlsVisibility}>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain bg-black"
        playsInline
        crossOrigin="anonymous"
        preload="auto"
        poster={poster ? `${(getMediaApiBaseUrl() || window.location.origin).replace(/\/$/, "")}/api/proxy?url=${encodeURIComponent(poster)}` : undefined}
      />

      {subtitleText && selectedSubtitle >= 0 && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-6 transition-all duration-300",
            settings.subtitlePosition === "top"
              ? "top-[calc(6rem+env(safe-area-inset-top,0px))]"
              : "bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))]",
          )}
        >
          <div
            className={cn(
              "max-w-[90%] w-fit text-center px-4 py-2 rounded-md leading-tight break-words",
              settings.subtitleSize === "large"
                ? "text-3xl md:text-4xl"
                : settings.subtitleSize === "medium"
                ? "text-xl md:text-2xl"
                : "text-base md:text-lg",
            )}
            style={{
              color: settings.subtitleColor || "#ffffff",
              background: `rgba(0,0,0,${settings.subtitleBgOpacity ?? 0.6})`,
              textShadow:
                settings.subtitleEdge === "shadow"
                  ? "0 8px 18px rgba(0,0,0,0.85)"
                  : undefined,
              WebkitTextStroke:
                settings.subtitleEdge === "stroke" ? "0.06em rgba(0,0,0,0.95)" : undefined,
              padding: "0.5rem 1rem",
              boxShadow: settings.subtitleEdge === "shadow" ? "0 6px 20px rgba(0,0,0,0.6)" : undefined,
              borderRadius: "10px",
              whiteSpace: "pre-line",
            }}
          >
            {subtitleText}
          </div>
        </div>
      )}

      {(isLoading || subtitleLoading) && !error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 animate-spin text-white" />
            {subtitleLoading && <div className="text-sm font-medium text-white/85">Fetching subtitles...</div>}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-8">
          <div className="max-w-xl rounded-2xl border border-white/10 bg-zinc-950/95 p-6 text-center">
            <p className="text-lg text-red-300">{error}</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button onClick={() => { setError(null); initPlayback(); }} className="rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/90">Retry</button>
              <button onClick={closePlayer} className="rounded-lg bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20">Back</button>
            </div>
          </div>
        </div>
      )}

      {nextEpisodeCountdown !== null && (
        <div className="absolute bottom-28 right-6 z-30 rounded-2xl border border-white/10 bg-black/75 p-4">
          <p className="text-sm text-white/70">Next episode in {nextEpisodeCountdown}s</p>
          <button onClick={playNextEpisode} className="mt-2 rounded-lg bg-primary px-3 py-1 text-sm font-semibold text-white">Play now</button>
        </div>
      )}

      <div className={cn("absolute inset-0 z-25 flex flex-col justify-between bg-linear-to-b from-black/70 via-transparent to-black/85 transition-opacity duration-250", showControls || settingsOpen ? "opacity-100" : "pointer-events-none opacity-0")}>
        <div className="flex items-center gap-3 p-4">
          <button onClick={closePlayer} className="rounded-full bg-black/40 p-2 text-white hover:bg-white/20" title="Back"><ChevronLeft className="h-6 w-6" /></button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-white">{initialTitle}</h1>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="mb-3 flex items-center gap-3 text-sm text-white/85">
            <span className="w-14 text-right font-mono">{formatTime(displayedSeekTime)}</span>
            <input
              type="range"
              min={0}
              max={effectiveDuration > 0 ? effectiveDuration : Math.max(displayedSeekTime + 300, 300)}
              step={0.25}
              value={displayedSeekTime}
              onMouseDown={handleSeekScrubStart}
              onTouchStart={handleSeekScrubStart}
              onChange={(e) => handleSeekScrubMove(parseFloat(e.target.value))}
              onMouseUp={handleSeekScrubCommit}
              onTouchEnd={handleSeekScrubCommit}
              onKeyUp={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
                  handleSeekScrubCommit();
                }
              }}
              onBlur={handleSeekScrubCommit}
              className="h-1.5 flex-1 cursor-pointer accent-primary"
              title="Seek"
            />
             <span className="w-14 font-mono">{effectiveDuration > 0 ? formatTime(effectiveDuration) : "--:--"}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="rounded-full p-2 text-white hover:bg-white/15" title={isPlaying ? "Pause" : "Play"}>{isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-white" />}</button>
              <button onClick={() => seekBy(-10)} className="rounded-full p-2 text-white hover:bg-white/15" title="Back 10s"><SkipBack className="h-5 w-5" /></button>
              <button onClick={() => seekBy(10)} className="rounded-full p-2 text-white hover:bg-white/15" title="Forward 10s"><SkipForward className="h-5 w-5" /></button>
              <button onClick={toggleMute} className="rounded-full p-2 text-white hover:bg-white/15" title="Mute">{isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
              <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={(e) => setPlayerVolume(parseFloat(e.target.value))} className="h-1.5 w-24 cursor-pointer accent-primary" title="Volume" />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => { setSettingsOpen((p) => !p); setSettingsTab("audio"); setAudioMenuOpen(false); setSubtitleMenuOpen(false); }} className={cn("rounded-full p-2 text-white transition-colors", settingsOpen ? "bg-primary" : "hover:bg-white/15")} title="Settings"><Settings className="h-5 w-5" /></button>
              <button onClick={() => { setAudioMenuOpen((p) => !p); setSubtitleMenuOpen(false); setSettingsOpen(false); }} className={cn("rounded-full p-2 text-white hover:bg-white/15", audioMenuOpen ? "bg-white/10" : "")} title="Audio Tracks"><Music className="h-5 w-5" /></button>
              <button onClick={() => { setSubtitleMenuOpen((p) => !p); setAudioMenuOpen(false); setSettingsOpen(false); }} className={cn("rounded-full p-2 text-white hover:bg-white/15", subtitleMenuOpen ? "bg-white/10" : "")} title="Subtitles"><Subtitles className="h-5 w-5" /></button>
              <button onClick={toggleFullscreen} className="rounded-full p-2 text-white hover:bg-white/15" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {audioMenuOpen && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-24 right-6 z-40 w-80 rounded-xl border border-white/10 bg-zinc-900/95 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-white/60">Audio Tracks</p>
              <button ref={audioCloseButtonRef} onClick={() => setAudioMenuOpen(false)} className="rounded-md bg-white/5 px-2 py-1 text-xs text-white" title="Close audio menu">Close</button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {audioTracks.length === 0 && <div className="text-sm text-white/50">No audio tracks</div>}
              {audioTracks.map((a) => (
                    <button key={a.id} onClick={() => { switchAudioTrack(a.id); setAudioMenuOpen(false); }} className={cn("w-full text-left px-3 py-2 rounded-md text-sm transition-all", selectedAudio === a.id ? "bg-gradient-to-r from-primary/80 to-primary/60 text-white shadow-[0_0_20px_rgba(66,133,244,0.4)]" : "bg-white/5 text-white/80 hover:bg-gradient-to-r hover:from-white/12 hover:to-white/6 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]")}>
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-4 h-4 text-white/90" />
                    <span className="truncate">{a.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {subtitleMenuOpen && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute bottom-24 right-20 z-40 w-96 rounded-xl border border-white/10 bg-zinc-900/95 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-white/60">Subtitles</p>
              <button ref={subtitleCloseButtonRef} onClick={() => setSubtitleMenuOpen(false)} className="rounded-md bg-white/5 px-2 py-1 text-xs text-white" title="Close subtitle menu">Close</button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1">
                  <button onClick={() => { void handleSubtitleChange(-1); setSubtitleMenuOpen(false); }} className={cn("w-full text-left px-3 py-2 rounded-md text-sm transition-all", selectedSubtitle < 0 ? "bg-gradient-to-r from-primary/80 to-primary/60 text-white shadow-[0_0_20px_rgba(66,133,244,0.4)]" : "bg-white/5 text-white/80 hover:bg-gradient-to-r hover:from-white/12 hover:to-white/6 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]")}>Off</button>
              {subtitleTracks.length === 0 && <div className="text-sm text-white/50">No subtitles</div>}
              {subtitleTracks.map((s) => (
                <button key={s.id} onClick={() => { void handleSubtitleChange(s.id); setSubtitleMenuOpen(false); }} className={cn("w-full text-left px-3 py-2 rounded-md text-sm transition-all", selectedSubtitle === s.id ? "bg-gradient-to-r from-primary/80 to-primary/60 text-white shadow-[0_0_20px_rgba(66,133,244,0.4)]" : "bg-white/5 text-white/80 hover:bg-gradient-to-r hover:from-white/12 hover:to-white/6 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]")}>
                  <div className="flex items-center gap-3">
                    <Subtitles className="w-4 h-4 text-white/90" />
                    <span className="truncate">{s.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {settingsOpen && (
          <motion.aside ref={settingsAsideRef} initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 320, opacity: 0 }} transition={{ duration: 0.18 }} className="absolute right-0 top-0 z-35 h-full w-90 border-l border-white/10 bg-zinc-950/95 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Cinema Settings</h2>
              <button ref={settingsCloseButtonRef} onClick={() => setSettingsOpen(false)} className="rounded-md bg-white/10 px-2 py-1 text-xs text-white" title="Close Settings">Close</button>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
              {(["audio", "subtitle", "display"] as SettingsTab[]).map((tab) => (
                  <button key={tab} onClick={() => setSettingsTab(tab)} className={cn("rounded-md px-2 py-2 font-semibold capitalize transition-all", settingsTab === tab ? "bg-gradient-to-r from-primary/80 to-primary/60 text-white shadow-[0_0_20px_rgba(66,133,244,0.3)]" : "bg-white/10 text-white/75 hover:bg-gradient-to-r hover:from-white/15 hover:to-white/8 hover:shadow-[0_0_15px_rgba(255,255,255,0.08)]")}>{tab}</button>
              ))}
            </div>

            {settingsTab === "audio" && (
              <div className="space-y-3">
                <p className="text-xs text-white/60">Pick audio language track from IPTV stream. HLS uses native rendition switching, and non-HLS uses native browser track switching when supported.</p>
                <div className="max-h-[45vh] overflow-y-auto rounded-md border border-white/10 p-2">
                  {audioTracks.length === 0 && <p className="px-2 py-2 text-sm text-white/50">No audio tracks available</p>}
                  {audioTracks.map((a, i) => (
                    <button key={a.id} onClick={() => switchAudioTrack(a.id)} className={cn("mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-all", selectedAudio === a.id ? "bg-gradient-to-r from-primary/80 to-primary/60 text-white shadow-[0_0_20px_rgba(66,133,244,0.4)]" : i === focusIndex ? "bg-gradient-to-r from-primary/30 to-primary/15 text-white shadow-[0_0_15px_rgba(66,133,244,0.25)]" : "bg-white/5 text-white/80 hover:bg-gradient-to-r hover:from-white/12 hover:to-white/6")}>{a.name}</button>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-xs text-white/65">Audio sync ({audioOffsetMs > 0 ? "+" : ""}{(audioOffsetMs / 1000).toFixed(1)}s)</div>
                  <input type="range" min={-3000} max={3000} step={100} value={audioOffsetMs} onChange={(e) => updateAudioDelay(parseInt(e.target.value, 10))} className="h-1.5 w-full cursor-pointer accent-primary" title="Audio sync" />
                </div>
              </div>
            )}

            {settingsTab === "subtitle" && (
              <div className="space-y-3">
                <p className="text-xs text-white/60">Dynamic subtitle engine for Teletext, ASS/SSA, VTT, SRT, DVB when the IPTV stream exposes text-convertible subtitles.</p>
                {subtitleLanguages.length > 0 && (
                  <div className="rounded-md border border-white/10 bg-white/5 p-2">
                    <p className="mb-2 text-xs text-white/60">Quick language pick</p>
                    <div className="flex flex-wrap gap-2">
                      {subtitleLanguages.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => switchSubtitleLanguage(lang.code)}
                          className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/85 hover:bg-white/20"
                        >
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="max-h-[45vh] overflow-y-auto rounded-md border border-white/10 p-2">
                  <button onClick={() => handleSubtitleChange(-1)} className={cn("mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-all", selectedSubtitle === -1 ? "bg-gradient-to-r from-primary/80 to-primary/60 text-white shadow-[0_0_20px_rgba(66,133,244,0.4)]" : focusIndex === 0 ? "bg-gradient-to-r from-primary/30 to-primary/15 text-white shadow-[0_0_15px_rgba(66,133,244,0.25)]" : "bg-white/5 text-white/80 hover:bg-gradient-to-r hover:from-white/12 hover:to-white/6")}>Off</button>
                  {subtitleTracks.map((s, i) => (
                    <button key={s.id} onClick={() => handleSubtitleChange(s.id)} className={cn("mb-1 w-full rounded-md px-3 py-2 text-left text-sm", selectedSubtitle === s.id ? "bg-primary text-white" : i + 1 === focusIndex ? "bg-white/20 text-white" : "bg-white/5 text-white/80 hover:bg-white/15")}>{s.name}</button>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-xs text-white/65">Subtitle sync ({subtitleOffsetMs > 0 ? "+" : ""}{(subtitleOffsetMs / 1000).toFixed(1)}s)</div>
                  <input type="range" min={-8000} max={8000} step={100} value={subtitleOffsetMs} onChange={(e) => setSubtitleOffsetMs(parseInt(e.target.value, 10))} className="h-1.5 w-full cursor-pointer accent-primary" title="Subtitle sync" />
                </div>
              </div>
            )}

            {settingsTab === "display" && (
              <div className="space-y-2">
                <p className="text-xs text-white/60">Configure your viewing experience. Subtitle positioning and size can be adjusted here for better visibility.</p>
                <div className="max-h-[45vh] overflow-y-auto rounded-md border border-white/10 p-2">
                  {settingsEntries.map((entry, i) => {
                    const isActive = 
                      (entry === "Subtitle Top" && settings.subtitlePosition === "top") ||
                      (entry === "Subtitle Bottom" && settings.subtitlePosition === "bottom") ||
                      (entry === "Subtitle Large" && settings.subtitleSize === "large") ||
                      (entry === "Subtitle Medium" && settings.subtitleSize === "medium");
                      
                    return (
                      <button 
                        key={entry} 
                        onClick={() => {
                          if (entry === "Subtitle Top") updateSettings({ subtitlePosition: "top" });
                          else if (entry === "Subtitle Bottom") updateSettings({ subtitlePosition: "bottom" });
                          else if (entry === "Subtitle Large") updateSettings({ subtitleSize: "large" });
                          else if (entry === "Subtitle Medium") updateSettings({ subtitleSize: "medium" });
                        }}
                        className={cn(
                          "mb-1 w-full rounded-md px-3 py-2 text-left text-sm",
                          isActive ? "bg-primary text-white" : i === focusIndex ? "bg-white/20 text-white" : "bg-white/5 text-white/80 hover:bg-white/15"
                        )}
                      >
                        {isActive ? "✓ " : ""}{entry}
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-white/60 font-semibold">TV Remote Shortcuts</p>
                  <p className="mt-1 text-[10px] text-white/40">Enter: Select, Up/Down: Navigate, Green: Settings.</p>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-md bg-white/5 p-2 text-xs text-white/55">Focus slot: {focusIndex + 1} / {Math.max(1, settingsEntries.length)}</div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}