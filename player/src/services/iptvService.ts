export interface XtreamAccountInfo {
  username: string;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  max_connections: string;
  created_at: string;
}

export interface XtreamServerInfo {
  url: string;
  port: string;
  https_port: string;
  server_protocol: string;
  rtmp_port: string;
  timezone: string;
  timestamp: number;
  time_now: string;
}

export interface XtreamResponse {
  user_info: XtreamAccountInfo;
  server_info: XtreamServerInfo;
}

export interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface LiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

export interface MovieStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5_0: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
}

export interface SeriesStream {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5_0: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
}

export interface EpgProgram {
  id: string;
  epg_id: string;
  title: string;
  lang: string;
  start: string;
  end: string;
  description: string;
  channel_id: string;
  start_timestamp: string;
  stop_timestamp: string;
  now_playing?: number;
  has_archive?: number;
}

export interface ShortEpgResponse {
  epg_listings: EpgProgram[];
}

// ---------------------------------------------------------------------------
// IndexedDB persistent cache — survives page reloads & browser restarts
// ---------------------------------------------------------------------------
const IDB_NAME = "nova_iptv_cache";
const IDB_VERSION = 1;
const IDB_STORE = "api_responses";

let dbPromise: Promise<IDBDatabase> | null = null;

function openIDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Auto-reset dbPromise when the browser closes the connection or demands a
      // version upgrade from another tab so the next call opens a fresh connection.
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function idbGet(
  key: string,
): Promise<{ data: any; ts: number } | undefined> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? undefined);
        req.onerror = () => resolve(undefined);
      } catch {
        dbPromise = null;
        resolve(undefined);
      }
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, data: any): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        store.put({ data, ts: Date.now() }, key);
        tx.oncomplete = () => {
          resolve();
          idbEvictOld().catch(() => {});
        };
        tx.onerror = () => resolve();
      } catch {
        dbPromise = null;
        resolve();
      }
    });
  } catch {
    // IndexedDB unavailable — silently skip
  }
}

// Evict entries older than 7 days — runs at most once per session.
let _idbEvictedThisSession = false;
async function idbEvictOld(): Promise<void> {
  if (_idbEvictedThisSession) return;
  _idbEvictedThisSession = true;
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if ((cursor.value as any)?.ts < cutoff) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    _idbEvictedThisSession = false; // allow retry on next set
  }
}

async function idbClear(): Promise<void> {
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // silently skip
  } finally {
    // Null the cached promise so the next DB operation opens a fresh connection
    // instead of reusing a connection that may have been closed by the browser.
    dbPromise = null;
  }
}

// Batch-read multiple keys in a single IDB transaction — much faster than N separate reads.
async function idbGetBatch(
  keys: string[],
): Promise<Map<string, { data: any; ts: number }>> {
  const result = new Map<string, { data: any; ts: number }>();
  if (keys.length === 0) return result;
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      let pending = keys.length;
      const done = () => {
        if (--pending === 0) resolve();
      };
      for (const key of keys) {
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result) result.set(key, req.result);
          done();
        };
        req.onerror = done;
      }
    });
  } catch {
    // IDB unavailable
  }
  return result;
}

// Pre-open the IDB connection at module load so the first real read is instant.
openIDB().catch(() => {});

export class IPTVService {
  // ── In-memory L1 cache ──────────────────────────────────────────────
  private static memCache = new Map<string, { data: any; ts: number }>();
  private static inFlight = new Map<string, Promise<any>>();
  private static epgEndpointSupport = new Map<
    string,
    { simpleDataTable?: boolean; xmltv?: boolean }
  >();

  // TTLs — IDB stores survive restarts; memory is per-session
  private static readonly CACHE_TTL_CATEGORIES = 24 * 60 * 60 * 1000; // 24 h
  private static readonly CACHE_TTL_STREAMS = 24 * 60 * 60 * 1000; // 24 h
  private static readonly CACHE_TTL_SHORT = 5 * 60 * 1000; // 5 min (EPG, info)
  // How often a background refresh can check the server for new data
  private static readonly REFRESH_INTERVAL = 30 * 60 * 1000; // 30 min

