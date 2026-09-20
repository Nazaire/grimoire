---
status: Active
since: 2026-09
retired:
---

# Schemas

**What it is:** A DTO is the **audience wire contract** — the Zod schema a
client generates from. It lives in `*-schemas.ts` next to that audience's
router. `toXDto` / `.parse` at the handler is how a domain value becomes
bytes. Branded ids come from `*-refs.ts`. The aggregate (`toQuote`) lives
in queries. Services never take or return a DTO.

**Why it appealed:** One `Order` type on the service, the Prisma payload,
and `/rpc` meant `failedReason` shipped to the app the day ops needed it.
`.omit().extend()` looked like reuse and leaked the next field the same
way. A DTO is a published contract per audience, not a projection of the
domain object.

**How it's held up:** `.pick` embeds hold — that is a reference, not a
dependency. The friction is treating the fatter schema as canonical and
hiding fields. User DTOs that import ops (`failedReason`) are one field
from the app. `toOrderDto` inside a service pins the write to today's
wire. Old app builds keep calling the previous shape: dual-read, don't
"fix" a field another client still parses.

```ts
export const userOrderDtoSchema = orderDtoSchema.pick({
  id: true,
  status: true,
  total: true,
});

return { status: 200 as const, body: { order: toUserOrderDto(row) } };
```

## Artifacts

- [`order-schemas.ts`](./order-schemas.ts) — user `.pick` embed, `toXDto`
  at the edge, input DTO; `.omit().extend()`, ops on `/rpc`, and a service
  that returns a DTO as the seam.

## What a DTO is

Named `*DtoSchema` / `toXDto`. Zod that OpenAPI and the client SDK are
generated from. Input DTOs (`payOrderInputDtoSchema`) and output DTOs
(`userOrderDtoSchema`) are both this. They are not:

- the aggregate — `toQuote` / `toOrder` in `*-queries.ts`
- a branded id — `quoteIdSchema` → `QuoteId` in `*-refs.ts`
- a Prisma payload
- a service argument or return

## Where

| Place                                      | DTO?                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| Handler `.input` / `.output`               | Yes. This *is* the contract.                                 |
| `toXDto` / `*DtoSchema.parse`              | Yes. Handler, or the schema file it calls.                   |
| Other domain embed                         | `.pick` only. That is a reference.                           |
| Same-audience ops/admin embed              | `.pick`. Reference.                                          |
| Service / use case / worker                | No. Query types and branded ids.                             |
| `*-queries.ts`                             | No. `toQuote` is the aggregate.                              |
| `*-refs.ts`                                | No. The id, not the wire object.                             |

Parse at the edge. The handler calls `toUserOrderDto` / `toOrderDto`. The
service returns the query type.

User `*-schemas.ts` is published (`/rpc`). Ops and admin stay with their
audience — user DTOs do not import them. Reuse branded ids from
`*-refs.ts`.

`.pick` is an embed. `.omit` / `.omit().extend()` is not — a new field on
the source ships to the other audience until someone remembers to omit
it. `.pick().extend({ ... })` may add fields that **belong to this
audience** (user `lines`, `documents`). It is not a way to hide ops
internals.

## Wire compatibility

Old app builds and mixed pods keep calling the previous shape.

Compatible: new output field; new optional input; new procedure; wider
input.

Breaking: remove/rename a field, path, or procedure; new required input;
change a type; narrow an enum; change which error codes a client
switches on.

Deprecate, then remove: add the replacement, keep the old, mark it in
OpenAPI, dual-read until clients move. Do not “fix” a DTO by dropping a
field another client still parses.

## Status log

- 2026-09 ✅ Active — DTO is the audience wire contract; `.pick` to embed;
  parse at the edge; services never see it.
