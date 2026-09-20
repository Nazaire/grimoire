/**
 * Inversify v7 does not inherit `@inject` fields or `@preDestroy` from a base.
 * The concrete class takes both `@injectable('Singleton')` and
 * `@injectFromHierarchy()`. Infra workers / publishers all do this.
 */

abstract class PgBossWorker {
  @inject(PgBoss)
  protected readonly boss!: PgBoss;

  @preDestroy()
  protected async onUnbind() {
    await this.stop();
  }

  abstract stop(): Promise<void>;
}

@injectable('Singleton')
@injectFromHierarchy()
export class OrderPaidWorker extends PgBossWorker {
  constructor(@inject(OrderService) private readonly orders: OrderService) {
    super();
  }

  async stop() {
    await this.boss.stop();
  }

  async work(orderId: string) {
    return this.orders.pay(orderId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

// ✗ missing @injectFromHierarchy — `boss` stays undefined; onUnbind never runs.
@injectable('Singleton')
export class BrokenWorker extends PgBossWorker {
  async stop() {
    // boss was never injected — this is already too late
  }
}

declare class PgBoss {
  stop(): Promise<void>;
}
declare class OrderService {
  pay(id: string): Promise<unknown>;
}
declare function injectable(scope?: string): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
declare function injectFromHierarchy(): ClassDecorator;
declare function preDestroy(): MethodDecorator;
