/**
 * The request is the only place with cookies, IP, and the anonymous id.
 * Stamp it onto the aggregate at the handler. Later writes read metadata —
 * they do not see a request. distinctId is the user or that anonymous id.
 * Missing both → skip, do not mint.
 */

export function getAnalyticsContext(input: { req?: AnalyticsRequest; metadata?: unknown } = {}): AnalyticsContext {
  const metadata = asRecord(input.metadata);
  return {
    posthogDistinctId: str(metadata.posthogDistinctId) ?? header(input.req?.headers['x-posthog-distinct-id']),
    posthogSessionId: str(metadata.posthogSessionId) ?? header(input.req?.headers['x-posthog-session-id']),
    referralId: str(metadata.referralId),
    current_url: str(metadata.current_url),
  };
}

export function analyticsDistinctId(userId: string | null | undefined, context: AnalyticsContext) {
  return userId || context.posthogDistinctId || undefined;
}

// Handler: fold request context into the metadata the aggregate will store.
export async function createCart(
  context: { headers: Record<string, string>; container: { get(token: typeof CartService): CartService } },
  body: { metadata?: Record<string, unknown> },
) {
  const metadata = { ...body.metadata, ...getAnalyticsContext({ req: context, metadata: body.metadata }) };
  return context.container.get(CartService).create({ metadata });
}

// Later write: no request. Read what the handler stamped.
export function toOrderPaidEvent(order: { id: string; userId: string | null; paidAt: Date; metadata: unknown }) {
  const context = getAnalyticsContext({ metadata: order.metadata });
  const distinctId = analyticsDistinctId(order.userId, context);
  if (!distinctId) return null; // skip — do not invent a person
  return {
    ...context,
    userId: order.userId,
    distinctId,
    event: 'ORDER_PAID' as const,
    occurred_at: order.paidAt,
    idempotencyKey: `order:${order.id}:ORDER_PAID`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function captureFromTheRequest(
  posthog: { capture(id: string, event: string): Promise<void> },
  userId: string,
) {
  await posthog.capture(userId, 'ORDER_PAID'); // ✗ vendor hop on the request; no idempotency
}

export function mintDistinctIdInTheWorker(order: { userId: string | null }) {
  return order.userId ?? `anon:${crypto.randomUUID()}`; // ✗ a new person every retry
}

type AnalyticsContext = {
  posthogDistinctId?: string;
  posthogSessionId?: string;
  referralId?: string;
  current_url?: string;
};
type AnalyticsRequest = { headers: Record<string, string | undefined> };

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function str(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function header(value: string | undefined) {
  return value && value.length > 0 ? value : undefined;
}
declare class CartService {
  create(data: { metadata: Record<string, unknown> }): Promise<unknown>;
}
