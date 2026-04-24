/**
 * InlineMediaPlayer — Video.js-powered embedded player.
 * Works on webOS, Tizen, and every modern browser.
 * Audio / subtitle track switching uses:
 *   - HLS streams  → Video.js VHS native track API
 *   - File streams → direct playback by default, /api/remux only when a track is changed
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Music, SlidersHorizontal, Subtitles } from "lucide-react";
import videojs from "video.js";
import SubtitleOverlay from "./SubtitleOverlay";
import { usePlaylist } from "../context/PlaylistContext";
import {
  isTextSubtitleCodec,
  parseSubtitleText,
  type SubtitleCueItem,
} from "../lib/subtitles";

type VjsPlayer = ReturnType<typeof videojs>;

const AUDIO_SWITCH_BACKOFF_SEC = 0.2;
const TRACK_SWITCH_BACKOFF_SEC = 0.35;

interface TrackOption {
  id: number;
  name: string;
  language?: string;
  codec?: string;
  extractable?: boolean;
}

interface InlineMediaPlayerProps {
  url: string;
  poster?: string;
  streamInfo?: any;
  startTime?: number;
  className?: string;
  onProgressChange?: (currentTime: number, duration: number) => void;
}

const toArr = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);

const buildAudioLabel = (a: any, i: number) => {
  const lang = (a.tags?.language || a.lang || "").toUpperCase();
  const codec = (a.codec_name || "").toUpperCase();
  const ch = a.channel_layout
    ? a.channel_layout.replace(/\(.*?\)/g, "").trim()
    : a.channels
      ? `${a.channels}ch`
      : "";
  if (lang && codec) return `${lang} — ${codec}${ch ? ` ${ch}` : ""}`;
  if (lang) return lang;
  if (codec) return `${codec}${ch ? ` ${ch}` : ""}`;
  return `Audio ${i + 1}`;
};

const buildSubLabel = (s: any, i: number) => {
  const lang = (s.tags?.language || s.lang || "").toUpperCase();
  const codec = (s.codec_name || "").toUpperCase();
  if (lang) return codec ? `${lang} — ${codec}` : lang;
  if (codec) return codec;
  return `Sub ${i + 1}`;
};

export default function InlineMediaPlayer({
  url,
  poster,
  streamInfo = null,
  startTime = 0,
  className,
  onProgressChange,
}: InlineMediaPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<VjsPlayer | null>(null);
  const originalUrlRef = useRef(url);
  const aliveRef = useRef(true);
  const currentAudioRef = useRef(0);
  const currentSubRef = useRef(-1);
  const remuxActiveRef = useRef(false);
  const remuxOffsetRef = useRef(0);
  const sourceDurationRef = useRef(0);

  const { settings } = usePlaylist();

  const [audioTracks, setAudioTracks] = useState<TrackOption[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackOption[]>([]);
  const [currentAudio, setCurrentAudio] = useState(0);
  const [currentSub, setCurrentSub] = useState(-1);
  const [showMenu, setShowMenu] = useState(false);
  const [menuTab, setMenuTab] = useState<"audio" | "subtitle">("audio");
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCueItem[]>([]);
  const [subtitleTimeBase, setSubtitleTimeBase] = useState(0);
  const [logicalCurrentTime, setLogicalCurrentTime] = useState(startTime || 0);
  const [logicalDuration, setLogicalDuration] = useState(0);
  const [switchingAudio, setSwitchingAudio] = useState(false);

  const getNativeSubtitleTracks = useCallback(() => {
    const player = playerRef.current;
    const textTracks = player?.textTracks?.();
    if (!textTracks || textTracks.length <= 0) return [] as any[];
    return Array.from({ length: textTracks.length }, (_, index) => (textTracks as any)[index] as any)
      .filter((track) => track && (track.kind === "subtitles" || track.kind === "captions"));
  }, []);

  const isHlsUrl = (rawUrl: string) => {
    const clean = rawUrl.split("?")[0].toLowerCase();
    return clean.endsWith(".m3u8") || clean.includes("/hls/");
  };

  const proxyOf = (rawUrl: string) =>
    `${window.location.origin}/api/proxy?url=${encodeURIComponent(rawUrl)}`;

  const remuxUrl = useCallback(
    (audioId: number, subId: number | null, seekSec: number) => {
      const p = new URLSearchParams({
        url: originalUrlRef.current,
        audio: String(audioId),
      });
      if (seekSec > 1) p.set("seek", seekSec.toFixed(3));
      if (subId != null && subId >= 0) p.set("subtitle", String(subId));
      return `${window.location.origin}/api/remux?${p}`;
    },
    [],
  );

  const subtitleSourceUrl = useCallback((subtitleId: number, seekSec: number) => {
    const params = new URLSearchParams({
      url: originalUrlRef.current,
      index: String(subtitleId),
    });
    if (seekSec > 1) params.set("seek", seekSec.toFixed(3));
    return `${window.location.origin}/api/subtitle?${params.toString()}`;
  }, []);

  // ─── Video.js initialization / teardown ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    aliveRef.current = true;
    originalUrlRef.current = url;
    remuxActiveRef.current = false;
    remuxOffsetRef.current = 0;
    sourceDurationRef.current = 0;
    setSubtitleUrl(null);
    setSubtitleCues([]);
    setSubtitleTimeBase(0);
    setSwitchingAudio(false);
    setLogicalCurrentTime(startTime || 0);
    setLogicalDuration(0);

    const hls = isHlsUrl(url);
    const srcType = hls ? "application/x-mpegURL" : "video/mp4";
    const initialSource = proxyOf(url);

    const videoEl = document.createElement("video");
    videoEl.className = "video-js vjs-big-play-centered";
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("webkit-playsinline", "");
    containerRef.current.appendChild(videoEl);

    const player = videojs(videoEl, {
      controls: true,
      autoplay: "any" as any,
      preload: "auto",
      fill: true,
      fluid: false,
      poster: poster
        ? `${window.location.origin}/api/proxy?url=${encodeURIComponent(poster)}`
        : undefined,
      techOrder: ["html5"],
      html5: {
        vhs: {
          overrideNative: !(videojs as any).browser?.IS_SAFARI,
          enableLowInitialPlaylist: false,
          limitRenditionByPlayerDimensions: true,
          useNetworkInformationApi: true,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
        nativeTextTracks: false,
      },
      sources: [{ src: initialSource, type: srcType }],
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
    } as any);

    playerRef.current = player;

    if (startTime > 0) {
      player.one("loadedmetadata", () => {
        try {
          const dur = player.duration() || 0;
          if (!isFinite(dur) || dur > startTime) player.currentTime(startTime);
        } catch {}
      });
    }

    player.on("loadedmetadata", () => {
      const rawDuration = player.duration() || 0;
      if (!remuxActiveRef.current && isFinite(rawDuration) && rawDuration > 0) {
        sourceDurationRef.current = rawDuration;
        setLogicalDuration(rawDuration);
      } else if (remuxActiveRef.current && isFinite(rawDuration) && rawDuration > 0) {
        setLogicalDuration(Math.max(sourceDurationRef.current, remuxOffsetRef.current + rawDuration));
      }
      setSwitchingAudio(false);
    });

    player.on("timeupdate", () => {
      if (!aliveRef.current) return;
      const current = (remuxActiveRef.current ? remuxOffsetRef.current : 0) + (player.currentTime() || 0);
      const rawDuration = player.duration() || 0;
      const duration = sourceDurationRef.current > 0
        ? sourceDurationRef.current
        : (remuxActiveRef.current ? remuxOffsetRef.current + rawDuration : rawDuration);
      setLogicalCurrentTime(current);
      setLogicalDuration(duration || 0);
      onProgressChange?.(current, duration || 0);
    });

    // HLS: populate tracks from VHS after manifest is parsed
    if (hls) {
      player.on("loadedmetadata", () => {
        if (!aliveRef.current) return;
        try {
          const at = player.audioTracks();
          if (at && at.length > 1) {
            const tracks: TrackOption[] = [];
            for (let i = 0; i < at.length; i++) {
              const t = at[i] as any;
              tracks.push({ id: i, name: t.label || t.language || `Audio ${i + 1}`, language: t.language });
            }
            setAudioTracks(tracks);
            setCurrentAudio(0);
            currentAudioRef.current = 0;
          }
          const tt = player.textTracks();
          if (tt && tt.length > 0) {
            const subs: TrackOption[] = [];
            for (let i = 0; i < tt.length; i++) {
              const t = tt[i] as any;
              if (t.kind === "subtitles" || t.kind === "captions")
                subs.push({
                  id: i,
                  name: t.label || t.language || `Sub ${i + 1}`,
                  language: t.language,
                  codec: "native",
                  extractable: true,
                });
            }
            setSubtitleTracks(subs);
          }
        } catch {}
      });
    }

    // Non-HLS: pre-populate from streamInfo then refine with ffprobe
    if (!hls) {
      if (streamInfo) {
        const audioArr = toArr(streamInfo.audio);
        const subArr = toArr(streamInfo.sub);
        if (audioArr.length > 0) {
          setAudioTracks(audioArr.map((a: any, i: number) => ({ id: i, name: buildAudioLabel(a, i) })));
          setCurrentAudio(0);
          currentAudioRef.current = 0;
        }
        if (subArr.length > 0)
          setSubtitleTracks(
            subArr.map((s: any, i: number) => ({
              id: i,
              name: buildSubLabel(s, i),
              codec: s.codec_name,
              extractable: isTextSubtitleCodec(s.codec_name),
            })),
          );
      }

      const ac = new AbortController();
      player.one("playing", () => {
        fetch(`${window.location.origin}/api/tracks?url=${encodeURIComponent(url)}`, { signal: ac.signal })
          .then((r) => r.json())
          .then((data) => {
            if (!aliveRef.current || !data.available || !data.streams?.length) return;
            const audioStreams = data.streams.filter((s: any) => s.codec_type === "audio");
            const subStreams = data.streams.filter((s: any) => s.codec_type === "subtitle");
            if (audioStreams.length > 0) {
              setAudioTracks(audioStreams.map((s: any, i: number) => ({ id: i, name: buildAudioLabel(s, i) })));
              setCurrentAudio(0);
              currentAudioRef.current = 0;
            }
            if (subStreams.length > 0)
              setSubtitleTracks(
                subStreams.map((s: any, i: number) => ({
                  id: i,
                  name: buildSubLabel(s, i),
                  codec: s.codec_name,
                  extractable: isTextSubtitleCodec(s.codec_name),
                })),
              );
          })
          .catch(() => {});
      });

      return () => {
        ac.abort();
        aliveRef.current = false;
        if (!player.isDisposed()) player.dispose();
        playerRef.current = null;
        if (containerRef.current) containerRef.current.innerHTML = "";
      };
    }

    return () => {
      aliveRef.current = false;
      if (!player.isDisposed()) player.dispose();
      playerRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!subtitleUrl || isHlsUrl(url) || currentSub < 0) {
      setSubtitleCues([]);
      return;
    }

    const controller = new AbortController();
    fetch(subtitleUrl, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        if (!aliveRef.current) return;
        setSubtitleCues(parseSubtitleText(text));
      })
      .catch(() => {
        if (aliveRef.current) setSubtitleCues([]);
      });

    return () => controller.abort();
  }, [currentSub, subtitleUrl, url]);

  // ─── Track switching ────────────────────────────────────────────────────────

  const changeAudio = useCallback(
    (audioId: number) => {
      const player = playerRef.current;
      if (!player || player.isDisposed()) return;

      if (isHlsUrl(url)) {
        const at = player.audioTracks();
        for (let i = 0; i < at.length; i++) (at[i] as any).enabled = i === audioId;
        setCurrentAudio(audioId);
        currentAudioRef.current = audioId;
        setShowMenu(false);
        return;
      }

      try {
        const at = player.audioTracks();
        if (at && at.length > 0) {
          for (let i = 0; i < at.length; i++) (at[i] as any).enabled = i === audioId;
          setCurrentAudio(audioId);
          currentAudioRef.current = audioId;
          setShowMenu(false);
          return;
        }
      } catch {}

      const requestedTime = (remuxActiveRef.current ? remuxOffsetRef.current : 0) + (player.currentTime() || 0);
      const savedTime = Math.max(0, requestedTime - AUDIO_SWITCH_BACKOFF_SEC);
      remuxActiveRef.current = true;
      remuxOffsetRef.current = savedTime;
      setSwitchingAudio(true);
      const currentSubTrack = subtitleTracks.find((track) => track.id === currentSubRef.current);
      if (currentSubRef.current >= 0 && currentSubTrack?.extractable !== false) {
        setSubtitleUrl(subtitleSourceUrl(currentSubRef.current, savedTime));
        setSubtitleTimeBase(savedTime);
      } else {
        setSubtitleUrl(null);
        setSubtitleCues([]);
        setSubtitleTimeBase(0);
      }
      player.src({
        src: remuxUrl(audioId, null, savedTime),
        type: "video/mp4",
      });
      player.one("loadedmetadata", () => {
        player.play().catch(() => {});
      });
      player.load();
      setCurrentAudio(audioId);
      currentAudioRef.current = audioId;
      setShowMenu(false);
    },
    [url, remuxUrl, subtitleSourceUrl],
  );

  const changeSubtitle = useCallback(
    (subId: number) => {
      const player = playerRef.current;
      if (!player || player.isDisposed()) return;

      if (isHlsUrl(url)) {
        const tt = player.textTracks();
        for (let i = 0; i < tt.length; i++) (tt[i] as any).mode = i === subId ? "showing" : "disabled";
        setCurrentSub(subId);
        currentSubRef.current = subId;
        setShowMenu(false);
        return;
      }

      const nativeSubtitleTracks = getNativeSubtitleTracks();
      if (nativeSubtitleTracks.length > 0) {
        nativeSubtitleTracks.forEach((track, index) => {
          track.mode = subId >= 0 && index === subId ? "hidden" : "disabled";
        });
        setSubtitleUrl(null);
        setSubtitleCues([]);
        setSubtitleTimeBase(0);
        setCurrentSub(subId);
        currentSubRef.current = subId;
        setShowMenu(false);
        return;
      }

      const requestedTime = (remuxActiveRef.current ? remuxOffsetRef.current : 0) + (player.currentTime() || 0);
      const savedTime = Math.max(0, requestedTime - TRACK_SWITCH_BACKOFF_SEC);
      const selectedTrack = subtitleTracks.find((track) => track.id === subId);
      if (subId >= 0) {
        if (selectedTrack?.extractable === false) {
          setSubtitleUrl(null);
          setSubtitleCues([]);
          setSubtitleTimeBase(0);
          setCurrentSub(-1);
          currentSubRef.current = -1;
          setShowMenu(false);
          return;
        }
        const normalizedSeekTime = savedTime > 1 ? savedTime : 0;
        setSubtitleUrl(subtitleSourceUrl(subId, normalizedSeekTime));
        setSubtitleTimeBase(normalizedSeekTime);
      } else {
        setSubtitleUrl(null);
        setSubtitleCues([]);
        setSubtitleTimeBase(0);
      }
      setCurrentSub(subId);
      currentSubRef.current = subId;
      setShowMenu(false);
    },
    [getNativeSubtitleTracks, subtitleSourceUrl, subtitleTracks, url],
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  const hasMultiTracks = audioTracks.length > 1 || subtitleTracks.length > 0;

  return (
    <div className={`relative min-h-45 overflow-hidden rounded-[22px] border border-white/10 bg-black shadow-2xl ${className ?? ""}`}>
      {/* Video.js mounts here */}
      <div ref={containerRef} className="w-full h-full" />

      {!isHlsUrl(url) && currentSub >= 0 && subtitleCues.length > 0 && (
        <SubtitleOverlay
          cues={subtitleCues}
          currentTime={Math.max(0, logicalCurrentTime - subtitleTimeBase)}
          size={settings.subtitleSize}
          className="bottom-[13%] z-45"
        />
      )}

      {switchingAudio && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-46 flex justify-center px-4">
          <div className="nova-player-chip flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
            <Loader2 className="h-4 w-4 animate-spin" />
            Switching Audio
          </div>
        </div>
      )}

      {/* Track selector */}
      {hasMultiTracks && (
        <div className="absolute right-3 top-3 z-50">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="nova-player-chip flex items-center gap-2 rounded-full px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-black/90"
            title="Track settings"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Tracks
          </button>

          {showMenu && (
            <div
              className="absolute right-0 top-11 z-50 min-w-50 overflow-hidden rounded-2xl border border-white/15 bg-black/92 shadow-2xl"
            >
              {audioTracks.length > 1 && subtitleTracks.length > 0 && (
                <div className="flex border-b border-white/10 bg-white/5">
                  <button
                    onClick={() => setMenuTab("audio")}
                    className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${menuTab === "audio" ? "bg-primary/18 text-primary" : "text-white/60 hover:text-white"}`}
                  >
                    <Music className="h-3.5 w-3.5" />
                    Audio
                  </button>
                  <button
                    onClick={() => setMenuTab("subtitle")}
                    className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${menuTab === "subtitle" ? "bg-primary/18 text-primary" : "text-white/60 hover:text-white"}`}
                  >
                    <Subtitles className="h-3.5 w-3.5" />
                    Subtitles
                  </button>
                </div>
              )}

              <div className="max-h-52 overflow-y-auto p-1.5">
                {(menuTab === "audio" || subtitleTracks.length === 0) &&
                  audioTracks.length > 1 &&
                  audioTracks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => changeAudio(t.id)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                        currentAudio === t.id ? "bg-primary/15 text-primary font-semibold" : "text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {currentAudio === t.id ? "✓ " : ""}{t.name}
                    </button>
                  ))}

                {(menuTab === "subtitle" || audioTracks.length <= 1) && subtitleTracks.length > 0 && (
                  <>
                    <button
                      onClick={() => changeSubtitle(-1)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                        currentSub === -1 ? "bg-primary/15 text-primary font-semibold" : "text-white/80 hover:bg-white/10"
                      }`}
                    >
                      {currentSub === -1 ? "✓ " : ""}Off
                    </button>
                    {subtitleTracks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => changeSubtitle(t.id)}
                        className={`w-full rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                          currentSub === t.id ? "bg-primary/15 text-primary font-semibold" : "text-white/80 hover:bg-white/10"
                        }`}
                      >
                        {currentSub === t.id ? "✓ " : ""}
                        {t.name}
                        {t.extractable === false ? " · unsupported" : ""}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}