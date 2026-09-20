/**
 * One queue subscribes to analytics.event. Live vs historical is job priority
 * from how old occurred_at is — not two queue ids. Two workers claim from the
 * same queue (minPriority / maxPriority). Capture is the worker; the service
 * already published.
 */

const LIVE = 10;
const HISTORICAL = 0;
const HISTORICAL_AGE_MS = 7 * 86_400 * 1000;

@injectable('Singleton')
@injectFromHierarchy()
export class AnalyticsEventService extends PgBossPublisher<AnalyticsEvent> {
  defaultPriority(data: AnalyticsEvent) {
    const ageMs = Date.now() - data.occurred_at.getTime();
    return ageMs > HISTORICAL_AGE_MS ? HISTORICAL : LIVE;
  }
}

@injectable('Singleton')
@injectFromHierarchy()
export class PosthogEventQueue extends PgBossQueueWithDLQ<AnalyticsEvent> {
  static readonly id = pgBossQueueId('posthog-event');

  constructor(
    @inject(PgBoss) boss: PgBoss,
    @inject(AnalyticsEventService) private readonly analyticsEvent: AnalyticsEventService,
  ) {
    super(boss);
  }

  defaultPriority(data: AnalyticsEvent) {
    return this.analyticsEvent.defaultPriority(data);
  }

  defaultSingletonKey(data: AnalyticsEvent) {
    return data.idempotencyKey;
  }

  get subscriptions() {
    return [this.analyticsEvent];
  }
}

@injectable('Singleton')
@injectFromHierarchy()
export class PosthogEventPriorityWorker extends PgBossWorker<PosthogEventQueue> {
  constructor(
    @inject(PgBoss) boss: PgBoss,
    @inject(PosthogEventQueue) readonly queue: PosthogEventQueue,
    @inject(Posthog) private readonly posthog: Posthog,
  ) {
    super(boss);
  }

  get minPriority() {
    return LIVE;
  }

  protected async work(jobs: Array<{ data: AnalyticsEvent }>) {
    for (const job of jobs) await this.posthog.capture(job.data);
    return jobs.map((job) => success({ event: job.data.event }));
  }
}

@injectable('Singleton')
@injectFromHierarchy()
export class PosthogEventHistoricalWorker extends PgBossWorker<PosthogEventQueue> {
  constructor(
    @inject(PgBoss) boss: PgBoss,
    @inject(PosthogEventQueue) readonly queue: PosthogEventQueue,
    @inject(Posthog) private readonly posthog: Posthog,
  ) {
    super(boss);
  }

  get maxPriority() {
    return HISTORICAL;
  }

  protected async work(jobs: Array<{ data: AnalyticsEvent }>) {
    for (const job of jobs) await this.posthog.capture(job.data);
    return jobs.map((job) => success({ event: job.data.event }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export const liveQueueId = pgBossQueueId('posthog-event-live'); // ✗ one queue; split by priority
export const historicalQueueId = pgBossQueueId('posthog-event-historical');

export async function captureInTheService(posthog: Posthog, event: AnalyticsEvent) {
  await posthog.capture(event); // ✗ the subscriber captures; the write publishes
}

type AnalyticsEvent = { event: string; occurred_at: Date; idempotencyKey: string };
declare abstract class PgBossPublisher<_T> {
  defaultPriority?(data: _T): number;
}
declare abstract class PgBossQueueWithDLQ<_T> {
  constructor(boss: PgBoss);
}
declare abstract class PgBossWorker<Q> {
  constructor(boss: PgBoss);
  abstract readonly queue: Q;
}
declare class PgBoss {}
declare class Posthog {
  capture(event: AnalyticsEvent): Promise<void>;
}
declare function pgBossQueueId(id: string): string;
declare function success<T>(data: T): { success: true; data: T };
declare function injectable(scope?: string): ClassDecorator;
declare function injectFromHierarchy(): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
