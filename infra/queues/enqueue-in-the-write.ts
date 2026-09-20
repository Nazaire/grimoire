/**
 * Enqueue from the write. Service classes persist, then `publish` / `send` on
 * the same Prisma tx — the job is another row in that transaction, not a vendor
 * hop. The worker is the next edge: other domains subscribe; they do not call
 * this service to handle the write.
 *
 * `send` / `publish` after the tx returns races the worker against uncommitted
 * state. Pass `{ tx }`.
 */

import { failureCode, success } from '../../typescript/result/result';
import type { AcceptOrderQueue } from './defining-a-queue';
import type { OrderPaidEventService } from '../pub-sub/order-paid-event';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISH IN THE WRITE: persist, then publish on the same tx. Exclusive
// subscribers treat this as at-least-once; singletonKey (the order id) dedupes.
// ─────────────────────────────────────────────────────────────────────────────

@injectable('Singleton')
export class OrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orderPaid: OrderPaidEventService,
    private readonly acceptOrder: AcceptOrderQueue,
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

      // Same tx as the row. Job and update commit or roll back together.
      await this.orderPaid.publish({ id: orderId, paidAt: new Date() }, { tx });
      return success({ alreadyPaid: false as const });
    });
  }

  // Direct send when *this* domain owns the follow-up (no other subscribers).
  async requestAccept(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return failureCode('order_not_found');
      await this.acceptOrder.send({ id: orderId }, { tx });
      return success(undefined);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function sendAfterTheTransaction(service: OrderService, orderId: string) {
  const result = await service.markPaid(orderId);
  if (!result.success) return result;
  // ✗ Worker can run before the row is visible — or run after a rollback.
  await acceptOrder.send({ id: orderId });
  return result;
}

export async function jobChainToNestVendorIo(orderId: string) {
  // ✗ The request wasn't allowed two vendor hops; a job is not a loophole.
  // Persist + one hop in the service. The worker is the *next* edge, with its
  // own budget, not a nested continuation of this one.
  await payments.charge(orderId);
  await acceptOrder.send({ id: orderId });
  await fulfillments.ship(orderId);
}

// Placeholders so the file reads as real usage.
declare class PrismaClient {
  $transaction<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T>;
}
type PrismaTx = {
  order: {
    updateMany(args: unknown): Promise<{ count: number }>;
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
};
declare const acceptOrder: AcceptOrderQueue;
declare const payments: { charge(id: string): Promise<void> };
declare const fulfillments: { ship(id: string): Promise<void> };
declare function injectable(scope?: string): ClassDecorator;
