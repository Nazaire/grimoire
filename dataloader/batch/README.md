---
status: Active
since: 2026-09
retired:
---

# Batch

**What it is:** One loader per remote key, on the **provider**. `getX(id)`
`load`s; the batch fn makes one vendor `list({ ids })` and returns results
**in input-id order**. Missing → `success(null)`, mapped to `not_found` in
`getX`. Concurrent `load`s reuse the in-flight promise. Catalog loaders
cache with `ExpiringMap` as DataLoader `cacheMap`.

**Why it appealed:** I used to collect ids, `list`, stuff a `Map`, then
`byId.get(id)!`. TypeScript dropped the pairing — see
[inference](../../typescript/inference). `getX(id)` stays procedural and
infers a single `Result`. The network call is an implementation detail of
the provider.

**How it's held up:** The call-site shape holds. The sharp edges are
`for` + `await getX(id)` (each await flushes a one-id batch) and caching a
retryable vendor failure (clear the key). Not for Prisma — compose the join
(`INCLUDE`). Not for writes.

```ts
const product = await this.getProduct(id);
if (!product.success) return product;

await Promise.all(ids.map((id) => this.getProduct(id)));
```

## Artifacts

- [`on-the-provider.ts`](./on-the-provider.ts) — loader + `getProduct(id)`:
  batch `list`, `success(null)` → `not_found`, `clear` on `service_failed`.
- [`kick-off-then-wait.ts`](./kick-off-then-wait.ts) — `Promise.all` /
  `loadMany` vs `for await` vs `Map` then `get(id)!`.

## Where

One loader per key type, constructed on the singleton provider (Shopify
product, Stripe price). The batch fn dedupes ids, calls the vendor once,
maps back in **the same order DataLoader passed in**.

Per key: vendor `failure` (same result on every id in that batch) or
`success(value | null)`. `getX` maps `null` to `not_found`. Retryable
failure → `loader.clear(id)` so the next call hits the network.

`cacheMap: new ExpiringMap(ttl, { gcTime })` — catalog ~10m. Idle keys
must not keep the process alive (`unref` on the sweep).

## Not

Prisma: `INCLUDE` at the query. A DataLoader over `findMany` is a second
query planner.

Writes: a load cache is not a write-through store.

A hand-rolled `getProducts(ids): Map` is the split. Keep `getX(id)`.

## Status log

- 2026-09 ✅ Active — `getX(id)` on the provider; batch is the loader;
  kick off every load, then wait.
