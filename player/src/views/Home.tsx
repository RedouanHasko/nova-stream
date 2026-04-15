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

export default function Home() {
  const navigate = useNavigate();
  const {
    activePlaylist,
    isConnected,
    playlists,
    clearCache,
    isPrefetching,
    prefetchProgress,
  } = usePlaylist();
  const t = useT();

  const handleReload = () => {
    clearCache();
    toast.promise(new Promise((resolve) => setTimeout(resolve, 1000)), {
      loading: t.reloadingPlaylist,
      success: t.playlistCacheCleared,
      error: t.failedToReloadPlaylist,
    });
  };

  const expiryDate = activePlaylist?.accountInfo?.user.exp_date
    ? IPTVService.formatExpiryDate(activePlaylist.accountInfo.user.exp_date)
    : t.unlimited;

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

      {/* Prefetch progress */}
      {isPrefetching && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex flex-col items-center gap-2"
        >
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${(prefetchProgress.completed / prefetchProgress.total) * 100}%`,
              }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-white/40 text-xs">
            Loading {prefetchProgress.label}... ({prefetchProgress.completed}/
            {prefetchProgress.total})
          </span>
        </motion.div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-4 gap-6 w-full max-w-6xl">
        {/* Large Live Tile */}
        <div className="col-span-1 row-span-2">
          <Tile
            icon={Tv}
            label={t.live}
            isLoading={isPrefetching}
            large
            onClick={() => navigate("/live")}
            className="h-full"
          />
        </div>

        {/* Medium Tiles */}
        <Tile
          icon={Film}
          label={t.movies}
          onClick={() => navigate("/movies")}
        />
        <Tile
          icon={Clapperboard}
          label={t.series}
          onClick={() => navigate("/series")}
        />
        <Tile icon={Radio} label={t.radio} onClick={() => navigate("/radio")} />

        {/* Small Action Tiles */}
        <Tile
          icon={Settings}
          label={t.settings}
          onClick={() => navigate("/settings")}
          className="bg-white/5 hover:bg-white/10"
        />

        <Tile
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
          icon={ListRestart}
          label={t.changePlaylist}
          onClick={() =>
            navigate("/settings", { state: { openModal: "playlists" } })
          }
          className="bg-white/5 hover:bg-white/10"
        />
        <Tile
          icon={RefreshCw}
          label={t.reload}
          onClick={handleReload}
          className="bg-white/5 hover:bg-white/10"
        />

        <Tile
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
