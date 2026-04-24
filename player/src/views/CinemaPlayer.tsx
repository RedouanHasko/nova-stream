import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  Subtitles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLocation, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { toast } from "sonner";
import { cn } from "../lib/utils";

type TrackItem = {
  id: number;
  name: string;
  codec?: string;
  lang?: string;
};

type SubtitleCueItem = {
  start: number;
  end: number;
  text: string;
};

type SettingsTab = "audio" | "subtitle" | "display";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const parseDurationToSeconds = (raw: unknown): number => {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return 0;
  const value = raw.trim();
  if (!value) return 0;
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const parts = value.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

const parseClock = (raw: string): number => {
  const v = raw.trim();
  if (!v) return 0;
  if (/^\d+:\d{2}:\d{2}\.\d{2}$/.test(v)) {
    const [h, m, sCs] = v.split(":");
    const [s, cs] = sCs.split(".");
    return (
      parseInt(h, 10) * 3600 +
      parseInt(m, 10) * 60 +
      parseInt(s, 10) +
      parseInt(cs, 10) / 100
    );
  }
  const normalized = v.replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length !== 3) return 0;
  const [h, m, secPart] = parts;
  const sec = parseFloat(secPart);
  if (!Number.isFinite(sec)) return 0;
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + sec;
};

