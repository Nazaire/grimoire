---
status: Active
since: 2026-09
retired:
---

# Inference

**What it is:** Business logic does not declare a contract. A service method
has no return type — `success` / `failureCode` already make a
[`Result`](../result), and the error union stays a set of literals. An
`interface` exists only when **two implementations** must conform to the
same shape (Stripe and Flex, CMS and Shopify). One class is not a contract.

**Why it appealed:** `IOrderService` looked like architecture. It collapsed
every code into `CodedError` (or `CodedError<string>`), so `switch` stopped
narrowing, and a new `failureCode` compiled without a caller noticing. The
class **is** the type. Callers import `OrderService`, not a protocol I
invented in front of it.

**How it's held up:** Inference is the durable bit — same rule as Result.
The friction is reaching for `interface` the moment a second caller appears.
A second _caller_ still infers. A second _implementation_ (two vendors
behind a facade) is the exception: write the interface, implementers inherit
the signature, do not repeat the return type on the class.

```ts
async markPaid(orderId: string) {
  if (!row) return failureCode('order_not_found');
  if (row.paidAt) return failureCode('order_already_paid');
  return success(row); // inferred — no Promise<Result<Order, CodedError>>
}
```

## Artifacts

- [`let-it-infer.ts`](./let-it-infer.ts) — a service with no return types;
  `IOrderService` and an annotated `Result` as the seam.
- [`shared-contract.ts`](./shared-contract.ts) — two payment rails, one
  `PaymentProvider`; implementers inherit, they do not re-declare.

## What to annotate

|                                     | Annotate?                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Method / function **return**        | No. Inference is the contract.                                                           |
| **Parameters** the caller passes in | Yes, if TS cannot see them. A `type PlaceOrderInput` is a parameter bag, not a protocol. |
| `const x = …`                       | No, unless the initializer is untyped (`JSON.parse`, Prisma JSON).                       |
| `interface` / `implements`          | Only when two (or more) classes must match.                                              |

oRPC DTOs are the **wire** contract ([rpc](../../orpc/rpc)). They are not
a service interface. Zod at the edge; inference in the domain.

A `Symbol` token (`FileStorage`) is the same exception as the interface —
two impls, one slot. See [inversify](../../di/inversify).

## Status log

- 2026-09 ✅ Active — infer outputs; `interface` only for a shared
  implementation contract.
