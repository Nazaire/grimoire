---
name: pgboss
description: PgBoss queues, workers, and event publishers. Use when adding or changing a queue, worker, event publisher, job payload schema, or enqueue/publish.
---

# PgBoss

Index `payments` / `orders` workers. Use `PgBossWorker` + `PgBossQueue`, not `BasePgBossWorkerService`. Infra: `packages/server/src/infra/pgboss`.

Enqueue in the same Prisma tx is **not** a vendor hop — it is another row in that write. The worker is the next edge (see architecture). Do not use a job chain to nest IO the request was not allowed to nest.

## Queue

`PgBossQueue` or `PgBossQueueWithDLQ`. `static id` / `deadLetterId` via `pgBossQueueId`. Zod `schema`.

- **Exclusive** + `defaultSingletonKey` for at-least-once dedupe (one job per quote/order id)
- `notify: true` — enqueue wakes the worker; do not wait for the next poll
- Retry / expire / heartbeat on the queue class
- **Enqueue in the same Prisma tx** as the write: `queue.send(data, { tx })` / `publisher.publish(data, { tx })` (`db: fromPrisma(tx)`). Job and row commit or roll back together. Do not `send` after the tx if the worker could run on uncommitted state.

## Schema

Parsed **on consume**, not on send. Payloads are JSON — Dates come back as strings (`z.coerce.date()`).

Changes must accept **in-flight jobs** from older pods. New required fields, renamed keys, or narrowed unions parse-fail on mixed deploys and **dead-letter** those jobs. Additive / optional fields, or a union of old and new shapes, until rollout finishes. Same for event subscriptions.

## Worker

`PgBossWorker<Queue, Result>`. `@injectable('Singleton')` + `@injectFromHierarchy()`. Implement `work(job)`.

- Orchestrate; call services. Do not become a second domain layer.
- `success` → complete
- `failure` → **no retry**, dead-letter (expected / poison)
- `throw` → **retry** (or final fail). Same as application-style: throw if *this* worker is wrong; pass `{ cause }` when wrapping
- `job.log` for progress. Errors at `PgBossWorker` (`pgboss-worker.ts`) — see error-logging

```typescript
protected async work(job: Job<QuotePaidEvent>) {
  const result = await this.orders.acceptOrder(job.data.id);
  if (!result.success) {
    switch (result.error.code) {
      case 'order_already_accepted':
        return success({ outcome: 'already_accepted' });
      case 'order_not_found':
        return failure(result.error);
      default:
        assertNever(result.error);
    }
  }
  return success({ outcome: 'accepted' });
}
```

Register the class in that module's `*-workers.ts` (`CartWorkers`, `PaymentsWorkers`, …). Infra `Workers` composes those groups — do not add the worker to `infra/workers.ts`.

Examples: `QuotePaidQueue` / `QuotePaidWorker`, `AcceptOrderQueue`, `QuotePaidEventService`.

## Events

`PgBossPublisher` in `events/` (`quote.paid`). The queue lists `subscriptions`. Publish from the service with `{ tx }` when the write is transactional. Subscribers treat as at-least-once; exclusive key dedupes.
