---
status: Active
since: 2026-09
retired:
---

# Logger

**What it is:** `logger.error('…', { error })` is how a failure leaves the
process. The logger fans to console (and New Relic); with `sentry: true` it
also writes a Sentry log, and on **error** level it `captureException`s.
[`CodedError`](../../typescript/coded-error) is special-cased: `code` becomes
the `failure_code` tag, `extra` rides on both the log and the exception.

**Why it appealed:** I used to log *and* `Sentry.captureException` at the call
site. Two sinks, two shapes, easy to drop `cause` or page a 4xx. One `{ error }`
bag at the **boundary** is the sink. Services return a `Result`; they do not
`llog.error`.

**How it's held up:** The boundary rule is the durable bit. `extra` used to be
an opt-out ("vendor 4xx, don't capture") and double-paged anyway when someone
logged at error. Now extra is context, not a mute: HTTP 4xx are `warn` (log,
no exception); 5xx and worker `Job failed` are `error` (log + capture). Pass
`{ cause }` so the walk still sees vendor text and Zod issues.

```ts
// oRPC boundary — 4xx warn, 5xx error. CodedError → failureCode on the line.
log[level](cause.message, { code, status, error: cause, failureCode: cause.code });

// Worker boundary — failure is error + capture; throw-with-retries is warn.
log.error('Job failed', { error: result.error });
```

## Artifacts

- [`logger.ts`](./logger.ts) — `{ error }` parsing, `zodIssuesFrom` walking
  `cause`, the Sentry branch (`failure_code`, `extra`, capture on error).
- [`logging-at-the-boundary.ts`](./logging-at-the-boundary.ts) — oRPC, worker,
  and the service that does *not* log; `extra` through a remap.

## `{ error }`

The key must be `error`. A raw `Error` argument also lands there. Any other
key is flattened with `util.inspect` — an `Error` under `err` or `cause` will
not be tagged or captured as the exception.

```ts
logger.error('Flex payment failed', { error });          // Error object preserved
logger.error('Flex payment failed', { err: error });     // ✗ inspected as a field
logger.error('Flex payment failed', error.toString());   // ✗ cause / extra / code gone
```

`withFields` stamps every line from that logger (`module`, request path, job
id). `ServiceBase.llog` is `logger.withFields({ module: this.constructor.name })`
— use it for `info`, not for the failure that the boundary will log.

## Sentry

Enabled via `setOptions({ sentry: true })` at boot. Levels map
error → `error`, warn → `warn`, info → `info`.

On every Sentry write:

- `isCodedError(error)` → tag `failure_code: error.code`, attr `error_type: name`
- `error.extra` copied onto log attrs **and** `captureException` context
- `Error.message` / `stack` lifted explicitly (non-enumerable; a raw Error
  would serialize as `{}`)

`captureException` runs **only** at error level. Warn is a Sentry log without
an issue. That is how expected 4xx stay off the pager while vendor `extra`
still shows up when something *does* error.

## Boundaries

Log **once**. The boundary walks `cause` — so pass `cause` through; do not
`new Error(message)`.

| Surface | Boundary | Level |
| --- | --- | --- |
| oRPC | `createErrorHandler` | ≤4xx `warn`, 5xx `error` |
| Express | `errorHandler` | unhandled → error |
| pg-boss | `PgBossWorker` | `failure` / final throw → `Job failed` (error); retryable throw → `Job exception` (warn) |

Services and use cases do not `llog.error`. `llog.info` for domain events is
fine. Do not log-and-return or log-and-throw the same failure. Do not
`Sentry.captureException` next to the logger — the logger already did.

## Status log

- 2026-09 ✅ Active — `CodedError.extra` is Sentry context, not a capture
  opt-out. One `{ error }` at the boundary; error level captures, warn does not.
