/**
 * Persist, map the fact to an event, publish on the same tx. occurred_at is
 * the row's timestamp. idempotencyKey is stable — queue singleton and capture
 * id. No distinctId / no occurred_at → skip, do not throw, do not capture.
 */

import { failureCode, success } from '../../typescript/result/result';
import { analyticsDistinctId, getAnalyticsContext } from './context-at-the-edge';

@injectable('Singleton')
@injectFromHierarchy()
export class AnalyticsEventService extends PgBossPublisher<AnalyticsEvent> {
  readonly schema = analyticsEventSchema;

  get id() {
    return pgBossEventId('analytics.event');
  }

  protected defaultSingletonKey(data: AnalyticsEvent) {
    return data.idempotencyKey;
  }
}

@injectable('Singleton')
export class OrderService {
  constructor(
    @inject(PrismaClient) private readonly prisma: PrismaClient,
    @inject(AnalyticsEventService) private readonly analyticsEvent: AnalyticsEventService,
  ) {}

  async markPaid(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const paid = await tx.order.updateMany({
        where: { id: orderId, paidAt: null },
        data: { status: 'paid', paidAt: new Date() },
      });
      if (paid.count === 0) {
        const existing = await tx.order.findUnique({ where: { id: orderId } });
        if (!existing) return failureCode('order_not_found');
        return success({ alreadyPaid: true as const });
      }

      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const event = toOrderEvent(order, 'ORDER_PAID');
      if (event) {
        await this.analyticsEvent.publish(event, { tx }); // same tx as the row
      }
      return success({ alreadyPaid: false as const });
    });
  }
}

function toOrderEvent(
  order: { id: string; userId: string | null; paidAt: Date | null; metadata: unknown },
  event: 'ORDER_PAID',
) {
  const occurredAt = order.paidAt;
  if (!occurredAt) return null;

  const context = getAnalyticsContext({ metadata: order.metadata });
  const distinctId = analyticsDistinctId(order.userId, context);
  if (!distinctId) return null;

  return {
    ...context,
    userId: order.userId,
    distinctId,
    event,
    occurred_at: occurredAt,
    idempotencyKey: `order:${order.id}:${event}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function publishAfterCommit(analyticsEvent: AnalyticsEventService, event: AnalyticsEvent) {
  await analyticsEvent.publish(event); // ✗ worker can run before the row commits
}

export function occurredAtIsNow(order: { id: string; paidAt: Date }) {
  return { occurred_at: new Date(), idempotencyKey: `order:${order.id}:ORDER_PAID` }; // ✗ backfill looks live
}

export function randomIdempotencyKey(order: { id: string }) {
  return `order:${order.id}:${crypto.randomUUID()}`; // ✗ retry = a second capture
}

type AnalyticsEvent = {
  distinctId: string;
  event: string;
  occurred_at: Date;
  idempotencyKey: string;
};
declare const analyticsEventSchema: unknown;
declare abstract class PgBossPublisher<T> {
  abstract readonly schema: unknown;
  publish(data: T, options?: { tx?: unknown }): Promise<void>;
}
declare function pgBossEventId(id: string): string;
declare class PrismaClient {
  $transaction<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T>;
}
type PrismaTx = {
  order: {
    updateMany(args: unknown): Promise<{ count: number }>;
    findUnique(args: unknown): Promise<{ id: string } | null>;
    findUniqueOrThrow(
      args: unknown,
    ): Promise<{ id: string; userId: string | null; paidAt: Date | null; metadata: unknown }>;
  };
};
declare function injectable(scope?: string): ClassDecorator;
declare function injectFromHierarchy(): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
