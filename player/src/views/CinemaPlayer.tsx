import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ChevronLeft, Loader2, Maximize2, Minimize2, Music, Pause, Play, Settings, SkipBack, SkipForward, Subtitles, Volume2, VolumeX } from "lucide-react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { trySwitchPlatformAudioTrack, trySwitchPlatformSubtitleTrack, startPlatformPlayback, platformSupportsEngine, webosRegisterTrack, webosUnregisterTrack, webosGetTracks, normalizePlatformTracks, getPlatformName, webosReadNativeTracks, readShakaTracks, trySelectShakaAudioTrack, trySelectShakaSubtitleTrack, destroyShakaPlayer } from "../lib/platformPlayer";
import { findActiveSubtitleCue } from "../lib/subtitles";
import { isLowPowerTV } from "../lib/tv";
import { reportPlaybackDebug } from "../lib/playbackDebug";
import { getMediaApiBaseUrl } from "../lib/activationApi";
import {
  buildStreamTsUrl,
  getPlaybackOrigin,
  wrapProxyPlaybackUrl,
} from "../lib/streamPlaybackUrl";
import { usePlaylist } from "../context/PlaylistContext";
import { cn } from "../lib/utils";
import { focusNext } from "../lib/remote";


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
type PlaybackMode =
  | "none"
  | "native"
  | "proxy-range"
  | "stream-ts"
  | "stream-ts-fallback"
  | "remux-fallback"
  | "hls-remux";

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

const parseFfprobeDurationTag = (raw: unknown): number => {
  if (typeof raw !== "string") return parseDurationToSeconds(raw);
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return 0;
  return parseDurationToSeconds(normalized);
};

const getStreamDurationSeconds = (stream: any): number => {
  const candidates = [
    stream?.duration,
    stream?.tags?.DURATION,
    stream?.tags?.duration,
  ];
  for (const candidate of candidates) {
    const seconds = parseFfprobeDurationTag(candidate);
    if (seconds > 0) return seconds;
  }
  return 0;
};

const getProbeDurationSeconds = (probe: any): number => {
  const candidates = [
    probe?.duration,
    probe?.format?.duration,
    probe?.format?.tags?.DURATION,
    probe?.format?.tags?.duration,
  ];
  for (const candidate of candidates) {
    const seconds = parseFfprobeDurationTag(candidate);
    if (seconds > 0) return seconds;
  }

  const streamDurations = Array.isArray(probe?.streams)
    ? probe.streams
        .map(getStreamDurationSeconds)
        .filter((seconds: number) => seconds > 0)
    : [];
  return streamDurations.length > 0 ? Math.max(...streamDurations) : 0;
};

