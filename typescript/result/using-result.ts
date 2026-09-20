/**
 * Generalized examples of the Result + CodedError building blocks.
 * Domain is deliberately generic (users, orders) — the shapes are the point.
 */

import { success, failure, failureCode, resultify, chain, unwrapOr, assertSuccess } from './result';
import { CodedError } from '../coded-error/coded-error';

// A fallible operation returns a Result instead of throwing.
// Do NOT annotate the return type — let it infer so the error union stays precise.
export async function getUser(id: string) {
  const row = await db.users.findById(id);
  if (!row) return failureCode('user_not_found'); // Failure<CodedError<'user_not_found'>>
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
    // Message defaults to the new code, not cause.message — callers switch on code only.
    return failureCode('service_unavailable', { cause: result.error });
  }
  return success(result.data);
}

// chain sequences a dependent step. `fn` receives the Success object and may be
// sync or async; a failed input short-circuits without calling `fn`.
export async function getUserName(id: string) {
  const result = await getUser(id);
  return chain(result, ({ data: user }) => success(user.name));
}

export async function getUpperName(id: string) {
  return chain(await getUserName(id), ({ data: name }) => success(name.toUpperCase()));
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
// for when you need to do something with it (log) before returning the failure.
// failureCode(code, { cause }) would build it and return in one step, giving you no
// handle on the instance in between. logger.error({ error }) is the Sentry sink —
// do not captureException beside it.
export async function importData(input: string) {
  const result = await resultify(doWork(input));
  if (!result.success) {
    const error = CodedError.fromCause('import_failed', result.error);
    logger.error('import failed', { error });
    return failure(error); // return the same instance we just logged
  }
  return success(result.data);
}

// Placeholders so the file reads as real usage.
declare const db: {
  users: { findById(id: string): Promise<{ name: string; primaryOrderId?: string } | null> };
};
declare function doWork(input: string): Promise<{ rows: number }>;
declare const logger: { error(msg: string, fields?: { error: unknown }): void };
