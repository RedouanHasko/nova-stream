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
  Film,
  Star,
  Calendar,
  Clock,
  Play,
  X,
  Lock,
  Unlock,
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
import { IPTVService, MovieStream } from "../services/iptvService";
import { getFlagForCategory } from "../lib/flags";
import { reportPlaybackDebug } from "../lib/playbackDebug";
import { focusNext, useTVRemote, handleHeaderZoneKey, focusHeader } from "../lib/remote";
import { getHDPosterUrl } from "../lib/imageOptimization";
import { xtreamMovieUrl } from "../lib/xtreamUrls";

export default function Movies() {
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
    isFetchingVod,
    fetchVod,
    favorites,
    toggleFavorite,
    settings,
    isParentalUnlocked,
    unlockParental,
    lockParental,
    categoryCounts: indexedCategoryCounts,
    setCategoryCount,
  } = usePlaylist();

  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [localVodStreams, setLocalVodStreams] = useState<MovieStream[] | null>(
    null,
  );
  const [isFetchingCategory, setIsFetchingCategory] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieStream | null>(null);
  const [movieInfo, setMovieInfo] = useState<any>(null);
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
  // webOS TV is CPU-constrained; render fewer items initially for smooth interaction
  const isWebOS = document.documentElement.dataset.tv === "true";
  const panelHost = activePlaylist?.host || "";
  const INITIAL_VISIBLE = isWebOS ? 24 : 48;
  const LOAD_STEP = isWebOS ? 24 : 48;
  // Virtual grid sizing
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(800);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const pinModalRef = useRef<HTMLDivElement | null>(null);
  const movieModalRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const colorActionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastNonFavoriteCategoryRef = useRef("all");
  const [colorAction, setColorAction] = useState<string | null>(null);
  const vodCategoryCacheRef = useRef<Map<string, MovieStream[]>>(new Map());
  const fetchedAllVodRef = useRef(false);
  const CARD_GAP = 16;

  /** Cap per-category movie lists when global `vodStreams` is empty (fallback mode). */
  /** webOS: keep only the active category in RAM; desktop keeps a small LRU. */
  const MAX_VOD_CATEGORY_CACHE = isWebOS ? 1 : 12;
  const trimVodCategoryCache = (
    map: Map<string, MovieStream[]>,
    max: number,
    keepId?: string,
  ) => {
    for (const k of Array.from(map.keys())) {
      if (k !== keepId) map.delete(k);
    }
    while (map.size > max) {
      const k = map.keys().next().value;
      if (k === undefined || k === keepId) break;
      map.delete(k);
    }
  };

  useEffect(() => {
    vodCategoryCacheRef.current.clear();
    fetchedAllVodRef.current = false;
  }, [activePlaylist?.id]);

  // webOS: avoid "All" — it forces a full-catalog fetch that OOMs the TV browser.
  useEffect(() => {
    if (!isWebOS) return;
    const cats = playlistData.vodCategories || [];
    if (cats.length === 0 || activeCategory !== "all") return;
    setActiveCategory(String(cats[0].category_id));
  }, [isWebOS, playlistData.vodCategories, activeCategory]);

  // webOS: if categories are missing, load them (full catalogs come from PlaylistContext prefetch / fetchVod).
  useEffect(() => {
    if (!activePlaylist || activePlaylist.type !== "xtream") return;
    if (!isWebOS) return;
    if ((playlistData.vodCategories || []).length > 0) return;
    fetchVod().catch(() => {});
  }, [
    activePlaylist?.id,
    activePlaylist?.type,
    isWebOS,
    playlistData.vodCategories?.length,
    fetchVod,
  ]);

  // If prefetch didn't load VOD streams, fetch per-category on demand.
  useEffect(() => {
    if (!activePlaylist) return;
    if (activePlaylist.type !== "xtream") return;

    // Prefetch already filled the full vodStreams — use them.
    if ((playlistData.vodStreams || []).length > 0) {
      setLocalVodStreams(null);
      return;
    }

    if (isFetchingVod) return;

    let cancelled = false;

    const fetchCategory = async (catId: string) => {
      try {
        if (isWebOS) {
          trimVodCategoryCache(vodCategoryCacheRef.current, MAX_VOD_CATEGORY_CACHE, catId);
          setLocalVodStreams(null);
          setVisibleCount(INITIAL_VISIBLE);
        }
        const cached = vodCategoryCacheRef.current.get(catId);
        if (cached) {
          setLocalVodStreams(cached);
          setIsFetchingCategory(false);
          return;
        }
        setIsFetchingCategory(true);
        const streams = await IPTVService.getVodStreams(
          activePlaylist.host!,
          activePlaylist.username!,
          activePlaylist.password!,
          catId,
        );
        if (!cancelled) {
          const safeStreams = streams || [];
          vodCategoryCacheRef.current.set(catId, safeStreams);
          if (isWebOS) {
            trimVodCategoryCache(
              vodCategoryCacheRef.current,
              MAX_VOD_CATEGORY_CACHE,
              catId,
            );
          } else {
            trimVodCategoryCache(vodCategoryCacheRef.current, MAX_VOD_CATEGORY_CACHE);
          }
          setLocalVodStreams(safeStreams);
          setCategoryCount("vod", catId, safeStreams.length);
        }
      } catch (err) {
        console.error("fetchVod category failed:", err);
        if (!cancelled) setLocalVodStreams([]);
        toast.error("Failed to load movies");
      } finally {
        if (!cancelled) setIsFetchingCategory(false);
      }
    };

    // If user selected a specific category, fetch that category only.
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

    // Desktop: "All" loads the full VOD catalog. webOS: per-category only (OOM-safe).
    const cats = playlistData.vodCategories || [];
    if (activeCategory === "all") {
      if (!isWebOS && !isFetchingVod && !fetchedAllVodRef.current) {
        fetchedAllVodRef.current = true;
        fetchVod().catch((err: any) => {
          fetchedAllVodRef.current = false;
          console.error("fetchVod failed:", err);
          toast.error("Failed to load movies");
        });
      }
      return () => {
        cancelled = true;
      };
    }

    // If a specific category is selected, fetch that category to show items
    if (cats.length > 0) {
      fetchCategory(cats[0].category_id);
      return () => {
        cancelled = true;
      };
    }
  }, [
    activePlaylist?.id,
    activeCategory,
    playlistData.vodCategories?.length,
    playlistData.vodStreams?.length,
    isFetchingVod,
  ]);

  // Reset visible count when filters/search change
  

  // Deferred values so filtering never blocks the UI
  const deferredSearch = useDeferredValue(searchQuery);
  const deferredCategory = useDeferredValue(activeCategory);

  const categories = useMemo(() => {
    const cats = playlistData.vodCategories || [];
    if (isParentalUnlocked) return cats;
    return cats.filter(
      (cat) => !settings.hiddenCategories.vod.includes(cat.category_id),
    );
  }, [
    playlistData.vodCategories,
    settings.hiddenCategories.vod,
    isParentalUnlocked,
  ]);

  const movies = useMemo(() => {
    const allMovies =
      playlistData.vodStreams && playlistData.vodStreams.length > 0
        ? playlistData.vodStreams
        : localVodStreams || [];
    if (isParentalUnlocked) return allMovies;
    return allMovies.filter(
      (m) => !settings.hiddenCategories.vod.includes(m.category_id),
    );
  }, [
    playlistData.vodStreams,
    localVodStreams,
    settings.hiddenCategories.vod,
    isParentalUnlocked,
  ]);

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const favoriteVodSet = useMemo(() => new Set(favorites.vod), [favorites.vod]);

  const filteredMovies = useMemo(() => {
    if (!Array.isArray(movies)) return [];
    const hasSearch = normalizedSearch.length > 0;
    let filtered = movies.filter(
      (m) =>
        (!hasSearch || m.name.toLowerCase().includes(normalizedSearch)) &&
        (deferredCategory === "all" ||
          deferredCategory === "fav" ||
          m.category_id === deferredCategory),
    );

    if (deferredCategory === "fav") {
      filtered = filtered.filter((m) => favoriteVodSet.has(m.stream_id));
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
        filtered.sort((a, b) => (b.stream_id || 0) - (a.stream_id || 0));
        break;
    }

    return filtered;
  }, [movies, normalizedSearch, deferredCategory, favoriteVodSet, sortBy]);

  // Reset visible count when filters/search change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [deferredSearch, deferredCategory, sortBy, playlistData.vodStreams?.length, localVodStreams?.length, INITIAL_VISIBLE]);

  // Scroll handler to load more items when near bottom
  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    let ticking = false;
    const threshold = isWebOS ? 600 : 800; // px from bottom - trigger sooner on webOS
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold) {
          setVisibleCount((v) => Math.min((filteredMovies?.length || 0), v + LOAD_STEP));
        }
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [filteredMovies.length, LOAD_STEP, isWebOS]);

  const sidebarItems = useMemo(() => {
    if (!Array.isArray(movies))
      return [{ id: "all", name: t.allMovies, count: 0 }];
    const counts: Record<string, number> = {};
    if (!isWebOS) {
      for (let i = 0; i < movies.length; i++) {
        const catId = movies[i].category_id;
        counts[catId] = (counts[catId] || 0) + 1;
      }
    }

    return [
      ...(isWebOS
        ? []
        : [{ id: "all", name: t.allMovies, count: movies.length }]),
      { id: "fav", name: `⭐ ${t.favorites}`, count: favorites.vod.length },
      ...(categories || []).map((cat) => ({
        id: cat.category_id,
        name: `${getFlagForCategory(cat.category_name)} ${cat.category_name}`,
        count: isWebOS
          ? (indexedCategoryCounts.vod[cat.category_id] ??
            (activeCategory === cat.category_id ? movies.length : 0))
          : counts[cat.category_id] || 0,
        locked:
          (settings.parentalLockedCategories?.vod || []).includes(
            cat.category_id,
          ) && !isParentalUnlocked,
      })),
    ];
  }, [
    movies,
    categories,
    favorites.vod.length,
    isWebOS,
    indexedCategoryCounts.vod,
    activeCategory,
  ]);

  const activeCategoryLabel = useMemo(() => {
    return sidebarItems.find((item) => item.id === activeCategory)?.name || t.allMovies;
  }, [sidebarItems, activeCategory, t.allMovies]);

  const handleMovieClick = useCallback(async (movie: MovieStream) => {
    setSelectedMovie(movie);
    setIsLoadingInfo(true);
    setMovieInfo(null);

    if (activePlaylist && activePlaylist.type === "xtream") {
      try {
        const info = await IPTVService.getVodInfo(
          activePlaylist.host!,
          activePlaylist.username!,
          activePlaylist.password!,
          movie.stream_id,
        );
        setMovieInfo(info);
      } catch (error) {
        console.error("Failed to fetch movie info:", error);
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

  const playMovie = (movie: MovieStream) => {
    if (!activePlaylist) return;

    const baseUrl = activePlaylist.host;
    const user = activePlaylist.username;
    const pass = activePlaylist.password;
    const id = movie.stream_id;

    // Use the movie's container extension or fallback to mp4
    const ext = movie.container_extension || "mp4";
    const url = xtreamMovieUrl(baseUrl, user!, pass!, id, ext);

    reportPlaybackDebug("selection.movie", {
      playlistId: activePlaylist.id,
      playlistType: activePlaylist.type,
      host: activePlaylist.host,
      streamId: id,
      extension: ext,
      streamUrl: url,
      categoryId: movie.category_id,
      codecHint: movieInfo?.info?.video?.codec_name || null,
      audioTracksHint: Array.isArray(movieInfo?.info?.audio)
        ? movieInfo.info.audio.length
        : movieInfo?.info?.audio
          ? 1
          : 0,
      subtitleTracksHint: Array.isArray(movieInfo?.info?.sub)
        ? movieInfo.info.sub.length
        : movieInfo?.info?.sub
          ? 1
          : 0,
    });

    navigate("/watch", {
      state: {
        title: movie.name,
        url: url,
        poster: movie.stream_icon,
        streamId: id,
        extension: ext,
        streamInfo: movieInfo?.info ?? null,
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
    const locked = settings.parentalLockedCategories?.vod || [];
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

  // Which panel currently owns D-pad focus: sidebar categories or movie grid
  const [sidebarTVFocus, setSidebarTVFocus] = useState(false);

  // Auto-focus first card on load if nothing focused
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) {
        const first = gridContainerRef.current?.querySelector<HTMLElement>("[data-tv-focusable]");
        first?.focus();
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Auto-focus modal when it opens
  useEffect(() => {
    if (selectedMovie) {
      setTimeout(() => {
        const watchBtn = movieModalRef.current?.querySelector<HTMLElement>('button[data-tv-focusable]:not([aria-label="Close"])');
        if (watchBtn) watchBtn.focus();
        else {
           const closeBtn = document.querySelector<HTMLElement>('button[aria-label="Close"]');
           closeBtn?.focus();
        }
      }, 300);
    }
  }, [selectedMovie]);

  // TV remote navigation — pure spatial: focusNext() finds the element
  // visually above/below/left/right of whatever currently has DOM focus.
  // No index tracking needed; the browser focus ring highlights the target.
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key as string;
      if (!key) return;

      // Handle Modal Focus if open
      if (showPinModal || !!selectedMovie || showSortMenu) {
        if (key === "back" || key === "red") {
          if (showSortMenu) setShowSortMenu(false);
          else if (showPinModal) setShowPinModal(false);
          else if (selectedMovie) setSelectedMovie(null);
          return;
        }
        if (key === "enter" || key === "select") {
          (document.activeElement as HTMLElement | null)?.click();
          return;
        }
        if (["left", "right", "up", "down"].includes(key)) {
          const modalRoot = movieModalRef.current || pinModalRef.current || sortMenuRef.current;
          if (modalRoot) {
            focusNext(key as any, { root: modalRoot });
          }
        }
        return;
      }

      // While sidebar owns TV focus, only allow back to release it.
      if (sidebarTVFocus) {
        if (key === "back" || key === "red") setSidebarTVFocus(false);
        return;
      }

      // Header zone handles its own left/right/enter/back.
      if (handleHeaderZoneKey(key, { 
        onBack: () => navigate("/"),
        onEscapeDown: () => {
          const first = document.querySelector<HTMLElement>(
            ".tv-live-column [data-tv-focusable], aside [data-tv-focusable]",
          );
          first?.focus();
        }
      })) return;

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

      if (key === "back" || key === "red") { navigate("/"); return; }
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
          // If nothing was to the left, hand off to sidebar.
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
          // If nothing was above, escape to header navbar.
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
          // Focus first card to start navigation.
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
    filteredMovies,
    focusSearch,
    handleMovieClick,
    navigate,
    selectedMovie,
    showPinModal,
    showSortMenu,
    sidebarTVFocus,
    toggleFavoriteFilter,
  ]);

  // Auto-focus first card when the movie list loads/changes (TV only).
  useEffect(() => {
    if (selectedMovie || showPinModal || showSortMenu) return;
    if (filteredMovies.length > 0 && !sidebarTVFocus) {
      const first = gridContainerRef.current?.querySelector<HTMLElement>(
        "[data-tv-focusable]",
      );
      first?.focus();
    }
  }, [filteredMovies.length, sidebarTVFocus, selectedMovie, showPinModal, showSortMenu]);

  // Auto-focus first button when modal opens
  useEffect(() => {
    if (selectedMovie) {
      setTimeout(() => {
        const first = movieModalRef.current?.querySelector<HTMLElement>("[data-tv-focusable]");
        first?.focus();
      }, 100);
    }
  }, [selectedMovie]);

  useEffect(() => {
    if (showPinModal) {
      setTimeout(() => {
        const first = pinModalRef.current?.querySelector<HTMLElement>("input, button[data-tv-focusable]");
        first?.focus();
      }, 100);
    }
  }, [showPinModal]);

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
                  <Film className="w-8 h-8 text-primary" />
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
                      data-tv-focusable
                      type="button"
                      onClick={() => setShowPinModal(false)}
                      className="tv-channel-row flex-1 px-6 py-4 font-bold mx-0"
                    >
                      Cancel
                    </button>
                    <button
                      data-tv-focusable
                      type="submit"
                      className="tv-channel-row tv-channel-row--selected flex-1 px-6 py-4 font-bold mx-0"
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
              data-tv-focusable
              onClick={() => navigate("/")}
              className="tv-header-back-btn rounded-full p-2"
              title="Back to Home"
              aria-label="Back to Home"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <WeatherWidget />
            <nav className="tv-nav-tabs flex items-center gap-1">
              <button data-tv-focusable onClick={() => navigate("/")} className="tv-nav-tab">
                {t.home}
              </button>
              <button data-tv-focusable onClick={() => navigate("/live")} className="tv-nav-tab">
                {t.live}
              </button>
              <button data-tv-focusable className="tv-nav-tab tv-nav-tab--active">
                {t.movies}
              </button>
              <button data-tv-focusable onClick={() => navigate("/series")} className="tv-nav-tab">
                {t.series}
              </button>
              <button data-tv-focusable onClick={() => navigate("/radio")} className="tv-nav-tab">
                {t.radio}
              </button>
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {settings.parentalPin && (
            <button
              data-tv-focusable
              onClick={() =>
                isParentalUnlocked ? lockParental() : setShowPinModal(true)
              }
              className={cn(
                "tv-header-icon-btn rounded-full p-2 transition-all",
                isParentalUnlocked
                  ? "tv-header-icon-btn--on text-white"
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
      <div className="flex flex-1 overflow-hidden relative bg-zinc-950">
        {/* Sidebar */}
        <Sidebar
          items={sidebarItems}
          activeId={activeCategory}
          onSelect={handleCategorySelect}
          hasTVFocus={sidebarTVFocus}
          onTVFocusAcquire={() => setSidebarTVFocus(true)}
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

        {/* Movie Grid */}
        <div ref={gridContainerRef} className="tv-live-column flex-1 flex flex-col overflow-hidden border-r border-white/5 bg-black/20">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
              <div className="p-6 bg-white/5 rounded-full">
                <Film className="w-12 h-12 text-white/20" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-bold">{t.noPlaylistConnected}</h3>
                <p className="text-white/40 max-w-xs">
                  Please add a playlist in settings to view movies.
                </p>
              </div>
              <button
                data-tv-focusable
                onClick={() => navigate("/playlist-setup")}
                className="tv-channel-row tv-channel-row--selected px-8 py-3 mx-0 font-bold uppercase tracking-widest text-sm"
              >
                {t.addPlaylistBtn}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-8 py-6 bg-linear-to-b from-white/[0.02] to-transparent border-b border-white/5">
                <div className="flex flex-col gap-1 min-w-0">
                  <h2 className="text-3xl font-black text-white tracking-tight uppercase truncate">
                    {activeCategoryLabel}
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-black text-white/30 tracking-[0.2em] uppercase">
                      {filteredMovies.length} {t.movies}
                    </span>
                    {(isFetchingVod || isFetchingCategory) && (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    )}
                    <div className="h-1 w-1 rounded-full bg-white/20" />
                    <span
                      className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                        sidebarTVFocus
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {sidebarTVFocus ? t.choosingCategory : t.browsingList}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-4 py-2 relative">
                <button
                  data-tv-focusable
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="tv-channel-row flex items-center gap-3 w-full h-[82px] px-4 text-left mx-2 my-1 hover:bg-white/6"
                >
                  <ChevronDown
                    className={cn(
                      "w-5 h-5 text-white/45 shrink-0 transition-transform",
                      showSortMenu && "rotate-180",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="block text-lg font-medium text-white/85">Sort</span>
                    <span className="block text-[11px] text-white/35 uppercase tracking-wide">
                      {sortBy === "default" && "Default Order"}
                      {sortBy === "name" && "Name (A-Z)"}
                      {sortBy === "rating" && "Top Rated"}
                      {sortBy === "newest" && "Newest Added"}
                    </span>
                  </div>
                </button>

                <AnimatePresence>
                  {showSortMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      ref={sortMenuRef}
                      className="tv-sort-menu absolute left-4 right-4 top-full mt-1 z-50 flex flex-col gap-1 p-2"
                    >
                      {[
                        { id: "default", label: "Default Order" },
                        { id: "name", label: "Name (A-Z)" },
                        { id: "rating", label: "Top Rated" },
                        { id: "newest", label: "Newest Added" },
                      ].map((option) => (
                        <button
                          key={option.id}
                          data-tv-focusable
                          onClick={() => {
                            setSortBy(option.id as typeof sortBy);
                            setShowSortMenu(false);
                          }}
                          className={cn(
                            "tv-channel-row tv-sort-menu__item flex items-center gap-3 w-full h-[72px] px-4 text-left mx-0 my-0",
                            sortBy === option.id && "tv-channel-row--selected",
                          )}
                        >
                          <span className="text-lg font-medium text-white/85">{option.label}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {activePlaylist && activePlaylist.type !== "xtream" && (
                <div className="mx-6 mb-2 p-4 rounded-2xl bg-yellow-900/10 border border-yellow-700/10 text-yellow-200 text-sm">
                  <strong>Note:</strong> Movies require an Xtream-type playlist. Current:{" "}
                  <span className="font-bold">{activePlaylist.type}</span>.
                </div>
              )}

              {filteredMovies.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-white/40">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p>{t.noMoviesFound}</p>
                </div>
              ) : (
                <div ref={listScrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-10">
                  {isWebOS ? (
                    <div className="flex flex-col gap-2">
                      {filteredMovies.slice(0, visibleCount).map((movie, idx) => (
                        <MovieCard
                          key={movie.stream_id}
                          rowIndex={idx + 1}
                          mediaKind="movie"
                          title={movie.name}
                          poster={movie.stream_icon}
                          onClick={() => handleMovieClick(movie)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className="px-6"
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                        gap: CARD_GAP,
                      }}
                    >
                      {filteredMovies.slice(0, visibleCount).map((movie) => (
                        <div key={movie.stream_id}>
                          <MovieCard
                            title={movie.name}
                            poster={movie.stream_icon}
                            onClick={() => handleMovieClick(movie)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Movie Detail Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            ref={movieModalRef}
            className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col md:flex-row overflow-hidden"
          >
              {/* FIXED CLOSE BUTTON - Fixed to viewport to prevent any movement */}
              <button
                data-tv-focusable
                onClick={() => setSelectedMovie(null)}
                className="fixed top-12 right-12 z-[200] flex items-center justify-center w-16 h-16 bg-white/10 hover:bg-white/20 focus:bg-primary focus:text-white rounded-full transition-all duration-200 outline-none ring-4 ring-transparent focus:ring-primary/40 shadow-2xl"
                aria-label="Close"
              >
                <X className="w-8 h-8" />
              </button>

              {/* Backdrop Background (Subtle) */}
              <div className="absolute inset-0 pointer-events-none opacity-20">
                {movieInfo?.info?.backdrop_path?.[0] ? (
                  <img src={getHDPosterUrl(movieInfo.info.backdrop_path[0], panelHost)} className="w-full h-full object-cover blur-2xl" alt="" referrerPolicy="no-referrer" />
                ) : selectedMovie.stream_icon ? (
                  <img src={getHDPosterUrl(selectedMovie.stream_icon, panelHost)} className="w-full h-full object-cover blur-3xl" alt="" referrerPolicy="no-referrer" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
              </div>

              {/* Left Section: Large Poster */}
              <div className="w-full md:w-[38%] relative shrink-0 overflow-hidden bg-zinc-900 group">
                {selectedMovie.stream_icon ? (
                  <img
                    src={getHDPosterUrl(selectedMovie.stream_icon, panelHost)}
                    alt={selectedMovie.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-24 h-24 text-white/5" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-zinc-950" />
              </div>

              {/* Right Section: Deep Details */}
              <div className="flex-1 p-10 md:p-14 lg:p-16 flex flex-col gap-8 overflow-y-auto scrollbar-hide relative z-10">
                <div className="space-y-6">
                  {/* Category & Tag Row */}
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-md shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]">
                      {selectedMovie.container_extension || "4K HDR"}
                    </span>
                    <span className="text-white/40 text-xs font-bold uppercase tracking-widest">
                      {activeCategoryLabel}
                    </span>
                  </div>

                  <h2 className="text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight drop-shadow-2xl">
                    {selectedMovie.name}
                  </h2>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-6 text-sm font-bold">
                    <div className="flex items-center gap-2 text-yellow-500">
                      <Star className="w-5 h-5 fill-current" />
                      <span className="text-lg">{movieInfo?.info?.rating || selectedMovie.rating || "8.5"}</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <span className="text-white/60">{movieInfo?.info?.releasedate || "2024"}</span>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <span className="text-white/60">{movieInfo?.info?.duration || "2h 15m"}</span>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <span className="px-2 py-0.5 border border-white/20 text-white/40 rounded text-[10px] font-black">PG-13</span>
                  </div>
                </div>

                {/* Plot / Storyline */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Storyline</h3>
                  <p className="text-white/70 text-lg lg:text-xl leading-relaxed font-medium italic">
                    {isLoadingInfo ? (
                      <span className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        Fetching details...
                      </span>
                    ) : (
                      movieInfo?.info?.plot || "When a mysterious force threatens the galaxy, a group of unlikely heroes must band together to save civilization from total destruction."
                    )}
                  </p>
                </div>

                {/* Director & Cast Grid */}
                <div className="grid grid-cols-2 gap-10 pt-4">
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30">Director</h4>
                    <p className="text-white font-bold text-lg">{movieInfo?.info?.director || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30">Cast</h4>
                    <p className="text-white font-bold text-lg truncate">{movieInfo?.info?.cast || "N/A"}</p>
                  </div>
                </div>

                {/* Premium Action Buttons */}
                <div className="pt-8 mt-auto flex flex-wrap gap-5 items-center">
                  <button
                    data-tv-focusable
                    onClick={() => playMovie(selectedMovie)}
                    disabled={isLoadingInfo}
                    className="flex-1 md:flex-none px-12 py-5 bg-primary hover:bg-white focus:bg-white text-white hover:text-black focus:text-black rounded-2xl font-black text-xl flex items-center justify-center gap-4 transition-all duration-300 shadow-[0_20px_40px_rgba(var(--primary-rgb),0.3)] hover:scale-105 focus:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    <Play className="w-8 h-8 fill-current" />
                    Watch Now
                  </button>
                  
                  <button
                    data-tv-focusable
                    onClick={() => toggleFavorite("vod", selectedMovie.stream_id)}
                    className={cn(
                      "w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 focus:scale-110 active:scale-90 border-2",
                      favorites.vod.includes(selectedMovie.stream_id)
                        ? "bg-primary border-primary text-white shadow-[0_10px_20px_rgba(var(--primary-rgb),0.3)]"
                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/20 focus:bg-white/20 focus:border-white/40"
                    )}
                  >
                    <Star className={cn("w-9 h-9", favorites.vod.includes(selectedMovie.stream_id) && "fill-current")} />
                  </button>

                  {movieInfo?.info?.youtube_trailer && (
                    <button
                      data-tv-focusable
                      onClick={() => window.open(
                        movieInfo.info.youtube_trailer.startsWith("http")
                          ? movieInfo.info.youtube_trailer
                          : `https://www.youtube.com/watch?v=${movieInfo.info.youtube_trailer}`,
                        '_blank'
                      )}
                      className="px-8 py-5 bg-white/5 hover:bg-white/10 focus:bg-white/10 text-white/80 hover:text-white focus:text-white rounded-2xl font-bold transition-all flex items-center gap-3 border border-white/5 hover:border-white/20"
                    >
                      <ExternalLink className="w-6 h-6" />
                      Trailer
                    </button>
                  )}
                </div>
              </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
