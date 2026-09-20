---
status: Active
since: 2026-09
retired:
---

# Expiring map

**What it is:** The in-memory cache, when a cache is actually required.
Same shape as a React Query client: the **client** is this map, the
**key** names the entry, the **getter** runs on miss (`memo`), the
**lifetime** is short. `get` drops expired entries lazily; `gcTime`
sweeps the long tail; that timer is `unref`'d so it does not keep the
process alive. `get` / `set` / `delete` / `clear` is DataLoader's
`CacheMap` — so a loader that *does* cache takes an instance, not the
library's unbounded `Map`.

**Why it appealed:** DataLoader already batched. I still reached for a
`Map` (or Redis) "so the next request is fast." The next request served
yesterday's catalog, last tick's `service_failed`, or someone else's
score. TTL on an in-process map is the whole policy — not a second
computer, not `cache-control` on the vendor.

**How it's held up:** Only after batching is not enough. Catalog loaders
~10m, cookie claims 5m, CMS GraphQL `memo` of the in-flight promise then
`delete` on `service_failed`. The friction is the key: miss an input
(member sex, a document version) and you serve the wrong identity until
TTL. `undefined` is a miss — negative-cache a sentinel (`true`). Redis
is rare: the work has to survive the pod, the TTL is still short, the
key is still complete. Reach for it carelessly and the weirdness is
cross-process.

```ts
const cache = new ExpiringMap(ttl, { gcTime: ttl }); // client
const result = await cache.memo(key, getter);
```

## Artifacts

- [`expiring-map.ts`](./expiring-map.ts) — TTL on set, lazy `get`, optional
  `gcTime` sweep, `memo`.
- [`using-expiring-map.ts`](./using-expiring-map.ts) — client / key /
  getter; catalog `cacheMap`; delete on failure; Redis and a partial key
  as the seam.

## When

[DataLoader](../dataloader) with `cache: false` first. A cache is for a
hot, stable remote that you have already measured — not for FHIR, not
for anything a write must invalidate, not "because the loader is right
there."

Expiry is from **last set**, not first. `set(key, value, ttl)` and
`memo(key, compute, ttl)` can override per entry. Without `gcTime`,
expired keys sit until the next `get`. With it, a sweep deletes them.
`unref` is required — a naive `setInterval` holds the event loop after
`App.stop`.

## Redis

Another computer. Use it when the result must outlive this process (and
maybe be shared across pods) **and** in-memory TTL is not enough. Still
a short lifetime. Still a complete key. A 30-day Redis blob with
`score:${userId}` is how you serve yesterday's person.

## Status log

- 2026-09 ✅ Active — in-memory client / key / getter / short TTL; only
  after batching is not enough. Redis is the rare cross-pod case.
