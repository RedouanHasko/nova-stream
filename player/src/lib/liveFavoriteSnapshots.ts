import type { LiveStream } from "../services/iptvService";

/** Persist full live channel rows for Favorites on TV (IDs alone are not enough without the full catalog in RAM). */
export type LiveFavSnapshotStore = Record<string, LiveStream>;

const storageKey = (playlistId: string) => `nova_fav_live_snap_${playlistId}`;

export const favoriteStreamKey = (streamId: number | string): string =>
  String(Number(streamId));

export function readLiveFavSnapshots(playlistId: string): LiveFavSnapshotStore {
  if (!playlistId) return {};
  try {
    const raw = localStorage.getItem(storageKey(playlistId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LiveFavSnapshotStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeLiveFavSnapshots(
  playlistId: string,
  store: LiveFavSnapshotStore,
): void {
  if (!playlistId) return;
  try {
    localStorage.setItem(storageKey(playlistId), JSON.stringify(store));
  } catch {
    /* ignore quota errors on TV */
  }
}

export function saveLiveFavSnapshot(
  playlistId: string,
  channel: LiveStream,
): void {
  const key = favoriteStreamKey(channel?.stream_id ?? "");
  if (!playlistId || !key || key === "NaN") return;
  const store = readLiveFavSnapshots(playlistId);
  store[key] = channel;
  writeLiveFavSnapshots(playlistId, store);
}

export function removeLiveFavSnapshot(
  playlistId: string,
  streamId: number | string,
): void {
  const key = favoriteStreamKey(streamId);
  if (!playlistId || !key || key === "NaN") return;
  const store = readLiveFavSnapshots(playlistId);
  delete store[key];
  writeLiveFavSnapshots(playlistId, store);
}

/** Minimal row so a favorite ID always appears in the list even if metadata was lost. */
export function minimalLiveChannel(streamId: number): LiveStream {
  return {
    num: streamId,
    name: `Channel ${streamId}`,
    stream_type: "live",
    stream_id: streamId,
    stream_icon: "",
    epg_channel_id: "",
    added: "",
    category_id: "",
    custom_sid: "",
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
  };
}

/** Build ordered favorite channel list from context + legacy snapshot storage. */
export function resolveFavoriteLiveStreams(
  playlistId: string,
  favoriteIds: number[],
  liveById: Record<string, LiveStream> = {},
  memoryChannels: LiveStream[] = [],
): LiveStream[] {
  if (!favoriteIds.length) return [];

  const legacy = readLiveFavSnapshots(playlistId);
  const memoryMap = new Map<number, LiveStream>();
  for (const ch of memoryChannels) {
    const id = Number(ch.stream_id);
    if (Number.isFinite(id) && id > 0) memoryMap.set(id, ch);
  }

  const out: LiveStream[] = [];
  const seen = new Set<number>();

  for (const rawId of favoriteIds) {
    const streamId = Number(rawId);
    if (!Number.isFinite(streamId) || streamId <= 0 || seen.has(streamId)) {
      continue;
    }
    seen.add(streamId);

    const key = favoriteStreamKey(streamId);
    const row =
      liveById[key] ||
      legacy[key] ||
      memoryMap.get(streamId) ||
      minimalLiveChannel(streamId);

    out.push({ ...row, stream_id: streamId });
  }

  return out;
}
