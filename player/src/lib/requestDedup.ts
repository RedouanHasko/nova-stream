/**
 * Request deduplication layer to prevent duplicate API calls during navigation
 * Useful for catalog fetches that may be triggered from multiple places
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timer: ReturnType<typeof setTimeout>;
}

class RequestDeduplicator {
  private _pending = new Map<string, PendingRequest<any>>();
  private _timeout = 500; // Keep pending for 500ms after resolution

  /**
   * Execute a fetcher only once, deduplicating concurrent calls
   * Later calls within the timeout window return cached promise
   */
  async deduplicate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this._pending.has(key)) {
      const req = this._pending.get(key)!;
      clearTimeout(req.timer); // Reset timeout
      req.timer = setTimeout(() => this._pending.delete(key), this._timeout);
      return req.promise;
    }

    const promise = fetcher();
    const timer = setTimeout(() => this._pending.delete(key), this._timeout);
    this._pending.set(key, { promise, timer });

    try {
      const result = await promise;
      return result;
    } catch (e) {
      this._pending.delete(key); // Remove on error, allow retry
      throw e;
    }
  }

  clear() {
    this._pending.forEach(req => clearTimeout(req.timer));
    this._pending.clear();
  }
}

export const requestDedup = new RequestDeduplicator();
