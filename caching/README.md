# Caching

Don't, until you have to. Concurrent `getX(id)` is a
[`DataLoader`](./dataloader) with `cache: false` — one vendor round-trip
this tick, then forget. A cache is a second decision: **client, key,
getter, short lifetime**, in process
([`ExpiringMap`](./expiring-map)). Redis is the rare case that has to
survive the pod. Stale reads, pinned outages, and the wrong identity are
what you buy the moment a key lives past the batch.

## Topics

| Topic                          | Status    |
| ------------------------------ | --------- |
| [dataloader](./dataloader)     | ✅ Active |
| [expiring-map](./expiring-map) | ✅ Active |
