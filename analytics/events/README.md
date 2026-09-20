---
status: Active
since: 2026-09
retired:
---

# Events

**What it is:** Analytics is a domain event. The HTTP edge stamps
attribution onto the aggregate (`getAnalyticsContext` from the request).
The write publishes `analytics.event` on the same Prisma tx — `occurred_at`
is the fact's timestamp, `idempotencyKey` is `order:{id}:ORDER_PAID`. A
queue **subscribes**; live vs historical is job **priority** from how old
that timestamp is, not two queue ids.

**Why it appealed:** `posthog.capture` in the service made the request wait
on a vendor, double-fired on retry, and lost the anonymous id that only
existed on the incoming request. Publishing in the write is the same
discipline as [queues](../../pgboss/queues): the job is another row in that
transaction. Delivery can fail and retry without redoing the order.

**How it's held up:** Context-at-the-edge holds — if you don't stamp it on
create, checkout cannot invent a session id later. The sharp edges are
`occurred_at` (using `Date.now()` on publish turns a backfill into "live")
and `idempotencyKey` (a random uuid double-fires PostHog). No `distinctId`
means skip, not a synthetic person.

```ts
await this.analyticsEvent.publish(event, { tx });
```

## Artifacts

- [`context-at-the-edge.ts`](./context-at-the-edge.ts) — stamp request
  context onto the aggregate; `distinctId` is user or anonymous.
- [`publish-in-the-write.ts`](./publish-in-the-write.ts) — persist, map the
  fact to an event, publish on the same tx.
- [`subscriber-priority.ts`](./subscriber-priority.ts) — one queue, two
  workers; priority from `occurred_at` age.

## Context

The request is the only place that has cookies, IP, and the PostHog
anonymous id. Fold that into `metadata` at the handler. Later writes read
it back with `getAnalyticsContext({ metadata })` — they do not see a
request.

`distinctId` = `userId` or `posthogDistinctId`. Missing both → do not
publish. Do not mint an id in the worker.

## The event

| Field            | Meaning                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `event`          | the fact (`ORDER_PAID`)                                               |
| `occurred_at`    | when it happened on the row (`paidAt`), not publish time              |
| `idempotencyKey` | stable (`order:{id}:ORDER_PAID`) — queue singleton **and** capture id |
| `distinctId`     | who                                                                   |

Retries are at-least-once. The key is how they do not become two people in
PostHog.

## Delivery

`AnalyticsEventService` publishes; `PosthogEventQueue` subscribes. Age of
`occurred_at` > 7 days → historical priority, else live. Two workers claim
from **one** queue (`minPriority` / `maxPriority`). Capture happens there.
Settlement is [queues](../../pgboss/queues) — `success` after capture.

## Status log

- 2026-09 ✅ Active — event on the write, context from the request,
  priority not a second queue.
