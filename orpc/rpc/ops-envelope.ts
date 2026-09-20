/**
 * Ops-ui binds tables to this envelope. List, retrieve, count — not a generic
 * `/r` resource API. Path params are named after the resource (`{orderId}`),
 * never `{id}`. Filters are sibling query keys (DTO field = Prisma column).
 */

import { z } from 'zod';
import { orderDtoSchema, orderIdSchema } from './audience-dtos';

const orderListSortDtoSchema = z.object({
  key: z.enum(['placedAt']),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

const orderListFiltersDtoSchema = z.object({
  status: z.enum(['placed', 'paid', 'canceled']).optional(),
  placedAt: z.object({ gte: z.date().optional(), lte: z.date().optional() }).optional(),
});

const collectionQuery = z.object({
  q: z.string().optional(),
  sort: orderListSortDtoSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(), // opaque; null nextCursor on the way out = last page
});

// Retrieve — GET /orders/{orderId}. No query. Body always `{ item }`.
export const retrieveOrder = {
  method: 'GET' as const,
  path: '/orders/{orderId}',
  input: z.object({ params: z.object({ orderId: orderIdSchema }) }),
  output: z.object({
    status: z.literal(200),
    body: z.object({ item: orderDtoSchema }),
  }),
};

// List — GET /orders. Shared page keys, then declared filters as siblings (`.and`).
export const listOrders = {
  method: 'GET' as const,
  path: '/orders',
  input: z.object({ query: collectionQuery.and(orderListFiltersDtoSchema) }),
  output: z.object({
    status: z.literal(200),
    body: z.object({
      items: z.array(orderDtoSchema),
      nextCursor: z.string().nullable(),
    }),
  }),
};

// Count — GET /orders/count. Same filters as the list; no sort / limit / cursor.
export const countOrders = {
  method: 'GET' as const,
  path: '/orders/count',
  input: z.object({
    query: z.object({ q: z.string().optional() }).and(orderListFiltersDtoSchema),
  }),
  output: z.object({ status: z.literal(200), body: z.object({ count: z.number().int() }) }),
};

// Actions — GET /orders/{orderId}/actions. Affordances for this resource, not a
// closed action enum. `disabled` is null when available, a string when not.
export const orderActions = {
  method: 'GET' as const,
  path: '/orders/{orderId}/actions',
  input: z.object({ params: z.object({ orderId: orderIdSchema }) }),
  output: z.object({
    status: z.literal(200),
    body: z.object({
      items: z.array(
        z.object({
          path: z.string(),
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
          disabled: z.string().nullable(),
        }),
      ),
    }),
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export const retrieveWithGenericId = { path: '/orders/{id}' }; // ✗ nested routes collide
export const retrieveWithNamedBody = { body: { order: orderDtoSchema } }; // ✗ always `{ item }`
export const listWithNestedFilters = { query: { filters: orderListFiltersDtoSchema } }; // ✗ siblings
export const listWithOffsetPage = { query: { page: z.number() } }; // ✗ cursor only
