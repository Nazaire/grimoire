/**
 * App is the tree. Constructed at boot — `new App(container)` — not an
 * injectable. Shared infra starts for every role (HTTP publishes jobs).
 * processRole picks HttpServer and/or Workers. Stop reverses start, then
 * unbindAll so onDeactivation flushes pools.
 */

export class App extends Lifecycle {
  readonly container: Container;
  protected readonly config: { processRole: Array<'server' | 'worker'> };
  protected readonly redis: RedisConnection;
  protected readonly boss: PgBoss;
  protected readonly httpServer: HttpServer;
  protected readonly workers: Workers;

  constructor(container: Container) {
    super();
    this.container = container;
    this.config = container.get(Config);
    this.redis = container.get(RedisConnection);
    this.boss = container.get(PgBoss);
    this.httpServer = container.get(HttpServer);
    this.workers = container.get(Workers);
  }

  private get isServer() {
    return this.config.processRole.includes('server');
  }

  private get isWorker() {
    return this.config.processRole.includes('worker');
  }

  protected async doStart(signal: AbortSignal) {
    await migrateDatabase();
    await seedDatabase();
    if (signal.aborted) return;

    // Shared: HTTP publishes; workers consume. Both roles need the broker.
    await Promise.all([this.redis.start(5_000, signal), this.boss.start()]);
    if (signal.aborted) return;

    await Promise.all([
      ...(this.isServer ? [this.httpServer.start(15_000, signal)] : []),
      ...(this.isWorker ? [this.workers.start(10_000, signal)] : []),
    ]);
  }

  protected async doStop() {
    await Promise.all([
      ...(this.isServer ? [this.httpServer.stop(15_000)] : []),
      ...(this.isWorker ? [this.workers.stop(10_000)] : []),
    ]);

    await Promise.all([this.redis.stop(5_000), this.boss.stop({ graceful: true, timeout: 10_000 })]);

    // onDeactivation: pg pool end, Prisma disconnect, Posthog flush
    await this.container.unbindAll();
  }
}

// Empty / unset processRole → both. A worker-only pod still migrates and
// starts PgBoss; it does not listen.

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function alwaysListens(httpServer: HttpServer, workers: Workers, signal: AbortSignal) {
  await httpServer.start(15_000, signal); // ✗ ignores isServer
  await workers.start(10_000, signal); // ✗ ignores isWorker
}

export async function unbindsFirst(container: Container, httpServer: HttpServer) {
  await container.unbindAll(); // ✗ in-flight HTTP loses Prisma
  await httpServer.stop(15_000);
}

declare abstract class Lifecycle {
  constructor();
  protected abstract doStart(signal: AbortSignal): Promise<void>;
  protected abstract doStop(): Promise<void>;
}
declare class Config {}
declare class Container {
  get<T>(token: unknown): T;
  unbindAll(): Promise<void>;
}
declare class RedisConnection {
  start(ms: number, signal: AbortSignal): Promise<void>;
  stop(ms: number): Promise<void>;
}
declare class PgBoss {
  start(): Promise<void>;
  stop(opts: { graceful: boolean; timeout: number }): Promise<void>;
}
declare class HttpServer {
  start(ms: number, signal: AbortSignal): Promise<void>;
  stop(ms: number): Promise<void>;
}
declare class Workers {
  start(ms: number, signal: AbortSignal): Promise<void>;
  stop(ms: number): Promise<void>;
}
declare function migrateDatabase(): Promise<void>;
declare function seedDatabase(): Promise<void>;
