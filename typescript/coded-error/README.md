---
status: Active
since: 2026-07
retired:
---

# Coded error

**What it is:** `CodedError<C>` — a single-code error whose `code` is a string
literal — and the discipline for handling one. The `Result` it rides in lives in
[result](../result); here it's the error and the call-site behaviour. Every
upstream failure takes exactly one of three exits — **pass through**, **remap**,
or **throw** — and never a fourth.

**Why it appealed:** One literal code per error lets callers `switch` on
`error.code` and have the compiler narrow. Three exits turn "handle the error"
into a finite decision, and exhaustive `switch` catches the one you forgot.

**How it's held up:** The three-exit constraint is durable. The friction: you
can't abstract it away — the `switch` must live at the call site where the result
type is inferred (see _don't extract absorb helpers_).

## Artifacts

- [`coded-error.ts`](./coded-error.ts) — the `CodedError<C>` class,
  `CodedError.fromCause`, `assertErrorCode`, and `CodedUnion`.
- [`absorbing-failures.ts`](./absorbing-failures.ts) — producing, consuming a
  typed union, a `resultify` boundary, and the two ways a `switch` swallows.

## The type

One `code` per error. Build it from a string literal, or the type widens to
`CodedError<string>` and won't narrow under `switch`. (This is widening at
*construction*; [result](../result) covers the other cause — widening by
*annotating* a return type.)

```ts
new CodedError('not_found');   // CodedError<'not_found'>
const code: string = 'not_found';
new CodedError(code);          // ✗ CodedError<string> — won't narrow
```

Producers: `failureCode(code, message?)` (fresh), `failureFromCause(code, error)`
(wrap an upstream error), `CodedError.fromCause(code, error)` (the error instance
itself — to log or capture before returning).

## Error handling guidance

### The three exits

Every failure takes exactly one — anything else is _swallowing_:

- **pass through** — same instance, unchanged (`failure(error)`, or
  `return result` after `assertFailureCode`).
- **remap** — a new code you own, keeping the cause (`failureFromCause`).
- **throw** — a bug in this layer; it must not appear on your `Result`.

```ts
return failure(error);                           // pass through
return failureFromCause('order_failed', error);  // remap — keeps cause
throw error;                                     // throw
```

Remap with `failureFromCause`, never `failureCode(code, err.toString())` — the
latter drops the cause chain:

```ts
return failureFromCause('order_failed', error);        // error survives as .cause
return failureCode('order_failed', error.toString());  // ✗ cause lost
```

### Never swallow

A `switch` that misses a code swallows it — the failure falls through and looks
like success. Cover every code:

```ts
if (!result.success) {
  switch (result.error.code) {
    case 'service_unavailable':
      return failure(result.error);
    // ✗ 'not_found', 'conflict' fall through...
  }
}
return success(data); // ✗ ...looks like success. Swallowed.
```

### Throw vs. return

One question per code:

> Is _my_ code wrong, or did _my caller_ do something I should report?

- **My bug** (built a bad query, edited a frozen record) → **throw**. It must not
  appear on this method's `Result`.
- **Caller's problem** (`not_found`, `conflict`, bad input, transient upstream) →
  **pass through** or **remap**.

```ts
switch (result.error.code) {
  case 'invalid_request':
    throw result.error;              // we built a bad query — our bug
  case 'not_found':
    return failure(result.error);    // caller's concern — report it
}
```

Throws are programmer errors, not API contract — they reach the top-level
boundary, get logged, and page you. If a caller should catch it, it should have
been a code.

### Closing the switch: `assertNever` vs `default: throw`

Pick by whether the union is **known**:

- **Known union** (a typed `Result`'s error type) → `default: assertNever(error)`.
  A new upstream code becomes a compile error — the point of single-code errors.
- **`CodedError<string>`** (from `instanceof CodedError` at a `catch` /
  `resultify` boundary) → `default: throw error`. Exhaustiveness is impossible.

```ts
default: assertNever(result.error); // known union — new code = compile error
default: throw result.error;        // CodedError<string> — new code = runtime throw
```

Boundaries don't protect you the way closed unions do: a new code fails the build
for a known union, but only throws at runtime past a boundary.

### Don't extract named absorb helpers

Absorb inline at the call site. A helper returning `CodedError` needs a return
type, which collapses the single-code union and hides the code from the caller's
inferred error type — defeating the system:

```ts
// ✗ the annotation erases which code came out — caller can't narrow
function mapError(e: CodedError): CodedError<'conflict' | 'not_found'> { ... }
```

A duplicated switch is cheaper than a lost error union. If the switch really is
identical across many sites, the upstream API exposes too many codes — fix it
there, not with a wrapper.

### Testing

Assert on `error.code`, not message text or error class. Codes are the contract.
A test expecting `not_found` that gets a new code should fail loudly — the runtime
echo of `assertNever`.

## Status log

- 2026-07 ✅ Active
