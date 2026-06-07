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
  startDeviceTrial,
  verifyDeviceActivation,
  type DeviceActivationResponse,
} from "../lib/activationApi";
import {
  getDeviceIdentity,
  syncDeviceIdentityKeyFromServer,
  type DeviceIdentity,
} from "../lib/deviceIdentity";
import {
  buildCachedActivationResponse,
  clearActivationCache,
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
import { requestDedup } from "../lib/requestDedup";
import { isWebOsTv } from "../lib/isWebOsTv";
import { readLiveFavSnapshots } from "../lib/liveFavoriteSnapshots";
import {
  indexCategoryCounts,
  readStoredCategoryCounts,
  writeStoredCategoryCounts,
  type CatalogSection,
  type CategoryCountMap,
} from "../services/categoryCountIndex";

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
  /** Full live rows keyed by stream_id — required for Favorites list on webOS (no full catalog in RAM). */
  liveById?: Record<string, LiveStream>;
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
  subtitlePosition: "top" | "bottom";
  subtitleColor: string;
  subtitleBgOpacity: number;
  subtitleEdge: "none" | "shadow" | "stroke";
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
    liveChannel?: LiveStream,
  ) => void;
  fetchLive: () => Promise<void>;
  isFetchingLive: boolean;
  fetchVod: () => Promise<void>;
  isFetchingVod: boolean;
  fetchSeries: () => Promise<void>;
  isFetchingSeries: boolean;
  setLiveStreams: (streams: LiveStream[]) => void;
  fetchLiveByCategory: (categoryId: string) => Promise<void>;
  clearCache: () => void;
  /** Clears in-memory stream catalogs (live/VOD/series) without touching categories or auth. */
  clearStreams: () => void;
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
  /** Per-category totals for TV mode (indexed in background without full catalogs). */
  categoryCounts: {
    live: CategoryCountMap;
    vod: CategoryCountMap;
    series: CategoryCountMap;
  };
  setCategoryCount: (
    section: CatalogSection,
    categoryId: string,
    count: number,
  ) => void;
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

const normalizeFavoriteIds = (ids: unknown[]): number[] =>
  ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

const normalizeFavoritesPayload = (raw: unknown): Favorites => {
  const base =
    raw && typeof raw === "object"
      ? (raw as Partial<Favorites>)
      : {};
  return {
    live: normalizeFavoriteIds(base.live || []),
    liveById:
      base.liveById && typeof base.liveById === "object"
        ? (base.liveById as Record<string, LiveStream>)
        : {},
    vod: normalizeFavoriteIds(base.vod || []),
    series: normalizeFavoriteIds(base.series || []),
    radio: Array.isArray(base.radio) ? base.radio.map(String) : [],
  };
};

const INITIAL_FAVORITES: Favorites = {
  live: [],
  liveById: {},
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
  subtitlePosition: "bottom",
  subtitleColor: "#ffffff",
  subtitleBgOpacity: 0.6,
  subtitleEdge: "shadow",
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
const ACTIVE_PLAYLIST_STORAGE_KEY = "nova_active_id";

const DEFAULT_BACKGROUND_FILE = "images/img1.png";

function resolveDefaultBackgroundUrl(): string {
  if (typeof document === "undefined") return `./${DEFAULT_BACKGROUND_FILE}`;
  return new URL(DEFAULT_BACKGROUND_FILE, document.baseURI).toString();
}

function normalizeBackgroundImagePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  // Migrate legacy absolute/root paths that break in file:// packaged builds.
  if (
    raw === "/images/img1.png" ||
    raw === "images/img1.png" ||
    raw === "./images/img1.png" ||
    raw.endsWith("/images/img1.png")
  ) {
    return resolveDefaultBackgroundUrl();
  }

  return raw;
}

function normalizeSettings(raw: unknown): Settings {
  const parsed =
    raw && typeof raw === "object"
      ? ({ ...INITIAL_SETTINGS, ...(raw as Partial<Settings>) } as Settings)
      : { ...INITIAL_SETTINGS };

  return {
    ...parsed,
    backgroundImage: normalizeBackgroundImagePath(parsed.backgroundImage),
  };
}

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
      (item.type === "m3u" || item.type === "xtream") &&
      item.managedByBackend !== true,
  );
}

function persistLocalPlaylists(playlists: PlaylistInfo[]) {
  const localOnly = playlists.filter((playlist) => !playlist.managedByBackend);
  localStorage.setItem(LOCAL_PLAYLISTS_STORAGE_KEY, JSON.stringify(localOnly));
}

