/**
 * DTOs are the audience wire contract. Parse at the edge. Services never take
 * or return them. User schemas may embed another user schema with `.pick`.
 * `.omit().extend()` is a seam — a new field on the source ships to the other
 * audience until someone remembers to omit it. Ops-only fields stay on ops.
 *
 * Branded ids live in `*-refs.ts`; colocated here so the pick is one file.
 */

import { z } from 'zod';

export const orderIdSchema = z.string().min(1).brand<'OrderId'>();
export type OrderId = z.output<typeof orderIdSchema>;

// Canonical order DTO — published on /rpc-ops. Internals live here.
export const orderDtoSchema = z.object({
  id: orderIdSchema,
  status: z.enum(['placed', 'paid', 'canceled']),
  total: z.number().int(),
  failedReason: z.string().nullable(), // ops-only — must not appear on /rpc
});

export type OrderDTO = z.infer<typeof orderDtoSchema>;

export function toOrderDto(order: {
  id: OrderId;
  status: 'placed' | 'paid' | 'canceled';
  total: number;
  failedReason: string | null;
}) {
  return orderDtoSchema.parse(order);
}

// User embed: .pick the fields the app may see. That is a reference, not a dependency.
export const userOrderDtoSchema = orderDtoSchema.pick({
  id: true,
  status: true,
  total: true,
});

export type UserOrderDTO = z.infer<typeof userOrderDtoSchema>;

export function toUserOrderDto(order: { id: OrderId; status: 'placed' | 'paid' | 'canceled'; total: number }) {
  return userOrderDtoSchema.parse(order);
}

export const payOrderInputDtoSchema = z.object({
  paymentMethodId: z.string().min(1),
});

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

// ✗ .omit looks like reuse. A new ops field on orderDtoSchema ships to the app.
export const userOrderViaOmit = orderDtoSchema.omit({ failedReason: true });

// ✗ user `/rpc` importing the ops schema. failedReason is one field away from the app.
export const userGetOrderOutput = z.object({ order: orderDtoSchema });

export class OrderServiceReturnsDto {
  async pay(_id: OrderId) {
    return toOrderDto({ id: _id, status: 'paid', total: 0, failedReason: null }); // ✗ service returns a DTO; pin the write to today's wire
  }
}
