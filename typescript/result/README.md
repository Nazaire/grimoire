---
status: Active
since: 2026-07
retired:
---

# Result

**What it is:** `Result<T, E>` makes failure a value, not a throw:
`{ success: true; data }` | `{ success: false; error }`. Callers branch on
`success`; the error branch usually carries a [`CodedError`](../coded-error).

**Why it appealed:** I abandoned `try/catch` for this. A thrown error is invisible
in a function's signature — callers forget it exists and the compiler never
reminds them. `Result` puts failure back in the return type: the set of things
that can go wrong is inferred, and you can't get at the value without acknowledging
the error.

**How it's held up:** Holds up on one condition — you let types infer. Annotate a
return type and the error union widens to `CodedError<string>`; `switch` stops
narrowing and the benefit is gone.

```ts
async function getUser(id: string) {
  const row = await db.users.find(id);
  if (!row) return failureCode('not_found'); // Result<never, CodedError<'not_found'>>
  return success(row);                        // inferred — don't annotate
}

const result = await getUser(id);
if (result.success) result.data;   // narrowed to the row
else result.error.code;            // 'not_found'
```

## Artifacts

- [`result.ts`](./result.ts) — the type, constructors, `resultify` / `tryCatch`,
  combinators (`mapResult`, `chainResult`, `flatten`), and the narrowing asserts.
- [`using-result.ts`](./using-result.ts) — producing, wrapping a promise,
  transforming, chaining, and narrowing at a boundary.

## Gotchas

**Binary — success *or* failure.** Partial success (some items pass) lives in
`T`, not `E`:

```ts
return success(items.map((it) => ({ id: it.id, result: process(it) })));
```

Consuming failures — remapping, `resultify` boundaries, closing the `switch` —
lives in [coded-error](../coded-error).

## Status log

- 2026-07 ✅ Active
