# When to Mock

This repo has two layers. Do not invent a third harness. How to write them is `.cursor/rules/tests.mdc`.

## Unit

Construct the subject (`new Service(...)` / `new Worker(...)`). Stub constructor deps. No `container.get`, no real Prisma / Stripe / Medplum, no pg-boss.

Stub only the delegates you touch. Sibling services return `Result` (`success(...)`, `failureCode('not_found')`). Prisma is a hand-shaped object of `jest.fn()` delegates, not a mock of the whole client.

Do not `jest.mock` modules you own to reach inside the subject. The constructor **is** the seam.

## Integration

Real Postgres. Vendors mocked through `buildTestContainer` / `bindMocks` / `MOCKS` in `packages/server/src/test-utils`. Resolve from `app.container`.

- `initTestDb` / `wipeDb` — real pool + Prisma; other process deps mocked (`mocks: { pool: false, prisma: false }`)
- Keep the vendor under test live: `buildTestContainer({ mocks: { stripe: false } })` (see `stripe-payment-provider.integration.test.ts`)
- New injectable vendor / external HTTP client → `testMockTokens` + `MOCKS` in the same change (`refuseTree`, or a no-op if incidental calls must not throw)

Do not `jest.mock` `container`. Do not stand up a second DI graph.

## Do not mock

- The subject under test
- Time / randomness unless the behavior is the clock
- Prisma in an integration test (that is what `initTestDb` is for)