const resolveVodDisplayDuration = (
  nativeDuration: number,
  metadataDuration: number,
  inferredDuration: number,
  isLiveStream: boolean,
): number => {
  if (isLiveStream) return 0;
  const trusted = metadataDuration > 0 ? metadataDuration : inferredDuration;
  if (trusted > 0) {
    // Remuxed HLS/TS windows can expose only the generated segment length
    // (for example 3 minutes) even though the movie is much longer.
    if (!Number.isFinite(nativeDuration) || nativeDuration <= 0) return trusted;
    if (nativeDuration < Math.max(300, trusted * 0.5)) return trusted;
  }
  return Number.isFinite(nativeDuration) && nativeDuration > 0 ? nativeDuration : trusted;
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
  const windowGate = (key: string, ttlMs = 3000): boolean => {
    try {
      if (typeof window === "undefined") return false;
      const w = window as unknown as Record<string, unknown>;
      const gateKey = `__nova_gate_${key}`;
      const now = Date.now();
      const prev = Number(w[gateKey] || 0);
      if (Number.isFinite(prev) && now - prev < ttlMs) {
        return true;
      }
      w[gateKey] = now;
      return false;
    } catch {
      return false;
    }
  };

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
  const controlsLayerRef = useRef<HTMLDivElement | null>(null);
  const trackMenuRef = useRef<HTMLDivElement | null>(null);
  const playerSettingsMenuRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const shakaRef = useRef<any>(null);
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
  /** Prevents duplicate async subtitle handlers (VTT + sidecar racing). */
  const subtitleHandoffLockRef = useRef(false);
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
  const metadataDurationRef = useRef(0);
  const remuxFallbackTriedRef = useRef(false);
  const startNativePlaybackRef = useRef<(
    seekSec?: number,
    urlOverrideOrPreferProxy?: string | boolean,
  ) => void>(() => {});
  const startFastTsPlaybackRef = useRef<(seekSec?: number, audioIdx?: number, subIdx?: number) => void>(() => {});
  const startHlsPlaybackRef = useRef<(seekSec?: number) => Promise<boolean>>(
    async () => false,
  );
    const isLiveStreamRef = useRef(false);
  const usingNativePlatformRef = useRef(false);

  const forceProxyPlaybackRef = useRef(false);
  const usingDirectPlaybackRef = useRef(false);
  const userPausedRef = useRef(false);
  const failingOverToProxyRef = useRef(false);
  const selectedAudioRef = useRef(-1);
  const currentFastTsAudioRef = useRef(-1);
  /** FFmpeg absolute stream index for muxed subs in `/api/stream-ts` (TV path). */
  const activeStreamTsSubRef = useRef(-1);
  const audioTracksRef = useRef<TrackItem[]>([]);
  const subtitleTracksRef = useRef<TrackItem[]>([]);
  const remuxSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMkvSourceRef = useRef(false);
  const preferNativeMkvRef = useRef(false);
  const playbackModeRef = useRef<PlaybackMode | null>(null);
  const tsRecoverLockRef = useRef(false);
  const tsRecoverLastAtRef = useRef(0);
  const trackMetadataInflightRef = useRef<Promise<number | null> | null>(null);
  const trackMetadataReadyUrlRef = useRef("");
  const trackMetadataLastAttemptRef = useRef<{ url: string; ts: number }>({
    url: "",
    ts: 0,
  });
  const hlsStartSeqRef = useRef(0);

  const { settings, updateSettings, activePlaylist } = usePlaylist();

    const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [metadataDuration, setMetadataDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
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
  const DEFAULT_SUBTITLE_OFFSET_MS = -700;
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("nova:subtitleOffsetMs");
      if (saved == null || saved === "") return DEFAULT_SUBTITLE_OFFSET_MS;
      const parsed = parseInt(saved, 10);
      return Number.isFinite(parsed) ? parsed : DEFAULT_SUBTITLE_OFFSET_MS;
    } catch {
      return DEFAULT_SUBTITLE_OFFSET_MS;
    }
  });
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
    return initialUrl || "";
  }, [initialUrl]);

  const fastTsBaseUrl = useMemo(() => {
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
    const sessionGateKey = `${initialUrl}|${episodeSeason ?? ""}|${episodeNum ?? ""}|${currentIndex ?? ""}`;
    if (windowGate(`sessionStart_${sessionGateKey}`, 5000)) return;
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

  const effectiveDuration = resolveVodDisplayDuration(
    duration,
    metadataDuration,
    inferredDuration,
    isLiveStream,
  );

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
    console.debug("[player] tearing down all players");
    
    // Stop and destroy MPEG-TS (MSE) player
    if (mpegtsRef.current) {
      try {
        mpegtsRef.current.unload();
        mpegtsRef.current.detachMediaElement();
        mpegtsRef.current.destroy();
      } catch {}
      mpegtsRef.current = null;
    }

    // Stop and destroy HLS player
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    // Stop and destroy Shaka player
    if (shakaRef.current) {
      try {
        destroyShakaPlayer(shakaRef.current);
      } catch {}
      shakaRef.current = null;
    }

    // Stop and destroy platform-specific player (AVPlay/WebOS)
    if (platformPlayerRef.current) {
      try {
        platformPlayerRef.current.stop();
      } catch {}
      platformPlayerRef.current = null;
    }

    // AGGRESSIVE VIDEO ELEMENT CLEANUP (Critical for WebOS/Tizen low memory)
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        // Force browser to dump the current media buffer from RAM
        v.src = ""; 
        v.load();
        v.removeAttribute("src");
        // Clear all text tracks to free up cue memory
        if (v.textTracks) {
          for (let i = 0; i < v.textTracks.length; i++) {
            v.textTracks[i].mode = "disabled";
          }
        }
      } catch (e) {
        console.warn("[player] video element cleanup error:", e);
      }
    }

    usingDirectPlaybackRef.current = false;
    usingNativePlatformRef.current = false;
    playbackModeRef.current = "none";
    setIsLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (remuxSwitchTimerRef.current) {
        clearTimeout(remuxSwitchTimerRef.current);
        remuxSwitchTimerRef.current = null;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (nextEpTimerRef.current) {
        clearInterval(nextEpTimerRef.current);
        nextEpTimerRef.current = null;
      }
      [waitingTimerRef, seekRecoveryTimerRef, seekApplyTimerRef].forEach((timerRef) => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      });
      if (subtitleRafRef.current != null) {
        cancelAnimationFrame(subtitleRafRef.current);
        subtitleRafRef.current = null;
      }
      subtitleFetchAbortRef.current?.abort();
      subtitleFetchAbortRef.current = null;
      teardownPlayers();
    };
  }, [teardownPlayers]);


  const refreshNativeTrackMetadata = useCallback((video: HTMLVideoElement) => {
    const nativeTracks = webosReadNativeTracks(video);
    const audios = nativeTracks.audios.map((track, index) => ({
      id: Number(track.index ?? index),
      name: track.name || `Audio ${index + 1}`,
      lang: String(track.lang || "").toUpperCase(),
      absIndex: Number(track.index ?? index),
    })) as TrackItem[];
    const subtitles = nativeTracks.subtitles.map((track, index) => ({
      id: Number(track.index ?? index),
      name: track.name || `Subtitle ${index + 1}`,
      lang: String(track.lang || "").toUpperCase(),
      absIndex: Number(track.index ?? index),
    })) as TrackItem[];

    if (audios.length > 0) {
      setAudioTracks(audios);
      const activeIndex = (() => {
        const nativeAudioTracks = (video as any).audioTracks;
        if (!nativeAudioTracks || typeof nativeAudioTracks.length !== "number") return 0;
        for (let i = 0; i < nativeAudioTracks.length; i++) {
          if (nativeAudioTracks[i]?.enabled) return i;
        }
        return 0;
      })();
      setSelectedAudio(clamp(activeIndex, 0, audios.length - 1));
    }
    if (subtitles.length > 0) {
      setSubtitleTracks(subtitles);
      setSelectedSubtitle(-1);
    }
  }, []);

  const startNativePlayback = useCallback(
    (seekSec = 0, urlOverrideOrPreferProxy?: string | boolean) => {
      const video = videoRef.current;
      if (!video) return;
      teardownPlayers();
      setIsLoading(true);

      const sourceUrl =
        typeof urlOverrideOrPreferProxy === "string"
          ? urlOverrideOrPreferProxy
          : initialUrl;
      usingDirectPlaybackRef.current = sourceUrl === initialUrl;

      if (!sourceUrl) return;

      const platform = getPlatformName();
      const skipPrebuffer = platform === "webos";

      streamSeekOffsetRef.current = 0;
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
        if (platform === "webos") {
          refreshNativeTrackMetadata(video);
        }
        setIsLoading(false);
        if (seekSec > 0 && Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = clamp(seekSec, 0, video.duration);
        }
        if (skipPrebuffer) {
          void video.play().catch(() => {});
          return;
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
    [initialUrl, refreshNativeTrackMetadata, teardownPlayers],
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
      const remuxedUrl = `${baseRemux.replace(/\/$/, "")}/api/remux?url=${encodeURIComponent(initialUrl)}&audio=${audioStreamIndex >= 0 ? audioStreamIndex : 0}&subtitle=${subtitleStreamIndex >= 0 ? subtitleStreamIndex : -1}&seek=${seekSec.toFixed(3)}&audioDelayMs=${delayMs}&subCodec=${encodeURIComponent(subtitleCodec)}&owner=1`;

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
    if (getPlatformName() === "webos") return null;
    if (trackMetadataReadyUrlRef.current === initialUrl && ffprobeAvailable.current) {
      return selectedAudioRef.current >= 0 ? selectedAudioRef.current : null;
    }
    if (trackMetadataInflightRef.current) {
      return trackMetadataInflightRef.current;
    }

    const now = Date.now();
    const sameRecentFailedAttempt =
      trackMetadataLastAttemptRef.current.url === initialUrl &&
      now - trackMetadataLastAttemptRef.current.ts < 8000 &&
      !ffprobeAvailable.current;
    if (sameRecentFailedAttempt) {
      return null;
    }
    trackMetadataLastAttemptRef.current = { url: initialUrl, ts: now };

    const run = (async (): Promise<number | null> => {
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
      const probedDuration = getProbeDurationSeconds(data);
      if (probedDuration > 0) {
        metadataDurationRef.current = probedDuration;
        setMetadataDuration(probedDuration);
      }

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
      const metadataGateKey = `${initialUrl}|${data.streams.length}`;
      if (!windowGate(`trackMetadata_${metadataGateKey}`, 5000)) {
        reportPlaybackDebug("player.trackMetadata", {
          url: initialUrl,
          streamCount: data.streams.length,
          audioCount: summary.filter((s: any) => s.type === "audio").length,
          subtitleCount: summary.filter((s: any) => s.type === "subtitle").length,
          summary,
        });
      }

      const defaultAudioId = parseTrackInfo(data.streams);
      trackMetadataReadyUrlRef.current = initialUrl;
      return defaultAudioId;
    } catch {
      ffprobeAvailable.current = false;
      return null;
    } finally {
      trackMetadataInflightRef.current = null;
    }
    })();

    trackMetadataInflightRef.current = run;
    return run;
  }, [initialUrl, isHlsStream, isLiveStream, parseTrackInfo]);

  useEffect(() => {
    if (!initialUrl || isHlsStream || isLiveStream) return;
    void loadTrackMetadata();
  }, [initialUrl, isHlsStream, isLiveStream, loadTrackMetadata]);


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

    const nativeAudioTracks = v?.audioTracks;
    if (nativeAudioTracks && typeof nativeAudioTracks.length === "number") {
      const safeIndex = clamp(trackId, 0, Math.max(0, nativeAudioTracks.length - 1));
      try {
        for (let i = 0; i < nativeAudioTracks.length; i++) {
          nativeAudioTracks[i].enabled = i === safeIndex;
        }
        setSelectedAudio(safeIndex);
        return true;
      } catch {
        // Fall through to platform-specific API.
      }
    }

    try {
      if (trySwitchPlatformAudioTrack(v, trackId)) {
        setSelectedAudio(trackId);
      return true;
      }
    } catch {}

    return false;
  }, []);

  const trySwitchNativeSubtitleTrack = useCallback((trackId: number): boolean => {
    const v = videoRef.current as any;
    if (!v) return false;

    const textTracks = v?.textTracks;
    if (textTracks && typeof textTracks.length === "number" && textTracks.length > 0) {
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
    }

    try {
      if (trySwitchPlatformSubtitleTrack(v, trackId)) {
        setNativeSubtitleActive(trackId >= 0);
        setSubtitleCues([]);
        setSubtitleText("");
        return true;
      }
    } catch {}

    return false;
  }, []);

  const failoverToProxy = useCallback((seekSec = 0) => {
    const platform = getPlatformName();
    if (platform !== "web" || !initialUrl || forceProxyPlaybackRef.current) {
      return;
    }
    forceProxyPlaybackRef.current = true;
    failingOverToProxyRef.current = true;
    const proxiedUrl = wrapProxyPlaybackUrl(initialUrl);
    reportPlaybackDebug(
      "player.proxyFailover",
      { seekSec, reason: "direct-playback-stall-or-error" },
      "warn",
    );
    startNativePlaybackRef.current(Math.max(0, seekSec), proxiedUrl);
    window.setTimeout(() => {
      failingOverToProxyRef.current = false;
    }, 1200);
  }, [initialUrl]);

  const startFastTsPlayback = useCallback(
    (seekSec = 0, audioIdx = 0, subIdx = -1) => {
      const video = videoRef.current;
      if (!video || !fastTsBaseUrl) return;
      const platform = getPlatformName();
      const isSmartTv = platform === "webos" || platform === "tizen";
      const isDesktopWeb = platform === "web";

      if (isSmartTv) {
        reportPlaybackDebug(
          "player.tvFfmpegFallbackBlocked",
          { mode: "stream-ts", seekSec, audioIdx, subIdx, platform },
          "warn",
        );
        setIsLoading(false);
        setIsBuffering(false);
        setError("This stream is not supported by the TV native player on this device.");
        return;
      }

      const requestedAudio = audioIdx >= 0 ? audioIdx : selectedAudioRef.current;
      const fallbackAudio = getPreferredAudioTrackId(audioTracksRef.current, selectedAudioRef.current);
      const safeAudio = requestedAudio >= 0 ? requestedAudio : fallbackAudio >= 0 ? fallbackAudio : 0;
      const safeSub =
        subIdx >= 0
          ? subIdx
          : isDesktopWeb
            ? -1
            : activeStreamTsSubRef.current;
      activeStreamTsSubRef.current = safeSub;
      const url = `${fastTsBaseUrl}&seek=${Math.max(0, seekSec).toFixed(3)}&audio=${safeAudio}${safeSub >= 0 ? `&sub=${safeSub}` : ""}`;

      if (!(mpegts.getFeatureList().msePlayback || mpegts.getFeatureList().mseLivePlayback)) {
        teardownPlayers();
        reportPlaybackMode("stream-ts-fallback", "warn");
        startNativePlayback(seekSec, url);
        return;
      }

      // Record the content offset for this stream instance. Because -copyts is
      // NOT used in the backend, the TS output PTS always starts from 0. All
      // effective-time calculations add streamSeekOffsetRef.current to
      // video.currentTime to get the real playback position.
      streamSeekOffsetRef.current = Math.max(0, seekSec);
      setIsLoading(true);
      teardownPlayers();
      reportPlaybackMode("stream-ts-fallback", "warn");
      currentFastTsAudioRef.current = safeAudio;
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
      // Prebuffer briefly on desktop; long waits keep the spinner up on slow panels.
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
        const prebufferTarget = isDesktopWeb ? 6 : isLowPowerTV ? 12 : 20;
        const prebufferWaitMs = isDesktopWeb ? 4000 : 9000;
        const ok = await waitForBufferTarget(prebufferTarget, prebufferWaitMs);
        try {
          const playRet = player.play();
          if (playRet && typeof (playRet as Promise<void>).catch === "function") {
            (playRet as Promise<void>).catch(() => {});
          }
        } catch {}
        if (!ok) {
          // if we couldn't prebuffer enough, ensure playback continues; mpegts player will keep loading
        }
        setIsLoading(false);
      })();
      player.on(mpegts.Events.ERROR, () => {
        // During subtitle single-connection handoff, never auto-restart TS playback.
        // The subtitle extractor needs the only upstream slot.
        if (subtitleInterruptionRef.current || subtitleLoadingRef.current) {
          return;
        }
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

  const startHlsPlayback = useCallback(
    async (seekSec = 0) => {
    const video = videoRef.current;
      if (!video || !initialUrl) return false;
    const requestSeq = ++hlsStartSeqRef.current;
    setIsLoading(true);
    setIsBuffering(false);
    teardownPlayers();

    try {
        const origin = getPlaybackOrigin();
        const startRes = await fetch(
          `${origin}/api/hls/start?url=${encodeURIComponent(initialUrl)}&seek=${seekSec.toFixed(3)}`,
        );
        if (!startRes.ok) throw new Error(`HLS start HTTP ${startRes.status}`);
        const body = (await startRes.json()) as { url?: string };
        const manifestPath = String(body.url || "").trim();
        if (!manifestPath) throw new Error("No HLS manifest returned");

        const manifestUrl = manifestPath.startsWith("http")
          ? manifestPath
          : `${origin}${manifestPath.startsWith("/") ? "" : "/"}${manifestPath}`;

        if (requestSeq !== hlsStartSeqRef.current) return false;
        streamSeekOffsetRef.current = Math.max(0, seekSec);
        usingDirectPlaybackRef.current = false;

        if (!Hls.isSupported()) {
          video.src = manifestUrl;
          video.load();
          reportPlaybackMode("hls-remux");
          await video.play().catch(() => {});
          if (requestSeq !== hlsStartSeqRef.current) return false;
          setIsLoading(false);
          return true;
        }

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 45,
          maxMaxBufferLength: 90,
        });
        hlsRef.current = hls;
        hls.loadSource(manifestUrl);
        hls.attachMedia(video);
        reportPlaybackMode("hls-remux");

        await new Promise<void>((resolve, reject) => {
          const onParsed = () => {
            hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
            hls.off(Hls.Events.ERROR, onError);
            const hlsAudio = (hls.audioTracks || []).map((t, i) => ({
              id: i,
              name: t.name || t.lang || `Audio ${i + 1}`,
              lang: (t.lang || "").toUpperCase(),
            }));
            const hlsSubs = (hls.subtitleTracks || []).map((t, i) => ({
              id: i,
              name: t.name || t.lang || `Subtitle ${i + 1}`,
              lang: (t.lang || "").toUpperCase(),
              absIndex: i,
            }));
            if (hlsAudio.length > 0) {
              setAudioTracks(hlsAudio);
              setSelectedAudio(
                clamp(hls.audioTrack >= 0 ? hls.audioTrack : 0, 0, hlsAudio.length - 1),
              );
            }
            if (hlsSubs.length > 0) {
              setSubtitleTracks(hlsSubs);
            }
            resolve();
          };
          const onError = (_e: unknown, data: { fatal?: boolean }) => {
            if (!data?.fatal) return;
            hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
            hls.off(Hls.Events.ERROR, onError);
            reject(new Error("HLS manifest error"));
          };
          hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.on(Hls.Events.ERROR, onError);
        });

        if (requestSeq !== hlsStartSeqRef.current) {
          try {
            hls.destroy();
          } catch {}
          if (hlsRef.current === hls) hlsRef.current = null;
          return false;
        }
        await video.play().catch(() => {});
        setIsLoading(false);
        setIsBuffering(false);
        return true;
    } catch (e) {
        console.error("[player] HLS remux failed:", e);
        if (hlsRef.current) {
          try {
            hlsRef.current.destroy();
          } catch {}
          hlsRef.current = null;
        }
        setIsLoading(false);
        setIsBuffering(false);
        return false;
      }
    },
    [initialUrl, reportPlaybackMode, teardownPlayers],
  );

  const startShakaPlayback = useCallback(async (seekSec = 0): Promise<boolean> => {
    const video = videoRef.current;
    if (!video || !initialUrl) return false;

    const primaryHlsUrl = initialUrl;
    const secondaryHlsUrl = "";

    try {
      const shakaModule: any = await import("shaka-player");
      const shaka: any = shakaModule?.default || shakaModule;

      if (typeof shaka?.polyfill?.installAll === "function") {
        shaka.polyfill.installAll();
      }
      if (!shaka?.Player) return false;
      if (
        typeof shaka.Player.isBrowserSupported === "function" &&
        !shaka.Player.isBrowserSupported()
      ) {
        return false;
      }

      const player = new shaka.Player(video);
      shakaRef.current = player;
      player.configure({
        streaming: {
          bufferingGoal: 30,
          rebufferingGoal: 2,
          bufferBehind: 45,
        },
        manifest: {
          retryParameters: {
            maxAttempts: 2,
            baseDelay: 300,
            backoffFactor: 2,
            fuzzFactor: 0.5,
            timeout: 8000,
          },
        },
      });

          const applyTracks = () => {
            const tracks = readShakaTracks(player);
            setAudioTracks(tracks.audios.map((track) => ({ ...track } as TrackItem)));
            setSubtitleTracks(tracks.subtitles.map((track) => ({ ...track } as TrackItem)));
            setSelectedAudio(
              tracks.activeAudioIndex >= 0 ? tracks.audios[tracks.activeAudioIndex]?.id ?? -1 : -1,
            );
            setSelectedSubtitle(
              tracks.activeSubtitleIndex >= 0 ? tracks.subtitles[tracks.activeSubtitleIndex]?.id ?? -1 : -1,
            );
            setNativeSubtitleActive(tracks.activeSubtitleIndex >= 0);
          };

      try {
        await player.load(primaryHlsUrl);
      } catch {
        if (!secondaryHlsUrl || secondaryHlsUrl === primaryHlsUrl) {
          throw new Error("Shaka primary load failed");
        }
        await player.load(secondaryHlsUrl);
      }

      usingDirectPlaybackRef.current = true;
      applyTracks();
      setIsLoading(false);

      if (seekSec > 0 && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = clamp(seekSec, 0, video.duration);
      }

      await video.play().catch(() => {});
      return true;
    } catch {
      if (shakaRef.current) {
        try {
          shakaRef.current.destroy();
        } catch {}
        shakaRef.current = null;
      }
      return false;
    }
  }, [initialUrl]);

  const initPlayback = useCallback(async () => { // Made async
    const video = videoRef.current;
    if (!video || !initialUrl) return;
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

    // 1. LIVE TV PATH (All Platforms)
    if (isLiveStream) {
      if (platform === 'webos') {
        // webOS packaged apps must use native URLs and hardware decoders.
        // The local `/api/stream-ts` remux server only exists in browser dev.
        reportPlaybackMode("native");
        startNativePlayback(0);
        return;
      }
      
      // Browser/desktop: panel URLs are cross-origin — play through local proxy/HLS rewrite.
      if (platform === "web" && isHlsStream) {
        usingDirectPlaybackRef.current = false;
        const proxied = wrapProxyPlaybackUrl(initialUrl);
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,
            maxBufferLength: 20,
          });
          hlsRef.current = hls;
          hls.loadSource(proxied);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            try {
              hls.destroy();
            } catch {}
            hlsRef.current = null;
            const tsUrl = buildStreamTsUrl(initialUrl, { isLive: true });
            reportPlaybackMode("stream-ts-fallback", "warn");
            startNativePlayback(0, tsUrl);
          });
          setIsLoading(false);
          return;
        }
      }
      
      usingDirectPlaybackRef.current = true;
      video.src =
        platform === "web" ? wrapProxyPlaybackUrl(initialUrl) : initialUrl;
      video.load();
      video.play().catch(() => {});
      setIsLoading(false);
      return;
    }

    // 2. WEBOS-SPECIFIC HLS/MKV ROUTING
    if (platform === "webos") {
      if (isHlsStream) {
        // webOS VOD HLS: same as live — native element + hardware decoder only.
        usingDirectPlaybackRef.current = true;
        video.src = initialUrl;
        video.load();
        video.play().catch(() => {});
        setIsLoading(false);
        return;
      }
      if (isMkvSource) {
        webosRegisterTrack("default")
          .then((trackId) => {
            if (trackId) {
              platformPlayerRef.current = {
                stop: () => {
                  try {
                    webosUnregisterTrack(trackId);
                  } catch {}
                },
                webosTrackId: trackId,
              };
            }
          })
          .catch(() => {});

        reportPlaybackMode("native");
        startNativePlayback(0);
        return;
      }
      // Fallback for other formats on WebOS
      video.src = initialUrl;
      video.load();
      video.play().catch(() => {});
      setIsLoading(false);
      return;
    }

    if (isHlsStream && Hls.isSupported()) {
      const primaryHlsUrl = initialUrl;
      const secondaryHlsUrl = initialUrl;
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
      usingDirectPlaybackRef.current = true;
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
          { type: "mpegts", url: initialUrl, isLive: false },
          { enableWorker: true, autoCleanupSourceBuffer: true, lazyLoad: false },
        );
        usingDirectPlaybackRef.current = true;
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

      // Tizen AVPlay can handle MKV playback outside the HTML5 element.
      // webOS stays on the native <video> path above.
      if (platform === "tizen" && platformSupportsEngine()) {
        try {
          // Use proxied URL to avoid CORS/range issues where possible
          const source = initialUrl;
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

      // Desktop browser: HLS segments + hls.js (stable). MPEG-TS pipe stalls and loops.
      if (platform === "web") {
        const hlsOk = await startHlsPlayback(0);
        if (hlsOk) return;
        reportPlaybackDebug(
          "player.hlsRemuxFallback",
          { reason: "browser-hls-failed-fallback-stream-ts" },
          "warn",
        );
        }

      if (preferNativeMkvRef.current) {
        usingDirectPlaybackRef.current = true;
        reportPlaybackMode("proxy-range");
        video.src = initialUrl;
        video.load();
        return;
      }
      // On other platforms (PC/Tizen), use FastTS (MPEG-TS) which is more "IPTV-safe" 
      // and provides robust seeking for MKV files that browsers can't seek natively.
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

      const sourceUrl =
        platform === "web" && originMismatch
          ? wrapProxyPlaybackUrl(initialUrl)
          : initialUrl;
      usingDirectPlaybackRef.current = sourceUrl === initialUrl;

      video.src = sourceUrl;
      video.load();
      void loadTrackMetadata();
      return;
    }

    usingDirectPlaybackRef.current = true;
    video.src = initialUrl;
    video.load();
  }, [
    extension,
    startFastTsPlayback,
    startHlsPlayback,
    initialUrl,
    isHlsStream,
    isLiveStream,
    loadTrackMetadata,
    reportPlaybackMode,
    startRemuxPlayback,
    startNativePlayback,
    startShakaPlayback,
    teardownPlayers,
  ]);

  useEffect(() => {
    startNativePlaybackRef.current = startNativePlayback;
  }, [startNativePlayback]);

  useEffect(() => {
    startFastTsPlaybackRef.current = startFastTsPlayback;
  }, [startFastTsPlayback]);

  useEffect(() => {
    startHlsPlaybackRef.current = startHlsPlayback;
  }, [startHlsPlayback]);

  useEffect(() => {
    isLiveStreamRef.current = isLiveStream;
  }, [isLiveStream]);

  const focusFirstPlayerControl = useCallback((root: HTMLElement | null, preferSelected = false) => {
    if (!root) return false;
    const selector = preferSelected
      ? "[aria-pressed='true'], .bg-primary[data-tv-focusable], [data-tv-focusable], button:not([disabled])"
      : "[data-tv-focusable], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])";
    const target = root.querySelector<HTMLElement>(selector);
    if (!target) return false;
    target.focus({ preventScroll: true });
    try {
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    } catch {}
    return true;
  }, []);

  const focusControlsLayer = useCallback(() => {
    setShowControls(true);
    requestAnimationFrame(() => {
      focusFirstPlayerControl(controlsLayerRef.current);
    });
  }, [focusFirstPlayerControl]);

  // Auto-focus first button when menus open
  useEffect(() => {
    if (audioMenuOpen) {
      setTimeout(() => {
        focusFirstPlayerControl(trackMenuRef.current, true);
      }, 100);
    }
  }, [audioMenuOpen, focusFirstPlayerControl]);

  useEffect(() => {
    if (subtitleMenuOpen) {
      setTimeout(() => {
        focusFirstPlayerControl(trackMenuRef.current, true);
      }, 100);
    }
  }, [subtitleMenuOpen, focusFirstPlayerControl]);

  useEffect(() => {
    if (settingsOpen) {
      setTimeout(() => {
        focusFirstPlayerControl(playerSettingsMenuRef.current);
      }, 100);
    }
  }, [settingsOpen, focusFirstPlayerControl]);

  // Handle showing controls on focus move
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target?.hasAttribute('data-tv-focusable')) {
        resetControlsVisibility();
      }
    };
    window.addEventListener('focusin', onFocus);
    return () => window.removeEventListener('focusin', onFocus);
  }, [resetControlsVisibility]);

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
    metadataDurationRef.current = 0;
    setMetadataDuration(0);
    setBufferedEnd(0);
    setDuration(0);
    setCurrentTime(0);
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
  useEffect(() => {
    subtitleOffsetMsRef.current = subtitleOffsetMs;
    try { localStorage.setItem("nova:subtitleOffsetMs", String(subtitleOffsetMs)); } catch {}
  }, [subtitleOffsetMs]);

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

  const fetchSubtitleCues = useCallback(async (trackId: number, seekOverride?: number, forceFull = false, registerAbort = true, fastProbe = true, externalSignal?: AbortSignal): Promise<"success" | "failed_extraction" | "not_text_based" | "aborted"> => {
    console.debug(`[subtitle] fetchSubtitleCues start track=${trackId} forceFull=${forceFull} registerAbort=${registerAbort}`);
    if (registerAbort) subtitleFetchAbortRef.current?.abort();
    const controller = new AbortController();
    if (registerAbort) subtitleFetchAbortRef.current = controller;

    // Link external signal to our controller
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      externalSignal.addEventListener("abort", () => controller.abort());
    }

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
    const subtitleBaseUrl = `${(getMediaApiBaseUrl() || window.location.origin).replace(/\/$/, "")}/api/subtitle?url=${encodeURIComponent(originalStreamUrl.current)}&index=${absIndex}&format=vtt&delayMs=0&title=${encodeURIComponent(initialTitle)}${codecHint}${effectiveSeek > 2 ? `&seek=${effectiveSeek}` : ""}&fastProbe=1&duration=${fastProbe ? 180 : 900}${allowFullDownload ? "" : "&noFullDownload=1"}`;

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
        const lowRes = await fetch(`${subtitleBaseUrl}&lowBandwidth=1&duration=900`, { signal: controller.signal, cache: "no-store" });
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
    const shakaPlayer = shakaRef.current;
    if (shakaPlayer) {
      if (trySelectShakaAudioTrack(shakaPlayer, trackId)) {
        setSelectedAudio(trackId);
        reportPlaybackDebug("player.audioTrackSelected", {
          mode: "shaka",
          trackId,
          track: audioTracks.find((t) => t.id === trackId) || null,
        });
        return;
      }
      if (trackId >= 0) {
        setError("Failed to switch Shaka audio track");
        return;
      }
    }

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
      // Snapshot the active subtitle track and cues so we can restore them
      // after the stream-ts pipeline restarts (teardownPlayers clears the video
      // element but does NOT clear subtitle state, so cues survive; we just
      // need to kick the subtitle engine back into motion once playback starts).
      const savedSubtitleId = selectedSubtitleRef.current;
      const savedCues = subtitleCuesRef.current.slice();
      startFastTsPlayback(seek, trackId);
      // Re-apply subtitle cues immediately so the overlay stays active without
      // requiring the user to re-select their subtitle track.
      if (savedSubtitleId >= 0 && savedCues.length > 0) {
        setSelectedSubtitle(savedSubtitleId);
        setSubtitleCues(savedCues);
        startSubtitleEngine();
      }
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
  }, [audioOffsetMs, audioTracks, isLiveStream, startRemuxPlayback, startSubtitleEngine, trySwitchNativeAudioTrack]);

  const handleSubtitleChange = useCallback(async (trackId: number) => {
    if (subtitleHandoffLockRef.current) return;

    // Ignore duplicate selections of the same subtitle track to avoid
    // restarting remux/stream pipelines repeatedly on sensitive providers.
    if (trackId === selectedSubtitleRef.current && !subtitleLoadingRef.current) {
      return;
    }

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

    if (isNativeTvPlatform) {
      // Smart TV recommended path: use native in-band subtitle tracks exposed by
      // the TV media engine. Do not fall back to local ffmpeg extraction/remux
      // in packaged webOS/Tizen apps because there is no local server and it can
      // interrupt playback on low-memory or single-connection devices.
      subtitleFetchAbortRef.current?.abort();
      subtitleResumeAfterLoadRef.current = false;
      subtitleInterruptionRef.current = false;
      subtitleLoadingRef.current = false;
      setSubtitleLoading(false);
      setSubtitleCues([]);
      setSubtitleText("");

      if (v && trySwitchPlatformSubtitleTrack(v, trackId)) {
        setNativeSubtitleActive(true);
        return;
      }

      if (trySwitchNativeSubtitleTrack(trackId)) {
        setNativeSubtitleActive(true);
        return;
      }

      try {
        const selectedMeta = subtitleTracks.find((track) => track.id === trackId);
        const textTracks = v?.textTracks;
        if (textTracks && typeof textTracks.length === "number" && textTracks.length > 0) {
          const targetLang = String(selectedMeta?.lang || "").toLowerCase();
          const targetName = String(selectedMeta?.name || "").toLowerCase();
          let matchedIndex = -1;
          for (let i = 0; i < textTracks.length; i++) {
            const track = textTracks[i] as any;
            const lang = String(track.language || track.lang || "").toLowerCase();
            const label = String(track.label || track.id || "").toLowerCase();
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

      setNativeSubtitleActive(false);
      toast.warning("This subtitle track is not exposed by the TV native player");
      return;
    }

    if (shakaRef.current) {
      if (trySelectShakaSubtitleTrack(shakaRef.current, trackId)) {
        setSelectedSubtitle(trackId);
        setNativeSubtitleActive(trackId >= 0);
        setSubtitleCues([]);
        setSubtitleText("");
        return;
      }
    }

    if (hlsRef.current) {
      const meta = subtitleTracks.find((t) => t.id === trackId);
      const targetLang = String(meta?.lang || "").toLowerCase();
      let hlsSubtitleIndex = trackId;
      const hlsSubs = hlsRef.current.subtitleTracks || [];
      if (targetLang && hlsSubs.length > 0) {
        const byLang = hlsSubs.findIndex(
          (t) => String(t.lang || "").toLowerCase() === targetLang,
        );
        if (byLang >= 0) hlsSubtitleIndex = byLang;
      }
      try {
        hlsRef.current.subtitleTrack = trackId >= 0 ? hlsSubtitleIndex : -1;
      } catch {}
      setSubtitleLoading(false);
      subtitleLoadingRef.current = false;
      setNativeSubtitleActive(trackId >= 0);
      setSubtitleCues([]);
      setSubtitleText("");
      reportPlaybackDebug("player.subtitleTrackSelected", {
        mode: "hls-remux-embedded",
        trackId,
        hlsSubtitleIndex,
      });
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
      const isStreamTsPlayback =
        Boolean(mpegtsRef.current) ||
        playbackModeRef.current === "stream-ts-fallback";

      // Stream-ts (MKV transmux): one upstream connection — never use sidecar while playing.
      if (!isLiveStream && v && isStreamTsPlayback) {
        const meta = subtitleTracks.find((track) => track.id === trackId);
        const ffmpegSubIdx =
          meta?.absIndex != null && Number.isFinite(Number(meta.absIndex))
            ? Number(meta.absIndex)
            : trackId;
        const effCurrent = Math.max(
          0,
          (Number.isFinite(v.currentTime) ? v.currentTime : 0) +
            streamSeekOffsetRef.current,
        );
        const audioIdx =
          selectedAudioRef.current >= 0
            ? selectedAudioRef.current
            : getPreferredAudioTrackId(
                audioTracksRef.current,
                selectedAudioRef.current,
              );

        // TV: mux embedded subs into the MPEG-TS pipe (hardware path).
        if (isNativeTvPlatform) {
          reportPlaybackDebug("player.subtitleTrackSelected", {
            mode: "stream-ts-muxed-sub",
            trackId,
            ffmpegSubIdx,
            seek: effCurrent,
            reason: "mux-subtitle-into-single-ffmpeg-session",
          });
          subtitleFetchAbortRef.current?.abort();
          subtitleInterruptionRef.current = false;
          subtitleLoadingRef.current = false;
          setSubtitleLoading(false);
          setSubtitleCues([]);
          setSubtitleText("");
          setNativeSubtitleActive(true);
          activeStreamTsSubRef.current = ffmpegSubIdx;
          startFastTsPlayback(
            effCurrent,
            audioIdx >= 0 ? audioIdx : 0,
            ffmpegSubIdx,
          );
          return;
        }

        // Browser stream-ts fallback only (desktop should use HLS remux above).
        subtitleHandoffLockRef.current = true;
        try {
          reportPlaybackDebug("player.subtitleTrackSelected", {
            mode: "stream-ts-vtt-overlay",
            trackId,
            ffmpegSubIdx,
            seek: effCurrent,
          });

          setSubtitleLoading(true);
          subtitleLoadingRef.current = true;
          setSubtitleText("Loading subtitles...");
          subtitleInterruptionRef.current = true;
          teardownPlayers();
          await new Promise<void>((r) => window.setTimeout(r, 400));

          if (subtitleSwitchSeqRef.current !== requestSeq) return;

          const extractionResult = await fetchSubtitleCues(
            trackId,
            Math.floor(effCurrent),
            true,
            true,
            true,
          );

          subtitleInterruptionRef.current = false;
          activeStreamTsSubRef.current = -1;

          if (subtitleSwitchSeqRef.current !== requestSeq) return;

          if (extractionResult === "success") {
            setNativeSubtitleActive(false);
            startSubtitleEngine();
          } else if (extractionResult !== "aborted") {
            setSubtitleCues([]);
            setSubtitleText("");
            toast.warning("Subtitles could not be loaded.");
          }

          startFastTsPlayback(effCurrent, audioIdx >= 0 ? audioIdx : 0, -1);
        } finally {
          subtitleInterruptionRef.current = false;
          setSubtitleLoading(false);
          subtitleLoadingRef.current = false;
          subtitleHandoffLockRef.current = false;
        }
        return;
      }

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

      // Browser/non-native path (non stream-ts players only).
      // For single-connection IPTV accounts, avoid sidecar subtitle extraction
      // entirely because it opens an extra upstream connection and kills playback.
      if (!isNativeTvPlatform && !isLiveStream && v && !isStreamTsPlayback) {
        if (singleConnection && !subtitleHandoffLockRef.current) {
          const effCurrent = Math.max(
            0,
            (Number.isFinite(v.currentTime) ? v.currentTime : 0) +
              streamSeekOffsetRef.current,
          );
          const shouldResumePlayback = !v.paused && !userPausedRef.current;

          setSubtitleLoading(true);
          subtitleLoadingRef.current = true;
          setSubtitleText("Preparing subtitles...");

          reportPlaybackDebug("player.subtitleTrackSelected", {
            mode: "sidecar-single-connection",
            trackId,
            track: subtitleTracks.find((t) => t.id === trackId) || null,
            seek: effCurrent,
            reason: "single-connection-handoff-sidecar",
          });

          // Strict single-connection handoff: release playback upstream socket
          // before starting subtitle extraction.
          subtitleInterruptionRef.current = true;
          setIsLoading(true);
          teardownPlayers();

          // Give provider side enough time to fully release the previous session
          // before opening the subtitle extraction connection.
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 2000);
          });

          if (subtitleSwitchSeqRef.current !== requestSeq) {
            subtitleInterruptionRef.current = false;
            setSubtitleLoading(false);
            subtitleLoadingRef.current = false;
            return;
          }

          // On Smart TVs (webOS/Tizen), we can mux subtitles directly into the TS stream.
          // This is much more reliable for single-connection accounts as it uses
          // only ONE connection for both video and subtitles.
          const platform = getPlatformName();
          const isSmartTv = platform === "webos" || platform === "tizen";

          if (isSmartTv) {
            console.log("[player] using in-stream subtitle muxing for smart tv", { trackId });
            try {
              if (playbackModeRef.current === "stream-ts-fallback") {
                startFastTsPlaybackRef.current?.(
                  effCurrent,
                  selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0,
                  trackId
                );
              } else {
                // If not in TS mode, try to switch to it to get muxed subtitles
                startFastTsPlaybackRef.current?.(
                  effCurrent,
                  selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0,
                  trackId
                );
              }
              setSubtitleLoading(false);
              subtitleLoadingRef.current = false;
              setNativeSubtitleActive(true); // TV will handle it
              return;
            } catch (e) {
              console.error("[player] failed to switch to in-stream subtitles", e);
            }
          }

          setSubtitleText("Fetching subtitles...");
          // Start extraction but don't block video restart for more than 3 seconds.
          // On single-connection accounts, we MUST abort the subtitle fetch before
          // starting video, otherwise the provider will block the video connection.
          const fetchController = new AbortController();
          const fetchPromise = fetchSubtitleCues(
            trackId,
            Math.floor(effCurrent),
            false,
            true,
            true,
            fetchController.signal
          );

          const result = await Promise.race([
            fetchPromise.then((val) => ({ type: "done" as const, val })),
            new Promise<"timeout">((resolve) => window.setTimeout(resolve, 3000, "timeout")).then(() => ({ type: "timeout" as const })),
          ]);

          if (result.type === 'timeout') {
            fetchController.abort();
            console.log("[player] subtitle fetch timed out (3s), aborting to free connection for video");
          }
          const extractionResultSidecar = result.type === 'done' ? result.val : 'aborted';

          // Resume playback from where we left off.
          try {
            if (playbackModeRef.current === "stream-ts-fallback") {
              startFastTsPlaybackRef.current?.(
                effCurrent,
                selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0,
              );
            } else {
              startNativePlaybackRef.current?.(effCurrent);
            }
          } catch {}

          if (!shouldResumePlayback) {
            const resumed = videoRef.current;
            if (resumed) {
              try {
                resumed.pause();
              } catch {}
            }
          }

          subtitleInterruptionRef.current = false;

          if (subtitleSwitchSeqRef.current !== requestSeq) {
            setSubtitleLoading(false);
            subtitleLoadingRef.current = false;
            return;
          }

          setSubtitleLoading(false);
          subtitleLoadingRef.current = false;

          if (extractionResultSidecar === "success") {
            setNativeSubtitleActive(false);
            toast.success("Subtitles loaded");
            return;
          }

          if (extractionResultSidecar === "aborted") {
            return;
          }

          // In strict single-connection mode, do not trigger remux fallback here.
          // Remux restarts can repeatedly tear down the primary stream.
          setSubtitleCues([]);
          setSubtitleText("");
          setNativeSubtitleActive(false);
          toast.warning("Subtitles unavailable in single-connection mode for this stream");
          return;
        }

        // Non-single-connection providers can try sidecar extraction first.
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
            return;
          }

          if (extractionResult === "aborted") {
            return;
          }

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
            reason: "browser-sidecar-failed-remux-fallback",
          });

          startRemuxPlayback(seek, audioIdx, trackId, audioOffsetMs);
          return;
        }
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
      // playback on a native TV, use in-stream muxing to avoid second connection.
      if (singleConnection && isNativeTvPlatform) {
        const v = videoRef.current as any;
        const effCurrent = v ? Math.max(0, (v.currentTime || 0) + streamSeekOffsetRef.current) : 0;
        
        console.log("[player] using in-stream subtitle muxing for direct-mode smart tv", { trackId });
        try {
          startFastTsPlaybackRef.current?.(
            effCurrent,
            selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0,
            trackId
          );
          setSubtitleLoading(false);
          subtitleLoadingRef.current = false;
          setNativeSubtitleActive(true);
          return;
        } catch (e) {
          console.error("[player] failed to switch to in-stream subtitles from direct mode", e);
        }
      }

      // If provider only allows a single connection and we're using direct
      // playback on a non-native platform (PC/Browser), perform sidecar extraction.
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
        // Perform extraction but don't block video restart for more than 3 seconds.
        const fetchController = new AbortController();
        const fetchPromise = fetchSubtitleCues(trackId, undefined, true, true, true, fetchController.signal);
        const result = await Promise.race([
          fetchPromise.then((val) => ({ type: "done" as const, val })),
          new Promise<"timeout">((resolve) => window.setTimeout(resolve, 3000, "timeout")).then(() => ({ type: "timeout" as const })),
        ]);

        if (result.type === 'timeout') {
          fetchController.abort();
          console.log("[player] native direct subtitle fetch timed out (3s), aborting to free connection");
        }

        const extractionResultDirect = result.type === 'done' ? result.val : 'aborted';

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

        if (extractionResultDirect === "success") {
          setNativeSubtitleActive(false);
          toast.success("Subtitles loaded");
        } else if (extractionResultDirect === "aborted") {
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
    startFastTsPlayback,
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
    if (isLiveStreamRef.current) return;
    // Compute effective current time (video.currentTime + TS stream offset).
    const effCurrent = v.currentTime + streamSeekOffsetRef.current;
    const baseDuration = effectiveDuration > 0 ? effectiveDuration : v.duration;
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

    if (playbackModeRef.current === "hls-remux") {
      setCurrentTime(effTarget);
      setBufferedEnd(effTarget);
      setIsLoading(true);
      setIsBuffering(false);
      void startHlsPlayback(effTarget).then((ok) => {
        if (!ok) {
          const audioIdx = selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0;
          startFastTsPlayback(effTarget, audioIdx);
        }
      });
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
    if (isLiveStreamRef.current) return;
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

    if (playbackModeRef.current === "hls-remux") {
      setCurrentTime(effTarget);
      setBufferedEnd(effTarget);
      setIsLoading(true);
      setIsBuffering(false);
      void startHlsPlayback(effTarget).then((ok) => {
        if (!ok) {
          const audioIdx = selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0;
          startFastTsPlayback(effTarget, audioIdx);
        }
      });
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
    const rawDuration = effectiveDuration > 0 ? effectiveDuration : v.duration;
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

    // Any key press should reveal controls
    resetControlsVisibility();

    // If a menu is open, handle navigation within it
    const activeMenuRoot = audioMenuOpen || subtitleMenuOpen
      ? trackMenuRef.current
      : settingsOpen
        ? playerSettingsMenuRef.current
        : null;

    if (activeMenuRoot) {
      if (key === "back" || key === "red") {
        setAudioMenuOpen(false);
        setSubtitleMenuOpen(false);
        setSettingsOpen(false);
        focusControlsLayer();
        return;
      }
      if (key === "enter" || key === "select") {
        (document.activeElement as HTMLElement | null)?.click();
        return;
      }
      if (["up", "down", "left", "right"].includes(key)) {
        focusNext(key as any, { root: activeMenuRoot as HTMLElement });
        return;
      }
    }

    // Main Player Shortcuts (Color Buttons)
    if (key === "green") {
      const willOpen = !audioMenuOpen;
      setAudioMenuOpen(willOpen);
      setSubtitleMenuOpen(false);
      setSettingsOpen(false);
      if (!willOpen) focusControlsLayer();
      return;
    }
    if (key === "yellow") {
      const willOpen = !subtitleMenuOpen;
      setSubtitleMenuOpen(willOpen);
      setAudioMenuOpen(false);
      setSettingsOpen(false);
      if (!willOpen) focusControlsLayer();
      return;
    }
    if (key === "blue") {
      const willOpen = !settingsOpen;
      setSettingsOpen(willOpen);
      setAudioMenuOpen(false);
      setSubtitleMenuOpen(false);
      if (!willOpen) focusControlsLayer();
      return;
    }
    if (key === "red") {
      closePlayer();
      return;
    }

    // Playback Controls
    if (key === "back") {
      if (showControls) {
        setShowControls(false);
      } else {
        closePlayer();
      }
      return;
    }

    if (key === "info" || key === "menu") {
      focusControlsLayer();
      return;
    }

    if (key === "play") {
      if (!isPlaying) togglePlay();
      return;
    }

    if (key === "pause" || key === "stop") {
      if (isPlaying) togglePlay();
      return;
    }

    if (key === "left" || key === "right" || key === "up" || key === "down") {
      const active = document.activeElement as HTMLElement | null;
      const activeInControls = !!(
        active &&
        controlsLayerRef.current &&
        controlsLayerRef.current.contains(active)
      );
      if (!showControls || !activeInControls) {
        focusControlsLayer();
        return;
      }
    }

    if (key === "enter" || key === "select" || key === "playpause") {
      const active = document.activeElement as HTMLElement | null;
      if (active && active.hasAttribute('data-tv-focusable')) {
        active.click();
      } else {
        togglePlay();
      }
      return;
    }

    if (key === "left" || key === "rewind") {
      const active = document.activeElement as HTMLElement | null;
      if (key === "left" && showControls && active && active.hasAttribute('data-tv-focusable')) {
        focusNext("left");
      } else {
        seekBy(-10);
      }
      return;
    }
    if (key === "right" || key === "fastforward") {
      const active = document.activeElement as HTMLElement | null;
      if (key === "right" && showControls && active && active.hasAttribute('data-tv-focusable')) {
        focusNext("right");
      } else {
        seekBy(10);
      }
      return;
    }
    if (key === "up") {
      if (showControls) {
        focusNext("up");
      } else {
        setPlayerVolume(Math.min(1, volume + 0.05));
      }
      return;
    }
    if (key === "down") {
      if (showControls) {
        focusNext("down");
      } else {
        setPlayerVolume(Math.max(0, volume - 0.05));
      }
      return;
    }
  }, [
    audioMenuOpen,
    subtitleMenuOpen,
    settingsOpen,
    showControls,
    volume,
    isPlaying,
    resetControlsVisibility,
    focusControlsLayer,
    togglePlay,
    seekBy,
    closePlayer
  ]);

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
    const updateBufferedEnd = () => {
      let nextBufferedEnd = 0;
      try {
        const effectiveNow = (v.currentTime || 0) + streamSeekOffsetRef.current;
        for (let index = 0; index < v.buffered.length; index += 1) {
          const start = v.buffered.start(index) + streamSeekOffsetRef.current;
          const end = v.buffered.end(index) + streamSeekOffsetRef.current;
          if (effectiveNow >= start - 1 && effectiveNow <= end + 1) {
            nextBufferedEnd = end;
            break;
          }
          nextBufferedEnd = Math.max(nextBufferedEnd, end);
        }
      } catch {
        nextBufferedEnd = 0;
      }
      setBufferedEnd(nextBufferedEnd);
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

      // Stream-ts recovery is for TV only — on desktop it causes ffmpeg restart loops.
      const platform = getPlatformName();
      if (
        platform !== "web" &&
        mpegtsRef.current &&
        startFastTsPlaybackRef.current &&
        playbackModeRef.current === "stream-ts-fallback"
      ) {
        const now = Date.now();
        if (!tsRecoverLockRef.current && now - tsRecoverLastAtRef.current > 45000) {
          tsRecoverLockRef.current = true;
          tsRecoverLastAtRef.current = now;
          const resumeAt = Math.max(
            0,
            (Number.isFinite(v.currentTime) ? v.currentTime : 0) +
              streamSeekOffsetRef.current,
          );
          const audioIdx =
            selectedAudioRef.current >= 0 ? selectedAudioRef.current : 0;
          const subIdx = activeStreamTsSubRef.current;
          reportPlaybackDebug(
            "player.streamTsRecover",
            { resumeAt, audioIdx, subIdx, reason: "stall" },
            "warn",
          );
          startFastTsPlaybackRef.current(
            resumeAt,
            audioIdx,
            subIdx >= 0 ? subIdx : -1,
          );
          window.setTimeout(() => {
            tsRecoverLockRef.current = false;
          }, 1200);
          return;
        }
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
      setIsBuffering(false);
      updateBufferedEnd();
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
      setIsBuffering(false);
      updateBufferedEnd();
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
      const isHlsRemux =
        Boolean(hlsRef.current) || playbackModeRef.current === "hls-remux";
      waitingTimerRef.current = setTimeout(() => {
        if (!v.paused && v.readyState < 3) {
          setIsBuffering(true);
          if (isHlsRemux && hlsRef.current) {
            try {
              hlsRef.current.startLoad();
            } catch {}
            clearSeekRecoveryTimer();
            seekRecoveryTimerRef.current = setTimeout(() => {
              if (v.readyState < 3 && !v.paused && !document.hidden) {
                const resumeAt = Math.max(
                  0,
                  (Number.isFinite(v.currentTime) ? v.currentTime : 0) +
                    streamSeekOffsetRef.current,
                );
                setIsLoading(true);
                setIsBuffering(false);
                void startHlsPlaybackRef.current(resumeAt);
              }
            }, 8000);
            return;
          }
          if (getPlatformName() === "web") return;
          setIsLoading(true);
          clearSeekRecoveryTimer();
          seekRecoveryTimerRef.current = setTimeout(() => {
            if (v.readyState < 3) recoverFromStall();
          }, 12000);
        }
      }, 800);
    };
    const onCanPlay = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      setIsLoading(false);
      setIsBuffering(false);
      updateBufferedEnd();
    };
    const onCanPlayThrough = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      setIsLoading(false);
      setIsBuffering(false);
      updateBufferedEnd();
    };
    const onStalled = () => {
      if (subtitleInterruptionRef.current) return;
      if (hlsRef.current || playbackModeRef.current === "hls-remux") {
        setIsBuffering(true);
        clearSeekRecoveryTimer();
        seekRecoveryTimerRef.current = setTimeout(() => {
          if (v.readyState < 3 && !v.paused && !document.hidden) {
            const resumeAt = Math.max(
              0,
              (Number.isFinite(v.currentTime) ? v.currentTime : 0) +
                streamSeekOffsetRef.current,
            );
            setIsLoading(true);
            setIsBuffering(false);
            void startHlsPlaybackRef.current(resumeAt);
          }
        }, 8000);
        return;
      }
      if (getPlatformName() === "web" && mpegtsRef.current) {
        setIsBuffering(true);
        return;
      }
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
      }, 12000);
    };
    const onTimeUpdate = () => {
      // Effective time = video.currentTime (0-based per TS stream) + stream seek offset.
      setCurrentTime((v.currentTime || 0) + streamSeekOffsetRef.current);
      updateBufferedEnd();
    };
    const onProgress = () => {
      updateBufferedEnd();
    };
    const onDuration = () => {
      const nativeDur = v.duration;
      const trusted = metadataDurationRef.current || inferredDurationRef.current;
      if (Number.isFinite(nativeDur) && nativeDur > 0) {
        setDuration(resolveVodDisplayDuration(nativeDur, metadataDurationRef.current, inferredDurationRef.current, isLiveStreamRef.current));
      }
      else if (trusted > 0) setDuration(trusted);
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
      const trusted = metadataDurationRef.current || inferredDurationRef.current;
      if (Number.isFinite(nativeDur) && nativeDur > 0) {
        setDuration(resolveVodDisplayDuration(nativeDur, metadataDurationRef.current, inferredDurationRef.current, isLiveStreamRef.current));
      } else if (trusted > 0) {
        setDuration(trusted);
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
        reportPlaybackDebug(
          "player.nativeMkvFailed",
          { platform: getPlatformName(), reason: "tv-native-decode-error" },
          "warn",
        );
        setError("This MKV stream is not supported by the TV native player.");
        setIsLoading(false);
        setIsBuffering(false);
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
    v.addEventListener("progress", onProgress);
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
      v.removeEventListener("progress", onProgress);
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
  const progressPercent =
    effectiveDuration > 0
      ? clamp((displayedSeekTime / effectiveDuration) * 100, 0, 100)
      : 0;
  const bufferedPercent =
    effectiveDuration > 0
      ? clamp((Math.max(bufferedEnd, displayedSeekTime) / effectiveDuration) * 100, 0, 100)
      : 0;

  const settingsEntries = useMemo(() => {
    if (settingsTab === "audio") return audioTracks.map((a) => a.name);
    if (settingsTab === "subtitle") return ["Off", ...subtitleTracks.map((s) => s.name)];
    return ["Subtitle Top", "Subtitle Bottom", "Subtitle Large", "Subtitle Medium"];
  }, [audioTracks, settingsTab, subtitleTracks]);

  useEffect(() => {
    setFocusIndex(0);
  }, [settingsTab]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-screen w-full overflow-hidden bg-black font-sans text-white",
        isLoading ? "cursor-wait" : "cursor-default",
      )}
      onMouseMove={resetControlsVisibility}
      onClick={resetControlsVisibility}
    >
      {/* 1. Main Video Element */}
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 h-full w-full object-contain transition-opacity duration-700",
          isLoading && !isBuffering ? "opacity-0" : "opacity-100",
        )}
        autoPlay
        playsInline
        crossOrigin="anonymous"
        preload="auto"
        poster={poster ? `${(getMediaApiBaseUrl() || window.location.origin).replace(/\/$/, "")}/api/proxy?url=${encodeURIComponent(poster)}` : undefined}
      />

      {/* 2. Subtitles Layer (Professional Rendering) */}
      {subtitleText && selectedSubtitle >= 0 && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-10 transition-all duration-300",
            settings.subtitlePosition === "top"
              ? "top-16"
              : "bottom-32",
          )}
        >
          <div
            className={cn(
              "max-w-[85%] rounded-xl px-6 py-3 text-center font-bold tracking-tight shadow-2xl transition-all",
              settings.subtitleSize === "large" ? "text-4xl" : settings.subtitleSize === "medium" ? "text-3xl" : "text-2xl",
            )}
            style={{
              color: settings.subtitleColor || "#ffffff",
              background: `rgba(0,0,0,${settings.subtitleBgOpacity ?? 0.65})`,
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
              backdropFilter: "blur(4px)",
              lineHeight: "1.4",
            }}
          >
            {subtitleText}
          </div>
        </div>
      )}

      {/* 3. Loading & Buffering Indicator */}
      {(isLoading || isBuffering) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-20 w-20">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <Loader2 className="h-20 w-20 animate-spin text-primary" />
            </div>
            <p className="animate-pulse text-lg font-bold tracking-widest text-white/80 uppercase">
              {isBuffering ? "Reconnecting stream..." : "Preparing playback..."}
            </p>
          </div>
        </div>
      )}

      {/* 4. Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 p-10 backdrop-blur-xl">
          <div className="max-w-2xl rounded-3xl border border-white/10 bg-zinc-900/80 p-10 text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-red-500/20 p-4">
                <Settings className="h-12 w-12 text-red-500" />
              </div>
            </div>
            <h2 className="mb-4 text-3xl font-black text-white">Playback Interrupted</h2>
            <p className="mb-8 text-xl text-white/60 leading-relaxed">{error}</p>
            <div className="flex flex-col gap-4">
              <button
                data-tv-focusable
                onClick={() => { setError(null); initPlayback(); }}
                className="w-full rounded-2xl bg-primary py-5 text-xl font-black text-white shadow-lg transition-all hover:scale-105 active:scale-95 focus:ring-4 focus:ring-primary/50"
              >
                Try Again
              </button>
              <button
                data-tv-focusable
                onClick={closePlayer}
                className="w-full rounded-2xl bg-white/5 py-5 text-xl font-bold text-white/70 hover:bg-white/10"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modern Smart TV Controls Layer */}
      <div 
        ref={controlsLayerRef}
        className={cn(
          "absolute inset-0 z-40 flex flex-col justify-between transition-all duration-500 ease-in-out",
          showControls || settingsOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        {/* Top Gradient & Info */}
        <div className="bg-linear-to-b from-black/90 via-black/40 to-transparent p-12 pb-24">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h1 className="text-5xl font-black tracking-tighter text-white drop-shadow-lg">
                  {initialTitle}
                </h1>
                <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1 backdrop-blur-md">
                   <span className="text-sm font-black uppercase text-primary">4K ULTRA HD</span>
                </div>
              </div>
              <p className="text-xl font-medium text-white/50">
                {seriesName ? `${seriesName} • S${episodeSeason}E${episodeNum}` : "Feature Film"}
              </p>
            </div>
            
            {/* Red Button Exit Prompt */}
            <div className="flex items-center gap-3 rounded-2xl bg-black/40 px-5 py-3 backdrop-blur-xl border border-white/5">
              <div className="h-4 w-4 rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
              <span className="text-sm font-black text-white/80 uppercase tracking-widest">Hold to Exit</span>
            </div>
          </div>
        </div>

        {/* Bottom Gradient & Controls */}
        <div className="bg-linear-to-t from-black/95 via-black/60 to-transparent p-12 pt-32">
          {/* Progress Section */}
          <div className="mb-8 flex flex-col gap-4">
            <div className="flex items-center justify-between px-2 font-mono text-xl font-bold text-white/80">
              <span>{formatTime(displayedSeekTime)}</span>
              <span className="text-white/40">{effectiveDuration > 0 ? formatTime(effectiveDuration) : "--:--"}</span>
            </div>
            
            <div className="group relative h-4 w-full rounded-full bg-white/10 backdrop-blur-sm overflow-hidden">
              {/* Buffer Bar */}
              <div 
                className="absolute inset-y-0 left-0 bg-white/10 transition-all duration-500"
                style={{ width: `${bufferedPercent}%` }}
              />
              {/* Playback Bar */}
              <div 
                className="absolute inset-y-0 left-0 bg-linear-to-r from-primary to-primary-light shadow-[0_0_20px_rgba(66,133,244,0.6)] transition-all duration-100"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Main Button Row - NETFLIX STYLE */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Large Center Play/Pause */}
              <button 
                data-tv-focusable 
                onClick={togglePlay}
                className="group relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-black transition-all hover:scale-110 focus:scale-110 focus:ring-8 focus:ring-white/30"
              >
                {isPlaying ? <Pause className="h-10 w-10 fill-current" /> : <Play className="h-10 w-10 fill-current ml-1" />}
              </button>

              <button 
                data-tv-focusable 
                onClick={() => seekBy(-15)}
                disabled={isLiveStream}
                className={cn(
                  "flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-white transition-all hover:bg-white/20 focus:scale-110 focus:bg-white/20 focus:ring-4 focus:ring-white/20",
                  isLiveStream && "cursor-not-allowed opacity-35 hover:bg-white/10 focus:scale-100",
                )}
              >
                <div className="flex flex-col items-center">
                  <SkipBack className="h-8 w-8" />
                  <span className="text-[10px] font-black mt-0.5">-15s</span>
                </div>
              </button>

              <button 
                data-tv-focusable 
                onClick={() => seekBy(15)}
                disabled={isLiveStream}
                className={cn(
                  "flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-white transition-all hover:bg-white/20 focus:scale-110 focus:bg-white/20 focus:ring-4 focus:ring-white/20",
                  isLiveStream && "cursor-not-allowed opacity-35 hover:bg-white/10 focus:scale-100",
                )}
              >
                 <div className="flex flex-col items-center">
                  <SkipForward className="h-8 w-8" />
                  <span className="text-[10px] font-black mt-0.5">+15s</span>
                </div>
              </button>

              {episodes && currentIndex !== null && currentIndex + 1 < episodes.length && (
                <button 
                  data-tv-focusable 
                  onClick={playNextEpisode}
                  className="flex h-20 px-8 items-center gap-3 rounded-2xl bg-white/10 text-white transition-all hover:bg-white/20 focus:scale-110 focus:bg-white/20 focus:ring-4 focus:ring-white/20"
                >
                  <SkipForward className="h-6 w-6" />
                  <span className="text-lg font-black uppercase">Next Episode</span>
                </button>
              )}
            </div>

            {/* Right Side: Quick Settings with Color Hints */}
            <div className="flex items-center gap-6">
              {/* AUDIO (GREEN) */}
              <button 
                data-tv-focusable 
                onClick={() => { setAudioMenuOpen(true); setSubtitleMenuOpen(false); setSettingsOpen(false); }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-6 py-4 transition-all focus:scale-110",
                  audioMenuOpen ? "bg-green-600 text-white" : "bg-white/10 text-white/70 focus:bg-green-600/30 focus:ring-4 focus:ring-green-600/40"
                )}
              >
                <Music className="h-7 w-7" />
                <span className="text-xs font-black uppercase">Audio</span>
                <div className="mt-1 h-1 w-full rounded-full bg-green-500 opacity-50" />
              </button>

              {/* SUBTITLES (YELLOW) */}
              <button 
                data-tv-focusable 
                onClick={() => { setSubtitleMenuOpen(true); setAudioMenuOpen(false); setSettingsOpen(false); }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-6 py-4 transition-all focus:scale-110",
                  subtitleMenuOpen ? "bg-yellow-500 text-black" : "bg-white/10 text-white/70 focus:bg-yellow-500/30 focus:ring-4 focus:ring-yellow-500/40"
                )}
              >
                <Subtitles className="h-7 w-7" />
                <span className="text-xs font-black uppercase">Subtitles</span>
                <div className="mt-1 h-1 w-full rounded-full bg-yellow-500 opacity-50" />
              </button>

              {/* SETTINGS (BLUE) */}
              <button 
                data-tv-focusable 
                onClick={() => { setSettingsOpen(true); setAudioMenuOpen(false); setSubtitleMenuOpen(false); }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-6 py-4 transition-all focus:scale-110",
                  settingsOpen ? "bg-blue-600 text-white" : "bg-white/10 text-white/70 focus:bg-blue-600/30 focus:ring-4 focus:ring-blue-600/40"
                )}
              >
                <Settings className="h-7 w-7" />
                <span className="text-xs font-black uppercase">Player</span>
                <div className="mt-1 h-1 w-full rounded-full bg-blue-500 opacity-50" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Professional Side Menus */}
      <AnimatePresence>
        {(audioMenuOpen || subtitleMenuOpen) && (
          <motion.div 
            ref={trackMenuRef}
            initial={{ opacity: 0, x: 100 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 100 }} 
            className="fixed inset-y-0 right-0 z-[100] w-[450px] bg-zinc-950/95 backdrop-blur-2xl shadow-[-20px_0_50px_rgba(0,0,0,0.8)] border-l border-white/5 p-12"
          >
            <div className="mb-10 flex items-center justify-between">
              <h3 className="text-4xl font-black text-white">
                {audioMenuOpen ? "Audio Settings" : "Subtitles"}
              </h3>
              <button data-tv-focusable onClick={() => { setAudioMenuOpen(false); setSubtitleMenuOpen(false); }} className="rounded-full bg-white/10 p-4 text-white">
                <ArrowLeft className="h-6 w-6" />
              </button>
            </div>

            <div className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
              {audioMenuOpen ? (
                audioTracks.map((a) => (
                  <button 
                    key={a.id} 
                    data-tv-focusable 
                    aria-pressed={selectedAudio === a.id}
                    onClick={() => { switchAudioTrack(a.id); setAudioMenuOpen(false); }}
                    className={cn(
                      "w-full rounded-2xl px-6 py-5 text-left text-xl font-bold transition-all",
                      selectedAudio === a.id ? "bg-primary text-white scale-105" : "bg-white/5 text-white/50 hover:bg-white/10 focus:bg-white/20"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{a.name}</span>
                      {selectedAudio === a.id && <div className="h-3 w-3 rounded-full bg-white shadow-[0_0_10px_white]" />}
                    </div>
                  </button>
                ))
              ) : (
                <>
                  <button 
                    data-tv-focusable 
                    aria-pressed={selectedSubtitle < 0}
                    onClick={() => { handleSubtitleChange(-1); setSubtitleMenuOpen(false); }}
                    className={cn(
                      "w-full rounded-2xl px-6 py-5 text-left text-xl font-bold transition-all mb-4",
                      selectedSubtitle < 0 ? "bg-primary text-white scale-105" : "bg-white/5 text-white/50 hover:bg-white/10"
                    )}
                  >
                    None / Off
                  </button>
                  {subtitleTracks.map((s) => (
                    <button 
                      key={s.id} 
                      data-tv-focusable 
                      aria-pressed={selectedSubtitle === s.id}
                      onClick={() => { handleSubtitleChange(s.id); setSubtitleMenuOpen(false); }}
                      className={cn(
                        "w-full rounded-2xl px-6 py-5 text-left text-xl font-bold transition-all",
                        selectedSubtitle === s.id ? "bg-primary text-white scale-105" : "bg-white/5 text-white/50 hover:bg-white/10 focus:bg-white/20"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span>{s.name}</span>
                        {selectedSubtitle === s.id && <div className="h-3 w-3 rounded-full bg-white shadow-[0_0_10px_white]" />}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}

        {settingsOpen && (
          <motion.div 
            ref={playerSettingsMenuRef}
            initial={{ opacity: 0, scale: 1.1 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 1.1 }} 
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-xl p-20"
          >
            <div className="w-full max-w-5xl">
              <div className="mb-12 flex items-center justify-between">
                <div>
                  <h2 className="text-6xl font-black text-white mb-2">Player Settings</h2>
                  <p className="text-2xl text-white/40">Fine-tune your viewing experience</p>
                </div>
                <button data-tv-focusable onClick={() => setSettingsOpen(false)} className="rounded-full bg-white/10 p-6 text-white hover:bg-red-600 transition-colors">
                  <ArrowLeft className="h-10 w-10" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-10">
                {/* Column 1: Subtitle Position */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-xl font-black uppercase tracking-widest text-primary mb-4">Position</h4>
                  {["top", "bottom"].map((pos) => (
                    <button 
                      key={pos}
                      data-tv-focusable 
                      aria-pressed={settings.subtitlePosition === pos}
                      onClick={() => updateSettings({ subtitlePosition: pos as any })}
                      className={cn(
                        "rounded-2xl py-8 text-2xl font-black uppercase transition-all",
                        settings.subtitlePosition === pos ? "bg-primary text-white scale-105" : "bg-white/5 text-white/40"
                      )}
                    >
                      {pos}
                    </button>
                  ))}
                </div>

                {/* Column 2: Subtitle Size */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-xl font-black uppercase tracking-widest text-primary mb-4">Text Size</h4>
                  {["small", "medium", "large"].map((size) => (
                    <button 
                      key={size}
                      data-tv-focusable 
                      aria-pressed={settings.subtitleSize === size}
                      onClick={() => updateSettings({ subtitleSize: size as any })}
                      className={cn(
                        "rounded-2xl py-8 text-2xl font-black uppercase transition-all",
                        settings.subtitleSize === size ? "bg-primary text-white scale-105" : "bg-white/5 text-white/40"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                {/* Column 3: Audio Sync */}
                <div className="flex flex-col gap-4">
                  <h4 className="text-xl font-black uppercase tracking-widest text-primary mb-4">Audio Sync</h4>
                  <div className="flex flex-col items-center justify-center rounded-3xl bg-white/5 p-10 h-full">
                    <span className="text-5xl font-black text-white mb-4">
                      {audioOffsetMs > 0 ? "+" : ""}{(audioOffsetMs / 1000).toFixed(1)}s
                    </span>
                    <div className="flex gap-4 w-full">
                       <button data-tv-focusable onClick={() => updateAudioDelay(audioOffsetMs - 100)} className="flex-1 rounded-xl bg-white/10 py-4 font-bold">- 100ms</button>
                       <button data-tv-focusable onClick={() => updateAudioDelay(audioOffsetMs + 100)} className="flex-1 rounded-xl bg-white/10 py-4 font-bold">+ 100ms</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}