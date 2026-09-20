/**
 * Lifecycle is the one-shot shell. You implement doStart / doStop.
 * start is single-flight; if doStart throws, stop runs with the same budget.
 * stop aborts first so in-flight children unwind. Pass that signal into every
 * child.start. This is boot and shutdown — not reconnect.
 */

@injectable('Singleton')
@injectFromHierarchy()
export class RedisConnection extends Lifecycle {
  constructor(@inject(Config) config: { redisUrl: string }) {
    super();
    this.client = connect(config.redisUrl);
    this.ready = this.client.whenReady();
  }

  private readonly client: RedisClient;
  private readonly ready: Promise<void>;

  protected async doStart(_signal: AbortSignal) {
    await this.ready; // block boot until the first connection
  }

  protected async doStop() {
    await this.client.quit();
  }
}

// A composer starts children with the abort signal and a stop budget.
@injectable('Singleton')
@injectFromHierarchy()
export class ConnectionGroup extends Lifecycle {
  constructor(@inject(RedisConnection) private readonly redis: RedisConnection) {
    super();
  }

  protected async doStart(signal: AbortSignal) {
    await this.redis.start(5_000, signal);
    signal.throwIfAborted();
  }

  protected async doStop() {
    await this.redis.stop(5_000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export class StartsWithoutAbort extends Lifecycle {
  constructor(@inject(RedisConnection) private readonly redis: RedisConnection) {
    super();
  }

  protected async doStart(_signal: AbortSignal) {
    await this.redis.start(5_000); // ✗ no signal — keeps going after App aborted
  }

  protected async doStop() {}
}

export class ReconnectsViaStart extends RedisConnection {
  async onDisconnect() {
    await this.start(5_000); // ✗ one-shot; reconnect belongs in the client
  }
}

declare abstract class Lifecycle {
  start(stopGraceMs: number, signal?: AbortSignal): Promise<void>;
  stop(stopGraceMs: number): Promise<void>;
  protected abstract doStart(signal: AbortSignal): Promise<void>;
  protected abstract doStop(): Promise<void>;
}
declare class Config {}
type RedisClient = { whenReady(): Promise<void>; quit(): Promise<void> };
declare function connect(url: string): RedisClient;
declare function injectable(scope?: string): ClassDecorator;
declare function injectFromHierarchy(): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
