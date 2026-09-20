/**
 * Kick off every load, then wait. for + await getX flushes a one-id batch
 * per iteration. Collecting a Map and indexing later is split-then-bang —
 * TypeScript dropped the pairing (`get(id)!`).
 */

import { success } from '../../../typescript/result/result';
import type { ProductShopifyProvider } from './on-the-provider';

export async function loadLineProducts(catalog: ProductShopifyProvider, lineProductIds: string[]) {
  return Promise.all(lineProductIds.map((id) => catalog.getProduct(id)));
}

export async function loadMany(loader: { loadMany(ids: readonly string[]): Promise<unknown[]> }, ids: string[]) {
  return loader.loadMany(ids);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function forAwaitBreaksTheBatch(catalog: ProductShopifyProvider, ids: string[]) {
  const products = [];
  for (const id of ids) {
    products.push(await catalog.getProduct(id)); // ✗ each await is its own one-id round trip
  }
  return products;
}

export async function splitThenBang(
  shopify: { listProducts(ids: string[]): Promise<{ id: string }[]> },
  ids: string[],
) {
  const rows = await shopify.listProducts(ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)!); // ✗ pairing gone; missing id is a crash
}

export async function getProductsAsMap(catalog: ProductShopifyProvider, ids: string[]) {
  const rows = await Promise.all(ids.map((id) => catalog.getProduct(id)));
  return new Map(ids.map((id, i) => [id, rows[i]!])); // ✗ callers go back to get(id)!
}

export function missingIsUndefined(byId: Map<string, { id: string }>, id: string) {
  const row = byId.get(id);
  if (!row) return undefined; // ✗ not_found belongs on Result, not a hole in a Map
  return success(row);
}
