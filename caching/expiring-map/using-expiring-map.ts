/**
 * The in-memory cache, when you have already decided you need one. Same
 * shape as a React Query client: client, key, getter, short lifetime.
 * undefined is a miss — negative-cache a sentinel. Delete on retryable
 * failure. Redis is the rare cross-pod case, not the default.
 */

import { assertNever, failureCode, success } from '../../typescript/result/result';
import { ExpiringMap } from './expiring-map';

const TEN_MIN = 10 * 60_000;

// Client. Short lifetime. gcTime sweeps idle keys; the timer is unref'd.
export const catalogCache = new ExpiringMap<string, unknown>(TEN_MIN, { gcTime: TEN_MIN });

// key + getter. CMS GraphQL is this: cache the Promise, drop it if the
// result is a retryable failure.
type Remote =
  | { success: true; data: unknown }
  | { success: false; error: { code: 'service_failed' | 'service_unavailable' | 'invalid_request' } };

export async function cachedQuery(
  cache: ExpiringMap<string, Promise<Remote>>,
  key: string,
  getter: () => Promise<Remote>,
) {
  const result = await cache.memo(key, getter);
  if (!result.success) {
    switch (result.error.code) {
      case 'service_failed':
      case 'service_unavailable':
        cache.delete(key);
        break;
      case 'invalid_request':
        break;
      default:
        assertNever(result.error.code);
    }
  }
  return result;
}

// DataLoader cacheMap — only after cache: false is not enough (catalog).
export function catalogLoaderOptions() {
  return { name: 'product-shopify-loader', maxBatchSize: 100, cacheMap: catalogCache };
}

// get/set — cookie claims, 5m. A 401 deletes rather than caching undefined.
export const claimsByCookie = new ExpiringMap<string, { sub: string }>(5 * 60_000, { gcTime: 5 * 60_000 });

export function rememberClaims(cookie: string, claims: { sub: string }) {
  claimsByCookie.set(cookie, claims);
}

export function forgetClaims(cookie: string) {
  claimsByCookie.delete(cookie);
}

// Negative cache — undefined is a miss, so store a sentinel.
export const catalogMisses = new ExpiringMap<string, true>(60_000, { gcTime: 60_000 });

export function rememberMiss(productId: string) {
  catalogMisses.set(productId, true);
}

export function isKnownMiss(productId: string) {
  return catalogMisses.get(productId) === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export const forever = new Map<string, unknown>(); // ✗ no clock; pins the pod

export function dataloaderDefaultCache() {
  return { cache: true }; // ✗ unbounded Map on a singleton; pass ExpiringMap or cache: false
}

export function negativeCacheUndefined(cache: ExpiringMap<string, true | undefined>, id: string) {
  cache.set(id, undefined); // ✗ next get is a miss; use a sentinel
}

export async function memoKeepsTheOutage(
  cache: ExpiringMap<string, Promise<{ success: boolean }>>,
  key: string,
  getter: () => Promise<{ success: boolean }>,
) {
  const result = await cache.memo(key, getter);
  if (!result.success) return failureCode('service_failed'); // ✗ next memo hits the failed promise
  return success(result);
}

export function scoreKey(userId: string) {
  return `score:${userId}`; // ✗ missing sex / version — serve yesterday's identity until TTL
}

export async function redisBecauseItMightHelp(
  redis: { set(key: string, value: string, ttl: number): Promise<void> },
  key: string,
  value: unknown,
) {
  await redis.set(key, JSON.stringify(value), 86_400); // ✗ another computer, long TTL; ExpiringMap first
}

export function intervalWithoutUnref() {
  setInterval(() => {}, 60_000); // ✗ holds the event loop after App.stop — ExpiringMap unrefs
}
