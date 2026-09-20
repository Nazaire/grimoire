/**
 * Business logic has no protocol. The method has no return type — success /
 * failureCode already make Result, and the code union stays literal. Callers
 * import the class. A parameter bag (`PlaceOrderInput`) is an input, not a
 * contract two services implement.
 */

import { assertNever, failureCode, success } from '../result/result';

export type PlaceOrderInput = {
  userId: string;
  total: number;
};

export class OrderService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(orderId: string) {
    const row = await this.prisma.order.findFirst({ where: { id: orderId } });
    if (!row) return failureCode('order_not_found');
    return success(row);
  }

  async place(input: PlaceOrderInput) {
    if (input.total <= 0) return failureCode('invalid_amount');
    const row = await this.prisma.order.create({ data: input });
    return success(row);
  }

  async markPaid(orderId: string) {
    const result = await this.get(orderId);
    if (!result.success) return result; // passes through CodedError<'order_not_found'>
    if (result.data.paidAt) return failureCode('order_already_paid');
    return success(result.data);
  }
}

// Caller switches on the inferred union — a new code is a compile error.
export async function pay(orders: OrderService, orderId: string) {
  const result = await orders.markPaid(orderId);
  if (!result.success) {
    switch (result.error.code) {
      case 'order_not_found':
      case 'order_already_paid':
        return result;
      default:
        assertNever(result.error.code);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export interface IOrderService {
  markPaid(orderId: string): Promise<Result<Order, CodedError>>; // ✗ one impl; union collapsed
}

export class AnnotatedOrderService implements IOrderService {
  async markPaid(orderId: string): Promise<Result<Order, CodedError>> {
    if (!orderId) return failureCode('order_not_found');
    return success({ id: orderId, paidAt: null });
    // caller sees CodedError, not 'order_not_found' | …
  }
}

export async function annotatedLocal(orders: OrderService, orderId: string) {
  const result: Result<Order, CodedError> = await orders.markPaid(orderId); // ✗ widens
  return result;
}

type Order = { id: string; paidAt: Date | null };
type Result<T, E> = { success: true; data: T } | { success: false; error: E };
type CodedError = { code: string; message: string };

declare class PrismaClient {
  order: {
    findFirst(args: unknown): Promise<{ id: string; paidAt: Date | null } | null>;
    create(args: unknown): Promise<{ id: string; paidAt: Date | null }>;
  };
}
