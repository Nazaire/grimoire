---
status: Active
since: 2026-09
retired:
---

# App

**What it is:** `App extends Lifecycle`. Constructed at boot —
`new App(container)` — not an injectable. `doStart` / `doStop` are the
composition — migrate, then shared connections, then HTTP and/or workers
according to `processRole` (`server`, `worker`, or both). A module owns a
`*Workers` group; infra `Workers` is just those groups. Adding a job is
registering the class on the module, not on `App`.

**Why it appealed:** One process mixed listen, consume, and reconnect in
`index.ts`. Start failed halfway and left Redis open. A worker lived as a
side-effect import. The shell is one-shot and abort-linked; the tree is
explicit; the role is a list on config, not a second binary.

**How it's held up:** Roles hold — HTTP publishes jobs, so Redis / Rabbit /
PgBoss start for both. The friction is the tree: a new `PgBossWorker` that
never lands on that module's `*Workers` never starts. Stop is the reverse of
start, then `container.unbindAll()` so `onDeactivation` flushes pools. Unbind
first and in-flight HTTP loses Prisma.

```ts
await Promise.all([
  ...(this.isServer ? [this.httpServer.start(HTTP_STOP_GRACE_MS, signal)] : []),
  ...(this.isWorker ? [this.workers.start(WORKERS_STOP_GRACE_MS, signal)] : []),
]);
```

## Artifacts

- [`start-stop.ts`](./start-stop.ts) — a leaf `Lifecycle`: `doStart` /
  `doStop`, the abort signal into every child, one-shot (not reconnect).
- [`app.ts`](./app.ts) — `App` composition, `processRole`, stop reverses
  start then unbinds.
- [`module-workers.ts`](./module-workers.ts) — the domain's `*Workers` group;
  infra `Workers` composes groups, not individual workers.

## The shell

`start(stopGraceMs, signal?)` is single-flight. If `doStart` throws, `stop`
runs with that same budget, then the error rethrows. `stop` aborts first so
in-flight children see `signal.aborted`. Composition is yours —
`Promise.all` siblings, `await` layers.

Pass `signal` into every `child.start(grace, signal)`. A start that ignores
it keeps going after App has given up.

Lifecycle is **boot and shutdown**, not reconnect. Redis reconnects inside
ioredis; do not call `start()` again.

## Roles

`processRole`: `server` | `worker` | both (the default).

| Role           | Starts                                              |
| -------------- | --------------------------------------------------- |
| both (default) | migrate/seed, Redis, Rabbit, PgBoss, HTTP, workers  |
| `server`       | same shared infra + HTTP — no `Workers.start`       |
| `worker`       | same shared infra + workers — no `HttpServer.start` |

Shared infra is shared because HTTP **publishes**. A server-only pod still
starts PgBoss so `queue.send` / `publisher.publish` work. Consume is the
worker role.

## The workers tree

```
App
└── Workers                 // infra — one constructor, the domain groups
    ├── OrdersWorkers
    ├── PaymentsWorkers
    └── CartWorkers
            └── CartAbandonWorker   // PgBossWorker — work() is pgboss
```

A new worker: the class, then that module's `*-workers.ts`. Do not add it to
`infra/workers.ts`. Settlement (`success` / `failure` / throw) lives in
[queues](../../pgboss/queues). This topic is who **starts**.

`@injectable('Singleton')` + `@injectFromHierarchy()` on every
`Lifecycle` subclass — see [inversify](../../di/inversify).

## Status log

- 2026-09 ✅ Active — App is the tree; roles pick HTTP vs consume; modules
  own `*Workers`.