const cleanSubtitleText = (raw: string): string => {
  return raw
    .replace(/\{[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\\N/g, "\n")
    .replace(/\r/g, "")
    .trim();
};

const parseVttOrSrt = (input: string): SubtitleCueItem[] => {
  const text = (input || "").replace(/^\uFEFF/, "");
  const re = /(\d{1,2}:\d{2}:\d{2}[\.,]\d{2,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[\.,]\d{2,3})(?:[^\n]*)\n([\s\S]*?)(?=\n\n|$)/g;
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

export default function CinemaPlayer() {
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
    streamInfo = null as any,
    episodes = null as any[] | null,
    currentIndex = null as number | null,
  } = location.state || {};

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitlePointerRef = useRef(0);
  const subtitleLastTimeRef = useRef(0);
  const subtitleLastTextRef = useRef("");
  const subtitleRafRef = useRef<number | null>(null);
  const nextEpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fastTsFallbackRef = useRef(false);
  const ffprobeAvailable = useRef(false);
  const originalStreamUrl = useRef(initialUrl);
  const lastVolumeRef = useRef(1);
  const settingsOpenRef = useRef(false);
  const inferredDurationRef = useRef(0);
  const remuxFallbackTriedRef = useRef(false);
  const startNativePlaybackRef = useRef<(seekSec?: number) => void>(() => {});
  const isLiveStreamRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioTracks, setAudioTracks] = useState<TrackItem[]>([]);
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackItem[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [nativeSubtitleActive, setNativeSubtitleActive] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCueItem[]>([]);
  const [subtitleText, setSubtitleText] = useState("");
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  const [audioOffsetMs, setAudioOffsetMs] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("audio");
  const [focusIndex, setFocusIndex] = useState(0);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);

  const proxiedUrl = useMemo(() => {
    if (!initialUrl) return "";
    return `${window.location.origin}/api/proxy?url=${encodeURIComponent(initialUrl)}`;
  }, [initialUrl]);

  const fastTsBaseUrl = useMemo(() => {
    if (!initialUrl) return "";
    return `${window.location.origin}/api/stream-ts?url=${encodeURIComponent(initialUrl)}`;
  }, [initialUrl]);

  const isLiveStream = initialUrl.includes("/live/");
  const isHlsStream =
    initialUrl.includes(".m3u8") || initialUrl.includes("/hls/") || isLiveStream;

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
        mpegtsRef.current.destroy();
      } catch {}
      mpegtsRef.current = null;
    }
  }, []);

  const startNativePlayback = useCallback(
    (seekSec = 0) => {
      const video = videoRef.current;
      if (!video || !proxiedUrl) return;
      teardownPlayers();
      setIsLoading(true);
      video.src = proxiedUrl;
      video.load();
      const onLoaded = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        if (seekSec > 0 && Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = clamp(seekSec, 0, video.duration);
        }
        video.play().catch(() => {});
      };
      video.addEventListener("loadedmetadata", onLoaded);
    },
    [proxiedUrl, teardownPlayers],
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

      teardownPlayers(); // Ensure HLS/mpegts players are destroyed
      setIsLoading(true);

      const remuxedUrl = `${window.location.origin}/api/remux?url=${encodeURIComponent(initialUrl)}&audio=${audioId}&subtitle=${subtitleId != null && subtitleId >= 0 ? subtitleId : -1}&seek=${seekSec.toFixed(3)}&audioDelayMs=${delayMs}`;
      
      video.src = remuxedUrl;
      video.load();
      video.play().catch(() => {});

      setSelectedAudio(audioId);
      setSelectedSubtitle(subtitleId != null ? subtitleId : -1);
      setNativeSubtitleActive(false); // Remuxed subtitles are handled by server/mov_text or custom engine or custom engine if extracted
      setSubtitleCues([]); // Clear custom cues if remuxing
      setSubtitleText("");
    }, [initialUrl, teardownPlayers]);

  const parseTrackInfo = useCallback((streams: any[]) => {
    const audios = streams.filter((s) => s.codec_type === "audio").map((s, i) => {
      const lang = (s.tags?.language || "und").toUpperCase();
      const codec = (s.codec_name || "audio").toUpperCase();
      const title = s.tags?.title || `${lang} ${codec}`;
      return { id: i, name: title, lang, codec } as TrackItem;
    });
    const subtitles = streams.filter((s) => s.codec_type === "subtitle").map((s, i) => {
      const lang = (s.tags?.language || "und").toUpperCase();
      const codec = (s.codec_name || "subtitle").toUpperCase();
      const title = s.tags?.title || `${lang} ${codec}`;
      return { id: i, name: title, lang, codec } as TrackItem;
    });
    setAudioTracks(audios);
    setSubtitleTracks(subtitles);
    setSelectedAudio(audios.length > 0 ? 0 : -1);
    setSelectedSubtitle(-1); // Default to no subtitle
  }, []);

  const loadTrackMetadata = useCallback(async () => {
    if (!initialUrl || isHlsStream || isLiveStream) return;
    try {
      const res = await fetch(`${window.location.origin}/api/tracks?url=${encodeURIComponent(initialUrl)}`);
      if (!res.ok) {
        ffprobeAvailable.current = false; // Explicitly set to false on failure
        return;
      }
      const data = await res.json();
      if (!data.available || !Array.isArray(data.streams)) { ffprobeAvailable.current = false; return; }
      ffprobeAvailable.current = true; // Set to true only on success
      parseTrackInfo(data.streams);
    } catch {}
  }, [initialUrl, isHlsStream, isLiveStream, parseTrackInfo]);

  const startFastTsPlayback = useCallback(
    (seekSec = 0, audioIdx = 0) => {
      const video = videoRef.current;
      if (!video || !fastTsBaseUrl) return;
      if (!(mpegts.getFeatureList().msePlayback || mpegts.getFeatureList().mseLivePlayback)) {
        startNativePlayback(seekSec);
        return;
      }

      setIsLoading(true);
      teardownPlayers();
      const url = `${fastTsBaseUrl}&seek=${Math.max(0, seekSec).toFixed(3)}&audio=${Math.max(0, audioIdx)}`;
      const player = mpegts.createPlayer(
        { type: "mpegts", url, isLive: false },
        {
          enableWorker: true,
          autoCleanupSourceBuffer: true,
          lazyLoad: false,
          stashInitialSize: 128,
        },
      );
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();
      const playRet = player.play();
      if (playRet && typeof (playRet as Promise<void>).catch === "function") {
        (playRet as Promise<void>).catch((err: any) => {
          if (String(err?.name || "") === "AbortError") return;
        });
      }
      player.on(mpegts.Events.ERROR, () => {
        if (!fastTsFallbackRef.current) {
          fastTsFallbackRef.current = true;
          startNativePlayback(seekSec);
          return;
        }
        setError("MPEG-TS playback failed");
        setIsLoading(false);
      });
    },
    [fastTsBaseUrl, startNativePlayback, teardownPlayers],
  );

  const initPlayback = useCallback(async () => { // Made async
    const video = videoRef.current;
    if (!video || !proxiedUrl) return;
    setError(null);
    setIsLoading(true);
    remuxFallbackTriedRef.current = false;
    originalStreamUrl.current = initialUrl;
    ffprobeAvailable.current = false;
    teardownPlayers();
    const cleanUrl = initialUrl.split("?")[0].toLowerCase();
    const ext = (extension || cleanUrl.match(/\.([a-z0-9]+)$/)?.[1] || "").toLowerCase();

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 45,
        maxMaxBufferLength: 90,
      });
      hlsRef.current = hls;
      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const hlsAudio = (hls.audioTracks || []).map((t, i) => ({ id: i, name: t.name || t.lang || `Audio ${i + 1}`, lang: t.lang }));
        const hlsSubs = (hls.subtitleTracks || []).map((t, i) => ({ id: i, name: t.name || t.lang || `Subtitle ${i + 1}`, lang: t.lang }));
        setAudioTracks(hlsAudio);
        setSubtitleTracks(hlsSubs);
        setSelectedAudio(hlsAudio.length > 0 ? hls.audioTrack : -1);
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
        setError("Stream playback failed");
        setIsLoading(false);
      });
      return;
    }

    // For non-HLS VOD, try to load track metadata first
    if (ext === "ts") {
      if (mpegts.getFeatureList().msePlayback || mpegts.getFeatureList().mseLivePlayback) {
        const player = mpegts.createPlayer(
          { type: "mpegts", url: proxiedUrl, isLive: false },
          { enableWorker: true, autoCleanupSourceBuffer: true, lazyLoad: false },
        );
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

    if (!isLiveStream && !isHlsStream) {
      await loadTrackMetadata(); // Wait for track metadata
      if (ffprobeAvailable.current) {
        // If ffprobe is available, start with remux playback to enable track switching
        startRemuxPlayback(0, 0, -1, audioOffsetMs);
        return;
      }
      // If ffprobe failed, fall through to native playback
      console.warn("ffprobe not available for VOD, falling back to native playback.");
    }

    video.src = proxiedUrl;
    video.load();
  }, [
    audioOffsetMs,
    extension,
    initialUrl,
    isHlsStream,
    isLiveStream,
    proxiedUrl,
    loadTrackMetadata,
    startRemuxPlayback,
    teardownPlayers,
  ]);

  useEffect(() => {
    startNativePlaybackRef.current = startNativePlayback;
  }, [startNativePlayback]);

  useEffect(() => {
    isLiveStreamRef.current = isLiveStream;
  }, [isLiveStream]);

  const runSubtitleEngineFrame = useCallback(() => {
    if (nativeSubtitleActive) {
      subtitleRafRef.current = requestAnimationFrame(runSubtitleEngineFrame);
      return;
    }
    const v = videoRef.current;
    if (!v || selectedSubtitle < 0 || subtitleCues.length === 0) {
      if (subtitleLastTextRef.current !== "") {
        subtitleLastTextRef.current = "";
        setSubtitleText("");
      }
      subtitleRafRef.current = requestAnimationFrame(runSubtitleEngineFrame);
      return;
    }
    const now = v.currentTime + subtitleOffsetMs / 1000;
    const last = subtitleLastTimeRef.current;
    subtitleLastTimeRef.current = now;
    let idx = subtitlePointerRef.current;
    if (Math.abs(now - last) > 1.2 || idx >= subtitleCues.length) {
      idx = getCueIndexBinary(subtitleCues, now);
      subtitlePointerRef.current = idx < 0 ? 0 : idx;
    } else {
      while (idx < subtitleCues.length && subtitleCues[idx].end < now) idx++;
      while (idx > 0 && subtitleCues[idx - 1].start > now) idx--;
      subtitlePointerRef.current = idx;
    }
    let nextText = "";
    if (idx >= 0 && idx < subtitleCues.length) {
      const cue = subtitleCues[idx];
      if (now >= cue.start && now <= cue.end) nextText = cue.text;
    }
    if (nextText !== subtitleLastTextRef.current) {
      subtitleLastTextRef.current = nextText;
      setSubtitleText(nextText);
    }
    subtitleRafRef.current = requestAnimationFrame(runSubtitleEngineFrame);
  }, [nativeSubtitleActive, selectedSubtitle, subtitleCues, subtitleOffsetMs]);

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

  const fetchSubtitleCues = useCallback(async (trackId: number): Promise<"success" | "failed_extraction" | "not_text_based"> => {
    if (trackId < 0) {
      setSubtitleCues([]);
      setSubtitleText("");
      return "success"; // Turning off is a "success" in this context
    }
    const endpoints = [
      `${window.location.origin}/api/subtitle?url=${encodeURIComponent(originalStreamUrl.current)}&index=${trackId}&format=vtt&delayMs=0`,
      `${window.location.origin}/api/subtitle?url=${encodeURIComponent(originalStreamUrl.current)}&index=${trackId}&format=srt&delayMs=0`,
    ];
    let payload = "";
    let ok = false;
    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const errorText = await res.text();
          if (errorText.includes("Subtitle track is empty or not text-based")) { return "not_text_based"; }
          continue; }
        payload = await res.text();
        const normalized = (payload || "").trim();
        const hasTimelineData =
          normalized.includes("-->") ||
          normalized.includes("Dialogue:") ||
          normalized.includes("[Script Info]");
        if (normalized && hasTimelineData) {
          ok = true;
          break;
        }
      } catch {}
    }
    if (!ok) {
      setSubtitleCues([]);
      setSubtitleText("");
      console.warn("Subtitle extraction failed for selected track", trackId); // eslint-disable-line no-console
      return "failed_extraction";
    }
    const cues = parseSubtitlePayload(payload);
    if (cues.length === 0) {
      setSubtitleCues([]);
      setSubtitleText("");
      console.warn("Subtitle payload parsed with zero cues", trackId); // eslint-disable-line no-console
      return "failed_extraction";
    }
    setSubtitleCues(cues);
    subtitlePointerRef.current = 0;
    return "success";
  }, []);

  const switchAudioTrack = useCallback((trackId: number) => {
    const v = videoRef.current;
    if (!v || trackId < 0) return;
    const hls = hlsRef.current;
    if (hls) {
      try {
        hls.audioTrack = trackId;
        setSelectedAudio(trackId);
      } catch {
        setError("Failed to switch HLS audio track");
      }
      return;
    }
    // For non-HLS VOD (MP4, MKV, etc.), use remuxing if ffprobe is available
    if (!isLiveStream && ffprobeAvailable.current) {
      const seek = Number.isFinite(v.currentTime) ? v.currentTime : 0;
      const currentSubId = selectedSubtitle >= 0 ? selectedSubtitle : -1;
      startRemuxPlayback(seek, trackId, currentSubId, audioOffsetMs);
      return;
    }

    // For live TS or other native-only streams, just update state (no actual switch)
    setSelectedAudio(trackId);
  }, [audioOffsetMs, isLiveStream, selectedSubtitle, startRemuxPlayback]);

  const switchSubtitleTrack = useCallback(async (trackId: number) => {
    setSelectedSubtitle(trackId);
    const v = videoRef.current as any;

    if (trackId < 0) {
      setNativeSubtitleActive(false);
      setSubtitleCues([]);
      setSubtitleText("");
      subtitlePointerRef.current = 0;
      const textTracks = v?.textTracks;
      if (textTracks && typeof textTracks.length === "number") {
        for (let i = 0; i < textTracks.length; i++) {
          try {
            textTracks[i].mode = "disabled";
          } catch {}
        }
      }
      return;
    }

    // For non-HLS VOD (MP4, MKV, etc.), use remuxing if ffprobe is available
    if (!isLiveStream && ffprobeAvailable.current) {
      const seek = Number.isFinite(v.currentTime) ? v.currentTime : 0;
      const currentAudioId = selectedAudio >= 0 ? selectedAudio : 0;
      startRemuxPlayback(seek, currentAudioId, trackId, audioOffsetMs);
      setNativeSubtitleActive(false);
      setSubtitleCues([]);
      setSubtitleText("");
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

    // For other native-only streams (e.g., live TS), try fetching cues for custom engine
    if (trackId >= 0) {
      const extractionResult = await fetchSubtitleCues(trackId);
      if (extractionResult === "success") {
        setNativeSubtitleActive(false);
      } else {
        setNativeSubtitleActive(false);
        setSubtitleCues([]);
        setSubtitleText("");
        if (extractionResult === "not_text_based") {
          toast.warning("Selected subtitle track is not text-based and cannot be displayed.");
        } else {
          toast.error("Failed to extract subtitles for the selected track.");
        }
      }
    } else {
      setNativeSubtitleActive(false);
      setSubtitleCues([]);
      setSubtitleText("");
    }
  }, [audioOffsetMs, isLiveStream, selectedAudio, startRemuxPlayback, fetchSubtitleCues]);

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
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const baseDuration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : effectiveDuration;
    if (!Number.isFinite(baseDuration) || baseDuration <= 0) return;
    const target = clamp(v.currentTime + delta, 0, baseDuration);
    if (mpegtsRef.current && fastTsBaseUrl) {
      const audioIdx = selectedAudio >= 0 ? selectedAudio : 0;
      if (seekApplyTimerRef.current) clearTimeout(seekApplyTimerRef.current);
      seekApplyTimerRef.current = setTimeout(() => {
        startFastTsPlayback(target, audioIdx);
      }, 120);
      setCurrentTime(target);
      return;
    }
    v.currentTime = target;
  };

  const handleSeekChange = (value: number) => {
    const v = videoRef.current;
    if (!v) return;
    const maxDuration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : effectiveDuration || 0;
    if (!Number.isFinite(maxDuration) || maxDuration <= 0) return;
    const target = clamp(value, 0, maxDuration);

    if (mpegtsRef.current && fastTsBaseUrl) {
      const audioIdx = selectedAudio >= 0 ? selectedAudio : 0;
      if (seekApplyTimerRef.current) clearTimeout(seekApplyTimerRef.current);
      seekApplyTimerRef.current = setTimeout(() => {
        startFastTsPlayback(target, audioIdx);
      }, 220);
      setCurrentTime(target);
      return;
    }

    setIsLoading(true);
    v.currentTime = target;
    if (hlsRef.current) {
      try {
        hlsRef.current.startLoad(-1);
      } catch {}
    }
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
    const ct = Math.floor(v.currentTime || 0);
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
      else navigate(-1);
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
          if (focusIndex === 0) switchSubtitleTrack(-1);
          else if (subtitleTracks.length > 0) switchSubtitleTrack(clamp(focusIndex - 1, 0, subtitleLimit));
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
  }, [audioOffsetMs, audioTracks.length, focusIndex, navigate, settingsOpen, settingsTab, subtitleTracks.length, updateAudioDelay, volume, switchAudioTrack, switchSubtitleTrack]);

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
      setSelectedAudio(0);
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
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onPause = () => setIsPlaying(false);
    const onSeeking = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      setIsLoading(true);
      seekRecoveryTimerRef.current = setTimeout(() => {
        if (v.readyState < 3) recoverFromStall();
      }, 5000);
    };
    const onSeeked = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      setIsLoading(false);
      if (v.paused && !document.hidden) {
        v.play().catch(() => {});
      }
    };
    const onWaiting = () => {
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
      setIsLoading(true);
      clearSeekRecoveryTimer();
      seekRecoveryTimerRef.current = setTimeout(() => {
        if (v.readyState < 3) recoverFromStall();
      }, 5000);
    };
    const onTimeUpdate = () => setCurrentTime(v.currentTime || 0);
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
      v.play().catch(() => {});
    };
    const onError = () => {
      clearWaitingTimer();
      clearSeekRecoveryTimer();
      if (
        !isLiveStreamRef.current &&
        !hlsRef.current &&
        ffprobeAvailable.current &&
        !remuxFallbackTriedRef.current
      ) {
        remuxFallbackTriedRef.current = true;
        const fallbackSeek = Number.isFinite(v.currentTime) ? v.currentTime : 0;
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

  const formatTime = (s: number) => {
    if (!Number.isFinite(s)) return "--:--";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const settingsEntries = useMemo(() => {
    if (settingsTab === "audio") return audioTracks.map((a) => a.name);
    if (settingsTab === "subtitle") return ["Off", ...subtitleTracks.map((s) => s.name)];
    return ["Subtitle Top", "Subtitle Bottom", "Subtitle Large"];
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
        poster={poster ? `${window.location.origin}/api/proxy?url=${encodeURIComponent(poster)}` : undefined}
      />

      {subtitleText && selectedSubtitle >= 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex justify-center px-6">
          <div className="max-w-[92vw] whitespace-pre-wrap rounded-xl bg-black/55 px-5 py-3 text-center text-xl font-semibold leading-snug text-white shadow-[0_6px_20px_rgba(0,0,0,0.6)] [text-shadow:0_2px_10px_rgba(0,0,0,0.95)] md:text-2xl">
            {subtitleText}
          </div>
        </div>
      )}

      {isLoading && !error && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35"><Loader2 className="h-12 w-12 animate-spin text-white" /></div>}

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-8">
          <div className="max-w-xl rounded-2xl border border-white/10 bg-zinc-950/95 p-6 text-center">
            <p className="text-lg text-red-300">{error}</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button onClick={() => { setError(null); initPlayback(); }} className="rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/90">Retry</button>
              <button onClick={() => navigate(-1)} className="rounded-lg bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20">Back</button>
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
          <button onClick={() => navigate(-1)} className="rounded-full bg-black/40 p-2 text-white hover:bg-white/20" title="Back"><ChevronLeft className="h-6 w-6" /></button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-white">{initialTitle}</h1>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="mb-3 flex items-center gap-3 text-sm text-white/85">
            <span className="w-14 text-right font-mono">{formatTime(currentTime)}</span>
            <input type="range" min={0} max={effectiveDuration > 0 ? effectiveDuration : 0} step={0.25} value={currentTime} onChange={(e) => handleSeekChange(parseFloat(e.target.value))} disabled={effectiveDuration <= 0} className="h-1.5 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50" title="Seek" />
            <span className="w-14 font-mono">{formatTime(effectiveDuration)}</span>
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
              <button onClick={() => { setSettingsOpen((p) => !p); setSettingsTab("audio"); }} className={cn("rounded-full p-2 text-white transition-colors", settingsOpen ? "bg-primary" : "hover:bg-white/15")} title="Settings"><Settings className="h-5 w-5" /></button>
              <button onClick={() => { setSettingsOpen(true); setSettingsTab("subtitle"); }} className="rounded-full p-2 text-white hover:bg-white/15" title="Subtitles"><Subtitles className="h-5 w-5" /></button>
              <button onClick={toggleFullscreen} className="rounded-full p-2 text-white hover:bg-white/15" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <motion.aside initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 320, opacity: 0 }} transition={{ duration: 0.18 }} className="absolute right-0 top-0 z-35 h-full w-90 border-l border-white/10 bg-zinc-950/95 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Cinema Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="rounded-md bg-white/10 px-2 py-1 text-xs text-white" title="Close Settings">Close</button>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
              {(["audio", "subtitle", "display"] as SettingsTab[]).map((tab) => (
                <button key={tab} onClick={() => setSettingsTab(tab)} className={cn("rounded-md px-2 py-2 font-semibold capitalize", settingsTab === tab ? "bg-primary text-white" : "bg-white/10 text-white/75 hover:bg-white/20")}>{tab}</button>
              ))}
            </div>

            {settingsTab === "audio" && (
              <div className="space-y-3">
                <p className="text-xs text-white/60">Pick audio language track from IPTV stream. HLS uses native rendition switching, and non-HLS uses native browser track switching when supported.</p>
                <div className="max-h-[45vh] overflow-y-auto rounded-md border border-white/10 p-2">
                  {audioTracks.length === 0 && <p className="px-2 py-2 text-sm text-white/50">No audio tracks available</p>}
                  {audioTracks.map((a, i) => (
                    <button key={a.id} onClick={() => switchAudioTrack(a.id)} className={cn("mb-1 w-full rounded-md px-3 py-2 text-left text-sm", selectedAudio === a.id ? "bg-primary text-white" : i === focusIndex ? "bg-white/20 text-white" : "bg-white/5 text-white/80 hover:bg-white/15")}>{a.name}</button>
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
                <div className="max-h-[45vh] overflow-y-auto rounded-md border border-white/10 p-2">
                  <button onClick={() => switchSubtitleTrack(-1)} className={cn("mb-1 w-full rounded-md px-3 py-2 text-left text-sm", selectedSubtitle === -1 ? "bg-primary text-white" : focusIndex === 0 ? "bg-white/20 text-white" : "bg-white/5 text-white/80 hover:bg-white/15")}>Off</button>
                  {subtitleTracks.map((s, i) => (
                    <button key={s.id} onClick={() => switchSubtitleTrack(s.id)} className={cn("mb-1 w-full rounded-md px-3 py-2 text-left text-sm", selectedSubtitle === s.id ? "bg-primary text-white" : i + 1 === focusIndex ? "bg-white/20 text-white" : "bg-white/5 text-white/80 hover:bg-white/15")}>{s.name}</button>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-xs text-white/65">Subtitle sync ({subtitleOffsetMs > 0 ? "+" : ""}{(subtitleOffsetMs / 1000).toFixed(1)}s)</div>
                  <input type="range" min={-8000} max={8000} step={100} value={subtitleOffsetMs} onChange={(e) => setSubtitleOffsetMs(parseInt(e.target.value, 10))} className="h-1.5 w-full cursor-pointer accent-primary" title="Subtitle sync" />
                </div>
              </div>
            )}

            {settingsTab === "display" && (
              <div className="space-y-3 text-sm text-white/80">
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <p className="font-semibold">Custom Subtitle Engine</p>
                  <p className="mt-1 text-xs text-white/60">Pointer-based subtitle renderer overlays text over the stream for TV-grade performance.</p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <p className="font-semibold">TV Remote Shortcuts</p>
                  <p className="mt-1 text-xs text-white/60">Enter: Play/Pause, Left/Right: Seek, Up/Down: Volume, Green: Settings, Back: Exit.</p>
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