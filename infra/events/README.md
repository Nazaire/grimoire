---
status: Active
since: 2026-09
retired:
---

# Events

**What it is:** A fact this domain just wrote. Lives in `events/`.
`QuotePaidEventService extends PgBossPublisher` — stable `id`
(`quote.paid`), a Zod schema, `defaultSingletonKey` on the aggregate.
This domain **publishes** with `{ tx }`; other domains **subscribe**.
They do not call the writer's service to handle the write.

**Why it appealed:** After pay, orders called `payments.getQuote` and
cart called `orders.accept` and everyone knew checkout. The writer
became a read API. A named event is the seam: subscribers bring their
own queue, their own `work()`, their own budget.

**How it's held up:** `quote.paid` / `order.placed` hold — at-least-once
plus exclusive singleton on the id. The sharp edge is treating publish
as `send` to the one worker you know about, or putting persist in the
subscriber (that's a second domain layer). [Analytics](../../analytics/events)
is a subscriber like any other (`analytics.event` → PostHog). It is not
a different bus.

```ts
await this.quotePaid.publish({ id, paidAt }, { tx });
```

## Artifacts

- [`order-paid-event.ts`](./order-paid-event.ts) — publisher, schema,
  singleton key; calling the writer's service from another domain as
  the seam.

## Where

`events/<aggregate>-<fact>-event.ts` in the domain that owns the write.
The queue that reacts lives in the *subscriber's* domain and lists the
publisher in `subscriptions` — [pub-sub](../pub-sub). Settlement of that
queue is [queues](../queues).

Publish in the same Prisma tx as the row. After the tx returns, the
worker can run against uncommitted state — or run after a rollback.

Do not rename `id`. A new name orphans existing `subscription` rows.

## Status log

- 2026-09 ✅ Active — this domain publishes; other domains subscribe.
  Not a call into the writer's service.
