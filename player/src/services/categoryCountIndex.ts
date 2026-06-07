import { IPTVService, type Category } from "./iptvService";

export type CatalogSection = "live" | "vod" | "series";

export type CategoryCountMap = Record<string, number>;

const COUNT_STORAGE_PREFIX = "nova_cat_counts_";

/** Persisted per-playlist category counts (numbers only — safe for TV storage). */
export function readStoredCategoryCounts(
  playlistId: string,
): Partial<Record<CatalogSection, CategoryCountMap>> {
  try {
    const raw = localStorage.getItem(`${COUNT_STORAGE_PREFIX}${playlistId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<
      Record<CatalogSection, CategoryCountMap>
    >;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeStoredCategoryCounts(
  playlistId: string,
  section: CatalogSection,
  counts: CategoryCountMap,
): void {
  try {
    const existing = readStoredCategoryCounts(playlistId);
    localStorage.setItem(
      `${COUNT_STORAGE_PREFIX}${playlistId}`,
      JSON.stringify({
        ...existing,
        [section]: counts,
      }),
    );
  } catch {
    // ignore quota errors on TV
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Fetches item counts per category via scoped Xtream calls (one category at a time).
 * Does not keep full stream arrays in IPTVService caches — only counts are returned.
 */
export async function indexCategoryCounts(
  section: CatalogSection,
  host: string,
  user: string,
  pass: string,
  categories: Category[],
  options?: {
    signal?: AbortSignal;
    concurrency?: number;
    onBatch?: (partial: CategoryCountMap) => void;
  },
): Promise<CategoryCountMap> {
  const concurrency = Math.max(1, options?.concurrency ?? 3);
  const result: CategoryCountMap = {};

  const fetchOne = async (cat: Category) => {
    if (options?.signal?.aborted) return;
    const id = String(cat.category_id ?? "").trim();
    if (!id) return;
    const count = await IPTVService.countItemsInCategory(
      host,
      user,
      pass,
      section,
      id,
    );
    if (options?.signal?.aborted) return;
    result[id] = count;
  };

  for (const batch of chunk(categories, concurrency)) {
    if (options?.signal?.aborted) break;
    await Promise.all(batch.map((cat) => fetchOne(cat)));
    options?.onBatch?.({ ...result });
    if (options?.signal?.aborted) break;
  }

  return result;
}
