import {
  Tv,
  Film,
  Clapperboard,
  User,
  ListRestart,
  Settings,
  RefreshCw,
  FolderOpen,
  Radio,
  X,
  Link,
  Upload,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import WeatherWidget from "../components/WeatherWidget";
import DigitalClock from "../components/DigitalClock";
import { motion } from "motion/react";
import { toast } from "sonner";
import { usePlaylist } from "../context/PlaylistContext";
import { IPTVService } from "../services/iptvService";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { focusNext } from "../lib/remote";

type DeckCardProps = {
  icon: any;
  title: string;
  metric?: string;
  subMetric?: string;
  description?: string;
  badge?: string;
  accent?: "gold" | "blue" | "violet" | "mint";
  onClick?: () => void;
};

function DeckCard({
  icon: Icon,
  title,
  metric,
  subMetric,
  description,
  badge,
  accent = "blue",
  onClick,
}: DeckCardProps) {
  return (
    <motion.button
      data-tv-focusable
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "tv-deck-card group relative h-[44vh] min-h-[500px] max-h-[600px] overflow-hidden rounded-[28px] border p-8 text-left transition-all duration-300",
        accent === "gold" && "tv-deck-card--gold",
        accent === "blue" && "tv-deck-card--blue",
        accent === "violet" && "tv-deck-card--violet",
        accent === "mint" && "tv-deck-card--mint",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/15 via-transparent to-transparent opacity-60" />
      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-4 flex items-center justify-between">
          <span className="rounded-full border border-white/16 bg-white/6 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/66">
            {badge || "Watch"}
          </span>
        </div>

        <div className="flex justify-center pt-2">
          <div className="rounded-3xl border border-white/20 bg-white/5 p-5">
            <Icon className="h-16 w-16 text-white/95" />
          </div>
        </div>

        <div className="mt-auto flex min-w-0 flex-col items-start gap-2 pb-1">
          <h3 className="text-[48px] font-semibold tracking-tight text-white leading-none">
            {title}
          </h3>
          {description ? <p className="max-w-[92%] text-[13px] text-white/62">{description}</p> : null}
          <div className="flex flex-col items-start gap-1">
            {metric ? <span className="text-[42px] font-semibold text-white/95 leading-none">{metric}</span> : null}
            {subMetric ? <span className="text-sm text-white/70">{subMetric}</span> : null}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

type OrbActionProps = {
  icon: any;
  label: string;
  onClick?: () => void;
};

function OrbAction({ icon: Icon, label, onClick }: OrbActionProps) {
  return (
    <button
      data-tv-focusable
      onClick={onClick}
      className="tv-orb-action flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-black/35 backdrop-blur-md"
      aria-label={label}
      title={label}
    >
      <Icon className="h-6 w-6 text-white" />
    </button>
  );
}

type UtilityActionProps = {
  icon: any;
  label: string;
  hint?: string;
  onClick?: () => void;
};

function UtilityAction({ icon: Icon, label, hint, onClick }: UtilityActionProps) {
  return (
    <button
      data-tv-focusable
      onClick={onClick}
      className="home-utility-action tv-utility-pill flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-white/90"
      aria-label={label}
      title={label}
    >
      <span className="home-utility-action__icon">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-white/92">{label}</span>
        {hint ? <span className="truncate text-[11px] text-white/48">{hint}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
    </button>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const {
    activePlaylist,
    isConnected,
    fetchLive,
    refreshAccountInfo,
    isLiveInitialLoading,
    isVodInitialLoading,
    isSeriesInitialLoading,
    sectionLoadProgress,
    playlistData,
    activationStatus,
  } = usePlaylist();
  const t = useT();

  const handleReload = () => {
    if (!activePlaylist) {
      toast.error(t.noPlaylistConnected);
      return;
    }

    const reloadPromise = Promise.allSettled([
      fetchLive(),
      ...(activePlaylist.type === "xtream"
        ? [refreshAccountInfo(activePlaylist.id)]
        : []),
    ]).then((results) => {
      if (results.every((result) => result.status === "rejected")) {
        throw new Error("Playlist refresh failed");
      }
    });

    toast.promise(reloadPromise, {
      loading: t.reloadingPlaylist,
      success: t.reload,
      error: t.failedToReloadPlaylist,
    });
  };

  const expiryDate = activePlaylist?.accountInfo?.user.exp_date
    ? IPTVService.formatExpiryDate(activePlaylist.accountInfo.user.exp_date)
    : t.unlimited;

  const formatActivationExpiry = (value?: string | null) => {
    if (!value) return t.unlimited;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t.unlimited;
    return parsed.toLocaleDateString();
  };

  const appActivationExpiry = activationStatus.activations.find(
    (activation) => activation.status === "active" && activation.expiresAt,
  )?.expiresAt || activationStatus.trial.expiresAt;

  const appActivationExpiryLabel = formatActivationExpiry(appActivationExpiry);
  const [showOpenStreamModal, setShowOpenStreamModal] = useState(false);
  const [streamInput, setStreamInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // TV D-pad navigation for the home tiles (spatial, non-indexed).
  const homeFocusRootRef = useRef<HTMLDivElement | null>(null);
  const openStreamModalRef = useRef<HTMLDivElement | null>(null);

  const focusHomeDefault = () => {
    const firstDeckCard =
      homeFocusRootRef.current?.querySelector<HTMLElement>(".home-deck-grid [data-tv-focusable]") ||
      homeFocusRootRef.current?.querySelector<HTMLElement>("[data-tv-focusable]");
    firstDeckCard?.focus({ preventScroll: true });
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if ((key === "back" || key === "red") && showOpenStreamModal) {
        setShowOpenStreamModal(false);
        return;
      }
      if (key === "enter" || key === "select") {
        (document.activeElement as HTMLElement | null)?.click();
        return;
      }
      if (key === "left" || key === "right" || key === "up" || key === "down") {
        const root = showOpenStreamModal ? openStreamModalRef.current : homeFocusRootRef.current;
        const active = document.activeElement as HTMLElement | null;
        if (!showOpenStreamModal && (!active || active === document.body || !root?.contains(active))) {
          focusHomeDefault();
          return;
        }
        focusNext(key, { root });
      }
    };
    window.addEventListener("tv-remote-key", handler);
    // Auto-focus the main deck so d-pad navigation starts where users expect.
    requestAnimationFrame(() => {
      focusHomeDefault();
    });
    return () => window.removeEventListener("tv-remote-key", handler);
  }, [showOpenStreamModal]);

  const openExternalStream = (raw: string) => {
    const url = raw.trim();
    if (!url) {
      toast.error(t.enterStreamUrl);
      return;
    }
    const isHttp = /^https?:\/\//i.test(url);
    const isBlob = /^blob:/i.test(url);
    if (!isHttp && !isBlob) {
      toast.error("Please enter a valid stream URL");
      return;
    }
    navigate("/player", {
      state: {
        title: t.externalStream,
        url,
        isLive: /\.m3u8(\?|$)/i.test(url),
      },
    });
    setShowOpenStreamModal(false);
    setStreamInput("");
  };

  const handleStreamFilePick = async (file?: File | null) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    try {
      // For M3U/text files, extract the first HTTP/HTTPS URL.
      if (lowerName.endsWith(".m3u") || lowerName.endsWith(".m3u8") || lowerName.endsWith(".txt")) {
        const text = await file.text();
        const match = text.match(/https?:\/\/[^\s"'<>]+/i);
        if (!match) {
          toast.error("No stream URL found in file");
          return;
        }
        openExternalStream(match[0]);
        return;
      }

      // For media files, play through a blob URL directly.
      const blobUrl = URL.createObjectURL(file);
      openExternalStream(blobUrl);
    } catch {
      toast.error("Failed to read file");
    }
  };

  return (
    <div className="home-tv-shell min-h-screen p-6 md:p-8">
      <div className="home-tv-bg-orb home-tv-bg-orb--a" />
      <div className="home-tv-bg-orb home-tv-bg-orb--b" />

      <div
        ref={homeFocusRootRef}
        className="relative z-10 mx-auto flex h-[calc(100vh-3rem)] w-full max-w-[1760px] flex-col"
      >
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="home-tv-topbar mb-6 flex items-start justify-between"
        >
          <div className="flex min-w-[300px] max-w-[460px] flex-col gap-1 px-1 py-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  isConnected ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.6)]" : "bg-white/35",
                )}
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/46">
                {t.active} Playlist
              </span>
            </div>
            <span className="block truncate text-[18px] font-semibold text-white/92">
              {activePlaylist?.name || t.noPlaylistConnected}
            </span>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <Logo size="lg" />
          </div>

          <div className="flex items-center gap-3">
            <OrbAction icon={RefreshCw} label={t.reload} onClick={handleReload} />
            <OrbAction icon={Settings} label={t.settings} onClick={() => navigate("/settings")} />
            <OrbAction icon={User} label={t.account} onClick={() => navigate("/account")} />
          </div>
        </motion.header>

        <main className="flex flex-1 flex-col gap-6">
          <div className="flex flex-1 items-center">
            <div className="home-deck-grid mx-auto grid w-full max-w-[1580px] grid-cols-4 gap-7">
            <DeckCard
              icon={Tv}
              title={t.live}
              metric={`+${playlistData.liveStreams?.length || 0}`}
              subMetric={isLiveInitialLoading ? `Loading ${sectionLoadProgress.live}%` : "Channels"}
              description="Live channels with fast zap and instant playback"
              badge="Live"
              accent="gold"
              onClick={() => navigate("/live")}
            />
            <DeckCard
              icon={Film}
              title={t.movies}
              metric={`+${playlistData.vodStreams?.length || 0}`}
              subMetric={isVodInitialLoading ? `Loading ${sectionLoadProgress.vod}%` : "Movies"}
              description="On-demand movies in one curated catalog"
              badge="VOD"
              accent="blue"
              onClick={() => navigate("/movies")}
            />
            <DeckCard
              icon={Clapperboard}
              title={t.series}
              metric={`+${playlistData.seriesStreams?.length || 0}`}
              subMetric={isSeriesInitialLoading ? `Loading ${sectionLoadProgress.series}%` : "Series"}
              description="Episode browsing with season-aware navigation"
              badge="Series"
              accent="violet"
              onClick={() => navigate("/series")}
            />
            <DeckCard
              icon={Radio}
              title={t.radio}
              metric="Live"
              subMetric="Stations"
              description="Background-friendly live radio stations"
              badge="Radio"
              accent="mint"
              onClick={() => navigate("/radio")}
            />
            </div>
          </div>

          <div className="mt-auto grid grid-cols-1 items-end gap-6 md:grid-cols-[1fr_auto_1fr]">
            <div className="flex w-full flex-col gap-3 md:justify-self-start">
              <div className="flex flex-wrap items-center gap-3">
                <UtilityAction
                  icon={ListRestart}
                  label={t.changePlaylist}
                  hint="Switch or manage playlists"
                  onClick={() => navigate("/settings", { state: { openModal: "playlists" } })}
                />
                <UtilityAction
                  icon={FolderOpen}
                  label={t.openUrlFile}
                  hint="Open external stream URL or file"
                  onClick={() => setShowOpenStreamModal(true)}
                />
              </div>
            </div>

            <div className="home-meta-ribbon flex items-center justify-center gap-3 px-4 py-3">
              <div className="home-meta-ribbon__item">
                <span className="home-meta-ribbon__label">IPTV {t.expires}</span>
                <span className="home-meta-ribbon__value">{expiryDate}</span>
              </div>
              <div className="home-meta-ribbon__divider" />
              <div className="home-meta-ribbon__item">
                <span className="home-meta-ribbon__label">App {t.expires}</span>
                <span className="home-meta-ribbon__value">{appActivationExpiryLabel}</span>
              </div>
              <div className="home-meta-ribbon__divider" />
              <div className="home-meta-ribbon__item">
                <span className="home-meta-ribbon__label">Version</span>
                <span className="home-meta-ribbon__value">1.0.0</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 md:justify-self-end md:pr-2">
              <div className="home-status-strip flex items-center gap-1 px-2.5 py-2">
                <DigitalClock variant="compact" />
                <div className="home-status-separator h-7 w-px bg-white/14" />
                <WeatherWidget variant="compact" />
              </div>
            </div>
          </div>
        </main>

        {showOpenStreamModal && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div ref={openStreamModalRef} className="w-full max-w-[720px] rounded-3xl border border-white/15 bg-[#0c111b] p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-white">{t.openUrlFile}</h3>
                  <p className="mt-1 text-sm text-white/50">Paste a stream URL or choose a local file.</p>
                </div>
                <button
                  data-tv-focusable
                  onClick={() => setShowOpenStreamModal(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white/80"
                  aria-label="Close"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-5 rounded-2xl border border-white/10 bg-black/25 p-4">
                <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-white/45">Stream URL</label>
                <input
                  data-tv-focusable
                  autoFocus
                  value={streamInput}
                  onChange={(e) => setStreamInput(e.target.value)}
                  placeholder="https://...m3u8"
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-sky-300/50"
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  void handleStreamFilePick(e.target.files?.[0] || null);
                  e.currentTarget.value = "";
                }}
              />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  data-tv-focusable
                  onClick={() => openExternalStream(streamInput)}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-500/20 px-5 py-2.5 text-sm font-semibold text-sky-100"
                >
                  <Link className="h-4 w-4" />
                  Open URL
                </button>
                <button
                  data-tv-focusable
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white/90"
                >
                  <Upload className="h-4 w-4" />
                  Choose File
                </button>
                <button
                  data-tv-focusable
                  onClick={() => setShowOpenStreamModal(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-transparent px-5 py-2.5 text-sm font-semibold text-white/75"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
