// PlaylistContext holds a createContext() singleton. If Vite HMR re-evaluates
// this module it would create a *new* context object while the already-mounted
// PlaylistProvider still provides the *old* one → useContext returns undefined
// in every consumer.  Declaring decline() makes Vite do a full page reload
// instead of a partial hot update whenever this file (or its dependents) change.
if ((import.meta as any).hot) {
  (import.meta as any).hot.decline();
}

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { toast } from "sonner";
import { getLang } from "../lib/i18n";

import {
  IPTVService,
  XtreamAccountInfo,
  XtreamServerInfo,
  Category,
  LiveStream,
  MovieStream,
  SeriesStream,
} from "../services/iptvService";

interface PlaylistData {
  liveCategories: Category[];
  liveStreams: LiveStream[];
  vodCategories: Category[];
  vodStreams: MovieStream[];
  seriesCategories: Category[];
  seriesStreams: SeriesStream[];
}

interface Favorites {
  live: number[];
  vod: number[];
  series: number[];
  radio: string[];
}

interface PlaylistInfo {
  id: string;
  name: string;
  type: "m3u" | "xtream";
  url?: string;
  host?: string;
  username?: string;
  password?: string;
  addedAt: string;
  accountInfo?: {
    user: XtreamAccountInfo;
    server: XtreamServerInfo;
  };
}

interface Settings {
  parentalPin: string | null;
  hiddenCategories: {
    live: string[];
    vod: string[];
    series: string[];
  };
  parentalLockedCategories: {
    live: string[];
    vod: string[];
    series: string[];
  };
  language: string;
  layout: "grid" | "list";
  liveSort: "default" | "az" | "za" | "added";
  timeFormat: "12h" | "24h";
  streamFormat: "hls" | "ts" | "mp4";
  autoPlay: boolean;
  subtitleSize: "small" | "medium" | "large";
  subtitleColor: string;
  pipEnabled: boolean;
  accentColor: string;
  backgroundImage: string | null;
}

interface PlaylistContextType {
  playlists: PlaylistInfo[];
  activePlaylist: PlaylistInfo | null;
  setActivePlaylist: (id: string) => void;
  addPlaylist: (info: Omit<PlaylistInfo, "id" | "addedAt">) => void;
  removePlaylist: (id: string) => void;
  refreshAccountInfo: (id: string) => Promise<void>;
  logout: () => void;
  isConnected: boolean;
  playlistData: PlaylistData;
  favorites: Favorites;
  toggleFavorite: (
    type: "live" | "vod" | "series" | "radio",
    id: number | string,
  ) => void;
  fetchLive: () => Promise<void>;
  isFetchingLive: boolean;
  fetchVod: () => Promise<void>;
  isFetchingVod: boolean;
  fetchSeries: () => Promise<void>;
  isFetchingSeries: boolean;
  clearCache: () => void;
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  clearHistory: (type: "live" | "vod" | "series") => void;
  isParentalUnlocked: boolean;
  unlockParental: (pin: string) => boolean;
  lockParental: () => void;
  prefetchProgress: { completed: number; total: number; label: string };
  isPrefetching: boolean;
}

const INITIAL_DATA: PlaylistData = {
  liveCategories: [],
  liveStreams: [],
  vodCategories: [],
  vodStreams: [],
  seriesCategories: [],
  seriesStreams: [],
};

const INITIAL_FAVORITES: Favorites = {
  live: [],
  vod: [],
  series: [],
  radio: [],
};

const INITIAL_SETTINGS: Settings = {
  parentalPin: null,
  hiddenCategories: {
    live: [],
    vod: [],
    series: [],
  },
  parentalLockedCategories: {
    live: [],
    vod: [],
    series: [],
  },
  language: "en",
  layout: "grid",
  liveSort: "default",
  timeFormat: "24h",
  streamFormat: "hls",
  autoPlay: true,
  subtitleSize: "medium",
  subtitleColor: "#ffffff",
  pipEnabled: true,
  accentColor: "#8b0000",
  backgroundImage: null,
};

