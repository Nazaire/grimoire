---
status: Active
since: 2026-09
retired:
---

# RPC

**What it is:** Always oRPC. Mount on an **audience** tree — user `/rpc`,
admin `/rpc-admin`, ops `/rpc-ops`. A handler is thin: `context.container.get`,
then a query + `toX` / DTO `.parse`, or a service write. The wire type is a
[DTO](../schemas). Services never take or return it.

**Why it appealed:** Express routes mixed auth, Prisma, and HTTP status in one
function. The error the app switched on was a string message. oRPC puts the
contract in Zod (`input` / `output` / `.errors()`), and `throw
errors.NOT_FOUND({ cause })` keeps the [`CodedError`](../../typescript/coded-error)
on `cause` so the [logger](../../observability/logger) interceptor walks it.

**How it's held up:** Audience trees hold. The friction is the map from domain
code to HTTP: a `default: throw errors.INTERNAL_SERVER_ERROR` compiles when a
new code appears and swallows it as 500. Exhaustive `switch` +
`assertNever(result.error.code)` is the same discipline as coded-error, at the
edge.

```ts
.handler(async ({ input, context, errors }) => {
  const result = await context.container.get(OrderService).pay(
    input.params.orderId,
    input.body.paymentMethodId,
  );
  if (!result.success) {
    switch (result.error.code) {
      case 'order_not_found':
        throw errors.NOT_FOUND({ cause: result.error });
      default:
        assertNever(result.error.code);
    }
  }
  return { status: 200 as const, body: { order: toUserOrderDto(result.data) } };
})
```

## Artifacts

- [`thin-handler.ts`](./thin-handler.ts) — a read (query + DTO), a write
  (service + exhaustive map), `cause` on the throw.

## Audience

Never put admin or ops on user `/rpc`. Clients generate from that tree's
OpenAPI. Schema files live with the audience — see [schemas](../schemas).

| Audience | Prefix       | Router                   | Schemas                        |
| -------- | ------------ | ------------------------ | ------------------------------ |
| User     | `/rpc`       | `orpc.<domain>.ts`       | `<aggregate>-schemas.ts`       |
| Admin    | `/rpc-admin` | `orpc.<domain>-admin.ts` | `<aggregate>-admin-schemas.ts` |
| Ops      | `/rpc-ops`   | `orpc.<domain>-ops.ts`   | `<aggregate>-ops-schemas.ts`   |

## Mapping codes

`.errors({ NOT_FOUND: {}, CONFLICT: {} })` is the set you may throw. Each
domain `CodedError` code takes one HTTP status — same heuristic as coded-error
(caller's problem → 4xx; this layer is wrong → throw / 500).

Always pass `{ cause: result.error }`. Message is optional copy for the client.
`data` is typed extra on that error (cart issues on `BAD_REQUEST`), not a place
to dump the domain object.

The interceptor logs once: ≤4xx `warn`, 5xx `error`. Do not `context.log.error`
then throw.

## Status log

- 2026-09 ✅ Active — audience trees, thin handlers, `errors.X({ cause })`.
  Exhaustive code maps at the edge; interceptor is the log. DTOs live under
  [schemas](../schemas).
