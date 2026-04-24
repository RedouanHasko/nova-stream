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
  ACTIVATION_PORTAL_URL,
  getDeviceFeed,
  startDeviceTrial,
  verifyDeviceActivation,
  type BackendAssignedPlaylist,
  type DeviceActivationResponse,
} from "../lib/backendApi";
import {
  getDeviceIdentity,
  syncDeviceIdentityKeyFromServer,
  type DeviceIdentity,
} from "../lib/deviceIdentity";
import {
  buildCachedActivationResponse,
  clearActivationCache,
  getActivationRefreshIntervalMs,
  readActivationCache,
  writeActivationCache,
} from "../lib/activationCache";

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
  managedByBackend?: boolean;
  backendAssignmentId?: number;
  backendPlaylistId?: number;
  backendUpdatedAt?: string;
  targetApplicationId?: number | null;
  targetAppName?: string | null;
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
  isLiveInitialLoading: boolean;
  isVodInitialLoading: boolean;
  isSeriesInitialLoading: boolean;
  sectionLoadProgress: {
    live: number;
    vod: number;
    series: number;
  };
  activationStatus: ActivationStatus;
  isActivationLoading: boolean;
  refreshActivationStatus: (forceNetwork?: boolean) => Promise<void>;
  startFreeTrial: () => Promise<void>;
  activationPortalUrl: string;
}

interface ActivationStatus {
  ready: boolean;
  activated: boolean;
  reason: string;
  device: {
    mac?: string;
    deviceKey?: string;
    status?: string;
    platform?: string | null;
    deviceName?: string | null;
  } | null;
  activations: Array<{
    id?: number;
    applicationId?: number;
    appName?: string;
    activationKind?: string;
    duration?: string;
    activatedAt?: string;
    expiresAt?: string | null;
    status?: string;
  }>;
  trial: {
    enabled: boolean;
    durationDays: number;
    consumed: boolean;
    available: boolean;
    eligible: boolean;
    active: boolean;
    status: string;
    startedAt: string | null;
    expiresAt: string | null;
    remainingDays: number;
  };
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

const INITIAL_ACTIVATION_STATUS: ActivationStatus = {
  ready: false,
  activated: false,
  reason: "loading",
  device: null,
  activations: [],
  trial: {
    enabled: true,
    durationDays: 7,
    consumed: false,
    available: false,
    eligible: false,
    active: false,
    status: "NOT_STARTED",
    startedAt: null,
    expiresAt: null,
    remainingDays: 0,
  },
};

const LOCAL_PLAYLISTS_STORAGE_KEY = "nova_playlists";
const MANAGED_PLAYLISTS_STORAGE_KEY = "nova_managed_playlists";
const ACTIVE_PLAYLIST_STORAGE_KEY = "nova_active_id";

const PlaylistContext = createContext<PlaylistContextType | undefined>(
  undefined,
);

function isPlaylistInfoArray(value: unknown): value is PlaylistInfo[] {
  return Array.isArray(value);
}

function sanitizeSavedPlaylists(value: unknown): PlaylistInfo[] {
  if (!isPlaylistInfoArray(value)) return [];
  return value.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      (item.type === "m3u" || item.type === "xtream"),
  );
}

