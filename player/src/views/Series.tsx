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
import { useNavigate, useLocation } from "react-router-dom";
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
import { focusNext, useTVRemote, handleHeaderZoneKey, focusHeader } from "../lib/remote";

export default function Series() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      const s = (location.state || {}) as any;
      if (s?.returnCategory) setActiveCategory(String(s.returnCategory));
    } catch {}
  }, [location]);
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
  const INITIAL_VISIBLE = 36;
  const LOAD_STEP = 36;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
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
  const pinModalRef = useRef<HTMLDivElement | null>(null);
  const seriesModalRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const colorActionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastNonFavoriteCategoryRef = useRef("all");
  const [colorAction, setColorAction] = useState<string | null>(null);
  const seriesCategoryCacheRef = useRef<Map<string, SeriesStream[]>>(new Map());
  const fetchedAllSeriesRef = useRef(false);
  const CARD_GAP = 16;

  useEffect(() => {
    seriesCategoryCacheRef.current.clear();
    fetchedAllSeriesRef.current = false;
  }, [activePlaylist?.id]);

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
        const cached = seriesCategoryCacheRef.current.get(catId);
        if (cached) {
          setLocalSeriesStreams(cached);
          setIsFetchingCategory(false);
          return;
        }
        setIsFetchingCategory(true);
        const streams = await IPTVService.getSeries(
          activePlaylist.host!,
          activePlaylist.username!,
          activePlaylist.password!,
          catId,
        );
        if (!cancelled) {
          const safeStreams = streams || [];
          seriesCategoryCacheRef.current.set(catId, safeStreams);
          setLocalSeriesStreams(safeStreams);
        }
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
      if (!isFetchingSeries && !fetchedAllSeriesRef.current) {
        fetchedAllSeriesRef.current = true;
        fetchSeries().catch((err: any) => {
          fetchedAllSeriesRef.current = false;
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

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const favoriteSeriesSet = useMemo(
    () => new Set(favorites.series),
    [favorites.series],
  );

  const filteredSeries = useMemo(() => {
    if (!Array.isArray(series)) return [];
    const hasSearch = normalizedSearch.length > 0;
    let filtered = series.filter(
      (s) =>
        (!hasSearch || s.name.toLowerCase().includes(normalizedSearch)) &&
        (deferredCategory === "all" ||
          deferredCategory === "fav" ||
          s.category_id === deferredCategory),
    );

    if (deferredCategory === "fav") {
      filtered = filtered.filter((s) => favoriteSeriesSet.has(s.series_id));
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
  }, [series, normalizedSearch, deferredCategory, favoriteSeriesSet, sortBy]);

  // Reset visible count when filters/search change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [deferredSearch, deferredCategory, sortBy, playlistData.seriesStreams?.length, localSeriesStreams?.length, INITIAL_VISIBLE]);

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
          setVisibleCount((v) => Math.min((filteredSeries?.length || 0), v + LOAD_STEP));
        }
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [filteredSeries.length, LOAD_STEP]);

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

  const activeCategoryLabel = useMemo(() => {
    return sidebarItems.find((item) => item.id === activeCategory)?.name || t.allSeries;
  }, [sidebarItems, activeCategory, t.allSeries]);

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
        from: `${location.pathname}${location.search}`,
        returnCategory: activeCategory,
      },
    });
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockParental(pinInput)) {
      toast.success("Parental content unlocked");
      setShowPinModal(false);
      if (pendingLockedCategoryId) {
        startTransition(() => setActiveCategory(pendingLockedCategoryId!));
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
      startTransition(() => setActiveCategory(catId));
    }
  };

  const showColorAction = useCallback((label: string) => {
    setColorAction(label);
    if (colorActionTimerRef.current) clearTimeout(colorActionTimerRef.current);
    colorActionTimerRef.current = setTimeout(() => setColorAction(null), 1200);
  }, []);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    showColorAction("Search focused");
  }, [showColorAction]);

  const cycleSort = useCallback(() => {
    const order: Array<typeof sortBy> = ["default", "name", "rating", "newest"];
    const currentIndex = order.indexOf(sortBy);
    const next = order[(currentIndex + 1) % order.length];
    setSortBy(next);
    const labels: Record<typeof sortBy, string> = {
      default: "Sort: Default",
      name: "Sort: A-Z",
      rating: "Sort: Top rated",
      newest: "Sort: Newest",
    };
    showColorAction(labels[next]);
  }, [sortBy, showColorAction]);

  const toggleFavoriteFilter = useCallback(() => {
    if (activeCategory === "fav") {
      const fallbackCategory =
        lastNonFavoriteCategoryRef.current &&
        (lastNonFavoriteCategoryRef.current === "all" ||
          categories.some(
            (category) => category.category_id === lastNonFavoriteCategoryRef.current,
          ))
          ? lastNonFavoriteCategoryRef.current
          : categories[0]?.category_id || "all";
      setActiveCategory(fallbackCategory);
      showColorAction("Favorites filter off");
      return;
    }

    if (activeCategory !== "all") {
      lastNonFavoriteCategoryRef.current = activeCategory;
    }
    setActiveCategory("fav");
    showColorAction("Favorites filter on");
  }, [activeCategory, categories, showColorAction]);

  // Which panel currently owns D-pad focus: sidebar categories or series grid
  const [sidebarTVFocus, setSidebarTVFocus] = useState(false);

  // TV remote navigation — pure spatial: focusNext() finds the element
  // visually above/below/left/right of whatever currently has DOM focus.
  useEffect(() => {
    if (document.documentElement.dataset.tv !== "true") return;
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (!key) return;
      if (showPinModal || !!selectedSeries || showSortMenu) return;

      // While sidebar owns TV focus, only allow back to release it.
      if (sidebarTVFocus) {
        if (key === "back") setSidebarTVFocus(false);
        return;
      }

      // Header zone handles its own left/right/enter/back.
      if (handleHeaderZoneKey(key, { onBack: () => navigate("/") })) return;

      if (key === "green") {
        focusSearch();
        return;
      }
      if (key === "yellow") {
        toggleFavoriteFilter();
        return;
      }
      if (key === "blue") {
        cycleSort();
        return;
      }

      if (key === "back") { navigate("/"); return; }
      if (key === "enter" || key === "select") {
        (document.activeElement as HTMLElement | null)?.click();
        return;
      }

      const grid = gridContainerRef.current;
      const active = document.activeElement as HTMLElement | null;
      const inGrid = !!(grid && active && grid.contains(active));

      if (key === "left") {
        if (inGrid) {
          const before = document.activeElement;
          focusNext("left", { root: grid });
          if (document.activeElement === before) setSidebarTVFocus(true);
        } else {
          setSidebarTVFocus(true);
        }
        return;
      }

      if (key === "up") {
        if (inGrid) {
          const before = document.activeElement;
          focusNext("up", { root: grid });
          if (document.activeElement === before) focusHeader();
        }
        return;
      }

      if (key === "right") {
        focusNext("right", { root: grid });
        return;
      }

      if (key === "down") {
        if (inGrid) {
          focusNext("down", { root: grid });
        } else {
          const first = grid?.querySelector<HTMLElement>("[data-tv-focusable]");
          first?.focus();
        }
        return;
      }
    };
    window.addEventListener("tv-remote-key", handler);
    return () => window.removeEventListener("tv-remote-key", handler);
  }, [
    cycleSort,
    filteredSeries,
    focusSearch,
    handleSeriesClick,
    navigate,
    selectedSeries,
    showPinModal,
    showSortMenu,
    sidebarTVFocus,
    toggleFavoriteFilter,
  ]);

  // Auto-focus first card when the series list loads/changes (TV only).
  useEffect(() => {
    if (document.documentElement.dataset.tv !== "true") return;
    if (filteredSeries.length === 0) return;
    requestAnimationFrame(() => {
      const first = gridContainerRef.current?.querySelector<HTMLElement>("[data-tv-focusable]");
      first?.focus();
    });
  }, [filteredSeries]);

  useEffect(() => {
    if (activeCategory !== "fav") {
      lastNonFavoriteCategoryRef.current = activeCategory;
    }
  }, [activeCategory]);

  useEffect(() => {
    return () => {
      if (colorActionTimerRef.current) clearTimeout(colorActionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const focusFirst = (container: HTMLElement | null) => {
      if (!container) return;
      const first = container.querySelector<HTMLElement>(
        "[data-tv-focusable], button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])",
      );
      first?.focus();
    };

    const root = showPinModal
      ? pinModalRef.current
      : selectedSeries
        ? seriesModalRef.current
        : showSortMenu
          ? sortMenuRef.current
          : null;
    if (!root) return;
    setTimeout(() => focusFirst(root), 20);
  }, [showPinModal, selectedSeries, showSortMenu]);

  useTVRemote((key, event) => {
    const modalRoot = showPinModal
      ? pinModalRef.current
      : selectedSeries
        ? seriesModalRef.current
        : showSortMenu
          ? sortMenuRef.current
          : null;
    if (!modalRoot) return;
    event?.stopImmediatePropagation();

    if (key === "back") {
      if (showPinModal) setShowPinModal(false);
      else if (selectedSeries) setSelectedSeries(null);
      else if (showSortMenu) setShowSortMenu(false);
      return;
    }

    if (key === "left" || key === "right" || key === "up" || key === "down") {
      focusNext(key, { root: modalRoot });
      return;
    }

    if (key === "enter" || key === "select") {
      const active = document.activeElement as HTMLElement | null;
      if (active && modalRoot.contains(active)) {
        active.click();
      }
    }
  });

  return (
    <div className="tv-browser-shell flex flex-col h-screen">
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2 pointer-events-none select-none">
        <div className="tv-key-hints flex flex-wrap justify-end gap-2 rounded-2xl px-3 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-green-600" /><span className="text-xs text-white/80 font-bold">Search</span></div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-yellow-400" /><span className="text-xs text-white/80 font-bold">Favorites</span></div>
          <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-blue-600" /><span className="text-xs text-white/80 font-bold">Sort</span></div>
        </div>
        {colorAction && (
          <div className="mt-2 px-3 py-1 rounded bg-black/80 text-white/90 text-xs font-bold shadow-lg animate-pulse">
            {colorAction}
          </div>
        )}
      </div>
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
              ref={pinModalRef}
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
                    className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-3xl tracking-[1em] text-center w-full focus:outline-none focus:bg-gradient-to-br focus:from-primary/10 focus:to-transparent focus:border-primary/40 focus:shadow-[0_0_20px_rgba(66,133,244,0.25)] transition-all"
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
      <header data-tv-zone="header" className="tv-browser-header flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="tv-header-back-btn rounded-full p-2"
              title="Back to Home"
              aria-label="Back to Home"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <WeatherWidget />
            <nav className="tv-nav-tabs flex items-center gap-1">
              <button
                onClick={() => navigate("/")}
                className="tv-nav-tab"
              >
                {t.home}
              </button>
              <button
                onClick={() => navigate("/live")}
                className="tv-nav-tab"
              >
                {t.live}
              </button>
              <button
                onClick={() => navigate("/movies")}
                className="tv-nav-tab"
              >
                {t.movies}
              </button>
              <button className="tv-nav-tab tv-nav-tab--active">
                {t.series}
              </button>
              <button
                onClick={() => navigate("/radio")}
                className="tv-nav-tab"
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
                "tv-header-icon-btn rounded-full p-2 transition-all",
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
          <div className="tv-search-shell w-[320px] md:w-[360px]">
            <Search className="tv-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t.search}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="tv-search-input"
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
          hasTVFocus={sidebarTVFocus}
          onTVFocusRelease={() => {
            setSidebarTVFocus(false);
            const first = gridContainerRef.current?.querySelector<HTMLElement>("[data-tv-focusable]");
            first?.focus();
          }}
          onTVFocusEscapeUp={() => {
            setSidebarTVFocus(false);
            focusHeader();
          }}
        />

        {/* Series Grid */}
        <div ref={gridContainerRef} className="tv-browser-content flex-1 flex flex-col overflow-hidden">
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
              <div className="px-8 pt-7 pb-4">
                <div className="tv-nav-strip mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Category</span>
                    <span className="tv-browser-stat px-3 py-1 text-sm font-semibold text-white/90">{activeCategoryLabel}</span>
                  </div>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
                    sidebarTVFocus ? "bg-emerald-500/20 text-emerald-200" : "bg-cyan-500/20 text-cyan-100",
                  )}>
                    {sidebarTVFocus ? "Categories Focus" : "Grid Focus"}
                  </span>
                </div>
                {activePlaylist && activePlaylist.type !== "xtream" && (
                  <div className="mb-4 p-4 rounded-2xl bg-yellow-900/10 border border-yellow-700/10 text-yellow-200">
                    <strong>Note:</strong> Series require an Xtream-type playlist. Current:{" "}
                    <span className="font-bold">{activePlaylist.type}</span>.
                  </div>
                )}
                <div className="tv-browser-toolbar flex items-center justify-between mb-5 px-4 py-3">
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
                          ref={sortMenuRef}
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
                    <span className="tv-browser-stat px-3 py-1 text-white/70 text-sm font-semibold">
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
                        <div key={item.series_id}>
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
              ref={seriesModalRef}
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
