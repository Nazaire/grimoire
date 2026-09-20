# Infra

The process and the bus. [`App`](./app) starts connections and picks a
role. A [`queue`](./queues) is a job this domain owns. An
[`event`](./events) is a fact other domains subscribe to.
[`Pub/sub`](./pub-sub) is the wiring — pg-boss in this process, Rabbit
when the consumer is another one.

## Topics

| Topic                | Status    |
| -------------------- | --------- |
| [app](./app)         | ✅ Active |
| [queues](./queues)   | ✅ Active |
| [events](./events)   | ✅ Active |
| [pub-sub](./pub-sub) | ✅ Active |