function mapBackendPlaylists(playlists: DeviceActivationResponse["playlists"]): PlaylistInfo[] {
  if (!Array.isArray(playlists)) return [];

  const parseXtreamCredentialsFromUrl = (urlValue: unknown) => {
    if (typeof urlValue !== "string" || !urlValue.trim()) return null;
    try {
      const parsed = new URL(urlValue);
      const username = parsed.searchParams.get("username") || "";
      const password = parsed.searchParams.get("password") || "";
      if (!username || !password) return null;

      return {
        host: `${parsed.protocol}//${parsed.host}`,
        username,
        password,
      };
    } catch {
      return null;
    }
  };

  return playlists
    .map((playlist, index) => {
      const rawType = (playlist?.type || "m3u").toString().toLowerCase();
      const credentialsFromPayload =
        playlist?.credentials && typeof playlist.credentials === "object"
          ? playlist.credentials
          : null;
      const derivedCredentials = parseXtreamCredentialsFromUrl(playlist?.url);
      const credentials = credentialsFromPayload || derivedCredentials;
      const type =
        rawType === "xtream" ||
        Boolean(credentials?.host && credentials?.username && credentials?.password)
          ? "xtream"
          : "m3u";

      const id = `backend:${
        playlist?.assignmentId ?? playlist?.id ?? `${index}:${playlist?.name || "playlist"}`
      }`;

      return {
        id,
        name: (playlist?.name || "Managed Playlist").toString(),
        type,
        url: playlist?.url || undefined,
        host: credentials?.host || undefined,
        username: credentials?.username || undefined,
        password: credentials?.password || undefined,
        addedAt: playlist?.addedAt || playlist?.updatedAt || new Date().toISOString(),
        managedByBackend: true,
        backendAssignmentId:
          typeof playlist?.assignmentId === "number" ? playlist.assignmentId : undefined,
        backendPlaylistId: typeof playlist?.id === "number" ? playlist.id : undefined,
        backendUpdatedAt: playlist?.updatedAt || undefined,
        targetApplicationId:
          typeof playlist?.targetApplicationId === "number"
            ? playlist.targetApplicationId
            : null,
        targetAppName: playlist?.targetAppName || null,
      } satisfies PlaylistInfo;
    })
    .filter((playlist) =>
      playlist.type === "xtream"
        ? Boolean(playlist.host && playlist.username && playlist.password)
        : Boolean(playlist.url),
    );
}

