/**
 * Generalized examples of the Result + CodedError building blocks.
 * Domain is deliberately generic (users, orders) — the shapes are the point.
 */

import {
  success,
  failure,
  failureCode,
  failureFromCause,
  resultify,
  mapResult,
  chainResult,
  unwrapOr,
  assertSuccess,
} from './result';
import { CodedError } from '../coded-error/coded-error';

// A fallible operation returns a Result instead of throwing.
// Do NOT annotate the return type — let it infer so the error union stays precise.
export async function getUser(id: string) {
  const row = await db.users.findById(id);
  if (!row) return failureCode('user_not_found'); // Result<never, CodedError<'user_not_found'>>
  return success(row); // success branch inferred from `row`
}

// failureCode makes a fresh single-code error. Construct with a string LITERAL so the
// type is CodedError<'user_not_found'>, not a collapsed CodedError<string>.
export async function credit(amount: number) {
  if (amount <= 0) return failureCode('invalid_amount', 'amount must be positive');
  return success(undefined);
}

// resultify wraps a promise that might reject — the rejection becomes the error branch.
export async function callExternalApi() {
  const result = await resultify(fetch('https://example.com/thing'));
  if (!result.success) {
    // Remap an unknown/thrown cause into a code this layer owns; keeps the cause chain.
    return failureFromCause('service_unavailable', result.error);
  }
  return success(result.data);
}

// Combinators transform without unwrapping — the error branch passes straight through.
export async function getUserName(id: string) {
  const result = await getUser(id);
  return mapResult(result, (user) => user.name); // Result<string, CodedError<'user_not_found'>>
}

// chainResult sequences a dependent step. Both sides share one error type E, so the
// chained step carries the same error union forward (here it only ever succeeds).
export async function getUpperName(id: string) {
  const user = await getUser(id);
  return chainResult(user, (u) => success(u.name.toUpperCase()));
}

// unwrapOr collapses to a fallback when you don't care why it failed.
export async function getUserNameOr(id: string, fallback: string) {
  return unwrapOr(await getUserName(id), fallback);
}

// assertSuccess narrows to the success branch at a boundary where failure is truly
// unexpected — it throws result.error rather than forcing a switch.
export async function mustGetUser(id: string) {
  const result = await getUser(id);
  assertSuccess(result);
  return result.data; // typed as the user, no `if (!result.success)` needed
}

// Result<T, E> is binary. Partial success (some items ok, some not) lives in T,
// never in the error — model it explicitly.
export async function creditMany(ids: string[]) {
  const results = await Promise.all(ids.map(async (id) => ({ id, result: await credit(1) })));
  return success(results); // caller inspects per-item outcomes in the data
}

// CodedError.fromCause builds the coded error without wrapping it in a Result yet —
// for when you need to do something with it (log, capture to Sentry) before returning
// the failure. failureFromCause would build it and return in one step, giving you no
// handle on the instance in between.
export async function importData(input: string) {
  const result = await resultify(doWork(input));
  if (!result.success) {
    const error = CodedError.fromCause('import_failed', result.error);
    logger.error(error);
    Sentry.captureException(error);
    return failure(error); // return the same instance we just logged/captured
  }
  return success(result.data);
}

// Placeholders so the file reads as real usage.
declare const db: {
  users: { findById(id: string): Promise<{ name: string; primaryOrderId?: string } | null> };
};
declare function doWork(input: string): Promise<{ rows: number }>;
declare const logger: { error(err: unknown): void };
declare const Sentry: { captureException(err: unknown): void };
