---
name: dataloader
description: DataLoader for batched remote reads. Use when loading the same remote id from many places, adding a catalog or provider getX(id), or looping vendor reads.
---

# DataLoader

Use when the same **remote id** is loaded from many places (or in a loop) and you want the call site to stay `getX(id)`. That keeps the method procedural and the type a `Result` — no collect-into-`Map` then `get(id)!`. TS infers a single `Result`; no hand-rolled batch types.

The loader batches ids into one network call, **reuses in-flight promises** across concurrent `load`s, and caches via `ExpiringMap` (`packages/core/src/expiring-map.ts` as DataLoader `cacheMap`).

Not for Prisma. Compose joins at the query (`INCLUDE`). Not for writes.

## Shape

- One loader per key type, on the **provider** (singleton)
- Batch fn: vendor `ids: { in }` / `list({ ids })`; return **in input-id order**
- Per key: `success(value | null)` or the vendor `failure` — map `null` to `not_found` in `getX`
- `cacheMap: new ExpiringMap(ttl, { gcTime })` (catalog loaders, ~10m)
- `clear(id)` on retryable vendor failure

```typescript
this.loader = new DataLoader(
  async (ids) => {
    const fetched = await this.vendor.list({ ids: [...new Set(ids)] });
    if (!fetched.success) return ids.map(() => fetched);
    const byId = new Map(fetched.data.map((row) => [row.id, row]));
    return ids.map((id) => success(byId.get(id) ?? null));
  },
  { name: '…-loader', maxBatchSize: 100, cacheMap: new ExpiringMap(10 * 60_000, { gcTime: 10 * 60_000 }) },
);
```

`for` + `await getX(id)` **breaks batching** — each `await` flushes a one-id batch. Kick off every `load` first, then wait: `Promise.all(ids.map((id) => this.getX(id)))` or `loader.loadMany(ids)`.

Examples: `FulfillmentCatalogCmsProvider`, `ProductShopifyProvider`, Stripe/Flex price loaders.
