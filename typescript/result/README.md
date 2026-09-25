---
status: Active
since: 2026-07
retired:
---

# Result

**What it is:** `Result<T, E>` makes failure a value, not a throw:
`Success<T>` | `Failure<E>`. Callers branch on `success`; the error branch
usually carries a [`CodedError`](../coded-error).

**Why it appealed:** I abandoned `try/catch` for this. A thrown error is invisible
in a function's signature — callers forget it exists and the compiler never
reminds them. `Result` puts failure back in the return type: the set of things
that can go wrong is inferred, and you can't get at the value without acknowledging
the error.

The other half is how the function *reads*. Failure is a value, so you return
it and the rest of the body is only the success case:

```ts
const paid = await orders.pay(orderId, methodId);
if (!paid.success) return paid;

const shipped = await fulfillments.ship(paid.data.id);
if (!shipped.success) return shipped;

return success(shipped.data);
```

That is a **straight-line happy path** (guard clauses / early return). The
success logic is a vertical line you can scan; each failure is a one-line
`if (!….success) return`. Nesting the same branches (arrow code) is the same
number of decisions — **cyclomatic complexity** does not drop — but
**cognitive complexity** does: you are not holding a stack of `else`s. The
failures sit on the left, in source order, instead of buried at the bottom
of a pyramid.

**How it's held up:** Holds up on one condition — you let types infer. Annotate a
return type and the error union widens to `CodedError<string>`; `switch` stops
narrowing and the benefit is gone. The straight-line shape is the other
condition: `return result` is pass-through ([coded-error](../coded-error));
don't indent the rest of the function under `if (result.success)`.

```ts
async function pay(order: { id: string; paidAt?: Date }, methodId: string) {
  if (!methodId) return failureCode('payment_method_required');
  if (order.paidAt) return failureCode('order_already_paid');
  return success(order); // inferred — don't annotate
}

const result = await pay(order, methodId);
if (result.success) result.data;   // narrowed to the order
else result.error.code;            // 'payment_method_required' | 'order_already_paid'
```

## Artifacts

- [`result.ts`](./result.ts) — the type, constructors, `resultify` / `tryCatch`,
  combinators (`chain`, `map`, `flatten`), and the narrowing asserts.
- [`using-result.ts`](./using-result.ts) — producing, wrapping a promise,
  remapping with `{ cause }`, the straight-line `if (!….success) return`,
  chaining, and narrowing at a boundary.

## Gotchas

**Binary — success *or* failure.** Partial success (some items pass) lives in
`T`, not `E`:

```ts
return success(items.map((it) => ({ id: it.id, result: process(it) })));
```

Consuming failures — remapping, `resultify` boundaries, closing the `switch` —
lives in [coded-error](../coded-error). Logging `{ error }` at the boundary
lives in [logger](../../observability/logger).

## Status log

- 2026-09 ✅ Active — `failureFromCause` folded into `failureCode(code, { cause, extra })`.
  Remap message defaults to the new code, not `cause.message`. `Success` / `Failure`
  are now the result object types (`SuccessOf` / `FailureOf` extract them).
- 2026-07 ✅ Active
