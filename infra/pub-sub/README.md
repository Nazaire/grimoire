---
status: Active
since: 2026-09
retired:
---

# Pub/sub

**What it is:** A fact this domain just wrote. The publisher lives in
`events/` (`OrderPaidEventService extends PgBossPublisher`) — stable
`id` (`order.paid`), a Zod schema, `defaultSingletonKey` on the
aggregate. Other domains **subscribe**: their queue lists
`subscriptions`, start calls `boss.subscribe(event, queue)`, and
`publish` fans out with **one options bag**. They do not call the
writer's service. Rabbit is the other computer — a topic exchange for
protobuf, when the consumer is another process.

**Why it appealed:** After pay, orders called `payments.getQuote` and
cart called `orders.accept` and everyone knew checkout. `queue.send` to
each known worker meant the writer owned the graph. A named event
inverts it: new consumers add a queue and a subscription row. One bag
on publish is the cost — you do not get per-queue singleton keys.

**How it's held up:** In-process fan-out is pg-boss (`quote.paid` /
`order.placed`). At-least-once plus exclusive singleton on the id.
[Analytics](../../analytics/events) is a subscriber like any other
(`analytics.event` → PostHog). Rabbit is outbound (Knock, other
services) and reconnects *inside* the connection, not by calling
`App.start` again. The friction is using Rabbit for `quote.paid` inside
this monolith, `send`ing to every subscriber by hand, or putting
persist in the subscriber (a second domain layer).

```ts
await this.quotePaid.publish({ id, paidAt }, { tx });

get subscriptions() {
  return [this.orderPaid];
}
```

## Artifacts

- [`order-paid-event.ts`](./order-paid-event.ts) — publisher, schema,
  singleton key; calling the writer's service as the seam.
- [`subscriptions.ts`](./subscriptions.ts) — queue lists the publisher;
  one bag on publish; Rabbit for in-process fan-out as the seam.

## Where

`events/<aggregate>-<fact>-event.ts` in the domain that owns the write.
The reacting queue lives in the *subscriber's* domain. Settlement of
that queue is [workers](../workers).

Publish in the same Prisma tx as the row. After the tx returns, the
worker can run against uncommitted state — or run after a rollback. Do
not rename `id`. A new name orphans existing `subscription` rows.

## Two buses

| Bus     | Consumer                          | Payload                          |
| ------- | --------------------------------- | -------------------------------- |
| pg-boss | a `PgBossWorker` in this process  | JSON, parsed by the queue schema |
| Rabbit  | another process                   | protobuf on the `events` topic   |

pg-boss `notify` still applies — publish should wake subscribers, not
wait for the poll. [Lifecycle](../lifecycle) starts both connections because HTTP
publishes.

## Status log

- 2026-09 ✅ Active — a domain event *is* pub/sub. pg-boss in this
  process; Rabbit when the consumer is another one. One options bag on
  publish.
