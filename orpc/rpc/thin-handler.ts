/**
 * Thin handlers. Reads run the query at the call site and parse a DTO.
 * Writes call a service and map every CodedError code to an oRPC error with
 * `{ cause }`. The interceptor logs — do not log then throw.
 */

import { z } from 'zod';
import { type CodedError } from '../../typescript/coded-error/coded-error';
import { assertNever, type Result } from '../../typescript/result/result';
import { orderIdSchema, payOrderInputDtoSchema, userOrderDtoSchema, type OrderId } from './audience-dtos';

// ─────────────────────────────────────────────────────────────────────────────
// READ: Prisma at the handler, map with toUserOrder, parse the DTO. No service.
// ─────────────────────────────────────────────────────────────────────────────

export const getOrder = base
  .route({ method: 'GET', path: '/order/{orderId}', summary: "Get the authenticated user's order" })
  .use(authMiddleware({ required: true }))
  .input(z.object({ params: z.object({ orderId: orderIdSchema }) }))
  .output(z.object({ status: z.literal(200), body: z.object({ order: userOrderDtoSchema }) }))
  .errors({ NOT_FOUND: {}, UNAUTHORIZED: {} })
  .handler(async ({ input, context, errors }) => {
    const row = await context.container.get(PrismaClient).order.findFirst({
      where: { userId: context.login.userId, id: input.params.orderId },
    });
    if (row === null) throw errors.NOT_FOUND({ message: 'Order not found' });
    return { status: 200 as const, body: { order: userOrderDtoSchema.parse(toUserOrder(row)) } };
  });

// ─────────────────────────────────────────────────────────────────────────────
// WRITE: service returns Result. Exhaustive switch — a new code is a compile
// error, not a surprise 500. cause keeps the CodedError for the logger.
// ─────────────────────────────────────────────────────────────────────────────

export const payOrder = base
  .route({ method: 'POST', path: '/order/{orderId}/pay', summary: 'Pay order' })
  .use(authMiddleware({ required: true }))
  .input(z.object({ params: z.object({ orderId: orderIdSchema }), body: payOrderInputDtoSchema }))
  .output(z.object({ status: z.literal(200), body: z.object({ order: userOrderDtoSchema }) }))
  .errors({ NOT_FOUND: {}, BAD_REQUEST: {}, CONFLICT: {}, UNAUTHORIZED: {} })
  .handler(async ({ input, context, errors }) => {
    const result = await context.container.get(OrderService).pay(input.params.orderId, input.body);
    if (!result.success) {
      switch (result.error.code) {
        case 'order_not_found':
          throw errors.NOT_FOUND({ cause: result.error });
        case 'order_empty':
        case 'card_declined':
          throw errors.BAD_REQUEST({ message: result.error.message, cause: result.error });
        case 'conflict':
        case 'order_already_paid':
          throw errors.CONFLICT({ message: result.error.message, cause: result.error });
        default:
          assertNever(result.error.code);
      }
    }
    return { status: 200 as const, body: { order: userOrderDtoSchema.parse(toUserOrder(result.data)) } };
  });

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function dropsTheCause(errors: Errors, error: CodedError<'order_not_found'>) {
  throw errors.NOT_FOUND({ message: error.message }); // ✗ interceptor cannot walk cause
}

export async function logsThenThrows(
  log: { error(msg: string, fields: object): void },
  errors: Errors,
  error: CodedError,
) {
  log.error('pay failed', { error }); // ✗ interceptor logs again
  throw errors.INTERNAL_SERVER_ERROR({ cause: error });
}

export async function swallowsNewCodes(errors: Errors, error: { code: string; message: string }) {
  switch (error.code) {
    case 'order_not_found':
      throw errors.NOT_FOUND({ cause: error });
    default:
      throw errors.INTERNAL_SERVER_ERROR({ cause: error }); // ✗ new code compiles as 500
  }
}

type Errors = {
  NOT_FOUND: (args?: { message?: string; cause?: unknown }) => Error;
  BAD_REQUEST: (args?: { message?: string; cause?: unknown }) => Error;
  CONFLICT: (args?: { message?: string; cause?: unknown }) => Error;
  INTERNAL_SERVER_ERROR: (args?: { message?: string; cause?: unknown }) => Error;
  UNAUTHORIZED: (args?: { message?: string; cause?: unknown }) => Error;
};

type HandlerArgs = {
  input: { params: { orderId: OrderId }; body: unknown };
  context: {
    login: { userId: string };
    container: { get<T>(token: abstract new (...args: never[]) => T): T };
  };
  errors: Errors;
};

interface Procedure {
  use(mw: unknown): Procedure;
  input(schema: unknown): Procedure;
  output(schema: unknown): Procedure;
  errors(map: object): Procedure;
  handler(fn: (args: HandlerArgs) => Promise<unknown>): unknown;
}

declare const base: { route(opts: object): Procedure };
declare function authMiddleware(opts: { required: boolean }): unknown;

declare class PrismaClient {
  order: { findFirst(args: unknown): Promise<unknown | null> };
}

type PayError =
  | CodedError<'order_not_found'>
  | CodedError<'order_empty'>
  | CodedError<'card_declined'>
  | CodedError<'conflict'>
  | CodedError<'order_already_paid'>;

declare class OrderService {
  pay(id: OrderId, body: unknown): Promise<Result<unknown, PayError>>;
}

declare function toUserOrder(row: unknown): unknown;
