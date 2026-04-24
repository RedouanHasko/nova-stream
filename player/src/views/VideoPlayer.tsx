import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import mpegts from "mpegts.js";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function VideoPlayer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { title = "Video", url = "", poster = "" } = location.state || {};

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);
  const lastVolumeRef = useRef(1);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const proxiedUrl = useMemo(() => {
    if (!url) return "";
    return `${window.location.origin}/api/proxy?url=${encodeURIComponent(url)}`;
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !proxiedUrl) return;

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        try {
          mpegtsRef.current.destroy();
        } catch {
          // noop
        }
        mpegtsRef.current = null;
      }
    };

    cleanup();
    setError(null);
    setIsLoading(true);

    const lowerUrl = url.toLowerCase();
    if ((lowerUrl.includes(".m3u8") || lowerUrl.includes("/hls/")) && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setError("Playback failed");
        setIsLoading(false);
      });
      return cleanup;
    }

    if (
      lowerUrl.endsWith(".ts") &&
      (mpegts.getFeatureList().msePlayback || mpegts.getFeatureList().mseLivePlayback)
    ) {
      const player = mpegts.createPlayer({
        type: "mpegts",
        url: proxiedUrl,
        isLive: false,
      });
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();
      player.play();
      setIsLoading(false);
      player.on(mpegts.Events.ERROR, () => {
        setError("Playback failed");
        setIsLoading(false);
      });
      return cleanup;
    }

    video.src = proxiedUrl;
    video.load();
    return cleanup;
  }, [proxiedUrl, url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime || 0);
    const onDurationChange = () => {
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted || video.volume === 0);
    };
    const onError = () => {
      setError("Playback failed");
      setIsLoading(false);
    };
    const onLoadedMetadata = () => {
      setIsLoading(false);
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("error", onError);
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("error", onError);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      return;
    }
    video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.muted || video.volume === 0) {
      const restore = lastVolumeRef.current > 0 ? lastVolumeRef.current : 1;
      video.muted = false;
      video.volume = restore;
      setVolume(restore);
      setIsMuted(false);
      return;
    }

    lastVolumeRef.current = video.volume > 0 ? video.volume : lastVolumeRef.current;
    video.muted = true;
    setIsMuted(true);
  };

  const setPlayerVolume = (next: number) => {
    const video = videoRef.current;
    if (!video) return;
    const value = clamp(next, 0, 1);
    if (value > 0) lastVolumeRef.current = value;
    video.volume = value;
    video.muted = value === 0;
    setVolume(value);
    setIsMuted(value === 0);
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return "--:--";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="relative h-screen w-full bg-black text-white">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain bg-black"
        playsInline
        crossOrigin="anonymous"
        preload="auto"
        poster={
          poster
            ? `${window.location.origin}/api/proxy?url=${encodeURIComponent(poster)}`
            : undefined
        }
      />

      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 className="h-10 w-10 animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
          <div>
            <p className="mb-4 text-red-300">{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="rounded bg-white/10 px-4 py-2 hover:bg-white/20"
            >
              Back
            </button>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full bg-black/40 p-2 hover:bg-white/20"
          title="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-lg font-bold">{title}</h1>
          <p className="text-xs text-white/60">Generic player route</p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="mb-3 flex items-center gap-3 text-sm">
          <span className="w-12 text-right font-mono">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.25}
            value={currentTime}
            onChange={(e) => {
              const video = videoRef.current;
              if (!video) return;
              video.currentTime = parseFloat(e.target.value);
            }}
            className="h-1.5 flex-1 cursor-pointer accent-primary"
            title="Seek"
          />
          <span className="w-12 font-mono">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="rounded-full p-2 hover:bg-white/15"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-white" />}
          </button>
          <button
            onClick={toggleMute}
            className="rounded-full p-2 hover:bg-white/15"
            title="Mute"
          >
            {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => setPlayerVolume(parseFloat(e.target.value))}
            className="h-1.5 w-24 cursor-pointer accent-primary"
            title="Volume"
          />
        </div>
      </div>
    </div>
  );
}