  private static dedupeByNumericKey<T extends Record<string, any>>(
    items: T[],
    key: string,
  ): T[] {
    const seen = new Set<number | string>();
    const out: T[] = [];
    for (const item of items) {
      const raw = item?.[key];
      const k =
        typeof raw === "number" || typeof raw === "string"
          ? raw
          : JSON.stringify(item);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
    return out;
  }

  private static async fetchByCategoriesBatched<T>(
    categoryIds: Array<string | number>,
    fetcher: (categoryId: string | number) => Promise<T[]>,
    batchSize = 6,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let i = 0; i < categoryIds.length; i += batchSize) {
      const chunk = categoryIds.slice(i, i + batchSize);
      const settled = await Promise.allSettled(chunk.map((id) => fetcher(id)));
      for (const result of settled) {
        if (result.status === "fulfilled" && Array.isArray(result.value)) {
          all.push(...result.value);
        }
      }
    }
    return all;
  }

  /** Wipe both memory + IndexedDB caches (call on playlist switch / logout). */
  static clearMemoryCache() {
    this.memCache.clear();
    this.epgEndpointSupport.clear();
    // Don't clear inFlight — pending requests should still resolve.
  }

  static async clearAllCaches() {
    this.memCache.clear();
    _idbEvictedThisSession = false;
    await idbClear();
  }

  // ── Low-level fetch (no cache) ─────────────────────────────────────
  // Single retry-capable method that returns response body as text.
  private static async fetchTextWithProxy(url: string, retries = 2): Promise<string> {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(proxyUrl, { signal: controller.signal });
        if (!response.ok) {
          if (response.status >= 500 && attempt < retries) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
      } catch (err: any) {
        if (
          attempt < retries &&
          (err.name === "TypeError" || err.message?.includes("fetch"))
        ) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw new Error("Max retries reached");
  }

  // JSON convenience wrapper around fetchTextWithProxy.
  private static async fetchWithProxy(url: string, retries = 2): Promise<any> {
    const text = await this.fetchTextWithProxy(url, retries);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response from server (${text.slice(0, 80)})`);
    }
  }

  private static parseProgramTime(value?: string, fallbackTimestamp?: string) {
    if (fallbackTimestamp && !Number.isNaN(Number(fallbackTimestamp))) {
      const seconds = Number(fallbackTimestamp);
      return new Date(seconds * 1000).toISOString();
    }

    if (!value) return new Date().toISOString();

    const xmltvMatch = value.match(
      /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s+([+\-]\d{4}))?$/,
    );
    if (xmltvMatch) {
      const [, y, mo, d, h, mi, s, tz] = xmltvMatch;
      const offset = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "Z";
      return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`).toISOString();
    }

