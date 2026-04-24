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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Tile from "../components/Tile";
import Logo from "../components/Logo";
import WeatherWidget from "../components/WeatherWidget";
import DigitalClock from "../components/DigitalClock";
import { motion } from "motion/react";
import { toast } from "sonner";
import { usePlaylist } from "../context/PlaylistContext";
import { IPTVService } from "../services/iptvService";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";
import { useEffect, useRef } from "react";

export default function Home() {
  const navigate = useNavigate();
  const {
    activePlaylist,
    isConnected,
    playlists,
    fetchLive,
    refreshAccountInfo,
    isLiveInitialLoading,
    isVodInitialLoading,
    isSeriesInitialLoading,
    sectionLoadProgress,
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

  // TV D-pad navigation for the home grid
  // Grid layout (4 cols): row0=[Live, Movies, Series, Radio], row1=[Live(span), Settings, Account, ChangePlaylist], row2=[Reload, OpenUrl]
  // We flatten to a linear index; the grid has 4 columns
  const GRID_COLS = 4;
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndexRef = useRef(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      const total = tileRefs.current.filter(Boolean).length;
      if (!total) return;

      let idx = focusIndexRef.current;
      if (key === "right") idx = Math.min(idx + 1, total - 1);
      else if (key === "left") idx = Math.max(idx - 1, 0);
      else if (key === "down") idx = Math.min(idx + GRID_COLS, total - 1);
      else if (key === "up") idx = Math.max(idx - GRID_COLS, 0);
      else if (key === "enter") {
        tileRefs.current[idx]?.click();
        return;
      } else return;

      focusIndexRef.current = idx;
      tileRefs.current[idx]?.focus();
    };
    window.addEventListener("tv-remote-key", handler);
    return () => window.removeEventListener("tv-remote-key", handler);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-12 relative">
      {/* Top Left Info */}
      <div className="absolute top-8 left-8">
        <WeatherWidget />
      </div>

      {/* Top Right Info */}
      <div className="absolute top-8 right-8">
        <DigitalClock />
      </div>

      {/* Header / Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2"
      >
        <Logo size="lg" />
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-4 gap-6 w-full max-w-6xl">
        {/* Large Live Tile */}
        <div className="col-span-1 row-span-2">
          <Tile
            ref={(el) => { tileRefs.current[0] = el; }}
            icon={Tv}
            label={t.live}
            isLoading={isLiveInitialLoading}
            loadProgress={sectionLoadProgress.live}
            large
            onClick={() => navigate("/live")}
            className="h-full"
          />
        </div>

        {/* Medium Tiles */}
        <Tile
          ref={(el) => { tileRefs.current[1] = el; }}
          icon={Film}
          label={t.movies}
          isLoading={isVodInitialLoading}
          loadProgress={sectionLoadProgress.vod}
          onClick={() => navigate("/movies")}
        />
        <Tile
          ref={(el) => { tileRefs.current[2] = el; }}
          icon={Clapperboard}
          label={t.series}
          isLoading={isSeriesInitialLoading}
          loadProgress={sectionLoadProgress.series}
          onClick={() => navigate("/series")}
        />
        <Tile ref={(el) => { tileRefs.current[3] = el; }} icon={Radio} label={t.radio} onClick={() => navigate("/radio")} />

        {/* Small Action Tiles */}
        <Tile
          ref={(el) => { tileRefs.current[4] = el; }}
          icon={Settings}
          label={t.settings}
          onClick={() => navigate("/settings")}
          className="bg-white/5 hover:bg-white/10"
        />

        <Tile
          ref={(el) => { tileRefs.current[5] = el; }}
          icon={User}
          label={t.account}
          onClick={() => navigate("/account")}
          className="bg-white/5 hover:bg-white/10"
          subLabel={
            expiryDate !== t.unlimited
              ? `${t.expiry} ${expiryDate}`
              : t.lifetime
          }
        />
        <Tile
          ref={(el) => { tileRefs.current[6] = el; }}
          icon={ListRestart}
          label={t.changePlaylist}
          onClick={() =>
            navigate("/settings", { state: { openModal: "playlists" } })
          }
          className="bg-white/5 hover:bg-white/10"
        />
        <Tile
          ref={(el) => { tileRefs.current[7] = el; }}
          icon={RefreshCw}
          label={t.reload}
          onClick={handleReload}
          className="bg-white/5 hover:bg-white/10"
        />

        <Tile
          ref={(el) => { tileRefs.current[8] = el; }}
          icon={FolderOpen}
          label={t.openUrlFile}
          onClick={() => {
            const url = window.prompt(t.enterStreamUrl);
            if (url) {
              navigate("/player", {
                state: {
                  title: t.externalStream,
                  url: url,
                  isLive: url.includes(".m3u8"),
                },
              });
            }
          }}
          className="bg-white/5 hover:bg-white/10"
        />
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/40 text-xs">
        <span>Version : 1.7.2.0</span>
      </div>

      {/* Playlist Info Bottom Right */}
      <div className="absolute bottom-8 right-8 flex flex-col items-end gap-1">
        {isConnected ? (
          <span className="text-primary font-bold text-sm">
            {t.active} {activePlaylist?.name}
          </span>
        ) : (
          <span className="text-white/40 italic text-xs">
            {t.noPlaylistConnected}
          </span>
        )}
        {isConnected && (
          <span
            className={cn(
              "px-3 py-1 rounded-full text-[10px] font-bold",
              expiryDate === t.unlimited
                ? "bg-green-500/20 text-green-400"
                : "bg-primary/20 text-primary",
            )}
          >
            {t.expires} {expiryDate}
          </span>
        )}
      </div>
    </div>
  );
}
