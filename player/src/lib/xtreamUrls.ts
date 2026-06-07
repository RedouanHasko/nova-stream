/**
 * Canonical Xtream Codes–style stream URL builders.
 *
 * LG webOS plays these URLs most reliably through the **native** `<video>` element:
 * - Live: `.m3u8` under `/live/` uses the TV hardware HLS path (avoid MSE-heavy JS players).
 * - VOD: `/movie/…` or direct `.mp4` when the panel exposes them.
 *
 * @see README.md — "webOS TV expectations"
 */

/** Strip trailing slash from panel base URL. */
function normalizeHost(host: string): string {
  return String(host || "").trim().replace(/\/+$/, "");
}

/**
 * Live TV stream URL: `{host}/live/{user}/{pass}/{streamId}.{ext}`
 * Default extension `m3u8` matches typical panel HLS endpoints.
 */
export function xtreamLiveUrl(
  host: string,
  username: string,
  password: string,
  streamId: number | string,
  extension: string = "m3u8",
): string {
  const h = normalizeHost(host);
  const ext = String(extension || "m3u8").replace(/^\./, "");
  // Panels expect literal user/pass path segments (same as typical Xtream URL docs).
  return `${h}/live/${username}/${password}/${streamId}.${ext}`;
}

/**
 * VOD / movie URL: `{host}/movie/{user}/{pass}/{streamId}.{ext}`
 * Extension often comes from API `container_extension` (e.g. mp4, mkv).
 */
export function xtreamMovieUrl(
  host: string,
  username: string,
  password: string,
  streamId: number | string,
  extension: string,
): string {
  const h = normalizeHost(host);
  const ext = String(extension || "mp4").replace(/^\./, "");
  return `${h}/movie/${username}/${password}/${streamId}.${ext}`;
}

/**
 * Series episode URL: `{host}/series/{user}/{pass}/{episodeId}.{ext}`
 * Xtream panels use episode `id` values here, not the parent `series_id`.
 */
export function xtreamSeriesUrl(
  host: string,
  username: string,
  password: string,
  episodeId: number | string,
  extension: string,
): string {
  const h = normalizeHost(host);
  const ext = String(extension || "mp4").replace(/^\./, "");
  return `${h}/series/${username}/${password}/${episodeId}.${ext}`;
}
