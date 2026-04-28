import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useDeferredValue,
  startTransition,
  useCallback,
} from "react";
import {
  ArrowLeft,
  Search,
  ChevronDown,
  Loader2,
  Tv,
  Star,
  Calendar,
  Play,
  X,
  Lock,
  Unlock,
  Clock,
  ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import MovieCard from "../components/MovieCard";
import Logo from "../components/Logo";
import WeatherWidget from "../components/WeatherWidget";
import DigitalClock from "../components/DigitalClock";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";
import { toast } from "sonner";
import { usePlaylist } from "../context/PlaylistContext";
import { IPTVService, SeriesStream } from "../services/iptvService";
import { getFlagForCategory } from "../lib/flags";
import { reportPlaybackDebug } from "../lib/playbackDebug";

export default function Series() {
  const navigate = useNavigate();
  const t = useT();
  const {
    activePlaylist,
    isConnected,
    playlistData,
    isFetchingSeries,
    fetchSeries,
    favorites,
    toggleFavorite,
    settings,
    isParentalUnlocked,
    unlockParental,
    lockParental,
  } = usePlaylist();

  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const [localSeriesStreams, setLocalSeriesStreams] = useState<
    SeriesStream[] | null
  >(null);
  const [isFetchingCategory, setIsFetchingCategory] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<SeriesStream | null>(
    null,
  );
  const [seriesInfo, setSeriesInfo] = useState<any>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [sortBy, setSortBy] = useState<
    "default" | "name" | "rating" | "newest"
  >("default");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pendingLockedCategoryId, setPendingLockedCategoryId] = useState<
    string | null
  >(null);

  // Virtual grid sizing
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(800);
  const CARD_GAP = 16;

  // ------- Watch progress -------
  const getProgressStore = (): Record<string, any> => {
    if (!activePlaylist?.id) return {};
    try {
      const raw = localStorage.getItem(
        `nova_progress_series_${activePlaylist.id}`,
      );
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const [progressStore, setProgressStore] =
    useState<Record<string, any>>(getProgressStore);

  // Refresh when a different series is opened
  useEffect(() => {
    setProgressStore(getProgressStore());
  }, [selectedSeries, activePlaylist?.id]);

  const formatProgressTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // If prefetch didn't load Series streams, fetch per-category on demand.
  useEffect(() => {
    if (!activePlaylist) return;
    if (activePlaylist.type !== "xtream") return;

    if ((playlistData.seriesStreams || []).length > 0) {
      setLocalSeriesStreams(null);
      return;
    }

    if (isFetchingSeries) return;

    let cancelled = false;

    const fetchCategory = async (catId: string) => {
      try {
        setIsFetchingCategory(true);
        const streams = await IPTVService.getSeries(
          activePlaylist.host!,
          activePlaylist.username!,
          activePlaylist.password!,
          catId,
        );
        if (!cancelled) setLocalSeriesStreams(streams || []);
      } catch (err) {
        console.error("fetchSeries category failed:", err);
        if (!cancelled) setLocalSeriesStreams([]);
        toast.error("Failed to load series");
      } finally {
        if (!cancelled) setIsFetchingCategory(false);
      }
    };

    if (
      activeCategory &&
      activeCategory !== "all" &&
      activeCategory !== "fav"
    ) {
      fetchCategory(activeCategory);
      return () => {
        cancelled = true;
      };
    }

    // If 'all' is selected, fetch all series streams via context helper
    const cats = playlistData.seriesCategories || [];
    if (activeCategory === "all") {
      if (!isFetchingSeries) {
        fetchSeries().catch((err: any) => {
          console.error("fetchSeries failed:", err);
          toast.error("Failed to load series");
        });
      }
      return () => {
        cancelled = true;
      };
    }

    if (cats.length > 0) {
      fetchCategory(cats[0].category_id);
      return () => {
        cancelled = true;
      };
    }
  }, [
    activePlaylist?.id,
    activeCategory,
    playlistData.seriesCategories?.length,
    playlistData.seriesStreams?.length,
    isFetchingSeries,
  ]);

  // Reset visible count when filters/search change
  

  const deferredSearch = useDeferredValue(searchQuery);
  const deferredCategory = useDeferredValue(activeCategory);

  useEffect(() => {
    startTransition(() => {});
  }, [searchQuery, activeCategory]);

  const categories = useMemo(() => {
    const cats = playlistData.seriesCategories || [];
    if (isParentalUnlocked) return cats;
    return cats.filter(
      (cat) => !settings.hiddenCategories.series.includes(cat.category_id),
    );
  }, [
    playlistData.seriesCategories,
    settings.hiddenCategories.series,
    isParentalUnlocked,
  ]);

  const series = useMemo(() => {
    const allSeries =
      playlistData.seriesStreams && playlistData.seriesStreams.length > 0
        ? playlistData.seriesStreams
        : localSeriesStreams || [];

    if (isParentalUnlocked) return allSeries;
    return allSeries.filter(
      (s) => !settings.hiddenCategories.series.includes(s.category_id),
    );
  }, [
    playlistData.seriesStreams,
    localSeriesStreams,
    settings.hiddenCategories.series,
    isParentalUnlocked,
  ]);

  const filteredSeries = useMemo(() => {
    if (!Array.isArray(series)) return [];
    let filtered = series.filter(
      (s) =>
        s.name.toLowerCase().includes(deferredSearch.toLowerCase()) &&
        (deferredCategory === "all" ||
          deferredCategory === "fav" ||
          s.category_id === deferredCategory),
    );

    if (deferredCategory === "fav") {
      filtered = filtered.filter((s) => favorites.series.includes(s.series_id));
    }

    switch (sortBy) {
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "rating":
        filtered.sort(
          (a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0),
        );
        break;
      case "newest":
        filtered.sort((a, b) => (b.series_id || 0) - (a.series_id || 0));
        break;
    }

    return filtered;
  }, [series, deferredSearch, deferredCategory, favorites.series, sortBy]);

  // Reset visible count when filters/search change
  useEffect(() => {
    setVisibleCount(50);
  }, [deferredSearch, deferredCategory, sortBy, playlistData.seriesStreams?.length, localSeriesStreams?.length]);

  // Scroll handler to load more series when near bottom
  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const threshold = 800;
        if (el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold) {
          setVisibleCount((v) => Math.min((filteredSeries?.length || 0), v + 50));
        }
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [filteredSeries.length]);

  // Remove old IntersectionObserver / loadMore from here

  const sidebarItems = useMemo(() => {
    if (!Array.isArray(series))
      return [{ id: "all", name: t.allSeries, count: 0 }];
    const counts: Record<string, number> = {};
    for (let i = 0; i < series.length; i++) {
      const catId = series[i].category_id;
      counts[catId] = (counts[catId] || 0) + 1;
    }

    return [
      { id: "all", name: t.allSeries, count: series.length },
      { id: "fav", name: `⭐ ${t.favorites}`, count: favorites.series.length },
      ...(categories || []).map((cat) => ({
        id: cat.category_id,
        name: `${getFlagForCategory(cat.category_name)} ${cat.category_name}`,
        count: counts[cat.category_id] || 0,
        locked:
          (settings.parentalLockedCategories?.series || []).includes(
            cat.category_id,
          ) && !isParentalUnlocked,
      })),
    ];
  }, [
    series,
    categories,
    favorites.series.length,
    settings.parentalLockedCategories?.series,
    isParentalUnlocked,
  ]);

  const handleSeriesClick = useCallback(async (s: SeriesStream) => {
    setSelectedSeries(s);
    setIsLoadingInfo(true);
    setSeriesInfo(null);

    if (activePlaylist && activePlaylist.type === "xtream") {
      try {
        const info = await IPTVService.getSeriesInfo(
          activePlaylist.host!,
          activePlaylist.username!,
          activePlaylist.password!,
          s.series_id,
        );
        setSeriesInfo(info);
      } catch (error) {
        console.error("Failed to fetch series info:", error);
      } finally {
        setIsLoadingInfo(false);
      }
    } else {
      setIsLoadingInfo(false);
    }
  }, [activePlaylist]);

  // Column count from container width (mirrors Tailwind breakpoints)
  const columnCount = useMemo(() => {
    if (gridWidth >= 1280) return 6;
    if (gridWidth >= 1024) return 5;
    if (gridWidth >= 768) return 4;
    if (gridWidth >= 640) return 3;
    return 2;
  }, [gridWidth]);

  // Measure grid container with ResizeObserver
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      if (width > 0) setGridWidth(width);
    });
    ro.observe(el);
    setGridWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const playEpisode = (episode: any, episodes: any[], index: number) => {
    if (!activePlaylist) return;

    const baseUrl = activePlaylist.host;
    const user = activePlaylist.username;
    const pass = activePlaylist.password;
    const id = episode.id;
    const ext = episode.container_extension || "mp4";

    const url = `${baseUrl}/series/${user}/${pass}/${id}.${ext}`;

    reportPlaybackDebug("selection.seriesEpisode", {
      playlistId: activePlaylist.id,
      playlistType: activePlaylist.type,
      host: activePlaylist.host,
      seriesId: selectedSeries?.series_id || null,
      streamId: id,
      season: episode.season,
      episodeNum: episode.episode_num,
      extension: ext,
      streamUrl: url,
      codecHint: episode?.info?.video?.codec_name || null,
      audioTracksHint: Array.isArray(episode?.info?.audio)
        ? episode.info.audio.length
        : episode?.info?.audio
          ? 1
          : 0,
      subtitleTracksHint: Array.isArray(episode?.info?.sub)
        ? episode.info.sub.length
        : episode?.info?.sub
          ? 1
          : 0,
    });

    navigate("/watch", {
      state: {
        title: `${selectedSeries?.name} - S${episode.season}E${episode.episode_num}: ${episode.title}`,
        url: url,
        poster: episode.info?.movie_image || selectedSeries?.cover,
        streamId: id,
        extension: ext,
        streamInfo: episode.info ?? null,
        // Continue-watching metadata
        seriesId: String(selectedSeries?.series_id ?? ""),
        playlistId: activePlaylist.id,
        episodeSeason: episode.season,
        episodeNum: episode.episode_num,
        episodeTitle: episode.title,
        seriesName: selectedSeries?.name ?? "",
        episodes: episodes.map((ep) => ({
          ...ep,
          url: `${baseUrl}/series/${user}/${pass}/${ep.id}.${ep.container_extension || "mp4"}`,
          fullTitle: `${selectedSeries?.name} - S${ep.season}E${ep.episode_num}: ${ep.title}`,
        })),
        currentIndex: index,
      },
    });
  };

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
    const locked = settings.parentalLockedCategories?.series || [];
    if (locked.includes(catId) && !isParentalUnlocked && settings.parentalPin) {
      setPendingLockedCategoryId(catId);
      setShowPinModal(true);
    } else {
      setActiveCategory(catId);
    }
  };

  // TV remote navigation
  const focusedSeriesIndexRef = useRef(-1);
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (!key) return;
      const total = filteredSeries.length;
      if (total === 0) return;
      if (key === "enter") {
        if (focusedSeriesIndexRef.current >= 0 && focusedSeriesIndexRef.current < total) {
          handleSeriesClick(filteredSeries[focusedSeriesIndexRef.current]);
        }
        return;
      }
      if (key === "back" || key === "backspace") {
        setSelectedSeries(null);
        return;
      }
      let next = focusedSeriesIndexRef.current;
      if (key === "right") next = Math.min(next + 1, total - 1);
      else if (key === "left") next = Math.max(next - 1, 0);
      else if (key === "down") next = Math.min(next + columnCount, total - 1);
      else if (key === "up") next = Math.max(next - columnCount, 0);
      else return;
      if (next < 0) next = 0;
      focusedSeriesIndexRef.current = next;
    };
    window.addEventListener("tv-remote-key", handler);
    return () => window.removeEventListener("tv-remote-key", handler);
  }, [filteredSeries, columnCount, handleSeriesClick]);

  return (
    <div className="flex flex-col h-screen">
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
                  <Tv className="w-8 h-8 text-primary" />
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
              <button
                onClick={() => navigate("/live")}
                className="text-white/60 hover:text-white font-medium"
              >
                {t.live}
              </button>
              <button
                onClick={() => navigate("/movies")}
                className="text-white/60 hover:text-white font-medium"
              >
                {t.movies}
              </button>
              <button className="text-primary font-bold border-b-2 border-primary">
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

        {/* Series Grid */}
        <div ref={gridContainerRef} className="flex-1 flex flex-col overflow-hidden bg-black/10">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
              <div className="p-6 bg-white/5 rounded-full">
                <Tv className="w-12 h-12 text-white/20" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-bold">No Playlist Connected</h3>
                <p className="text-white/40 max-w-xs">
                  Please add a playlist in settings to view series.
                </p>
              </div>
              <button
                onClick={() => navigate("/playlist-setup")}
                className="bg-primary px-8 py-3 rounded-xl font-bold hover:bg-primary-hover transition-colors"
              >
                Add Playlist
              </button>
            </div>
          ) : (
            <>
              <div className="px-8 pt-8 pb-4">
                {activePlaylist && activePlaylist.type !== "xtream" && (
                  <div className="mb-4 p-4 rounded-2xl bg-yellow-900/10 border border-yellow-700/10 text-yellow-200">
                    <strong>Note:</strong> Series require an Xtream-type playlist. Current:{" "}
                    <span className="font-bold">{activePlaylist.type}</span>.
                  </div>
                )}
                <div className="flex items-center justify-between mb-6">
                  <div className="relative">
                    <button
                      onClick={() => setShowSortMenu(!showSortMenu)}
                      className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors"
                    >
                      <span className="font-medium">
                        {sortBy === "default" && "Default Order"}
                        {sortBy === "name" && "Name (A-Z)"}
                        {sortBy === "rating" && "Top Rated"}
                        {sortBy === "newest" && "Newest Added"}
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 transition-transform",
                          showSortMenu && "rotate-180",
                        )}
                      />
                    </button>

                    <AnimatePresence>
                      {showSortMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full left-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl p-2 min-w-[180px] z-50 shadow-2xl"
                        >
                          {[
                            { id: "default", label: "Default Order" },
                            { id: "name", label: "Name (A-Z)" },
                            { id: "rating", label: "Top Rated" },
                            { id: "newest", label: "Newest Added" },
                          ].map((option) => (
                            <button
                              key={option.id}
                              onClick={() => {
                                setSortBy(option.id as any);
                                setShowSortMenu(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                                sortBy === option.id
                                  ? "bg-primary text-white"
                                  : "hover:bg-white/10 text-white/80",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="flex items-center gap-3">
                    {isFetchingSeries && (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    )}
                    <span className="text-white/40 font-medium">
                      {filteredSeries.length} series
                    </span>
                  </div>
                </div>
              </div>{/* end px-8 header */}

              {filteredSeries.length === 0 && !isFetchingSeries ? (
                <div className="flex flex-col items-center justify-center h-64 text-white/40">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p>{t.noSeriesFound}</p>
                </div>
              ) : (
                <div ref={listScrollRef} className="flex-1 overflow-y-auto px-8 pb-8 scrollbar-hide">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                      gap: CARD_GAP,
                    }}
                  >
                    {filteredSeries.slice(0, visibleCount).map((item, idx) => {
                      const prog = progressStore?.[String(item.series_id)];
                      const cardProgress =
                        prog?.duration > 0
                          ? prog.currentTime / prog.duration
                          : undefined;
                      const cardLabel = prog
                        ? `S${prog.season}E${prog.episodeNum}`
                        : undefined;
                      return (
                        <div key={item.series_id} data-series-index={idx}>
                          <MovieCard
                            title={item.name}
                            poster={item.cover}
                            onClick={() => handleSeriesClick(item)}
                            progress={cardProgress}
                            progressLabel={cardLabel}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Series Detail Modal */}
      <AnimatePresence>
        {selectedSeries && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md"
            onClick={() => setSelectedSeries(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-zinc-900 w-full max-w-6xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedSeries(null)}
                className="absolute top-6 right-6 z-10 p-2 bg-black/40 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Poster / Backdrop Section */}
              <div className="w-full md:w-1/3 aspect-[2/3] md:aspect-auto relative group overflow-hidden">
                {/* Backdrop hero behind poster */}
                {seriesInfo?.info?.backdrop_path?.[0] && (
                  <img
                    src={seriesInfo.info.backdrop_path[0]}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-30 scale-110"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                )}
                {selectedSeries.cover ? (
                  <img
                    src={selectedSeries.cover}
                    alt={selectedSeries.name}
                    className="relative w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center bg-white/5">
                    <Tv className="w-16 h-16 text-white/20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
              </div>

              {/* Info Section */}
              <div className="flex-1 p-8 md:p-12 overflow-y-auto">
                <div className="flex flex-col gap-6">
                  <div>
                    <h2 className="text-4xl font-black text-white mb-4 leading-tight">
                      {selectedSeries.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
                      <div className="flex items-center gap-1.5 text-yellow-500">
                        <Star className="w-4 h-4 fill-current" />
                        <span>
                          {seriesInfo?.info?.rating ||
                            selectedSeries.rating ||
                            "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-white/60">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {seriesInfo?.info?.releaseDate ||
                            selectedSeries.releaseDate ||
                            "Unknown Year"}
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          toggleFavorite("series", selectedSeries.series_id)
                        }
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors",
                          favorites.series.includes(selectedSeries.series_id)
                            ? "bg-primary text-white"
                            : "bg-white/5 hover:bg-white/10 text-white/60",
                        )}
                      >
                        <Star
                          className={cn(
                            "w-4 h-4",
                            favorites.series.includes(
                              selectedSeries.series_id,
                            ) && "fill-current",
                          )}
                        />
                        <span>
                          {favorites.series.includes(selectedSeries.series_id)
                            ? t.favorited
                            : t.addToFavorite}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(seriesInfo?.info?.genre || selectedSeries.genre || "")
                      .split(",")
                      .map((genre: string) => (
                        <span
                          key={genre}
                          className="px-3 py-1 bg-primary/20 text-primary rounded-full text-xs font-bold"
                        >
                          {genre.trim()}
                        </span>
                      ))}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">
                      Plot Summary
                    </h3>
                    <p className="text-white/80 leading-relaxed text-base italic">
                      {isLoadingInfo ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading details...
                        </span>
                      ) : (
                        seriesInfo?.info?.plot ||
                        selectedSeries.plot ||
                        "No description available for this series."
                      )}
                    </p>
                  </div>

                  {seriesInfo?.info?.cast && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">
                        Cast
                      </h3>
                      <p className="text-white/70 text-sm leading-relaxed">
                        {seriesInfo.info.cast}
                      </p>
                    </div>
                  )}

                  {seriesInfo?.info?.youtube_trailer && (
                    <a
                      href={
                        seriesInfo.info.youtube_trailer.startsWith("http")
                          ? seriesInfo.info.youtube_trailer
                          : `https://www.youtube.com/watch?v=${seriesInfo.info.youtube_trailer}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-bold w-fit"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Watch Trailer
                    </a>
                  )}

                  {/* Seasons & Episodes */}
                  <div className="space-y-6 pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <Tv className="w-5 h-5 text-primary" />
                        Seasons & Episodes
                      </h3>
                      {/* Continue Watching button */}
                      {(() => {
                        const prog =
                          progressStore[String(selectedSeries.series_id)];
                        if (!prog || !seriesInfo?.episodes) return null;
                        // Find the episode across all seasons
                        let continuableEpisode: any = null;
                        let continuableSeason: any[] = [];
                        let continuableIdx = 0;
                        for (const sn of Object.keys(seriesInfo.episodes)) {
                          const eps: any[] = seriesInfo.episodes[sn];
                          const idx = eps.findIndex(
                            (ep) =>
                              ep.season === prog.season &&
                              ep.episode_num === prog.episodeNum,
                          );
                          if (idx !== -1) {
                            continuableEpisode = eps[idx];
                            continuableSeason = eps;
                            continuableIdx = idx;
                            break;
                          }
                        }
                        if (!continuableEpisode) return null;
                        const pct =
                          prog.duration > 0
                            ? prog.currentTime / prog.duration
                            : 0;
                        const remaining = prog.duration - prog.currentTime;
                        return (
                          <button
                            onClick={() =>
                              playEpisode(
                                continuableEpisode,
                                continuableSeason,
                                continuableIdx,
                              )
                            }
                            className="flex items-center gap-2 bg-primary hover:bg-primary/90 px-4 py-2 rounded-xl font-bold text-sm transition-colors"
                          >
                            <Clock className="w-4 h-4" />
                            <span>
                              Continue S{prog.season}E{prog.episodeNum}
                            </span>
                            <span className="text-primary-foreground/70 text-xs">
                              {formatProgressTime(remaining)} left
                            </span>
                          </button>
                        );
                      })()}
                    </div>

                    {isLoadingInfo ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {Object.keys(seriesInfo?.episodes || {}).map(
                          (seasonNum) => (
                            <div key={seasonNum} className="space-y-4">
                              <h4 className="text-lg font-bold text-white/60">
                                Season {seasonNum}
                              </h4>
                              <div className="grid grid-cols-1 gap-3">
                                {seriesInfo.episodes[seasonNum].map(
                                  (episode: any, idx: number) => {
                                    const prog =
                                      progressStore[
                                        String(selectedSeries.series_id)
                                      ];
                                    const isLastWatched =
                                      prog &&
                                      prog.season === episode.season &&
                                      prog.episodeNum === episode.episode_num;
                                    const epProgress =
                                      isLastWatched && prog.duration > 0
                                        ? prog.currentTime / prog.duration
                                        : 0;
                                    return (
                                      <button
                                        key={episode.id}
                                        onClick={() =>
                                          playEpisode(
                                            episode,
                                            seriesInfo.episodes[seasonNum],
                                            idx,
                                          )
                                        }
                                        className={cn(
                                          "flex items-center justify-between p-4 rounded-xl transition-all group relative overflow-hidden",
                                          isLastWatched
                                            ? "bg-primary/10 border border-primary/30 hover:bg-primary/20"
                                            : "bg-white/5 hover:bg-white/10",
                                        )}
                                      >
                                        <div className="flex items-center gap-4">
                                          <div
                                            className={cn(
                                              "w-10 h-10 rounded-lg flex items-center justify-center font-bold",
                                              isLastWatched
                                                ? "bg-primary text-white"
                                                : "bg-primary/20 text-primary",
                                            )}
                                          >
                                            {episode.episode_num}
                                          </div>
                                          <div className="text-left">
                                            <div className="flex items-center gap-2">
                                              <p className="font-bold text-white group-hover:text-primary transition-colors">
                                                {episode.title}
                                              </p>
                                              {isLastWatched && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-primary text-white rounded">
                                                  {Math.round(epProgress * 100)}
                                                  %
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-xs text-white/40">
                                              {isLastWatched &&
                                              prog.duration > 0
                                                ? `${formatProgressTime(prog.currentTime)} / ${formatProgressTime(prog.duration)}`
                                                : `Episode ${episode.episode_num}`}
                                            </p>
                                          </div>
                                        </div>
                                        {isLastWatched ? (
                                          <Clock className="w-5 h-5 text-primary" />
                                        ) : (
                                          <Play className="w-5 h-5 text-white/20 group-hover:text-primary transition-colors" />
                                        )}
                                        {/* Progress bar at bottom of row */}
                                        {isLastWatched && epProgress > 0 && (
                                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
                                            <div
                                              className="h-full bg-primary"
                                              style={{
                                                width: `${epProgress * 100}%`,
                                              }}
                                            />
                                          </div>
                                        )}
                                      </button>
                                    );
                                  },
                                )}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
