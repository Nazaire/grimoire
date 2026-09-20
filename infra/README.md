# Infra

The process and the bus. [`Lifecycle`](./lifecycle) starts connections
and picks a role. [`DI`](./di) is the graph those constructors resolve.
A [`worker`](./workers) is a job this domain owns.
[`Pub/sub`](./pub-sub) is a fact other domains subscribe to — pg-boss in
this process, Rabbit when the consumer is another one.

## Topics

| Topic                    | Status    |
| ------------------------ | --------- |
| [lifecycle](./lifecycle) | ✅ Active |
| [di](./di)               | ✅ Active |
| [workers](./workers)     | ✅ Active |
| [pub-sub](./pub-sub)     | ✅ Active |
