---
status: Active
since: 2026-09
retired:
---

# DataLoader

**What it is:** One loader per remote key, on the **provider**. `getX(id)`
`load`s; the batch fn makes one vendor `list({ ids })` and returns results
**in input-id order**. Missing → `success(null)`, mapped to `not_found` in
`getX`. Concurrent `load`s reuse the in-flight promise. **`cache: false`**
— this tick only. Remembering across ticks is a cache, and a cache is a
different topic.

**Why it appealed:** I used to collect ids, `list`, stuff a `Map`, then
`byId.get(id)!`. TypeScript dropped the pairing — see
[inference](../../typescript/inference). `getX(id)` stays procedural and
infers a single `Result`. The network call is an implementation detail of
the provider.

**How it's held up:** The call-site shape holds. Batching is enough almost
always — FHIR loaders stay `cache: false` on a singleton. The sharp edges
are `for` + `await getX(id)` (each await flushes a one-id batch) and
turning cache on because the loader is already there. DataLoader's default
`Map` never expires; a singleton then pins the pod. Catalog ~10m with
[`ExpiringMap`](../expiring-map) is the exception we accepted, not the
starting point. Not for Prisma — compose the join (`INCLUDE`). Not for
writes.

```ts
const product = await this.getProduct(id);
if (!product.success) return product;

await Promise.all(ids.map((id) => this.getProduct(id)));
```

## Artifacts

- [`on-the-provider.ts`](./on-the-provider.ts) — loader + `getProduct(id)`:
  `cache: false`, batch `list`, `success(null)` → `not_found`. Catalog TTL
  is the opt-in.
- [`kick-off-then-wait.ts`](./kick-off-then-wait.ts) — `Promise.all` /
  `loadMany` vs `for await` vs `Map` then `get(id)!`.

## Where

One loader per key type, constructed on the singleton provider (Shopify
product, Stripe price, Medplum patient). The batch fn dedupes ids, calls
the vendor once, maps back in **the same order DataLoader passed in**.

Per key: vendor `failure` (same result on every id in that batch) or
`success(value | null)`. `getX` maps `null` to `not_found`.

`cache: false` is the default on a singleton. The loader still coalesces
concurrent `load`s in the same tick; it does not remember after. Turning
cache on (or omitting `cache: false` — the library defaults to an
unbounded `Map`) is opting into [expiring-map](../expiring-map): client,
key, getter, short TTL. Then `loader.clear(id)` on retryable failure, or
the next `getX` serves the blip.

## Not

A cache. Batching is the job. If the next request must see a write, there
is nothing to expire.

Prisma: `INCLUDE` at the query. A DataLoader over `findMany` is a second
query planner.

Writes: a load cache is not a write-through store.

A hand-rolled `getProducts(ids): Map` is the split. Keep `getX(id)`.

## Status log

- 2026-09 ✅ Active — `getX(id)` on the provider; batch is the loader;
  `cache: false` unless catalog TTL is a measured need.
