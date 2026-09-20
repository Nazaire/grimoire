---
status: Active
since: 2026-09
retired:
---

# RPC

**What it is:** Always oRPC. Mount on an **audience** tree — user `/rpc`,
admin `/rpc-admin`, ops `/rpc-ops`. A handler is thin: `context.container.get`,
then a query + `toX` / DTO `.parse`, or a service write. The wire type is the
DTO (`*-schemas.ts`). Services never take or return it.

**Why it appealed:** Express routes mixed auth, Prisma, and HTTP status in one
function. The error the app switched on was a string message. oRPC puts the
contract in Zod (`input` / `output` / `.errors()`), and `throw
errors.NOT_FOUND({ cause })` keeps the [`CodedError`](../../typescript/coded-error)
on `cause` so the [logger](../../observability/logger) interceptor walks it.

**How it's held up:** Audience trees hold. The friction is the map from domain
code to HTTP: a `default: throw errors.INTERNAL_SERVER_ERROR` compiles when a
new code appears and swallows it as 500. Exhaustive `switch` +
`assertNever(result.error.code)` is the same discipline as coded-error, at the
edge. DTOs that `.omit().extend()` a foreign schema look like reuse and leak
fields the other audience never meant to publish.

```ts
.handler(async ({ input, context, errors }) => {
  const result = await context.container.get(OrderService).pay(input.params.orderId, input.body);
  if (!result.success) {
    switch (result.error.code) {
      case 'order_not_found':
        throw errors.NOT_FOUND({ cause: result.error });
      default:
        assertNever(result.error.code);
    }
  }
  return { status: 200 as const, body: { order: userOrderDtoSchema.parse(toUserOrder(result.data)) } };
})
```

## Artifacts

- [`thin-handler.ts`](./thin-handler.ts) — a read (query + DTO), a write
  (service + exhaustive map), `cause` on the throw.
- [`audience-dtos.ts`](./audience-dtos.ts) — user `.pick` embed vs ops-only
  fields; `.omit().extend()` as a seam.
- [`ops-envelope.ts`](./ops-envelope.ts) — `{ item }` / `{ items, nextCursor }`,
  named path params, filters as sibling query keys.

## Audience

Never put admin or ops on user `/rpc`. Clients generate from that tree's
OpenAPI.

| Audience | Prefix       | Router                   | Schemas                        |
| -------- | ------------ | ------------------------ | ------------------------------ |
| User     | `/rpc`       | `orpc.<domain>.ts`       | `<aggregate>-schemas.ts`       |
| Admin    | `/rpc-admin` | `orpc.<domain>-admin.ts` | `<aggregate>-admin-schemas.ts` |
| Ops      | `/rpc-ops`   | `orpc.<domain>-ops.ts`   | `<aggregate>-ops-schemas.ts`   |

User schemas are published. Other domains may embed them with `.pick` — that is
a reference. `.omit` / `.omit().extend()` is not an embed. Ops and admin stay
with their audience; user DTOs do not import them (`failedReason` must not leak
to the app). Reuse branded ids from `*-refs.ts`.

Parse at the edge. `toOrderDto` / `orderDtoSchema.parse` is the handler's job,
not the service's.

## Mapping codes

`.errors({ NOT_FOUND: {}, CONFLICT: {} })` is the set you may throw. Each
domain `CodedError` code takes one HTTP status — same heuristic as coded-error
(caller's problem → 4xx; this layer is wrong → throw / 500).

Always pass `{ cause: result.error }`. Message is optional copy for the client.
`data` is typed extra on that error (cart issues on `BAD_REQUEST`), not a place
to dump the domain object.

The interceptor logs once: ≤4xx `warn`, 5xx `error`. Do not `context.log.error`
then throw.

## Wire compatibility

Old app builds and mixed pods keep calling the previous shape.

Compatible: new output field; new optional input; new procedure; wider input.

Breaking: remove/rename a field, path, or procedure; new required input;
change a type; narrow an enum; change which error codes a client switches on.

Deprecate, then remove: add the replacement, keep the old, mark it in OpenAPI,
dual-read until clients move.

## Ops collections

Ops-ui binds tables to a shared envelope. List / retrieve / count — not a
generic `/r` resource API. Path params are named after the resource
(`{orderId}`), never `{id}`. Retrieve body is always `{ item }`. List body is
always `{ items, nextCursor }` (`null` = last page). Filters are sibling query
keys (DTO field = Prisma column), not a nested `filters` bag.

## Status log

- 2026-09 ✅ Active — audience trees, thin handlers, `errors.X({ cause })`.
  Exhaustive code maps at the edge; interceptor is the log.