    const parsed = new Date(value.replace(" ", "T"));
    return Number.isNaN(parsed.getTime())
      ? new Date().toISOString()
      : parsed.toISOString();
  }

  private static normalizeEpgResponse(data: any): ShortEpgResponse {
    const rawListings = Array.isArray(data)
      ? data
      : Array.isArray(data?.epg_listings)
        ? data.epg_listings
        : Array.isArray(data?.jsonepg)
          ? data.jsonepg
          : typeof data?.epg_listings === "object" && data?.epg_listings
            ? Object.values(data.epg_listings)
            : [];

    const epg_listings = rawListings
      .filter(Boolean)
      .map((item: any, index: number) => ({
        id: String(item.id ?? item.epg_id ?? index),
        epg_id: String(item.epg_id ?? item.id ?? index),
        title: String(item.title ?? item.name ?? "Untitled Program"),
        lang: String(item.lang ?? ""),
        start: this.parseProgramTime(item.start, item.start_timestamp),
        end: this.parseProgramTime(item.end ?? item.stop, item.stop_timestamp),
        description: String(item.description ?? item.desc ?? ""),
        channel_id: String(item.channel_id ?? item.channel ?? ""),
        start_timestamp: String(item.start_timestamp ?? ""),
        stop_timestamp: String(item.stop_timestamp ?? item.end_timestamp ?? ""),
        now_playing: item.now_playing,
        has_archive: item.has_archive,
      }))
      .filter((item: EpgProgram) => !!item.title);

    return { epg_listings };
  }

  private static normalizeChannelKey(value?: string) {
    return String(value ?? "")
      .replace(/&amp;/gi, "&")
      .replace(/[|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /**
   * Normalize server responses that may be arrays or objects keyed by id.
   * Returns an array of items in a predictable format.
   */
  private static normalizeListResponse(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;

    // Some providers wrap results in properties like { streams: [...] }
    const candidateKeys = [
      "data",
      "result",
      "streams",
      "channels",
      "movies",
      "series",
      "items",
    ];
    for (const k of candidateKeys) {
      if (Array.isArray(data[k])) return data[k];
    }

    // Some providers return an object keyed by id: { "123": { ... }, "124": { ... } }
    if (typeof data === "object") {
      try {
        const vals = Object.values(data).filter(
          (v) => v && typeof v === "object",
        );
        if (vals.length > 0) return vals;
      } catch {
        return [];
      }
    }

    return [];
  }

  /**
   * Return or create a per-server EPG support state entry.
   * Used to remember whether short/simple/XMLTV EPG endpoints work for a server.
   */
  private static getEpgSupportState(host: string, user: string, pass: string) {
    const key = `${host}:${user}`;
    if (!this.epgEndpointSupport.has(key)) {
      this.epgEndpointSupport.set(key, {});
    }
    return this.epgEndpointSupport.get(key)!;
  }

  private static async getXmltvEpg(
    host: string,
    user: string,
    pass: string,
    epgChannelId?: string,
    channelName?: string,
    limit = 8,
  ): Promise<ShortEpgResponse> {
    const support = this.getEpgSupportState(host, user, pass);
    if (support.xmltv === false) {
      return { epg_listings: [] };
    }

    const url = `${host}/xmltv.php?username=${user}&password=${pass}`;
    const cacheKey = `xmltv:${url}`;

    let xmlText = "";
    const cached = this.memCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL_SHORT) {
      xmlText = String(cached.data || "");
    } else {
      xmlText = await this.fetchTextWithProxy(url, 1);
      this.memCache.set(cacheKey, { data: xmlText, ts: Date.now() });
    }

    if (!xmlText || !xmlText.includes("<programme")) {
      support.xmltv = false;
      return { epg_listings: [] };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    const allPrograms = Array.from(doc.getElementsByTagName("programme"));
    support.xmltv = allPrograms.length > 0;
    const targetIds = [epgChannelId, channelName]
      .map((v) => this.normalizeChannelKey(v))
      .filter(Boolean);

    let matchedPrograms = allPrograms.filter((program) => {
      const channelAttr = this.normalizeChannelKey(
        program.getAttribute("channel"),
      );
      return targetIds.some(
        (target) =>
          channelAttr === target ||
          channelAttr.includes(target) ||
          target.includes(channelAttr),
      );
    });

    if (matchedPrograms.length === 0 && channelName) {
      const channelNameKey = this.normalizeChannelKey(channelName);
      matchedPrograms = allPrograms.filter((program) => {
        const titleNode = program.getElementsByTagName("title")[0];
        const titleText = this.normalizeChannelKey(
          titleNode?.textContent || "",
        );
        return titleText.includes(channelNameKey);
      });
    }

    const epg_listings = matchedPrograms
      .map((program, index) => {
        const titleNode = program.getElementsByTagName("title")[0];
        const descNode = program.getElementsByTagName("desc")[0];
        const start = this.parseProgramTime(
          program.getAttribute("start") || undefined,
        );
        const end = this.parseProgramTime(
          program.getAttribute("stop") || undefined,
        );
        return {
          id: `xmltv-${index}`,
          epg_id: `xmltv-${index}`,
          title: titleNode?.textContent?.trim() || "Untitled Program",
          lang: titleNode?.getAttribute("lang") || "",
          start,
          end,
          description: descNode?.textContent?.trim() || "",
          channel_id: program.getAttribute("channel") || epgChannelId || "",
          start_timestamp: String(Math.floor(new Date(start).getTime() / 1000)),
          stop_timestamp: String(Math.floor(new Date(end).getTime() / 1000)),
        } as EpgProgram;
      })
      .filter((program) => Number.isFinite(new Date(program.start).getTime()))
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

    const now = Date.now();
    const relevant = epg_listings.filter(
      (program) => new Date(program.end).getTime() > now - 60 * 60 * 1000,
    );

    return {
      epg_listings: (relevant.length ? relevant : epg_listings).slice(0, limit),
    };
  }

  // ── Cached + dedup'd fetch (memCache → IndexedDB → network) ────────
  private static cachedFetch(url: string, ttl: number): Promise<any> {
    const cacheKey = url;

    // 1) Memory-cache hit
    const entry = this.memCache.get(cacheKey);
    if (entry && Date.now() - entry.ts < ttl) {
      return Promise.resolve(entry.data);
    }

    // 2) Dedup: return the in-flight promise
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    // 3) New request — check IndexedDB first, then network
    const promise = (async () => {
      // Try IndexedDB (L2 cache)
      const idbEntry = await idbGet(cacheKey);
      if (idbEntry && Date.now() - idbEntry.ts < ttl) {
        this.memCache.set(cacheKey, { data: idbEntry.data, ts: idbEntry.ts });
        this.inFlight.delete(cacheKey);
        return idbEntry.data;
      }

      // Network fetch
      const data = await this.fetchWithProxy(url);
      this.memCache.set(cacheKey, { data, ts: Date.now() });
      // Persist to IndexedDB (fire-and-forget)
      idbSet(cacheKey, data).catch(() => {});
      this.inFlight.delete(cacheKey);
      return data;
    })().catch((err) => {
      this.inFlight.delete(cacheKey);
      // If network fails but we have stale IDB data, return it
      return idbGet(cacheKey).then((stale) => {
        if (stale?.data) {
          this.memCache.set(cacheKey, { data: stale.data, ts: stale.ts });
          return stale.data;
        }
        throw err;
      });
    });

    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  // ── Force-refresh: bypass memory cache, use IDB only as fallback ───
  private static async forceRefresh(url: string): Promise<any> {
    try {
      const data = await this.fetchWithProxy(url);
      this.memCache.set(url, { data, ts: Date.now() });
      idbSet(url, data).catch(() => {});
      return data;
    } catch {
      // Return existing cached data if network fails
      const cached = this.memCache.get(url);
      if (cached) return cached.data;
      const idbEntry = await idbGet(url);
      if (idbEntry?.data) return idbEntry.data;
      return null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  static async getXtreamInfo(
    host: string,
    user: string,
    pass: string,
  ): Promise<XtreamResponse> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}`;
    return this.cachedFetch(url, this.CACHE_TTL_SHORT);
  }

  static async getLiveCategories(
    host: string,
    user: string,
    pass: string,
  ): Promise<Category[]> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=get_live_categories`;
    const data = await this.cachedFetch(url, this.CACHE_TTL_CATEGORIES);
    return this.normalizeListResponse(data) as Category[];
  }

  static async getLiveStreams(
    host: string,
    user: string,
    pass: string,
  ): Promise<LiveStream[]> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=get_live_streams`;
    const data = await this.cachedFetch(url, this.CACHE_TTL_STREAMS);
    const direct = this.normalizeListResponse(data) as LiveStream[];
    if (direct.length > 0) return direct;

    // Fallback for providers that briefly return empty data while cache is cold.
    const refreshed = this.normalizeListResponse(
      await this.forceRefresh(url),
    ) as LiveStream[];
    return refreshed.length > 0 ? refreshed : direct;
  }

  static async getVodCategories(
    host: string,
    user: string,
    pass: string,
  ): Promise<Category[]> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=get_vod_categories`;
    const data = await this.cachedFetch(url, this.CACHE_TTL_CATEGORIES);
    return this.normalizeListResponse(data) as Category[];
  }

  static async getVodStreams(
    host: string,
    user: string,
    pass: string,
    categoryId?: string | number,
  ): Promise<MovieStream[]> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=get_vod_streams${
      categoryId ? `&category_id=${encodeURIComponent(String(categoryId))}` : ""
    }`;
    const data = await this.cachedFetch(url, this.CACHE_TTL_STREAMS);
    return this.normalizeListResponse(data) as MovieStream[];
  }

  static async getSeriesCategories(
    host: string,
    user: string,
    pass: string,
  ): Promise<Category[]> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=get_series_categories`;
    const data = await this.cachedFetch(url, this.CACHE_TTL_CATEGORIES);
    return this.normalizeListResponse(data) as Category[];
  }

  static async getSeries(
    host: string,
    user: string,
    pass: string,
    categoryId?: string | number,
  ): Promise<SeriesStream[]> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=get_series${
      categoryId ? `&category_id=${encodeURIComponent(String(categoryId))}` : ""
    }`;
    const data = await this.cachedFetch(url, this.CACHE_TTL_STREAMS);
    return this.normalizeListResponse(data) as SeriesStream[];
  }

  static async getVodInfo(
    host: string,
    user: string,
    pass: string,
    streamId: number,
  ): Promise<any> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=get_vod_info&vod_id=${streamId}`;
    return this.cachedFetch(url, this.CACHE_TTL_SHORT);
  }

  static async getSeriesInfo(
    host: string,
    user: string,
    pass: string,
    seriesId: number,
  ): Promise<any> {
    const url = `${host}/player_api.php?username=${user}&password=${pass}&action=get_series_info&series_id=${seriesId}`;
    return this.cachedFetch(url, this.CACHE_TTL_SHORT);
  }

  static async getShortEpg(
    host: string,
    user: string,
    pass: string,
    streamId: number,
    epgChannelId?: string,
    channelName?: string,
  ): Promise<ShortEpgResponse> {
    const support = this.getEpgSupportState(host, user, pass);

    try {
      const shortUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_short_epg&stream_id=${streamId}&limit=8`;
      const shortData = await this.cachedFetch(shortUrl, this.CACHE_TTL_SHORT);
      const normalized = this.normalizeEpgResponse(shortData);
      if (normalized.epg_listings.length > 0) {
        return normalized;
      }
    } catch {
      // best effort only
    }

    if (support.simpleDataTable !== false) {
      try {
        const tableUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_simple_data_table&stream_id=${streamId}`;
        const tableData = await this.cachedFetch(
          tableUrl,
          this.CACHE_TTL_SHORT,
        );
        const normalized = this.normalizeEpgResponse(tableData);
        if (normalized.epg_listings.length > 0) {
          support.simpleDataTable = true;
          return normalized;
        }
      } catch {
        support.simpleDataTable = false;
      }
    }

    if (!epgChannelId && !channelName) {
      return { epg_listings: [] };
    }

    try {
      return await this.getXmltvEpg(
        host,
        user,
        pass,
        epgChannelId,
        channelName,
        8,
      );
    } catch {
      support.xmltv = false;
      return { epg_listings: [] };
    }
  }

  // ── Prefetch ALL data on app start ─────────────────────────────────
  // Fetches categories + streams for live, vod, and series in parallel.
  // Returns cached data instantly if available, then network-fetches in background.
  // The onProgress callback fires for each completed section (0..6).
  static async prefetchAll(
    host: string,
    user: string,
    pass: string,
    onProgress?: (completed: number, total: number, label: string) => void,
  ): Promise<{
    liveCategories: Category[];
    liveStreams: LiveStream[];
    vodCategories: Category[];
    vodStreams: MovieStream[];
    seriesCategories: Category[];
    seriesStreams: SeriesStream[];
  }> {
    // Batch-warm memCache from IDB in a single transaction before the 6 parallel
    // cachedFetch calls, so each one hits L1 instantly instead of doing a separate IDB read.
    const warmKeys = [
      `${host}/player_api.php?username=${user}&password=${pass}&action=get_live_categories`,
      `${host}/player_api.php?username=${user}&password=${pass}&action=get_live_streams`,
      `${host}/player_api.php?username=${user}&password=${pass}&action=get_vod_categories`,
      `${host}/player_api.php?username=${user}&password=${pass}&action=get_vod_streams`,
      `${host}/player_api.php?username=${user}&password=${pass}&action=get_series_categories`,
      `${host}/player_api.php?username=${user}&password=${pass}&action=get_series`,
    ];
    const batchEntries = await idbGetBatch(warmKeys);
    for (const [key, entry] of batchEntries) {
      if (!IPTVService.memCache.has(key)) {
        IPTVService.memCache.set(key, entry);
      }
    }

    const total = 6;
    let completed = 0;

    const wrap = async <T>(label: string, fn: () => Promise<T>) => {
      try {
        const value = await fn();
        completed++;
        onProgress?.(completed, total, label);
        return { status: "fulfilled", value } as const;
      } catch (reason) {
        completed++;
        onProgress?.(completed, total, label);
        return { status: "rejected", reason } as const;
      }
    };

    const results = await Promise.all([
      wrap("Live Categories", () => this.getLiveCategories(host, user, pass)),
      wrap("Live Channels", () => this.getLiveStreams(host, user, pass)),
      wrap("Movie Categories", () => this.getVodCategories(host, user, pass)),
      wrap("Movies", () => this.getVodStreams(host, user, pass)),
      wrap("Series Categories", () =>
        this.getSeriesCategories(host, user, pass),
      ),
      wrap("Series", () => this.getSeries(host, user, pass)),
    ]);

    const getVal = <T>(
      r: { status: string; value?: T } | { status: string; reason?: any },
    ) =>
      (r as any).status === "fulfilled"
        ? (r as any).value
        : ([] as unknown as T);

    return {
      liveCategories: getVal<Category[]>(results[0]),
      liveStreams: getVal<LiveStream[]>(results[1]),
      vodCategories: getVal<Category[]>(results[2]),
      vodStreams: getVal<MovieStream[]>(results[3]),
      seriesCategories: getVal<Category[]>(results[4]),
      seriesStreams: getVal<SeriesStream[]>(results[5]),
    };
  }

  // ── Background refresh — check for updates without blocking UI ─────
  // Only actually hits the network if the last refresh is older than REFRESH_INTERVAL.
  static async backgroundRefresh(
    host: string,
    user: string,
    pass: string,
  ): Promise<{
    liveCategories: Category[];
    liveStreams: LiveStream[];
    vodCategories: Category[];
    vodStreams: MovieStream[];
    seriesCategories: Category[];
    seriesStreams: SeriesStream[];
  } | null> {
    const baseUrl = `${host}/player_api.php?username=${user}&password=${pass}`;
    // Check if any key is stale enough to warrant a refresh
    const streamsUrl = `${baseUrl}&action=get_live_streams`;
    const entry = this.memCache.get(streamsUrl) || (await idbGet(streamsUrl));
    if (entry && Date.now() - entry.ts < this.REFRESH_INTERVAL) {
      return null; // Still fresh
    }

    // Force-refresh all data
    const [
      liveCategories,
      liveStreams,
      vodCategories,
      vodStreams,
      seriesCategories,
      seriesStreams,
    ] = await Promise.all([
      this.forceRefresh(`${baseUrl}&action=get_live_categories`),
      this.forceRefresh(`${baseUrl}&action=get_live_streams`),
      this.forceRefresh(`${baseUrl}&action=get_vod_categories`),
      this.forceRefresh(`${baseUrl}&action=get_vod_streams`),
      this.forceRefresh(`${baseUrl}&action=get_series_categories`),
      this.forceRefresh(`${baseUrl}&action=get_series`),
    ]);

    if (!liveCategories) return null;

    return {
      liveCategories,
      liveStreams,
      vodCategories,
      vodStreams,
      seriesCategories,
      seriesStreams,
    };
  }

  static formatExpiryDate(timestamp: string | number): string {
    if (
      !timestamp ||
      timestamp === "0" ||
      timestamp === 0 ||
      timestamp === "Unlimited"
    )
      return "Unlimited";
    const date = new Date(Number(timestamp) * 1000);
    return date.toISOString().split("T")[0];
  }
}
