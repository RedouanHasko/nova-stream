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
import { IPTVService, MovieStream } from "../services/iptvService";
import { getFlagForCategory } from "../lib/flags";

export default function Movies() {
  const navigate = useNavigate();
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
  } = usePlaylist();

  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
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
  const observerTarget = useRef<HTMLDivElement>(null);

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
        setIsFetchingCategory(true);
        const streams = await IPTVService.getVodStreams(
          activePlaylist.host!,
          activePlaylist.username!,
          activePlaylist.password!,
          catId,
        );
        if (!cancelled) setLocalVodStreams(streams || []);
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

    // If 'all' is selected, try fetching the first category to show some items
    const cats = playlistData.vodCategories || [];
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

  // Deferred values so filtering never blocks the UI
  const deferredSearch = useDeferredValue(searchQuery);
  const deferredCategory = useDeferredValue(activeCategory);

  useEffect(() => {
    startTransition(() => setVisibleCount(50));
  }, [searchQuery, activeCategory]);

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

  const filteredMovies = useMemo(() => {
    if (!Array.isArray(movies)) return [];
    let filtered = movies.filter(
      (m) =>
        m.name.toLowerCase().includes(deferredSearch.toLowerCase()) &&
        (deferredCategory === "all" ||
          deferredCategory === "fav" ||
          m.category_id === deferredCategory),
    );

    if (deferredCategory === "fav") {
      filtered = filtered.filter((m) => favorites.vod.includes(m.stream_id));
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
  }, [movies, deferredSearch, deferredCategory, favorites.vod, sortBy]);

  const visibleMovies = filteredMovies.slice(0, visibleCount);

  const loadMore = useCallback(
    () => setVisibleCount((prev) => Math.min(prev + 50, filteredMovies.length)),
    [filteredMovies.length],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { threshold: 0.1 },
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [loadMore]);

  const sidebarItems = useMemo(() => {
    if (!Array.isArray(movies))
      return [{ id: "all", name: t.allMovies, count: 0 }];
    const counts: Record<string, number> = {};
    for (let i = 0; i < movies.length; i++) {
      const catId = movies[i].category_id;
      counts[catId] = (counts[catId] || 0) + 1;
    }

    return [
      { id: "all", name: t.allMovies, count: movies.length },
      { id: "fav", name: `⭐ ${t.favorites}`, count: favorites.vod.length },
      ...(categories || []).map((cat) => ({
        id: cat.category_id,
        name: `${getFlagForCategory(cat.category_name)} ${cat.category_name}`,
        count: counts[cat.category_id] || 0,
        locked:
          (settings.parentalLockedCategories?.vod || []).includes(
            cat.category_id,
          ) && !isParentalUnlocked,
      })),
    ];
  }, [movies, categories, favorites.vod.length]);

  const handleMovieClick = async (movie: MovieStream) => {
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
  };

  const playMovie = (movie: MovieStream) => {
    if (!activePlaylist) return;

    const baseUrl = activePlaylist.host;
    const user = activePlaylist.username;
    const pass = activePlaylist.password;
    const id = movie.stream_id;

    // Use the movie's container extension or fallback to mp4
    const ext = movie.container_extension || "mp4";
    const url = `${baseUrl}/movie/${user}/${pass}/${id}.${ext}`;

    navigate("/player", {
      state: {
        title: movie.name,
        url: url,
        poster: movie.stream_icon,
        streamId: id,
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
    const locked = settings.parentalLockedCategories?.vod || [];
    if (locked.includes(catId) && !isParentalUnlocked && settings.parentalPin) {
      setPendingLockedCategoryId(catId);
      setShowPinModal(true);
    } else {
      setActiveCategory(catId);
    }
  };

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
              <button className="text-primary font-bold border-b-2 border-primary">
                {t.movies}
              </button>
              <button
                onClick={() => navigate("/series")}
                className="text-white/60 hover:text-white font-medium"
              >
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

        {/* Movie Grid */}
        <div className="flex-1 p-8 overflow-y-auto bg-black/10">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
              <div className="p-6 bg-white/5 rounded-full">
                <Film className="w-12 h-12 text-white/20" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-bold">No Playlist Connected</h3>
                <p className="text-white/40 max-w-xs">
                  Please add a playlist in settings to view movies.
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
              {activePlaylist && activePlaylist.type !== "xtream" && (
                <div className="mb-6 p-4 rounded-2xl bg-yellow-900/10 border border-yellow-700/10 text-yellow-200">
                  <strong>Note:</strong> Movies require an Xtream-type playlist
                  to use the provider VOD API. Your current playlist is set to
                  <span className="ml-1 font-bold">{activePlaylist.type}</span>.
                </div>
              )}

              <div className="flex items-center justify-between mb-8">
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
                  {(isFetchingVod || isFetchingCategory) && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  )}
                  <span className="text-white/40 font-medium">
                    {filteredMovies.length} movies
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {visibleMovies.map((movie) => (
                  <MovieCard
                    key={movie.stream_id}
                    title={movie.name}
                    poster={movie.stream_icon}
                    onClick={() => handleMovieClick(movie)}
                  />
                ))}
              </div>
              {/* Sentinel: loads next category (all mode) or more cards (specific category) */}
              {visibleCount < filteredMovies.length && (
                <div
                  ref={observerTarget}
                  className="h-20 flex items-center justify-center mt-4 gap-2"
                >
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-white/40 text-sm">
                    Loading more movies...
                  </span>
                </div>
              )}
              {filteredMovies.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-white/40">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p>{t.noMoviesFound}</p>
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md"
            onClick={() => setSelectedMovie(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-zinc-900 w-full max-w-5xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedMovie(null)}
                className="absolute top-6 right-6 z-10 p-2 bg-black/40 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Poster Section */}
              <div className="w-full md:w-1/3 aspect-[2/3] md:aspect-auto relative group">
                {selectedMovie.stream_icon ? (
                  <img
                    src={selectedMovie.stream_icon}
                    alt={selectedMovie.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/5">
                    <Film className="w-16 h-16 text-white/20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
              </div>

              {/* Info Section */}
              <div className="flex-1 p-8 md:p-12 overflow-y-auto">
                <div className="flex flex-col gap-6">
                  <div>
                    <h2 className="text-4xl font-black text-white mb-4 leading-tight">
                      {selectedMovie.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
                      <div className="flex items-center gap-1.5 text-yellow-500">
                        <Star className="w-4 h-4 fill-current" />
                        <span>
                          {movieInfo?.info?.rating ||
                            selectedMovie.rating ||
                            "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-white/60">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {movieInfo?.info?.releasedate || "Unknown Year"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-white/60">
                        <Clock className="w-4 h-4" />
                        <span>{movieInfo?.info?.duration || "N/A"}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-white/10 rounded text-xs uppercase tracking-wider">
                        {selectedMovie.container_extension || "MP4"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(movieInfo?.info?.genre || "")
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
                    <h3 className="text-lg font-bold text-white/40 uppercase tracking-widest text-xs">
                      Plot Summary
                    </h3>
                    <p className="text-white/80 leading-relaxed text-lg italic">
                      {isLoadingInfo ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading details...
                        </span>
                      ) : (
                        movieInfo?.info?.plot ||
                        "No description available for this title."
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-8 pt-4 border-t border-white/5">
                    <div>
                      <h4 className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">
                        Director
                      </h4>
                      <p className="text-white font-medium">
                        {movieInfo?.info?.director || "N/A"}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">
                        Cast
                      </h4>
                      <p className="text-white font-medium truncate">
                        {movieInfo?.info?.cast || "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="pt-8 flex gap-4">
                    <button
                      onClick={() => playMovie(selectedMovie)}
                      className="flex-1 bg-primary hover:bg-primary-hover text-white py-4 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-primary/20"
                    >
                      <Play className="w-6 h-6 fill-current" />
                      Watch Now
                    </button>
                    <button
                      onClick={() =>
                        toggleFavorite("vod", selectedMovie.stream_id)
                      }
                      className={cn(
                        "p-4 rounded-2xl transition-colors",
                        favorites.vod.includes(selectedMovie.stream_id)
                          ? "bg-primary text-white"
                          : "bg-white/5 hover:bg-white/10",
                      )}
                    >
                      <Star
                        className={cn(
                          "w-6 h-6",
                          favorites.vod.includes(selectedMovie.stream_id) &&
                            "fill-current",
                        )}
                      />
                    </button>
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
