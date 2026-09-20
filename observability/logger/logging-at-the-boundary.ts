/**
 * Log once at the boundary. Services return a Result; the handler / worker
 * logs `{ error }`. The logger walks cause, tags CodedError.code, and copies
 * extra onto Sentry — so pass cause through, and do not captureException next
 * to the log.
 */

import { CodedError, isCodedError } from '../../typescript/coded-error/coded-error';
import { assertNever, failure, failureCode, success } from '../../typescript/result/result';
import { type ILogger } from './logger';

declare const logger: ILogger;

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE: do not llog.error. Return the Result. extra rides the CodedError
// so the boundary's one log line still has vendor context.
// ─────────────────────────────────────────────────────────────────────────────

export async function charge(orderId: string) {
  const result = await vendor.charge(orderId);
  if (!result.success) {
    switch (result.error.code) {
      case 'card_declined':
        // Remap keeps cause + merges extra. Boundary Sentry sees payment_declined + extra.
        return failureCode('payment_declined', { cause: result.error, extra: { vendor: 'flex' } });
      case 'service_failed':
        return failure(result.error);
      default:
        return assertNever(result.error.code);
    }
  }
  return success(result.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// oRPC BOUNDARY: 4xx → warn (Sentry log, no issue). 5xx → error (log + capture).
// CodedError is tagged failure_code. Do not context.log.error then throw.
// ─────────────────────────────────────────────────────────────────────────────

export function logOrpcFailure(log: ILogger, caught: { status: number; code: string; cause?: unknown }) {
  const cause = caught.cause ?? caught;
  const level = caught.status < 500 ? 'warn' : 'error';

  if (isCodedError(cause)) {
    log[level](cause.message, {
      code: caught.code,
      status: caught.status,
      error: cause, // key must be `error`
      failureCode: cause.code,
    });
    return;
  }
  if (cause instanceof Error) {
    log[level](cause.message, { code: caught.code, status: caught.status, error: cause });
    return;
  }
  log[level](String(cause), { code: caught.code, status: caught.status, error: cause });
}

export async function payHandler(log: ILogger, orderId: string) {
  const result = await charge(orderId);
  if (!result.success) {
    // Throw with cause — the interceptor logs once. Do not log here.
    throw Object.assign(new Error(result.error.message), {
      status: 422,
      code: 'PAYMENT_DECLINED',
      cause: result.error,
    });
  }
  return success(result.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKER BOUNDARY: PgBossWorker already logs Job failed / Job exception.
// work() returns Result; job.log is progress. extra on the failure still
// reaches Sentry because the base logs `{ error }`.
// ─────────────────────────────────────────────────────────────────────────────

export async function workCharge(job: { data: { orderId: string }; log: ILogger }) {
  job.log.info('Charging', { orderId: job.data.orderId });

  const result = await charge(job.data.orderId);
  if (!result.success) {
    switch (result.error.code) {
      case 'payment_declined':
        return failure(result.error); // → Job failed (error + capture), extra intact
      case 'service_failed':
        throw result.error; // → Job exception (warn) until the last attempt
      default:
        return assertNever(result.error.code);
    }
  }
  return success(result.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLE ON THE ERROR INSTANCE: fromCause when you need the object before
// wrapping it in a Result. One logger.error — do not also captureException.
// ─────────────────────────────────────────────────────────────────────────────

export async function importData(input: string) {
  try {
    return success(await doWork(input));
  } catch (err) {
    const error = CodedError.fromCause('import_failed', err);
    logger.error('import failed', { error });
    return failure(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function logsThenReturns(orderId: string) {
  const result = await charge(orderId);
  if (!result.success) {
    logger.error('charge failed', { error: result.error }); // ✗ boundary will log again
    return failure(result.error);
  }
  return success(result.data);
}

export async function logsThenThrows(orderId: string) {
  const result = await charge(orderId);
  if (!result.success) {
    logger.error('charge failed', { error: result.error }); // ✗ then the interceptor logs
    throw result.error;
  }
  return success(result.data);
}

export async function capturesBesideTheLogger(orderId: string) {
  const result = await charge(orderId);
  if (!result.success) {
    logger.error('charge failed', { error: result.error });
    Sentry.captureException(result.error); // ✗ logger.error already captured
    return failure(result.error);
  }
  return success(result.data);
}

export async function stringifiesTheError(orderId: string) {
  const result = await charge(orderId);
  if (!result.success) {
    logger.error('charge failed', result.error.toString()); // ✗ code / extra / cause dropped
    return failure(result.error);
  }
  return success(result.data);
}

declare const vendor: {
  charge(
    orderId: string,
  ): Promise<
    | { success: true; data: { id: string } }
    | { success: false; error: CodedError<'card_declined'> | CodedError<'service_failed'> }
  >;
};
declare function doWork(input: string): Promise<{ rows: number }>;
declare const Sentry: { captureException(err: unknown): void };
