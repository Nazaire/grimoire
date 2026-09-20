# Infra

The process and the bus. [`App`](./app) starts connections and picks a
role. [`DI`](./di) is the graph those constructors resolve. A
[`queue`](./queues) is a job this domain owns. [`Pub/sub`](./pub-sub) is
a fact other domains subscribe to — pg-boss in this process, Rabbit when
the consumer is another one.

## Topics

| Topic                | Status    |
| -------------------- | --------- |
| [app](./app)         | ✅ Active |
| [di](./di)           | ✅ Active |
| [queues](./queues)   | ✅ Active |
| [pub-sub](./pub-sub) | ✅ Active |
