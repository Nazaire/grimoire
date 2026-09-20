/**
 * A domain lists its workers. Infra Workers composes those groups.
 * Do not add OrderPaidWorker to infra/workers.ts — it never starts unless
 * it sits on OrdersWorkers, and App only starts Workers when the role
 * includes `worker`.
 */

@injectable('Singleton')
@injectFromHierarchy()
export class OrderPaidWorker extends PgBossWorker {
  constructor(
    @inject(PgBoss) boss: PgBoss,
    @inject(OrderPaidQueue) readonly queue: OrderPaidQueue,
  ) {
    super(boss);
  }
}

@injectable('Singleton')
export class OrdersWorkers extends ModuleWorkers {
  constructor(
    @inject(OrderPaidWorker) orderPaid: OrderPaidWorker,
    @inject(AcceptOrderWorker) acceptOrder: AcceptOrderWorker,
    @inject(FulfillmentWorker) fulfillment: FulfillmentWorker,
  ) {
    super([orderPaid, acceptOrder, fulfillment]);
  }
}

@injectable('Singleton')
export class PaymentsWorkers extends ModuleWorkers {
  constructor(@inject(QuotePaidWorker) quotePaid: QuotePaidWorker) {
    super([quotePaid]);
  }
}

// Infra — the domain groups, not the workers. App starts this.
@injectable('Singleton')
export class Workers extends ModuleWorkers {
  constructor(@inject(OrdersWorkers) orders: OrdersWorkers, @inject(PaymentsWorkers) payments: PaymentsWorkers) {
    super([orders, payments]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

@injectable('Singleton')
export class WorkersWithALooseWorker extends ModuleWorkers {
  constructor(
    @inject(OrdersWorkers) orders: OrdersWorkers,
    @inject(OrderPaidWorker) orderPaid: OrderPaidWorker, // ✗ belongs on OrdersWorkers
  ) {
    super([orders, orderPaid]);
  }
}

export const startedByImport = new OrderPaidWorker(boss, queue); // ✗ App never sees it

declare abstract class Lifecycle {
  constructor();
}
declare abstract class ModuleWorkers extends Lifecycle {
  constructor(workers: object[]);
}
declare abstract class PgBossWorker {
  constructor(boss: PgBoss);
}
declare class PgBoss {}
declare class OrderPaidQueue {}
declare class AcceptOrderWorker {}
declare class FulfillmentWorker {}
declare class QuotePaidWorker {}
declare const boss: PgBoss;
declare const queue: OrderPaidQueue;
declare function injectable(scope?: string): ClassDecorator;
declare function injectFromHierarchy(): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