function mapBackendPlaylistToLocal(playlist: BackendAssignedPlaylist): PlaylistInfo | null {
  const credentials = playlist.credentials;
  if (credentials?.host && credentials?.username && credentials?.password) {
    return {
      id: `managed:${playlist.assignmentId || playlist.id || playlist.name || credentials.host}`,
      name: playlist.name || "Assigned Playlist",
      type: "xtream",
      host: credentials.host,
      username: credentials.username,
      password: credentials.password,
      addedAt: playlist.addedAt || playlist.updatedAt || new Date().toISOString(),
      managedByBackend: true,
      backendAssignmentId: playlist.assignmentId,
      backendPlaylistId: playlist.id,
      backendUpdatedAt: playlist.updatedAt,
      targetApplicationId: playlist.targetApplicationId ?? null,
      targetAppName: playlist.targetAppName ?? null,
    };
  }

  if (playlist.url) {
    return {
      id: `managed:${playlist.assignmentId || playlist.id || playlist.name || playlist.url}`,
      name: playlist.name || "Assigned Playlist",
      type: "m3u",
      url: playlist.url,
      addedAt: playlist.addedAt || playlist.updatedAt || new Date().toISOString(),
      managedByBackend: true,
      backendAssignmentId: playlist.assignmentId,
      backendPlaylistId: playlist.id,
      backendUpdatedAt: playlist.updatedAt,
      targetApplicationId: playlist.targetApplicationId ?? null,
      targetAppName: playlist.targetAppName ?? null,
    };
  }

  return null;
}

function readStoredPlaylists(storageKey: string): PlaylistInfo[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];

  try {
    return sanitizeSavedPlaylists(JSON.parse(raw));
  } catch {
    return [];
  }
}

function normalizeActivationStatus(
  response: DeviceActivationResponse,
  identity: DeviceIdentity,
): ActivationStatus {
  return {
    ready: true,
    activated: response.activated === true,
    reason: response.reason || "not_activated",
    device: {
      mac: response.device?.mac || identity.macAddress,
      deviceKey: response.device?.deviceKey || identity.deviceKey,
      status: response.device?.status || undefined,
      platform: response.device?.platform || identity.profile.platform,
      deviceName: response.device?.deviceName || identity.profile.deviceName,
    },
    activations: Array.isArray(response.activations) ? response.activations : [],
    trial: {
      enabled: response.trial?.enabled !== false,
      durationDays: Number(response.trial?.durationDays || 7),
      consumed: response.trial?.consumed === true,
      available: response.trial?.available === true,
      eligible: response.trial?.eligible === true,
      active: response.trial?.active === true,
      status: response.trial?.status || "NOT_STARTED",
      startedAt: response.trial?.startedAt || null,
      expiresAt: response.trial?.expiresAt || null,
      remainingDays: Number(response.trial?.remainingDays || 0),
    },
  };
}