function mergePlaylistsWithBackend(
  localPlaylists: PlaylistInfo[],
  backendPlaylists: DeviceActivationResponse["playlists"],
): PlaylistInfo[] {
  const editableLocal = localPlaylists.filter((playlist) => !playlist.managedByBackend);
  const managed = mapBackendPlaylists(backendPlaylists);
  return [...managed, ...editableLocal];
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playlistData, setPlaylistData] = useState<PlaylistData>(INITIAL_DATA);
  const [categoryCounts, setCategoryCounts] = useState<{
    live: CategoryCountMap;
    vod: CategoryCountMap;
    series: CategoryCountMap;
  }>({ live: {}, vod: {}, series: {} });
  const countIndexAbortRef = useRef<AbortController | null>(null);
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
  const activationRefreshInFlightRef = useRef(false);
  const activationRetryAfterTsRef = useRef(0);
  const lastOpenSyncAtRef = useRef(0);

  const playlists = [...localPlaylists];

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
    const lang = getLang(settings.language || "english");
    root.lang = lang;
    // Keep TV navigation and page layout stable; language changes only translate text.
    root.dir = "ltr";
    const bg = settings.backgroundImage || resolveDefaultBackgroundUrl();
    document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6),rgba(0,0,0,0.6)),url('${bg}')`;
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

    if (activationRefreshInFlightRef.current) return;

    const now = Date.now();
    if (now < activationRetryAfterTsRef.current) {
      setIsActivationLoading(false);
      return;
    }

    activationRefreshInFlightRef.current = true;

    const cachedActivation = readActivationCache(deviceIdentity);
    const shouldBlockOnNetwork = !cachedActivation;

    if (cachedActivation) {
      setActivationStatus(
        normalizeActivationStatus(
          buildCachedActivationResponse(cachedActivation.record, "cached_active"),
          deviceIdentity,
        ),
      );
    }

    if (!forceNetwork && !shouldBlockOnNetwork && !cachedActivation?.shouldRefresh) {
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
        const editableLocal = playlistsRef.current.filter(
          (playlist) => !playlist.managedByBackend,
        );
        setLocalPlaylists(editableLocal);
        playlistsRef.current = editableLocal;
        persistLocalPlaylists(editableLocal);

        const currentActiveId = activeIdRef.current;
        const currentExists = currentActiveId
          ? editableLocal.some((playlist) => playlist.id === currentActiveId)
          : false;

        if (!currentExists) {
          const nextActiveId = editableLocal[0]?.id || null;
          setActiveId(nextActiveId);
          if (nextActiveId) {
            localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, nextActiveId);
          } else {
            localStorage.removeItem(ACTIVE_PLAYLIST_STORAGE_KEY);
          }
        }
      } else {
        const mergedPlaylists = mergePlaylistsWithBackend(
          playlistsRef.current,
          verification.playlists,
        );
        setLocalPlaylists(mergedPlaylists);
        playlistsRef.current = mergedPlaylists;
        persistLocalPlaylists(mergedPlaylists);

        const currentActiveId = activeIdRef.current;
        const activeStillExists = currentActiveId
          ? mergedPlaylists.some((playlist) => playlist.id === currentActiveId)
          : false;
        if (!activeStillExists) {
          const nextActiveId = mergedPlaylists[0]?.id || null;
          setActiveId(nextActiveId);
          if (nextActiveId) {
            localStorage.setItem(ACTIVE_PLAYLIST_STORAGE_KEY, nextActiveId);
          } else {
            localStorage.removeItem(ACTIVE_PLAYLIST_STORAGE_KEY);
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error || "");
      const backendUnavailable =
        /failed to fetch|networkerror|not found|econnrefused|err_connection_refused|404/i.test(
          message,
        );

      if (/too many requests|too many activation attempts|429/i.test(message)) {
        activationRetryAfterTsRef.current = Date.now() + 2 * 60 * 1000;
        console.warn(
          "backend activation refresh throttled (429), cooling down for 120s",
        );
      } else if (backendUnavailable) {
        activationRetryAfterTsRef.current = Date.now() + 2 * 60 * 1000;
        console.warn(
          "backend activation refresh unreachable, keeping offline grace for 120s",
        );
      } else {
        console.error("backend activation refresh failed", error);
      }

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
      activationRefreshInFlightRef.current = false;
    }
  }, [deviceIdentity]);

  const startFreeTrial = useCallback(async () => {
    if (!deviceIdentity) return;

    setIsActivationLoading(true);
    try {
      const result = await startDeviceTrial(deviceIdentity);
      setActivationStatus(normalizeActivationStatus(result, deviceIdentity));
      if (result.activated) {
        await refreshActivationStatus(true);
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
          const normalized = normalizeFavoritesPayload(
            JSON.parse(savedFavs),
          );
          const legacySnaps = readLiveFavSnapshots(activeId);
          if (Object.keys(legacySnaps).length > 0) {
            normalized.liveById = {
              ...legacySnaps,
              ...(normalized.liveById || {}),
            };
          }
          setFavorites(normalized);
        } catch (e) {
          setFavorites(INITIAL_FAVORITES);
        }
      } else {
        setFavorites(INITIAL_FAVORITES);
      }

      const savedSettings = localStorage.getItem(`nova_settings_${activeId}`);
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings(normalizeSettings(parsed));
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
  }, [
    activePlaylist?.id,
    activePlaylist?.type,
    activePlaylist?.host,
    activePlaylist?.username,
    activePlaylist?.password,
    activePlaylist?.url,
    activePlaylist?.backendUpdatedAt,
  ]);

  // ── Progressive prefetch on connect ───────────────────────────────
  // 1) Hydrate instantly from cache (memory/IndexedDB).
  // 2) Refresh live/vod/series in parallel and commit each section as soon as ready.
  // ------------------------------------------------------------------
  useEffect(() => {
    const pl = activePlaylist;
    if (!pl || pl.type !== "xtream") return;
    const host = pl.host!;
    const user = pl.username!;
    const pass = pl.password!;
    const id = pl.id;

    const readyBySection: Record<"live" | "vod" | "series", boolean> = {
      live: false,
      vod: false,
      series: false,
    };
    let completedSections = 0;
    const markSectionReady = (
      section: "live" | "vod" | "series",
      label?: string,
    ) => {
      if (readyBySection[section]) return;
      readyBySection[section] = true;
      completedSections += 1;
      setSectionLoadProgress((prev) => ({ ...prev, [section]: 100 }));
      setPrefetchProgress({
        completed: completedSections,
        total: 3,
        label:
          label ||
          (section === "live"
            ? "Live ready"
            : section === "vod"
              ? "Movies ready"
              : "Series ready"),
      });
      if (section === "live") setIsFetchingLive(false);
      if (section === "vod") setIsFetchingVod(false);
      if (section === "series") setIsFetchingSeries(false);
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
    setPrefetchProgress({ completed: 0, total: 3, label: "Starting..." });
    completedSections = 0;

    const isWebOSTv = isWebOsTv();

    // webOS: hydrate category sidebars only — never replay huge stream JSON from IDB.
    const cacheBootstrap = isWebOSTv
      ? IPTVService.getCachedCatalogCategoriesOnly(host, user, pass)
      : IPTVService.getCachedBootstrap(host, user, pass);

    cacheBootstrap
      .then((cached) => {
        if (activeIdRef.current !== id) return;

        if (isWebOSTv) {
          IPTVService.evictGlobalStreamCatalogFromMemory(host, user, pass);
        }

        if (
          cached.liveCategories.length ||
          (!isWebOSTv && cached.liveStreams.length) ||
          cached.vodCategories.length ||
          (!isWebOSTv && cached.vodStreams.length) ||
          cached.seriesCategories.length ||
          (!isWebOSTv && cached.seriesStreams.length)
        ) {
          setPlaylistData((prev) => ({
            ...prev,
            liveCategories:
              cached.liveCategories.length > 0
                ? cached.liveCategories
                : prev.liveCategories,
            liveStreams: isWebOSTv
              ? prev.liveStreams
              : cached.liveStreams.length > 0
                ? cached.liveStreams
                : prev.liveStreams,
            vodCategories:
              cached.vodCategories.length > 0
                ? cached.vodCategories
                : prev.vodCategories,
            vodStreams: isWebOSTv
              ? prev.vodStreams
              : cached.vodStreams.length > 0
                ? cached.vodStreams
                : prev.vodStreams,
            seriesCategories:
              cached.seriesCategories.length > 0
                ? cached.seriesCategories
                : prev.seriesCategories,
            seriesStreams: isWebOSTv
              ? prev.seriesStreams
              : cached.seriesStreams.length > 0
                ? cached.seriesStreams
                : prev.seriesStreams,
          }));
        }

        if (
          (!isWebOSTv && cached.liveStreams.length > 0) ||
          cached.liveCategories.length > 0
        ) {
          markSectionReady("live", "Live loaded from cache");
        }
        if (
          (!isWebOSTv && cached.vodStreams.length > 0) ||
          cached.vodCategories.length > 0
        ) {
          markSectionReady("vod", "Movies loaded from cache");
        }
        if (
          (!isWebOSTv && cached.seriesStreams.length > 0) ||
          cached.seriesCategories.length > 0
        ) {
          markSectionReady("series", "Series loaded from cache");
        }
      })
      .catch(() => {});

    const loadSection = async (section: "live" | "vod" | "series") => {
      try {
        if (section === "live") {
          const liveCategories = await IPTVService.getLiveCategories(
            host,
            user,
            pass,
          );
          if (activeIdRef.current !== id) return;

          setPlaylistData((prev) => ({
            ...prev,
            liveCategories,
          }));
          setSectionLoadProgress((prev) => ({ ...prev, live: 50 }));

          if (!isWebOSTv) {
            const liveStreams = await IPTVService.getLiveStreams(host, user, pass);
            if (activeIdRef.current !== id) return;

            setPlaylistData((prev) => ({
              ...prev,
              liveStreams,
            }));
          } else {
            IPTVService.evictGlobalStreamCatalogFromMemory(host, user, pass);
          }

          try {
            const existing = localStorage.getItem(`nova_cats_${id}`);
            const parsed = existing ? JSON.parse(existing) : {};
            localStorage.setItem(
              `nova_cats_${id}`,
              JSON.stringify({
                ...parsed,
                live: liveCategories,
              }),
            );
          } catch {
            // ignore cache write failures
          }
        }

        if (section === "vod") {
          const vodCategories = await IPTVService.getVodCategories(
            host,
            user,
            pass,
          );
          if (activeIdRef.current !== id) return;

          setPlaylistData((prev) => ({
            ...prev,
            vodCategories,
          }));
          setSectionLoadProgress((prev) => ({ ...prev, vod: 50 }));

          if (!isWebOSTv) {
            const vodStreams = await IPTVService.getVodStreams(host, user, pass);
            if (activeIdRef.current !== id) return;

            setPlaylistData((prev) => ({
              ...prev,
              vodStreams,
            }));
          } else {
            IPTVService.evictGlobalStreamCatalogFromMemory(host, user, pass);
          }

          try {
            const existing = localStorage.getItem(`nova_cats_${id}`);
            const parsed = existing ? JSON.parse(existing) : {};
            localStorage.setItem(
              `nova_cats_${id}`,
              JSON.stringify({
                ...parsed,
                vod: vodCategories,
              }),
            );
          } catch {
            // ignore cache write failures
          }
        }

        if (section === "series") {
          const seriesCategories = await IPTVService.getSeriesCategories(
            host,
            user,
            pass,
          );
          if (activeIdRef.current !== id) return;

          setPlaylistData((prev) => ({
            ...prev,
            seriesCategories,
          }));
          setSectionLoadProgress((prev) => ({ ...prev, series: 50 }));

          if (!isWebOSTv) {
            const seriesStreams = await IPTVService.getSeries(host, user, pass);
            if (activeIdRef.current !== id) return;

            setPlaylistData((prev) => ({
              ...prev,
              seriesStreams,
            }));
          } else {
            IPTVService.evictGlobalStreamCatalogFromMemory(host, user, pass);
          }

          try {
            const existing = localStorage.getItem(`nova_cats_${id}`);
            const parsed = existing ? JSON.parse(existing) : {};
            localStorage.setItem(
              `nova_cats_${id}`,
              JSON.stringify({
                ...parsed,
                series: seriesCategories,
              }),
            );
          } catch {
            // ignore cache write failures
          }
        }

        if (activeIdRef.current === id) {
          markSectionReady(section);
        }
      } catch (err) {
        if (activeIdRef.current !== id) return;
        if (section === "live") setIsFetchingLive(false);
        if (section === "vod") setIsFetchingVod(false);
        if (section === "series") setIsFetchingSeries(false);
        console.error(`Failed to prefetch ${section}:`, err);
      }
    };

    // Desktop: full catalogs. webOS: categories only — lists load per category on demand.
    Promise.all([loadSection("live"), loadSection("vod"), loadSection("series")])
      .catch(() => {})
      .finally(() => {
        if (activeIdRef.current !== id) return;
        setIsPrefetching(false);
      });

    // Background refresh cadence: much less frequent on webOS to avoid
    // starving live playback on constrained TV hardware.
    const refreshIntervalMs = isWebOSTv ? 120 * 60 * 1000 : 30 * 60 * 1000;

    // Background refresh to pick up updates without blocking UI
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(
      () => {
        if (activeIdRef.current !== id) return;

        const isLiveRoute =
          typeof window !== "undefined" &&
          /\/live/i.test(window.location.pathname || "");
        const isAppVisible = document.visibilityState === "visible";

        // While actively watching live on webOS, skip catalog refresh entirely.
        // Some providers enforce low connection limits and these requests can
        // stall or interrupt the live stream.
        if (isWebOSTv && isLiveRoute && isAppVisible) {
          return;
        }

        const refreshPromise = isWebOSTv
          ? IPTVService.backgroundRefreshCategoriesOnly(host, user, pass)
          : IPTVService.backgroundRefresh(host, user, pass);

        refreshPromise
          .then((data) => {
            if (!data || activeIdRef.current !== id) return;

            if (isWebOSTv) {
              const cats = data as {
                liveCategories: Category[];
                vodCategories: Category[];
                seriesCategories: Category[];
              };
              setPlaylistData((prev) => ({
                ...prev,
                liveCategories:
                  Array.isArray(cats.liveCategories) && cats.liveCategories.length > 0
                    ? cats.liveCategories
                    : prev.liveCategories,
                vodCategories:
                  Array.isArray(cats.vodCategories) && cats.vodCategories.length > 0
                    ? cats.vodCategories
                    : prev.vodCategories,
                seriesCategories:
                  Array.isArray(cats.seriesCategories) &&
                  cats.seriesCategories.length > 0
                    ? cats.seriesCategories
                    : prev.seriesCategories,
              }));
              IPTVService.evictGlobalStreamCatalogFromMemory(host, user, pass);
              return;
            }

            const full = data as {
              liveCategories: Category[];
              liveStreams: LiveStream[];
              vodCategories: Category[];
              vodStreams: MovieStream[];
              seriesCategories: Category[];
              seriesStreams: SeriesStream[];
            };
            const liveStreams = full.liveStreams || [];
            setPlaylistData((prev) => ({
              liveCategories:
                Array.isArray(full.liveCategories) && full.liveCategories.length > 0
                  ? full.liveCategories
                  : prev.liveCategories,
              liveStreams:
                Array.isArray(liveStreams) && liveStreams.length > 0
                  ? liveStreams
                  : prev.liveStreams,
              vodCategories:
                Array.isArray(full.vodCategories) && full.vodCategories.length > 0
                  ? full.vodCategories
                  : prev.vodCategories,
              vodStreams:
                Array.isArray(full.vodStreams) && full.vodStreams.length > 0
                  ? full.vodStreams
                  : prev.vodStreams,
              seriesCategories:
                Array.isArray(full.seriesCategories) && full.seriesCategories.length > 0
                  ? full.seriesCategories
                  : prev.seriesCategories,
              seriesStreams:
                Array.isArray(full.seriesStreams) && full.seriesStreams.length > 0
                  ? full.seriesStreams
                  : prev.seriesStreams,
            }));
          })
          .catch(() => {}); // Silent — background refresh is best-effort
      },
      refreshIntervalMs,
    );

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [activeId]);

  // Hydrate sidebar count index from localStorage when switching playlists.
  useEffect(() => {
    const id = activePlaylist?.id;
    if (!id) {
      setCategoryCounts({ live: {}, vod: {}, series: {} });
      return;
    }
    const stored = readStoredCategoryCounts(id);
    setCategoryCounts({
      live: stored.live ?? {},
      vod: stored.vod ?? {},
      series: stored.series ?? {},
    });
  }, [activePlaylist?.id]);

  const setCategoryCount = useCallback(
    (section: CatalogSection, categoryId: string, count: number) => {
      const id = String(categoryId || "").trim();
      if (!id || !Number.isFinite(count) || count < 0) return;
      setCategoryCounts((prev) => {
        const nextSection = { ...prev[section], [id]: count };
        const next = { ...prev, [section]: nextSection };
        const plId = activeIdRef.current;
        if (plId) writeStoredCategoryCounts(plId, section, nextSection);
        return next;
      });
    },
    [],
  );

  // Background per-category API scans — stores counts only (how other IPTV apps show totals on TV).
  useEffect(() => {
    const pl = activePlaylist;
    if (!pl || pl.type !== "xtream" || !pl.host || !pl.username || !pl.password) {
      return;
    }

    const host = pl.host;
    const user = pl.username;
    const pass = pl.password;
    const playlistId = pl.id;
    const tvMode = isWebOsTv();

    if (tvMode) {
      // Low-memory TVs should learn counts from categories as users open them.
      // Scanning every category at startup can saturate single-connection IPTV
      // providers and churn cache/memory before playback even starts.
      countIndexAbortRef.current?.abort();
      return;
    }

    const jobs: Array<{
      section: CatalogSection;
      categories: Category[];
      skip: boolean;
    }> = [
      {
        section: "live",
        categories: playlistData.liveCategories,
        skip: !tvMode && playlistData.liveStreams.length > 0,
      },
      {
        section: "vod",
        categories: playlistData.vodCategories,
        skip: !tvMode && playlistData.vodStreams.length > 0,
      },
      {
        section: "series",
        categories: playlistData.seriesCategories,
        skip: !tvMode && playlistData.seriesStreams.length > 0,
      },
    ];

    countIndexAbortRef.current?.abort();
    const controller = new AbortController();
    countIndexAbortRef.current = controller;

    void (async () => {
      for (const job of jobs) {
        if (controller.signal.aborted || job.skip || job.categories.length === 0) {
          continue;
        }

        try {
          const final = await indexCategoryCounts(
            job.section,
            host,
            user,
            pass,
            job.categories,
            {
              signal: controller.signal,
              concurrency: tvMode ? 2 : 4,
              onBatch: (partial) => {
                if (controller.signal.aborted || activeIdRef.current !== playlistId) {
                  return;
                }
                setCategoryCounts((prev) => ({
                  ...prev,
                  [job.section]: { ...prev[job.section], ...partial },
                }));
              },
            },
          );

          if (controller.signal.aborted || activeIdRef.current !== playlistId) {
            return;
          }

          setCategoryCounts((prev) => ({
            ...prev,
            [job.section]: { ...prev[job.section], ...final },
          }));
          writeStoredCategoryCounts(playlistId, job.section, final);
        } catch {
          // best-effort — sidebar falls back to 0 until a category is opened
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    activePlaylist?.id,
    activePlaylist?.type,
    activePlaylist?.host,
    activePlaylist?.username,
    activePlaylist?.password,
    playlistData.liveCategories,
    playlistData.vodCategories,
    playlistData.seriesCategories,
    playlistData.liveStreams.length,
    playlistData.vodStreams.length,
    playlistData.seriesStreams.length,
  ]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    if (!activeId) return;
    setSettings((prev) => {
      const updated = normalizeSettings({ ...prev, ...newSettings });
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
    liveChannel?: LiveStream,
  ) => {
    if (!activeId) return;

    setFavorites((prev) => {
      if (type === "live") {
        const streamId = Number(id);
        if (!Number.isFinite(streamId) || streamId <= 0) return prev;

        const liveIds = normalizeFavoriteIds(prev.live);
        const isFav = liveIds.includes(streamId);
        const liveById = { ...(prev.liveById || {}) };
        const key = String(streamId);

        if (isFav) {
          delete liveById[key];
          const newFavs: Favorites = {
            ...prev,
            live: liveIds.filter((i) => i !== streamId),
            liveById,
          };
          localStorage.setItem(
            `nova_favs_${activeId}`,
            JSON.stringify(newFavs),
          );
          return newFavs;
        }

        if (liveChannel?.stream_id) {
          liveById[key] = liveChannel;
        }
        const newFavs: Favorites = {
          ...prev,
          live: [...liveIds, streamId],
          liveById,
        };
        localStorage.setItem(`nova_favs_${activeId}`, JSON.stringify(newFavs));
        return newFavs;
      }

      const current = prev[type] as Array<number | string>;
      const isFav = current.some(
        (entry) => String(entry) === String(id),
      );
      const updated = isFav
        ? current.filter((entry) => String(entry) !== String(id))
        : [...current, id];
      const newFavs = { ...prev, [type]: updated };
      localStorage.setItem(`nova_favs_${activeId}`, JSON.stringify(newFavs));
      return newFavs;
    });
  };

  useEffect(() => {
    const savedLocalPlaylists = readStoredPlaylists(LOCAL_PLAYLISTS_STORAGE_KEY);
    const savedActiveId = localStorage.getItem(ACTIVE_PLAYLIST_STORAGE_KEY);
    const combined = [...savedLocalPlaylists];

    setLocalPlaylists(savedLocalPlaylists);

    if (savedActiveId) {
      setActiveId(savedActiveId);
    } else if (combined.length > 0) {
      setActiveId(combined[0].id);
    }
  }, []);

  useEffect(() => {
    if (!deviceIdentity) return;

    const runOpenSync = () => {
      const now = Date.now();
      // webOS can emit multiple launch/visibility/focus events in quick bursts.
      // Coalesce them into a single backend verification to avoid rate limiting.
      if (now - lastOpenSyncAtRef.current < 15_000) {
        return;
      }
      lastOpenSyncAtRef.current = now;
      refreshActivationStatus(true).catch(() => {});
    };

    // Only sync with backend when app is opened/reopened.
    runOpenSync();

    const onLaunch = () => runOpenSync();
    const onRelaunch = () => runOpenSync();
    const onPageShow = () => runOpenSync();
    const onFocus = () => runOpenSync();
    const onOnline = () => runOpenSync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runOpenSync();
      }
    };

    document.addEventListener("nova:app-launch", onLaunch);
    document.addEventListener("nova:app-relaunch", onRelaunch);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("nova:app-launch", onLaunch);
      document.removeEventListener("nova:app-relaunch", onRelaunch);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
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
    setLocalPlaylists(updated);
    playlistsRef.current = updated;
    setActiveId(newPlaylist.id);
    persistLocalPlaylists(updated);
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
    const nextLocal = localPlaylists.filter((playlist) => playlist.id !== id);

    setLocalPlaylists(nextLocal);
    playlistsRef.current = nextLocal;
    persistLocalPlaylists(nextLocal);

    if (activeIdRef.current === id) {
      const nextActiveId = nextLocal[0]?.id || null;
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
    playlistsRef.current = [];
    setActiveId(null);
    setPlaylistData(INITIAL_DATA);
    setFavorites(INITIAL_FAVORITES);
    setSettings(INITIAL_SETTINGS);
    localStorage.removeItem(LOCAL_PLAYLISTS_STORAGE_KEY);
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

      const nextLocal = combined;

      setLocalPlaylists(nextLocal);
      playlistsRef.current = combined;
      persistLocalPlaylists(nextLocal);
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
    const tvMode = isWebOsTv();
    if (!tvMode && playlistData.liveStreams.length > 0) return;
    if (
      tvMode &&
      playlistData.liveCategories.length > 0 &&
      playlistData.liveStreams.length > 0
    ) {
      return;
    }

    const host = pl.host!;
    const user = pl.username!;
    const pass = pl.password!;
    const dedupKey = `live-${pl.id}`;

    setIsFetchingLive(true);
    try {
      await requestDedup.deduplicate(dedupKey, async () => {
        const cats = await IPTVService.getLiveCategories(host, user, pass);
        if (tvMode) {
          IPTVService.evictGlobalStreamCatalogFromMemory(host, user, pass);
          if (activeIdRef.current === pl.id) {
            setPlaylistData((p) => ({
              ...p,
              liveCategories: cats,
            }));
          }
          return;
        }
        const streams = await IPTVService.getLiveStreams(host, user, pass);
        if (activeIdRef.current === pl.id) {
          setPlaylistData((p) => ({
            ...p,
            liveCategories: cats,
            liveStreams: streams,
          }));
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch live data:", error);
      throw error;
    } finally {
      setIsFetchingLive(false);
    }
  }, [
    playlistData.liveStreams.length,
    playlistData.liveCategories.length,
  ]);

  const fetchVod = useCallback(async () => {
    const pl = activePlaylistRef.current;
    if (!pl || pl.type !== "xtream") return;

    const tvMode = isWebOsTv();
    if (!tvMode && playlistData.vodStreams.length > 0) return;
    if (tvMode && playlistData.vodCategories.length > 0) return;

    const host = pl.host!;
    const user = pl.username!;
    const pass = pl.password!;
    const dedupKey = `vod-${pl.id}`;

    setIsFetchingVod(true);
    try {
      await requestDedup.deduplicate(dedupKey, async () => {
        if (tvMode) {
          const cats = await IPTVService.getVodCategories(host, user, pass);
          IPTVService.evictGlobalStreamCatalogFromMemory(host, user, pass);
          if (activeIdRef.current === pl.id) {
            setPlaylistData((p) => ({ ...p, vodCategories: cats }));
          }
          return;
        }

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
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch VOD data:", error);
      throw error;
    } finally {
      setIsFetchingVod(false);
    }
  }, [playlistData.vodStreams.length, playlistData.vodCategories.length]);

  const fetchSeries = useCallback(async () => {
    const pl = activePlaylistRef.current;
    if (!pl || pl.type !== "xtream") return;

    const tvMode = isWebOsTv();
    if (!tvMode && playlistData.seriesStreams.length > 0) return;
    if (tvMode && playlistData.seriesCategories.length > 0) return;

    const host = pl.host!;
    const user = pl.username!;
    const pass = pl.password!;
    const dedupKey = `series-${pl.id}`;

    setIsFetchingSeries(true);
    try {
      await requestDedup.deduplicate(dedupKey, async () => {
        if (tvMode) {
          const cats = await IPTVService.getSeriesCategories(host, user, pass);
          IPTVService.evictGlobalStreamCatalogFromMemory(host, user, pass);
          if (activeIdRef.current === pl.id) {
            setPlaylistData((p) => ({ ...p, seriesCategories: cats }));
          }
          return;
        }

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
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch series data:", error);
      throw error;
    } finally {
      setIsFetchingSeries(false);
    }
  }, [playlistData.seriesStreams.length, playlistData.seriesCategories.length]);

  const setLiveStreams = useCallback((streams: LiveStream[]) => {
    setPlaylistData((prev) => ({ ...prev, liveStreams: streams }));
  }, []);

  const fetchLiveByCategory = useCallback(async (categoryId: string) => {
    const pl = activePlaylistRef.current;
    if (!pl || pl.type !== "xtream" || !pl.host || !pl.username || !pl.password) return;
    setIsFetchingLive(true);
    try {
      const streams = await IPTVService.getLiveStreams(
        pl.host,
        pl.username,
        pl.password,
        categoryId,
      );
      if (activeIdRef.current === pl.id) {
        setPlaylistData((prev) => ({
          ...prev,
          liveStreams: streams,
        }));
        setCategoryCount(
          "live",
          categoryId,
          Array.isArray(streams) ? streams.length : 0,
        );
      }
    } catch (err) {
      console.error("Failed to fetch live streams for category:", categoryId, err);
      throw err;
    } finally {
      setIsFetchingLive(false);
    }
  }, [setCategoryCount]);

  const clearCache = () => {
    setPlaylistData(INITIAL_DATA);
    setCategoryCounts({ live: {}, vod: {}, series: {} });
    const playlistId = activeIdRef.current;
    if (playlistId) {
      [
        `nova_cats_${playlistId}`,
        `nova_cat_counts_${playlistId}_live`,
        `nova_cat_counts_${playlistId}_vod`,
        `nova_cat_counts_${playlistId}_series`,
      ].forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });
    }
    IPTVService.clearAllCaches();
  };

  const clearStreams = () => {
    setPlaylistData((prev) => ({
      ...prev,
      liveStreams: [],
      vodStreams: [],
      seriesStreams: [],
    }));
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
        setLiveStreams,
        fetchLiveByCategory,
        clearCache,
        clearStreams,
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
        categoryCounts,
        setCategoryCount,
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
