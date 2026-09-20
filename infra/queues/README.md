---
status: Active
since: 2026-09
retired:
---

# Queues

**What it is:** `PgBossQueue` + `PgBossWorker`. A queue is a class with a
stable id, a Zod schema, and retry/expire/notify settings. The worker
implements `work(job)` and returns a [`Result`](../../typescript/result).
`queue.send(data, { tx })` when **this** domain owns the write *and* the
follow-up. A fact other domains should react to is an
[event](../events), not a send.

**Why it appealed:** A string queue name plus a throw-to-fail handler hid
the contract. The queue class is the settings; `work`'s `Result` is the
settlement. I can see from the return whether this job completes,
dead-letters, or retries — the same three-exit discipline as
[coded-error](../../typescript/coded-error), pointed at a job instead of
a caller.

**How it's held up:** Exclusive queues plus `defaultSingletonKey` (one
job per order/quote id) make at-least-once tolerable. The sharp edges are
schema compatibility on mixed deploys, and workers that grow into a
second domain layer. `BasePgBossWorkerService` is the old form — queue
and worker in one service, `getPgBoss()`, throw-to-fail. New work is
`PgBossWorker` + `PgBossQueue`.

```ts
protected async work(job: Job<AcceptOrderJob>) {
  const result = await this.orders.accept(job.data.id);
  if (!result.success) {
    switch (result.error.code) {
      case 'order_already_accepted':
        return success({ outcome: 'already_accepted' }); // complete — idempotent
      case 'order_not_found':
        return failure(result.error);                    // dead-letter — poison
      default:
        assertNever(result.error.code);
    }
  }
  return success({ outcome: 'accepted' });
}
```

## Artifacts

- [`defining-a-queue.ts`](./defining-a-queue.ts) — exclusive + DLQ, a
  cron tick, a direct-send queue.
- [`defining-a-worker.ts`](./defining-a-worker.ts) — `work` settlement,
  cron that fan-outs, registering the class on the module's `*Workers`.
- [`enqueue-in-the-write.ts`](./enqueue-in-the-write.ts) — persist and
  `send` in the same Prisma tx; the worker is the next edge.

## Settlement

`PgBossWorker` is the logging boundary. `work()` returns `Result`:

| Return | Job | When |
| --- | --- | --- |
| `success(data)` | complete (`output` = data) | done, including idempotent already-done |
| `failure(error)` | **no retry**, dead-letter | expected / poison — do not keep hitting it |
| **throw** | retry (final attempt → failed) | *this* worker is wrong, or a transient it should absorb |

Same heuristic as coded-error: throw if *my* code is wrong or the vendor
is down; return `failure` if the job itself is bad. `job.log` is
progress. Do not `job.log.error` then return the same error — the base
logs `Job failed` / `Job exception` with `{ error }`.

Payload parse runs **on consume**, not on send. Invalid JSON →
`ValidationError` → dead-letter, no `work` call. Dates round-trip as
strings (`z.coerce.date()`).

## Queue

`PgBossQueue` or `PgBossQueueWithDLQ`. `static id` / `deadLetterId` via
`pgBossQueueId`. Zod `schema` on the class.

- **Exclusive** + `defaultSingletonKey` — at-least-once dedupe (one job
  per aggregate id).
- `notify: true` — enqueue wakes the worker. Do not wait for the next
  poll.
- Retry / expire / heartbeat are getters on the queue. Pick them; pg-boss
  defaults are not a choice.
- **Do not rename `id`.** A new name is a new queue; in-flight jobs,
  singletons, and DLQ wiring stay on the old one.

Schema changes must accept **in-flight jobs** from older pods. New
required fields, renamed keys, or narrowed unions parse-fail on mixed
deploys and dead-letter those jobs. Additive / optional fields, or a
union of old and new shapes, until rollout finishes.

Cron (`schedules` on the queue) is a best-effort wake-up. Correctness
lives in idempotent handlers / "what's due?" state — not in fire time.
No DLQ on the tick; the next schedule covers a miss.

Enqueue in the same Prisma tx is **not** a vendor hop — it is another
row in that write. The worker is the next edge. Service classes stay
thin: one persist, at most one vendor hop, then `send` with `{ tx }`.
Do not use a job chain to nest IO the request was not allowed to nest.

Fan-out to other domains is [events](../events) over
[pub-sub](../pub-sub), not a second `send` you remembered to add.

## Worker

`PgBossWorker<Queue, Result>`. `@injectable('Singleton')` +
`@injectFromHierarchy()`. Implement `work(job)`.

- Orchestrate; call services. Do not become a second domain layer.
- `workers` / `workerConcurrency` / `pollingIntervalSeconds` are
  deliberate. pg-boss defaults to 1 / 1 / 2.
- Register the class in that module's `*-workers.ts` (`OrdersWorkers`,
  …). Infra `Workers` composes those groups — see [app](../app).

## Status log

- 2026-09 ✅ Active — `PgBossWorker` + `PgBossQueue`. Settlement is
  `Result`. `send` rides the write's transaction. Events and pub/sub
  are sibling topics under infra.
