---
status: Active
since: 2026-09
retired:
---

# Pub/sub

**What it is:** How an [event](../events) reaches queues. In this
process, that is pg-boss: the subscriber's queue lists `subscriptions`,
start calls `boss.subscribe(event, queue)`, and `publish` sends to every
row with **one options bag** (`singletonKey`, priority, `startAfter`).
Rabbit is the other computer — a topic exchange for protobuf, when the
consumer is another process.

**Why it appealed:** `queue.send` to each known worker meant the writer
knew the graph. Subscribe is inverted: new consumers add a queue and a
subscription row, they do not patch the publisher. One bag on publish is
the cost — you do not get per-queue singleton keys.

**How it's held up:** In-process fan-out is pg-boss. Rabbit is outbound
(Knock, other services) and reconnects *inside* the connection, not by
calling `App.start` again. The friction is using Rabbit for `quote.paid`
inside this monolith, or `send`ing to every subscriber by hand so you
can pass different options. Schema compatibility is the same as queues:
mixed pods, additive fields, do not rename the event id.

```ts
get subscriptions() {
  return [this.orderPaid];
}
```

## Artifacts

- [`subscriptions.ts`](./subscriptions.ts) — queue lists the publisher;
  one bag on publish; Rabbit for in-process fan-out as the seam.

## Two buses

| Bus | Consumer | Payload |
| --- | --- | --- |
| pg-boss | a `PgBossWorker` in this process | JSON, parsed by the queue schema |
| Rabbit | another process | protobuf on the `events` topic |

pg-boss `notify` still applies — publish should wake subscribers, not
wait for the poll. [App](../app) starts both connections because HTTP
publishes.

## Status log

- 2026-09 ✅ Active — pg-boss subscribe for in-process fan-out; Rabbit
  when the consumer is another process. One options bag on publish.
