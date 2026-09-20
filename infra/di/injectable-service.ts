/**
 * Autobind. The class is the token. `@injectable('Singleton')` is the binding —
 * container.ts does not list this class. Bind config, third-party clients, and
 * interface Symbols only.
 */

@injectable('Singleton')
export class OrderService extends ServiceBase {
  constructor(
    @inject(PrismaClient) private readonly prisma: PrismaClient,
    @inject(OrderPaidEventService) private readonly orderPaid: OrderPaidEventService,
  ) {
    super();
  }

  async pay(orderId: string) {
    const row = await this.prisma.order.findFirst({ where: { id: orderId } });
    if (row === null) return failureCode('order_not_found');
    await this.orderPaid.publish({ id: orderId });
    return success(row);
  }
}

// Facade: inject each impl, register in the constructor. Still a class token.
@injectable('Singleton')
export class PaymentProviderService {
  private readonly byVendor = new Map<string, { charge(id: string): Promise<unknown> }>();

  constructor(
    @inject(StripePaymentProvider) stripe: StripePaymentProvider,
    @inject(FlexPaymentProvider) flex: FlexPaymentProvider,
  ) {
    this.byVendor.set('stripe', stripe);
    this.byVendor.set('flex', flex);
  }
}

// Composition root — not a catalog of application services.
export function buildContainer(config: { database: string }) {
  const c = new Container({ autobind: true });
  c.bind(Container).toConstantValue(c);
  c.bind(Config).toConstantValue(config);
  c.bind(PrismaClient)
    .toDynamicValue(() => createPrisma(config.database))
    .inSingletonScope();
  c.bind(FileStorage)
    .toDynamicValue((ctx) => new LocalFileStorage(ctx.get(FileRepo)))
    .inSingletonScope();
  return c;
}

// Interface token — only when there is no class to autobind.
export const FileStorage = Symbol.for('FileStorage');
export const Config = Symbol.for('Config');

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export function bindEveryService(c: Container) {
  c.bind(OrderService).toSelf().inSingletonScope(); // ✗ autobind already did
}

export const orderServiceToken = Symbol.for('OrderService'); // ✗ the class is the token

declare abstract class ServiceBase {
  constructor();
}
declare class PrismaClient {
  order: { findFirst(args: unknown): Promise<unknown | null> };
}
declare class OrderPaidEventService {
  publish(data: { id: string }): Promise<void>;
}
declare class StripePaymentProvider {
  charge(id: string): Promise<unknown>;
}
declare class FlexPaymentProvider {
  charge(id: string): Promise<unknown>;
}
declare class FileRepo {}
declare class LocalFileStorage {
  constructor(repo: FileRepo);
}
declare class Container {
  constructor(opts: { autobind: boolean });
  bind(token: unknown): {
    toConstantValue(value: unknown): unknown;
    toDynamicValue(fn: (ctx: { get(token: unknown): never }) => unknown): { inSingletonScope(): unknown };
    toSelf(): { inSingletonScope(): unknown };
  };
  get<T>(token: unknown): T;
}
declare function createPrisma(url: string): PrismaClient;
declare function injectable(scope?: string): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
declare function failureCode(code: string): unknown;
declare function success<T>(data: T): unknown;
