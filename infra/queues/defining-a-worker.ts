/**
 * What a worker class looks like. `work` returns Result — that *is* settlement.
 * Orchestrate; call services. Do not become a second domain layer.
 *
 * Register on the module's `*Workers`. Infra `Workers` composes those groups.
 */

import { type CodedError } from '../../typescript/coded-error/coded-error';
import { assertNever, failure, failureCode, success, type Result } from '../../typescript/result/result';
import { AcceptOrderQueue, type OrderSweepJob, OrderSweepQueue } from './defining-a-queue';
import { type OrderPaidEvent } from '../events/order-paid-event';
import { OrderPaidQueue } from '../pub-sub/subscriptions';

type OrderPaidResult = Result<{ outcome: 'accepted' | 'already_accepted' }, CodedError>;

@injectable('Singleton')
@injectFromHierarchy()
export class OrderPaidWorker extends PgBossWorker<OrderPaidQueue, OrderPaidResult> {
  constructor(
    @inject(PgBoss) boss: PgBoss,
    @inject(OrderPaidQueue) readonly queue: OrderPaidQueue,
    @inject(OrderService) private readonly orders: OrderService,
  ) {
    super(boss);
  }

  get workers() {
    return 1;
  }

  get workerConcurrency() {
    return 10;
  }

  get pollingIntervalSeconds() {
    return 30;
  }

  get logOptions(): WorkerLogOptions {
    return {
      job: {
        started: 'info',
        completed: 'info',
        failed: 'error',
        exception: 'warn',
        args: (job) => job.data,
      },
    };
  }

  protected async work(job: Job<OrderPaidEvent>): Promise<OrderPaidResult> {
    // Progress only. The base logs Job failed / Job exception at the boundary.
    job.log.info('Accepting paid order', { orderId: job.data.id });

    const result = await this.orders.accept(job.data.id);
    if (!result.success) {
      switch (result.error.code) {
        case 'order_already_accepted':
          // Idempotent — complete, do not dead-letter a retry of a success.
          return success({ outcome: 'already_accepted' });
        case 'order_not_found':
          // Poison / expected — no retry.
          return failure(result.error);
        case 'service_unavailable':
          // Transient — throw so pg-boss retries. Final attempt becomes failed.
          throw result.error;
        default:
          return assertNever(result.error.code);
      }
    }
    return success({ outcome: 'accepted' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRON WORKER: the tick is cheap. Fan out onto the per-item queue; that queue
// carries retry / DLQ. A throw here retries the whole sweep — prefer success
// with a count, even when nothing is due.
// ─────────────────────────────────────────────────────────────────────────────

@injectable('Singleton')
@injectFromHierarchy()
export class OrderSweepWorker extends PgBossWorker<OrderSweepQueue, Result<{ enqueued: number }, never>> {
  constructor(
    @inject(PgBoss) boss: PgBoss,
    @inject(OrderSweepQueue) readonly queue: OrderSweepQueue,
    @inject(AcceptOrderQueue) private readonly acceptOrder: AcceptOrderQueue,
    @inject(OrderService) private readonly orders: OrderService,
  ) {
    super(boss);
  }

  get workers() {
    return 1;
  }

  get workerConcurrency() {
    return 1;
  }

  get pollingIntervalSeconds() {
    return 30;
  }

  get logOptions(): WorkerLogOptions {
    return {
      job: {
        started: 'debug',
        completed: 'debug',
        failed: 'error',
        exception: 'warn',
      },
    };
  }

  protected async work(_job: Job<OrderSweepJob>) {
    const due = await this.orders.listDue();
    await this.acceptOrder.bulkSend(due.map((id) => ({ data: { id } })));
    return success({ enqueued: due.length });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION: the module lists its workers. Infra Workers composes modules.
// Do not add OrderPaidWorker to infra/workers.ts.
// ─────────────────────────────────────────────────────────────────────────────

@injectable('Singleton')
export class OrdersWorkers extends ModuleWorkers {
  constructor(@inject(OrderPaidWorker) orderPaid: OrderPaidWorker, @inject(OrderSweepWorker) sweep: OrderSweepWorker) {
    super([orderPaid, sweep]);
  }
}

// ANTI-PATTERN — work that *is* the domain. Persistence, vendor calls, and
// policy live on services. The worker switches codes and sequences them.
export async function workerThatIsASecondDomainLayer(job: Job<OrderPaidEvent>) {
  const order = await prisma.order.findUnique({ where: { id: job.data.id } });
  if (!order) return failureCode('order_not_found');
  await stripe.capture(order.chargeId); // ✗ vendor hop belongs on a service
  await prisma.order.update({ where: { id: order.id }, data: { status: 'accepted' } });
  return success({ outcome: 'accepted' as const });
}

// Framework placeholders so the file reads as real usage.
declare const PgBoss: unique symbol;
declare abstract class PgBossWorker<Q, _R> {
  constructor(boss: typeof PgBoss);
  abstract readonly queue: Q;
}
declare abstract class ModuleWorkers {
  constructor(workers: object[]);
}
type Job<T> = {
  data: T;
  log: { info(msg: string, fields?: object): void };
  isFinalAttempt: boolean;
};
type WorkerLogOptions = {
  job: {
    started: 'debug' | 'info';
    completed: 'debug' | 'info';
    failed: 'error';
    exception: 'warn';
    args?: (job: { data: unknown }) => unknown;
  };
};
declare class OrderService {
  accept(
    id: string,
  ): Promise<
    Result<
      void,
      CodedError<'order_already_accepted'> | CodedError<'order_not_found'> | CodedError<'service_unavailable'>
    >
  >;
  listDue(): Promise<string[]>;
}
declare const prisma: {
  order: {
    findUnique(args: unknown): Promise<{ id: string; chargeId: string } | null>;
    update(args: unknown): Promise<unknown>;
  };
};
declare const stripe: { capture(id: string): Promise<void> };
declare function injectable(scope?: string): ClassDecorator;
declare function injectFromHierarchy(): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