function getTrialFailureMessage(response: DeviceActivationResponse): string {
  const reason = (response.reason || "").toString().toLowerCase();

  if (reason === "trial_expired") {
    return "This device already used its free trial.";
  }

  if (reason === "blocked") {
    return "This device is blocked on the server.";
  }

  if (reason === "device_key_mismatch") {
    return "The stored device key does not match this device.";
  }

  if (reason === "expired") {
    return "The previous activation for this device has expired.";
  }

  if (reason === "not_activated" || reason === "missing_credentials") {
    return "Free trial could not be started for this device yet.";
  }

  return "Unable to start free trial.";
}

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const [localPlaylists, setLocalPlaylists] = useState<PlaylistInfo[]>([]);
  const [managedPlaylists, setManagedPlaylists] = useState<PlaylistInfo[]>([]);
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
  const [sectionLoadProgress, setSectionLoadProgress] = useState({
    live: 0,
    vod: 0,
    series: 0,
  });
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(
    null,
  );
  const [activationStatus, setActivationStatus] =
    useState<ActivationStatus>(INITIAL_ACTIVATION_STATUS);
  const [isActivationLoading, setIsActivationLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playlists = [...managedPlaylists, ...localPlaylists];

  const isLiveInitialLoading =
    isFetchingLive &&
    playlistData.liveCategories.length === 0 &&
    playlistData.liveStreams.length === 0;
  const isVodInitialLoading =
    isFetchingVod &&
    playlistData.vodCategories.length === 0 &&
    playlistData.vodStreams.length === 0;
  const isSeriesInitialLoading =
    isFetchingSeries &&
    playlistData.seriesCategories.length === 0 &&
    playlistData.seriesStreams.length === 0;

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
    root.style.setProperty("--subtitle-color", settings.subtitleColor);
    root.lang = getLang(settings.language || "english");
    if (settings.backgroundImage) {
      document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6),rgba(0,0,0,0.6)),url('${settings.backgroundImage}')`;
    } else {
      document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6),rgba(0,0,0,0.6)),url('/images/img1.png')`;
    }
  }, [
    settings.accentColor,
    settings.backgroundImage,
    settings.language,
    settings.subtitleColor,
  ]);

  const activePlaylist = playlists.find((p) => p.id === activeId) || null;
  const activePlaylistRef = useRef(activePlaylist);
  activePlaylistRef.current = activePlaylist;
  const previousActiveIdRef = useRef<string | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const playlistsRef = useRef(playlists);
  useEffect(() => {
    playlistsRef.current = playlists;
  }, [playlists]);

  useEffect(() => {
    let active = true;

    getDeviceIdentity()
      .then((identity) => {
        if (active) {
          setDeviceIdentity(identity);
        }
      })
      .catch((error) => {
        console.error("device identity resolution failed", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshActivationStatus = useCallback(async (forceNetwork = false) => {
    if (!deviceIdentity) return;

    const cachedActivation = readActivationCache(deviceIdentity);
    const shouldBlockOnNetwork = !cachedActivation;
    const hasSavedPlaylists = playlistsRef.current.length > 0;

    if (cachedActivation) {
      setActivationStatus(
        normalizeActivationStatus(
          buildCachedActivationResponse(cachedActivation.record, "cached_active"),
          deviceIdentity,
        ),
      );
    }

    if (!forceNetwork && !shouldBlockOnNetwork && !cachedActivation?.shouldRefresh && hasSavedPlaylists) {
      setIsActivationLoading(false);
      return;
    }

    setIsActivationLoading(true);
    try {
      let resolvedIdentity = deviceIdentity;
      let verification = await verifyDeviceActivation(resolvedIdentity);

      if (verification.reason === "device_key_mismatch") {
        const syncedIdentity = syncDeviceIdentityKeyFromServer(
          resolvedIdentity,
          verification.device?.mac,
          verification.device?.deviceKey,
        );

        if (syncedIdentity.deviceKey !== resolvedIdentity.deviceKey) {
          resolvedIdentity = syncedIdentity;
          setDeviceIdentity(syncedIdentity);
          verification = await verifyDeviceActivation(resolvedIdentity);
        }
      }

      setActivationStatus(normalizeActivationStatus(verification, resolvedIdentity));

      if (verification.activated) {
        writeActivationCache(resolvedIdentity, verification);
      } else {
        clearActivationCache();
      }

      if (!verification.activated) {
        setManagedPlaylists([]);
        playlistsRef.current = localPlaylists;
        localStorage.removeItem(MANAGED_PLAYLISTS_STORAGE_KEY);
        if (activeIdRef.current && activeIdRef.current.startsWith("managed:")) {
          const fallbackId = localPlaylists[0]?.id || null;
          setActiveId(fallbackId);
          if (fallbackId) {
            localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, fallbackId);
          } else {
            localStorage.removeItem(ACTIVE_PLAYLIST_STORAGE_KEY);
          }
        }
        return;
      }

      const feed = await getDeviceFeed(resolvedIdentity);
      const nextManagedPlaylists = (feed.playlists || [])
        .map(mapBackendPlaylistToLocal)
        .filter(Boolean) as PlaylistInfo[];

      setManagedPlaylists(nextManagedPlaylists);
      localStorage.setItem(
        MANAGED_PLAYLISTS_STORAGE_KEY,
        JSON.stringify(nextManagedPlaylists),
      );

      const nextCombined = [...nextManagedPlaylists, ...localPlaylists];
      playlistsRef.current = nextCombined;

      const currentActiveId = activeIdRef.current;
      const currentExists = currentActiveId
        ? nextCombined.some((playlist) => playlist.id === currentActiveId)
        : false;

      if (!currentExists) {
        const nextActiveId = nextCombined[0]?.id || null;
        setActiveId(nextActiveId);
        if (nextActiveId) {
          localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, nextActiveId);
        } else {
          localStorage.removeItem(ACTIVE_PLAYLIST_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("backend activation refresh failed", error);
      if (cachedActivation) {
        setActivationStatus(
          normalizeActivationStatus(
            buildCachedActivationResponse(cachedActivation.record, "offline_grace"),
            deviceIdentity,
          ),
        );
      } else {
        setActivationStatus((prev) => ({
          ...prev,
          ready: true,
          activated: false,
          reason: prev.reason === "loading" ? "unreachable" : prev.reason,
          device:
            prev.device ||
            (deviceIdentity
              ? {
                  mac: deviceIdentity.macAddress,
                  deviceKey: deviceIdentity.deviceKey,
                  status: undefined,
                  platform: deviceIdentity.profile.platform,
                  deviceName: deviceIdentity.profile.deviceName,
                }
              : null),
        }));
      }
    } finally {
      setIsActivationLoading(false);
    }
  }, [deviceIdentity, localPlaylists]);

  const startFreeTrial = useCallback(async () => {
    if (!deviceIdentity) return;

    setIsActivationLoading(true);
    try {
      const result = await startDeviceTrial(deviceIdentity);
      setActivationStatus(normalizeActivationStatus(result, deviceIdentity));
      if (result.activated) {
        await refreshActivationStatus();
        toast.success("Free trial activated");
      } else {
        toast.error(getTrialFailureMessage(result));
      }
    } catch (error) {
      console.error("free trial start failed", error);
      toast.error(
        error instanceof Error ? error.message : "Unable to start free trial",
      );
    } finally {
      setIsActivationLoading(false);
    }
  }, [deviceIdentity, refreshActivationStatus]);

  useEffect(() => {
    const previousActiveId = previousActiveIdRef.current;
    // Reset data only when actually switching between different playlists.
    // Avoid wiping freshly fetched startup data on first load.
    if (previousActiveId && activeId && previousActiveId !== activeId) {
      setPlaylistData(INITIAL_DATA);
      setSectionLoadProgress({ live: 0, vod: 0, series: 0 });
    }
    if (previousActiveId && activeId && previousActiveId !== activeId) {
      void IPTVService.clearAllCaches();
    } else {
      IPTVService.clearMemoryCache();
    }
    previousActiveIdRef.current = activeId;

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

      // Instant categories from localStorage (faster than IDB for first paint)
      const cachedCategories = localStorage.getItem(`nova_cats_${activeId}`);
      if (cachedCategories) {
        try {
          const cats = JSON.parse(cachedCategories);
          setPlaylistData((prev) => ({
            ...prev,
            liveCategories: cats.live || [],
            vodCategories: cats.vod || [],
            seriesCategories: cats.series || [],
          }));
          // Mark categories as already loaded
          setSectionLoadProgress({ live: 50, vod: 50, series: 50 });
        } catch {
          // ignore invalid cache
        }
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

    const settledBySection = {
      live: 0,
      vod: 0,
      series: 0,
    };
    const readyBySection = {
      live: false,
      vod: false,
      series: false,
    };
    let readyCount = 0;
    const markSectionReady = (section: "live" | "vod" | "series") => {
      if (readyBySection[section]) return;
      readyBySection[section] = true;
      readyCount += 1;
      setSectionLoadProgress((prev) => ({ ...prev, [section]: 100 }));
      setPrefetchProgress({
        completed: readyCount,
        total: 3,
        label:
          section === "live"
            ? "Live ready"
            : section === "vod"
              ? "Movies ready"
              : "Series ready",
      });
      if (readyCount >= 3) {
        setIsPrefetching(false);
      }
      if (section === "live") setIsFetchingLive(false);
      if (section === "vod") setIsFetchingVod(false);
      if (section === "series") setIsFetchingSeries(false);
    };
    const markSectionSettled = (section: "live" | "vod" | "series") => {
      settledBySection[section] += 1;
      const nextProgress = readyBySection[section]
        ? 100
        : settledBySection[section] >= 2
          ? 100
          : 0;
      setSectionLoadProgress((prev) => ({ ...prev, [section]: nextProgress }));
      if (section === "live" && settledBySection.live >= 2) {
        setIsFetchingLive(false);
      }
      if (section === "vod" && settledBySection.vod >= 2) {
        setIsFetchingVod(false);
      }
      if (section === "series" && settledBySection.series >= 2) {
        setIsFetchingSeries(false);
      }
    };

    setIsPrefetching(true);
    setIsFetchingLive(
      playlistData.liveCategories.length === 0 &&
        playlistData.liveStreams.length === 0,
    );
    setIsFetchingVod(
      playlistData.vodCategories.length === 0 &&
        playlistData.vodStreams.length === 0,
    );
    setIsFetchingSeries(
      playlistData.seriesCategories.length === 0 &&
        playlistData.seriesStreams.length === 0,
    );
    setSectionLoadProgress({
      live:
        playlistData.liveCategories.length > 0 || playlistData.liveStreams.length > 0
          ? 100
          : 0,
      vod:
        playlistData.vodCategories.length > 0 || playlistData.vodStreams.length > 0
          ? 100
          : 0,
      series:
        playlistData.seriesCategories.length > 0 ||
        playlistData.seriesStreams.length > 0
          ? 100
          : 0,
    });
    readyCount = 0;
    setPrefetchProgress({ completed: 0, total: 3, label: "Starting..." });

    // Track loaded categories for localStorage cache
    const loadedCategories: {
      live?: Category[];
      vod?: Category[];
      series?: Category[];
    } = {};

    IPTVService.prefetchAll(host, user, pass, (completed, total, label) => {
      if (activeIdRef.current !== id) return;
      setPrefetchProgress({ completed, total, label });
    })
      .then(async (data) => {
        if (activeIdRef.current !== id) return;
        const nextData = {
          liveCategories: data.liveCategories || [],
          liveStreams: data.liveStreams || [],
          vodCategories: data.vodCategories || [],
          vodStreams: data.vodStreams || [],
          seriesCategories: data.seriesCategories || [],
          seriesStreams: data.seriesStreams || [],
        };

        setPlaylistData(nextData);

        // Cache categories to localStorage for instant load on next visit
        try {
          const cats = {
            live: data.liveCategories || [],
            vod: data.vodCategories || [],
            series: data.seriesCategories || [],
          };
          localStorage.setItem(`nova_cats_${id}`, JSON.stringify(cats));
        } catch {
          // ignore quota errors
        }

        // Mark sections ready based on returned data
        if ((nextData.liveStreams?.length || 0) > 0) {
          markSectionReady("live");
        }
        if ((nextData.vodStreams?.length || 0) > 0) {
          markSectionReady("vod");
        }
        if ((nextData.seriesStreams?.length || 0) > 0) {
          markSectionReady("series");
        }

        setSectionLoadProgress({
          live: (nextData.liveCategories?.length || nextData.liveStreams?.length) ? 100 : 0,
          vod: (nextData.vodCategories?.length || nextData.vodStreams?.length) ? 100 : 0,
          series: (nextData.seriesCategories?.length || nextData.seriesStreams?.length) ? 100 : 0,
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to prefetch data:", err);
        toast.error("Failed to load playlist data. Check connection or credentials.");
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
    const savedLocalPlaylists = readStoredPlaylists(LOCAL_PLAYLISTS_STORAGE_KEY);
    const savedManagedPlaylists = readStoredPlaylists(MANAGED_PLAYLISTS_STORAGE_KEY);
    const savedActiveId = localStorage.getItem(ACTIVE_PLAYLIST_STORAGE_KEY);
    const combined = [...savedManagedPlaylists, ...savedLocalPlaylists];

    setLocalPlaylists(savedLocalPlaylists);
    setManagedPlaylists(savedManagedPlaylists);

    if (savedActiveId) {
      setActiveId(savedActiveId);
    } else if (combined.length > 0) {
      setActiveId(combined[0].id);
    }
  }, []);

  useEffect(() => {
    if (!deviceIdentity) return;

    refreshActivationStatus().catch(() => {});
    const intervalId = window.setInterval(() => {
      refreshActivationStatus().catch(() => {});
    }, getActivationRefreshIntervalMs());

    return () => {
      window.clearInterval(intervalId);
    };
  }, [deviceIdentity, refreshActivationStatus]);

  // Force backend activation checks frequently so block/unblock actions are
  // enforced quickly even when cached activation is still valid.
  useEffect(() => {
    if (!deviceIdentity) return;

    const runForcedCheck = () => {
      refreshActivationStatus(true).catch(() => {});
    };

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        runForcedCheck();
      }
    }, 45_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runForcedCheck();
      }
    };

    const onFocus = () => runForcedCheck();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deviceIdentity, refreshActivationStatus]);

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
    const updated = [...localPlaylists, newPlaylist];
    const combined = [...managedPlaylists, ...updated];
    setLocalPlaylists(updated);
    playlistsRef.current = combined;
    setActiveId(newPlaylist.id);
    localStorage.setItem(LOCAL_PLAYLISTS_STORAGE_KEY, JSON.stringify(updated));
    localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, newPlaylist.id);

    // Auto-refresh info if it's xtream
    if (newPlaylist.type === "xtream") {
      refreshAccountInfo(newPlaylist.id);
    }
  };

  const setActivePlaylist = (id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, id);
  };

  const removePlaylist = (id: string) => {
    if (id.startsWith("managed:")) {
      return;
    }

    const nextLocal = localPlaylists.filter((playlist) => playlist.id !== id);
    const nextCombined = [...managedPlaylists, ...nextLocal];

    setLocalPlaylists(nextLocal);
    playlistsRef.current = nextCombined;
    localStorage.setItem(LOCAL_PLAYLISTS_STORAGE_KEY, JSON.stringify(nextLocal));

    if (activeIdRef.current === id) {
      const nextActiveId = nextCombined[0]?.id || null;
      setActiveId(nextActiveId);
      if (nextActiveId) {
        localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, nextActiveId);
      } else {
        localStorage.removeItem(ACTIVE_PLAYLIST_STORAGE_KEY);
      }
    }
  };

  const logout = () => {
    setLocalPlaylists([]);
    setManagedPlaylists([]);
    playlistsRef.current = [];
    setActiveId(null);
    setPlaylistData(INITIAL_DATA);
    setFavorites(INITIAL_FAVORITES);
    setSettings(INITIAL_SETTINGS);
    localStorage.removeItem(LOCAL_PLAYLISTS_STORAGE_KEY);
    localStorage.removeItem(MANAGED_PLAYLISTS_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_PLAYLIST_STORAGE_KEY);
    clearActivationCache();
    void IPTVService.clearAllCaches();
    setActivationStatus(INITIAL_ACTIVATION_STATUS);
    setIsActivationLoading(false);
  };

  const refreshAccountInfo = async (id: string) => {
    const playlist = playlistsRef.current.find((p) => p.id === id);
    if (
      !playlist ||
      playlist.type !== "xtream" ||
      !playlist.host ||
      !playlist.username ||
      !playlist.password

    ) {
      return;
    }

    try {
      const response = await IPTVService.getXtreamInfo(
        playlist.host,
        playlist.username,
        playlist.password,
      );

      const combined = playlistsRef.current.map((item) =>
        item.id === id
          ? {
              ...item,
              accountInfo: {
                user: response.user_info,
                server: response.server_info,
              },
            }
          : item,
      );

      const nextLocal = combined.filter((item) => !item.id.startsWith("managed:"));
      const nextManaged = combined.filter((item) => item.id.startsWith("managed:"));

      setLocalPlaylists(nextLocal);
      setManagedPlaylists(nextManaged);
      playlistsRef.current = combined;
      localStorage.setItem(LOCAL_PLAYLISTS_STORAGE_KEY, JSON.stringify(nextLocal));
      localStorage.setItem(
        MANAGED_PLAYLISTS_STORAGE_KEY,
        JSON.stringify(nextManaged),
      );
    } catch (error) {
      console.error("Failed to refresh account info:", error);
      throw error;
    }
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
      const [catsResult, streamsResult] = await Promise.allSettled([
        IPTVService.getVodCategories(host, user, pass),
        IPTVService.getVodStreams(host, user, pass),
      ]);

      let nextCats =
        catsResult.status === "fulfilled" ? catsResult.value : playlistData.vodCategories;
      let nextStreams =
        streamsResult.status === "fulfilled" ? streamsResult.value : playlistData.vodStreams;

      // Provider fallback: if global VOD returns empty but categories exist,
      // fetch per-category and merge by stream_id.
      if (nextStreams.length === 0 && nextCats.length > 0) {
        const categorySettled = await Promise.allSettled(
          nextCats.map((cat) =>
            IPTVService.getVodStreams(host, user, pass, cat.category_id),
          ),
        );
        const merged = categorySettled
          .filter(
            (r): r is PromiseFulfilledResult<MovieStream[]> =>
              r.status === "fulfilled",
          )
          .flatMap((r) => r.value || []);
        if (merged.length > 0) {
          const seen = new Set<number>();
          nextStreams = merged.filter((item) => {
            if (!Number.isFinite(item.stream_id)) return false;
            if (seen.has(item.stream_id)) return false;
            seen.add(item.stream_id);
            return true;
          });
        }
      }

      if (activeIdRef.current === pl.id) {
        setPlaylistData((p) => ({
          ...p,
          vodCategories: nextCats,
          vodStreams: nextStreams,
        }));
      }

      if (streamsResult.status === "rejected") {
        throw streamsResult.reason;
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
      const [catsResult, streamsResult] = await Promise.allSettled([
        IPTVService.getSeriesCategories(host, user, pass),
        IPTVService.getSeries(host, user, pass),
      ]);

      let nextCats =
        catsResult.status === "fulfilled"
          ? catsResult.value
          : playlistData.seriesCategories;
      let nextStreams =
        streamsResult.status === "fulfilled"
          ? streamsResult.value
          : playlistData.seriesStreams;

      // Provider fallback: if global series returns empty but categories exist,
      // fetch per-category and merge by series_id.
      if (nextStreams.length === 0 && nextCats.length > 0) {
        const categorySettled = await Promise.allSettled(
          nextCats.map((cat) =>
            IPTVService.getSeries(host, user, pass, cat.category_id),
          ),
        );
        const merged = categorySettled
          .filter(
            (r): r is PromiseFulfilledResult<SeriesStream[]> =>
              r.status === "fulfilled",
          )
          .flatMap((r) => r.value || []);
        if (merged.length > 0) {
          const seen = new Set<number>();
          nextStreams = merged.filter((item) => {
            if (!Number.isFinite(item.series_id)) return false;
            if (seen.has(item.series_id)) return false;
            seen.add(item.series_id);
            return true;
          });
        }
      }

      if (activeIdRef.current === pl.id) {
        setPlaylistData((p) => ({
          ...p,
          seriesCategories: nextCats,
          seriesStreams: nextStreams,
        }));
      }

      if (streamsResult.status === "rejected") {
        throw streamsResult.reason;
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
        isLiveInitialLoading,
        isVodInitialLoading,
        isSeriesInitialLoading,
        sectionLoadProgress,
        activationStatus,
        isActivationLoading,
        refreshActivationStatus,
        startFreeTrial,
        activationPortalUrl: ACTIVATION_PORTAL_URL,
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
