---
status: Active
since: 2026-09
retired:
---

# Inversify

**What it is:** `new Container({ autobind: true })`. A service is
`@injectable('Singleton')` plus `@inject(Class)` on the constructor. The class
**is** the token. The composition root binds config and third-party clients
only — Stripe, Prisma, a `Symbol` when there is no class. Request sites
resolve from the graph they were given.

**Why it appealed:** A process-wide locator hid the graph. Import-time
resolution, tests that couldn't swap a collaborator, circulars that hit the
export before the container existed. Autobind made the composition root small
again: decorate the class, stop listing it.

**How it's held up:** Autobind is the durable bit. The friction is inheritance —
Inversify v7 does not apply ancestor `@inject` fields or `@preDestroy` unless
the concrete class adds `@injectFromHierarchy()`. Missing it, the field is
`undefined` and shutdown never runs.

```ts
@injectable('Singleton')
export class OrderService extends ServiceBase {
  constructor(
    @inject(PrismaClient) private readonly prisma: PrismaClient,
    @inject(OrderPaidEventService) private readonly orderPaid: OrderPaidEventService,
  ) {
    super();
  }
}
```

## Artifacts

- [`injectable-service.ts`](./injectable-service.ts) — autobind, class token,
  composition root for config / vendors / interface `Symbol`s.
- [`inject-from-hierarchy.ts`](./inject-from-hierarchy.ts) — subclass a base
  that injects or `@preDestroy`s; both decorators.

## Binding

`@injectable('Singleton')` **is** the binding. Do not
`c.bind(OrderService).toSelf()`. The composition root stays:

- `Config` (a `Symbol` — it's a plain object)
- third-party clients you do not decorate (`PrismaClient`, `Stripe`, `PgBoss`)
- interface tokens (`FileStorage`) when two impls share a contract
- `c.bind(Container).toConstantValue(c)` so `@inject(Container)` works

A facade that fans out (Stripe / Flex) is still a class: inject each impl,
register them in the constructor. That is not a `container.bind`.

## Resolving

Pick the site that matches the call:

1. `@inject(Class)` — constructors
2. `res.locals.container.get(...)` — Express
3. `context.container.get(...)` — oRPC ([rpc](../../api/rpc))
4. `@inject(Container)` — dynamic / composition

Unit tests `new` the class with stubs. They do not resolve the graph.

## Status log

- 2026-09 ✅ Active — autobind + class tokens. `injectFromHierarchy` on every
  subclass of an injecting / lifecycle base.