const PlaylistContext = createContext<PlaylistContextType | undefined>(
  undefined,
);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playlistData, setPlaylistData] = useState<PlaylistData>(INITIAL_DATA);
  const [favorites, setFavorites] = useState<Favorites>(INITIAL_FAVORITES);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [isParentalUnlocked, setIsParentalUnlocked] = useState(false);
  const [isFetchingVod, setIsFetchingVod] = useState(false);
  const [isFetchingSeries, setIsFetchingSeries] = useState(false);
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState({
    completed: 0,
    total: 6,
    label: "",
  });
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Apply theme CSS variables whenever settings change (moved here from ThemeManager
  // to avoid the HMR "two context instances" crash that ThemeManager was prone to)
  useEffect(() => {
    const root = document.documentElement;
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r}, ${g}, ${b}`;
    };
    const rgb = hexToRgb(settings.accentColor);
    root.style.setProperty("--primary-rgb", rgb);
    root.style.setProperty("--primary-color", `rgb(${rgb})`);
    root.style.setProperty("--primary-hover", `rgba(${rgb}, 0.9)`);
    root.lang = getLang(settings.language || "english");
    if (settings.backgroundImage) {
      document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6),rgba(0,0,0,0.6)),url('${settings.backgroundImage}')`;
    } else {
      document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6),rgba(0,0,0,0.6)),url('/images/img1.png')`;
    }
  }, [settings.accentColor, settings.backgroundImage, settings.language]);

  const activePlaylist = playlists.find((p) => p.id === activeId) || null;
  const activePlaylistRef = useRef(activePlaylist);
  activePlaylistRef.current = activePlaylist;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    // Reset data when active playlist changes
    setPlaylistData(INITIAL_DATA);
    IPTVService.clearMemoryCache();

    // Load favorites and settings for this specific playlist
    if (activeId) {
      const savedFavs = localStorage.getItem(`nova_favs_${activeId}`);
      if (savedFavs) {
        try {
          setFavorites(JSON.parse(savedFavs));
        } catch (e) {
          setFavorites(INITIAL_FAVORITES);
        }
      } else {
        setFavorites(INITIAL_FAVORITES);
      }

      const savedSettings = localStorage.getItem(`nova_settings_${activeId}`);
      if (savedSettings) {
        try {
          setSettings({ ...INITIAL_SETTINGS, ...JSON.parse(savedSettings) });
        } catch (e) {
          setSettings(INITIAL_SETTINGS);
        }
      } else {
        setSettings(INITIAL_SETTINGS);
      }
    }
  }, [activeId]);

  // ── Prefetch ALL data on connect ─────────────────────────────────
  // Fetches categories + streams for live, vod, and series in parallel.
  // Cached data is served instantly from IDB; fresh data is fetched in background.
  // ------------------------------------------------------------------
  useEffect(() => {
    const pl = activePlaylist;
    if (!pl || pl.type !== "xtream") return;
    const host = pl.host!;
    const user = pl.username!;
    const pass = pl.password!;
    const id = pl.id;

    setIsPrefetching(true);
    setIsFetchingLive(true);
    setIsFetchingVod(true);
    setIsFetchingSeries(true);
    setPrefetchProgress({ completed: 0, total: 6, label: "Starting..." });

    IPTVService.prefetchAll(host, user, pass, (completed, total, label) => {
      setPrefetchProgress({ completed, total, label });
    })
      .then((data) => {
        if (activeIdRef.current !== id) return;
        setPlaylistData({
          liveCategories: data.liveCategories || [],
          liveStreams: data.liveStreams || [],
          vodCategories: data.vodCategories || [],
          vodStreams: data.vodStreams || [],
          seriesCategories: data.seriesCategories || [],
          seriesStreams: data.seriesStreams || [],
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to prefetch data:", err);
      })
      .finally(() => {
        setIsPrefetching(false);
        setIsFetchingLive(false);
        setIsFetchingVod(false);
        setIsFetchingSeries(false);
      });

    // Background refresh every 30 min to pick up updates without blocking UI
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(
      () => {
        if (activeIdRef.current !== id) return;
        IPTVService.backgroundRefresh(host, user, pass)
          .then((data) => {
            if (!data || activeIdRef.current !== id) return;
            setPlaylistData({
              liveCategories: data.liveCategories || [],
              liveStreams: data.liveStreams || [],
              vodCategories: data.vodCategories || [],
              vodStreams: data.vodStreams || [],
              seriesCategories: data.seriesCategories || [],
              seriesStreams: data.seriesStreams || [],
            });
          })
          .catch(() => {}); // Silent — background refresh is best-effort
      },
      30 * 60 * 1000,
    );

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [activeId]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    if (!activeId) return;
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(
        `nova_settings_${activeId}`,
        JSON.stringify(updated),
      );
      return updated;
    });
  };

  const clearHistory = (type: "live" | "vod" | "series") => {
    toast.success(`History for ${type} cleared`);
  };

  const unlockParental = (pin: string): boolean => {
    if (settings.parentalPin === pin) {
      setIsParentalUnlocked(true);
      return true;
    }
    return false;
  };

  const lockParental = () => {
    setIsParentalUnlocked(false);
  };

  const toggleFavorite = (
    type: "live" | "vod" | "series" | "radio",
    id: number | string,
  ) => {
    if (!activeId) return;

    setFavorites((prev) => {
      const current = prev[type] as any[];
      const isFav = current.includes(id);
      const updated = isFav
        ? current.filter((i) => i !== id)
        : [...current, id];
      const newFavs = { ...prev, [type]: updated };
      localStorage.setItem(`nova_favs_${activeId}`, JSON.stringify(newFavs));
      return newFavs;
    });
  };

  useEffect(() => {
    const savedPlaylists = localStorage.getItem("nova_playlists");
    const savedActiveId = localStorage.getItem("nova_active_id");

    if (savedPlaylists) {
      try {
        const parsed = JSON.parse(savedPlaylists);
        setPlaylists(parsed);
        if (savedActiveId) setActiveId(savedActiveId);
        else if (parsed.length > 0) setActiveId(parsed[0].id);
      } catch (e) {
        console.error("Failed to parse saved playlists");
      }
    }
  }, []);

  useEffect(() => {
    if (activePlaylist?.host) {
      try {
        const url = new URL(activePlaylist.host);
        const link = document.createElement("link");
        link.rel = "preconnect";
        link.href = url.origin;
        document.head.appendChild(link);
        return () => {
          document.head.removeChild(link);
        };
      } catch (e) {
        // Ignore invalid host
      }
    }
  }, [activePlaylist?.host]);

  const addPlaylist = (info: Omit<PlaylistInfo, "id" | "addedAt">) => {
    const newPlaylist: PlaylistInfo = {
      ...info,
      id: Math.random().toString(36).substring(7),
      addedAt: new Date().toISOString(),
    };
    const updated = [...playlists, newPlaylist];
    setPlaylists(updated);
    setActiveId(newPlaylist.id);
    localStorage.setItem("nova_playlists", JSON.stringify(updated));
    localStorage.setItem("nova_active_id", newPlaylist.id);

    // Auto-refresh info if it's xtream
    if (newPlaylist.type === "xtream") {
      refreshAccountInfo(newPlaylist.id);
    }
  };

  const refreshAccountInfo = async (id: string) => {
    const playlist = playlists.find((p) => p.id === id);
    if (
      !playlist ||
      playlist.type !== "xtream" ||
      !playlist.host ||
      !playlist.username ||
      !playlist.password
    )
      return;

    try {
      const info = await IPTVService.getXtreamInfo(
        playlist.host,
        playlist.username,
        playlist.password,
      );
      const updatedPlaylists = playlists.map((p) =>
        p.id === id
          ? {
              ...p,
              accountInfo: { user: info.user_info, server: info.server_info },
            }
          : p,
      );
      setPlaylists(updatedPlaylists);
      localStorage.setItem("nova_playlists", JSON.stringify(updatedPlaylists));
    } catch (error) {
      console.error("Failed to refresh account info:", error);
    }
  };

  const removePlaylist = (id: string) => {
    const updated = playlists.filter((p) => p.id !== id);
    setPlaylists(updated);
    localStorage.setItem("nova_playlists", JSON.stringify(updated));
    if (activeId === id) {
      const nextId = updated.length > 0 ? updated[0].id : null;
      setActiveId(nextId);
      if (nextId) localStorage.setItem("nova_active_id", nextId);
      else localStorage.removeItem("nova_active_id");
    }
  };

  const setActivePlaylist = (id: string) => {
    setActiveId(id);
    localStorage.setItem("nova_active_id", id);
  };

  const logout = () => {
    setPlaylists([]);
    setActiveId(null);
    localStorage.removeItem("nova_playlists");
    localStorage.removeItem("nova_active_id");
    IPTVService.clearMemoryCache();
  };

  // ── Fetch helpers (on-demand, called by views) ─────────────────────
  // Data is already prefetched on connect, so these are mostly no-ops.
  // They only re-fetch if prefetch somehow missed the data.
  // ------------------------------------------------------------------

  const fetchLive = useCallback(async () => {
    const pl = activePlaylistRef.current;
    if (!pl || pl.type !== "xtream") return;
    // Data already loaded by prefetch
    if (playlistData.liveStreams.length > 0) return;

    const host = pl.host!;
    const user = pl.username!;
    const pass = pl.password!;

    setIsFetchingLive(true);
    try {
      const [cats, streams] = await Promise.all([
        IPTVService.getLiveCategories(host, user, pass),
        IPTVService.getLiveStreams(host, user, pass),
      ]);
      if (activeIdRef.current === pl.id) {
        setPlaylistData((p) => ({
          ...p,
          liveCategories: cats,
          liveStreams: streams,
        }));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch live data:", error);
      throw error;
    } finally {
      setIsFetchingLive(false);
    }
  }, [playlistData.liveStreams.length]);

  const fetchVod = useCallback(async () => {
    const pl = activePlaylistRef.current;
    if (!pl || pl.type !== "xtream") return;
    // Data already loaded by prefetch
    if (playlistData.vodStreams.length > 0) return;

    const host = pl.host!;
    const user = pl.username!;
    const pass = pl.password!;

    setIsFetchingVod(true);
    try {
      const [cats, streams] = await Promise.all([
        IPTVService.getVodCategories(host, user, pass),
        IPTVService.getVodStreams(host, user, pass),
      ]);
      if (activeIdRef.current === pl.id) {
        setPlaylistData((p) => ({
          ...p,
          vodCategories: cats,
          vodStreams: streams,
        }));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch VOD data:", error);
      throw error;
    } finally {
      setIsFetchingVod(false);
    }
  }, [playlistData.vodStreams.length]);

  const fetchSeries = useCallback(async () => {
    const pl = activePlaylistRef.current;
    if (!pl || pl.type !== "xtream") return;
    // Data already loaded by prefetch
    if (playlistData.seriesStreams.length > 0) return;

    const host = pl.host!;
    const user = pl.username!;
    const pass = pl.password!;

    setIsFetchingSeries(true);
    try {
      const [cats, streams] = await Promise.all([
        IPTVService.getSeriesCategories(host, user, pass),
        IPTVService.getSeries(host, user, pass),
      ]);
      if (activeIdRef.current === pl.id) {
        setPlaylistData((p) => ({
          ...p,
          seriesCategories: cats,
          seriesStreams: streams,
        }));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch series data:", error);
      throw error;
    } finally {
      setIsFetchingSeries(false);
    }
  }, [playlistData.seriesStreams.length]);

  const clearCache = () => {
    setPlaylistData(INITIAL_DATA);
    IPTVService.clearAllCaches();
  };

  return (
    <PlaylistContext.Provider
      value={{
        playlists,
        activePlaylist,
        setActivePlaylist,
        addPlaylist,
        removePlaylist,
        refreshAccountInfo,
        logout,
        isConnected: !!activePlaylist,
        playlistData,
        favorites,
        toggleFavorite,
        fetchLive,
        isFetchingLive,
        fetchVod,
        isFetchingVod,
        fetchSeries,
        isFetchingSeries,
        clearCache,
        settings,
        updateSettings,
        clearHistory,
        isParentalUnlocked,
        unlockParental,
        lockParental,
        prefetchProgress,
        isPrefetching,
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylist() {
  const context = useContext(PlaylistContext);
  if (context === undefined) {
    throw new Error("usePlaylist must be used within a PlaylistProvider");
  }
  return context;
}
