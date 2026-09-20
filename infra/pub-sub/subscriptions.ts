/**
 * In-process fan-out is pg-boss: the subscriber's queue lists the publisher.
 * publish sends to every subscription with one options bag. Rabbit is the
 * other computer — not quote.paid inside this process.
 */

import { OrderPaidEventService, orderPaidEventSchema, type OrderPaidEvent } from '../events/order-paid-event';

export type OrderPaidQueueOpts = {
  policy: 'exclusive';
  singletonKey: string;
};

@injectable('Singleton')
@injectFromHierarchy()
export class OrderPaidQueue extends PgBossQueueWithDLQ<OrderPaidEvent, OrderPaidQueueOpts> {
  static readonly id = pgBossQueueId('order-paid');
  static readonly deadLetterId = pgBossQueueId('order-paid-dlq');
  static readonly schema = orderPaidEventSchema;

  constructor(
    @inject(PgBoss) boss: PgBoss,
    @inject(OrderPaidEventService) private readonly orderPaid: OrderPaidEventService,
  ) {
    super(boss);
  }

  get policy() {
    return PgBossQueue.POLICY.EXCLUSIVE;
  }

  get partition() {
    return false;
  }

  get retry(): QueueRetryOptions {
    return { limit: 10, delay: 5, backoff: true, delayMax: 600 };
  }

  get expireInSeconds() {
    return 300;
  }

  get heartbeatSeconds() {
    return 60;
  }

  get warningQueueSize() {
    return 100;
  }

  get notify() {
    return true;
  }

  defaultSingletonKey(data: OrderPaidEvent) {
    return data.id;
  }

  get subscriptions() {
    return [this.orderPaid]; // start calls boss.subscribe(event, queue)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function sendToEverySubscriberByHand(
  orders: { send(data: OrderPaidEvent, opts?: object): Promise<void> },
  analytics: { send(data: OrderPaidEvent, opts?: object): Promise<void> },
  data: OrderPaidEvent,
) {
  await orders.send(data, { singletonKey: data.id });
  await analytics.send(data, { priority: 1 }); // ✗ writer owns the graph; publish is one bag
}

export async function rabbitForQuotePaid(
  rabbit: { publish(routingKey: string, body: Buffer): Promise<void> },
  orderId: string,
) {
  await rabbit.publish('order.paid', Buffer.from(orderId)); // ✗ in-process fan-out is pg-boss
}

declare const PgBoss: unique symbol;
declare function pgBossQueueId<const T extends string>(id: T): T;
declare abstract class PgBossQueue<_T, _O = unknown> {
  static readonly POLICY: { EXCLUSIVE: 'exclusive'; STANDARD: 'standard' };
  constructor(boss: typeof PgBoss);
}
declare abstract class PgBossQueueWithDLQ<_T, _O = unknown> extends PgBossQueue<_T, _O> {}
type QueueRetryOptions =
  | { limit: number; delay?: number; backoff?: false }
  | { limit: number; delay?: number; backoff: true; delayMax?: number };
declare function injectable(scope?: string): ClassDecorator;
declare function injectFromHierarchy(): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
