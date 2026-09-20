/**
 * In-memory cache client: key + getter (`memo`) + short TTL. Each entry expires `ttl` ms after it
 * was last set and is dropped lazily on read. Pass `gcTime` to also sweep expired entries on a
 * background interval so idle keys don't linger — that timer is unref'd so it does not keep the
 * process alive.
 *
 * The shape (`get`/`set`/`delete`/`clear`) is DataLoader's `CacheMap` when a loader actually
 * caches. Typical loaders stay `cache: false`. See ../dataloader.
 */
export class ExpiringMap<K, V> {
  private readonly map = new Map<K, { value: V; insertedAt: number; ttl: number }>();

  constructor(
    private readonly ttl: number,
    opts?: { gcTime?: number },
  ) {
    if (opts?.gcTime) {
      const timer = setInterval(() => this.gc(), opts.gcTime);
      // Don't let the sweep keep the event loop (and process) alive.
      timer.unref?.();
    }
  }

  private gc(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.insertedAt + entry.ttl < now) this.map.delete(key);
    }
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.insertedAt + entry.ttl < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttl = this.ttl): void {
    this.map.set(key, { value, insertedAt: Date.now(), ttl });
  }

  memo<R extends V>(key: K, compute: () => R, ttl = this.ttl): R {
    const hit = this.get(key);
    if (hit !== undefined) {
      return hit as R;
    }
    const value = compute();
    this.set(key, value, ttl);
    return value;
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}
