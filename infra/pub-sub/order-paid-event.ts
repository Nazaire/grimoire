/**
 * A fact this domain wrote. Other domains subscribe — they do not call this
 * service to handle the write. Publish on the same Prisma tx as the row.
 */

import { z } from 'zod';

export const orderPaidEventSchema = z.object({
  id: z.string(),
  paidAt: z.coerce.date(), // pg-boss persists JSON; Date round-trips as a string
});
export type OrderPaidEvent = z.infer<typeof orderPaidEventSchema>;

@injectable('Singleton')
@injectFromHierarchy()
export class OrderPaidEventService extends PgBossPublisher<OrderPaidEvent> {
  readonly schema = orderPaidEventSchema;

  get id() {
    return pgBossEventId('order.paid');
  }

  // One options bag on publish — this key dedupes on every subscriber.
  protected defaultSingletonKey(data: OrderPaidEvent) {
    return data.id;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function callTheWriterToHandleTheWrite(
  payments: { getPaidQuote(id: string): Promise<{ id: string }> },
  orders: { accept(id: string): Promise<void> },
  quoteId: string,
) {
  const quote = await payments.getPaidQuote(quoteId); // ✗ writer became a read API
  await orders.accept(quote.id); // ✗ subscriber should listen to quote.paid
}

declare function pgBossEventId<const T extends string>(id: T): T;
declare abstract class PgBossPublisher<T> {
  abstract readonly schema: z.ZodType<T>;
  abstract get id(): string;
  publish(data: T, options?: { tx?: unknown; priority?: number }): Promise<void>;
}
declare function injectable(scope?: string): ClassDecorator;
declare function injectFromHierarchy(): ClassDecorator;
