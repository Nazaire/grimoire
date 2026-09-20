/**
 * What a queue class looks like. Two shapes this domain owns: a cron tick
 * (no DLQ — the next schedule covers a miss) and a direct-send queue this
 * domain both writes and consumes. Fan-out to other domains is events/ +
 * pub-sub, not a second send.
 *
 * Bases live in infra/pgboss (`PgBossQueue`, `PgBossQueueWithDLQ`).
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// CRON TICK: exclusive so two pods don't run the same minute twice. retryLimit 0,
// short retention — a stale tick is dropped; the next schedule fires regardless.
// No DLQ. The worker bulkSends per-item jobs onto a work queue.
// ─────────────────────────────────────────────────────────────────────────────

export const orderSweepJobSchema = z.object({});
export type OrderSweepJob = z.infer<typeof orderSweepJobSchema>;

@injectable('Singleton')
@injectFromHierarchy()
export class OrderSweepQueue extends PgBossQueue<OrderSweepJob, { policy: 'exclusive' }> {
  static readonly id = pgBossQueueId('order-sweep');
  static readonly schema = orderSweepJobSchema;

  get policy() {
    return PgBossQueue.POLICY.EXCLUSIVE;
  }

  get partition() {
    return false;
  }

  get retry(): QueueRetryOptions {
    return { limit: 0, backoff: true };
  }

  get expireInSeconds() {
    return 90;
  }

  get retentionSeconds() {
    return 3_600; // 1h — drop a tick still queued; next cron covers it
  }

  get warningQueueSize() {
    return 10;
  }

  get notify() {
    return true;
  }

  get schedules() {
    return {
      sweep: {
        cron: '* * * * *',
        data: {},
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT SEND: this domain owns the write *and* the follow-up. No pub/sub —
// the service calls `queue.send`. Exclusive + singletonKey still apply.
// ─────────────────────────────────────────────────────────────────────────────

export const acceptOrderJobSchema = z.object({ id: z.string() });
export type AcceptOrderJob = z.infer<typeof acceptOrderJobSchema>;

export type AcceptOrderQueueOpts = {
  policy: 'exclusive';
  singletonKey: string;
};

@injectable('Singleton')
@injectFromHierarchy()
export class AcceptOrderQueue extends PgBossQueueWithDLQ<AcceptOrderJob, AcceptOrderQueueOpts> {
  static readonly id = pgBossQueueId('accept-order');
  static readonly deadLetterId = pgBossQueueId('accept-order-dlq');
  static readonly schema = acceptOrderJobSchema;

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

  get warningQueueSize() {
    return 100;
  }

  get notify() {
    return true;
  }

  defaultSingletonKey(data: AcceptOrderJob) {
    return data.id;
  }
}

// Framework placeholders so the file reads as real usage.
declare const PgBoss: unique symbol;
declare function pgBossQueueId<const T extends string>(id: T): T;
declare abstract class PgBossQueue<T, _O = unknown> {
  static readonly POLICY: { EXCLUSIVE: 'exclusive'; STANDARD: 'standard' };
  constructor(boss: typeof PgBoss);
  send(data: T, options?: { tx?: unknown }): Promise<string | null>;
  bulkSend(jobs: { data: T; options?: object }[]): Promise<string[] | null>;
  abstract get policy(): string;
  abstract get partition(): boolean;
  abstract get retry(): QueueRetryOptions;
  abstract get expireInSeconds(): number;
  abstract get warningQueueSize(): number;
  abstract get notify(): boolean;
}
declare abstract class PgBossQueueWithDLQ<T, O = unknown> extends PgBossQueue<T, O> {}
type QueueRetryOptions =
  | { limit: number; delay?: number; backoff?: false }
  | { limit: number; delay?: number; backoff: true; delayMax?: number };
declare function injectable(scope?: string): ClassDecorator;
declare function injectFromHierarchy(): ClassDecorator;
