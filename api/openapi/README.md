---
status: Active
since: 2026-09
retired:
---

# OpenAPI

**What it is:** The published contract, committed. Each audience tree has
a snapshot (`rpc.json`, `rpc-admin.json`, `rpc-ops.json`,
`rpc-ops-agent.json`) generated from the oRPC router. CI regenerates and
fails if git is dirty — you forgot to commit. Then **oasdiff** compares
base → head and fails on breaking (`--fail-on ERR`) unless the PR has
`openapi:accept-breaking`. Drafts run too.

**Why it appealed:** [Schemas](../schemas) said don't break the wire.
Review still shipped a dropped field; old app builds 400'd. A label is
how you *acknowledge* a break (deprecate, then remove). It is not how
you skip generate.

**How it's held up:** The dirty check is the one that fires most —
router change, snapshot stale. oasdiff catches the break review missed
(required input, removed path, narrowed enum). The friction is the
label: slapping it on a forgotten field drop is the same as not having
the check. Dual-read first; label when the old shape is gone from
clients.

```sh
bun run openapi:generate
oasdiff breaking base.json head.json --flatten-allof --fail-on ERR
```

## Artifacts

- [`generate-openapi.ts`](./generate-openapi.ts) — one snapshot per
  audience router; stable JSON so the dirty check is a real diff.
- [`openapi.yml`](./openapi.yml) — regenerate must match HEAD; oasdiff
  vs base fails on ERR unless `openapi:accept-breaking`.

## Two gates

1. **Snapshot is current.** `openapi:generate` then `git diff --quiet
   packages/server/openapi`. Change a procedure, commit the JSON.
2. **Snapshot is compatible.** oasdiff against `origin/$base` for every
   audience file. ERR fails the job. WARN / changelog comment the PR;
   they do not fail.

What counts as breaking is [schemas](../schemas) — remove/rename a
field, new required input, narrow an enum, change error codes a client
switches on. Compatible: new output field, optional input, new
procedure.

The label is for a break you meant. Deprecate, dual-read, then drop,
then label. Do not label a dirty snapshot.

Runs on `opened` / `synchronize` including draft — Cursor opens drafts,
so drift must fail before ready-for-review.

## Status log

- 2026-09 ✅ Active — committed snapshots; CI fails dirty generate and
  oasdiff ERR. Label acknowledges a break, it does not skip the
  contract.
