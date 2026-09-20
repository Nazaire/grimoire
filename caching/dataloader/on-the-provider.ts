/**
 * One loader per remote key, on the provider. The batch fn lists once and
 * returns in input-id order. getX(id) loads and maps null to not_found.
 * cache: false — this tick only. Catalog TTL is the opt-in, not the default.
 */

import { assertNever, failure, failureCode, success } from '../../../typescript/result/result';
import { ExpiringMap } from '../expiring-map/expiring-map';

@injectable('Singleton')
export class ProductShopifyProvider {
  private readonly loader: DataLoader<string, ProductLoad>;

  constructor(@inject(ProductShopifyClient) private readonly shopify: ProductShopifyClient) {
    this.loader = new DataLoader(
      async (ids: readonly string[]) => {
        const fetched = await this.shopify.listProducts({ ids: [...new Set(ids)] });
        if (!fetched.success) return ids.map(() => fetched); // same failure on every key
        const byId = new Map(fetched.data.map((row) => [row.id, row]));
        return ids.map((id) => success(byId.get(id) ?? null));
      },
      {
        name: 'product-shopify-loader',
        maxBatchSize: 100,
        cache: false, // typical — batch this tick, forget
      },
    );
  }

  async getProduct(productId: string) {
    const result = await this.loader.load(productId);
    if (!result.success) {
      switch (result.error.code) {
        case 'service_failed':
        case 'service_unavailable':
          return failure(result.error);
        default:
          assertNever(result.error.code);
      }
    }
    if (result.data === null) return failureCode('product_not_found');
    return success(result.data);
  }
}

// Catalog is the exception — hot, stable, measured. Short TTL, in-memory.
// Then clear a retryable failure so the cache does not pin it.
export function catalogLoaderOptions() {
  return {
    name: 'product-shopify-loader',
    maxBatchSize: 100,
    cacheMap: new ExpiringMap(10 * 60_000, { gcTime: 10 * 60_000 }),
  };
}

export async function getCatalogProduct(loader: DataLoader<string, ProductLoad>, productId: string) {
  const result = await loader.load(productId);
  if (!result.success) {
    switch (result.error.code) {
      case 'service_failed':
      case 'service_unavailable':
        loader.clear(productId); // don't cache a blip
        return failure(result.error);
      default:
        assertNever(result.error.code);
    }
  }
  if (result.data === null) return failureCode('product_not_found');
  return success(result.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export class PrismaByIdLoader {
  constructor(private readonly prisma: { product: { findMany(args: unknown): Promise<unknown[]> } }) {
    void new DataLoader(async (ids: readonly string[]) => {
      await this.prisma.product.findMany({ where: { id: { in: [...ids] } } });
      return ids.map(() => success(null)); // ✗ compose the join (INCLUDE); this is a second planner
    });
  }
}

export function singletonWithDefaultCache() {
  return { name: 'product-shopify-loader' }; // ✗ DataLoader defaults to an unbounded Map; the singleton pins the pod
}

export function cacheBecauseTheLoaderIsThere() {
  return { cache: true }; // ✗ batching already happened; this remembers across ticks
}

export async function cachesTheOutage(loader: DataLoader<string, ProductLoad>, id: string) {
  const result = await loader.load(id);
  if (!result.success) return result; // ✗ next getX serves service_failed from cache
  return result;
}

type Product = { id: string; title: string };
type ProductLoad =
  | { success: true; data: Product | null }
  | { success: false; error: { code: 'service_failed' | 'service_unavailable' } };

declare class DataLoader<K, V> {
  constructor(
    batch: (keys: readonly K[]) => Promise<V[]>,
    opts?: { name: string; maxBatchSize: number; cache?: boolean; cacheMap?: unknown },
  );
  load(key: K): Promise<V>;
  clear(key: K): void;
}
declare class ProductShopifyClient {
  listProducts(args: {
    ids: string[];
  }): Promise<
    { success: true; data: Product[] } | { success: false; error: { code: 'service_failed' | 'service_unavailable' } }
  >;
}
declare function injectable(scope?: string): ClassDecorator;
declare function inject(token: unknown): ParameterDecorator;
