/**
 * Result type for handling operations that can succeed or fail.
 * Uses discriminated unions for type-safe error handling.
 */

import { CodedError } from '../coded-error/coded-error';

export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };
export type Success<R extends Result<any, any>> = R extends { success: true; data: infer T } ? T : never;
export type Failure<R extends Result<any, any>> = R extends { success: false; error: infer E } ? E : never;

/**
 * Creates a success result
 */
export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Creates an error result
 */
export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Wraps a Promise that might reject into a Result
 */
export async function resultify<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    const data = await promise;
    return success(data);
  } catch (err) {
    return failure(err instanceof Error ? err : new Error(String(err), { cause: err }));
  }
}

export async function tryCatch<T>(fn: () => T | PromiseLike<T>): Promise<Result<T, Error>> {
  try {
    return success(await fn());
  } catch (err) {
    return failure(err instanceof Error ? err : new Error(String(err), { cause: err }));
  }
}

/**
 * Unwrap one nested Result layer: `Result<Result<T, E>, F>` → `Result<T, E | F>`.
 *
 * Inner may be a union of Results (typical when a callback returns mixed
 * `failureCode('a') | failureCode('b') | success(data)`). {@link Success} /
 * {@link Failure} distribute over that union so the output is a single Result.
 */
export function flatten<Inner extends Result<any, any>, F>(
  result: Result<Inner, F>,
): Result<Success<Inner>, Failure<Inner> | F> {
  if (!result.success) return result;
  return result.data as Result<Success<Inner>, Failure<Inner> | F>;
}

/**
 * Maps a successful result to a new value
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (result.success) {
    return success(fn(result.data));
  }
  return result;
}

/**
 * Chains result-returning operations
 */
export function chainResult<T, U, E>(result: Result<T, E>, fn: (data: T) => Result<U, E>): Result<U, E> {
  if (result.success) {
    return fn(result.data);
  }
  return result;
}

/**
 * Unwraps a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.success) {
    return result.data;
  }
  throw result.error;
}

/**
 * Unwraps a result with a default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.success) {
    return result.data;
  }
  return defaultValue;
}

/** `failure(new CodedError(...))` with stack starting at the call site. */
export function failureCode<const C extends string>(code: C, message?: string): Result<never, CodedError<C>> {
  const err = new CodedError(code, message);
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(err, failureCode);
  }
  return failure(err);
}

/** `failure(CodedError.fromCause(...))` — remap wrapping an upstream error. */
export function failureFromCause<const C extends string>(
  code: C,
  error: unknown,
  message?: string,
): Result<never, CodedError<C>> {
  const err = CodedError.fromCause(code, error, message);
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(err, failureFromCause);
  }
  return failure(err);
}

/**
 * Narrow a {@link Result} to the success branch. Throws `result.error` on failure.
 */
export function assertSuccess<T, E>(result: Result<T, E>): asserts result is { success: true; data: T } {
  if (!result.success) throw result.error;
}

/**
 * Narrow a {@link Result} to the failure branch. Throws if the result succeeded.
 */
export function assertFailure<T, E>(result: Result<T, E>): asserts result is { success: false; error: E } {
  if (result.success) {
    throw new Error(`Expected failure result, got success`);
  }
}

/**
 * Narrow a failure {@link Result} whose error is a {@link CodedError} to `CodedError<C>`.
 * Calls {@link assertFailure}, then {@link CodedError.assertErrorCode} on `result.error`.
 */
export function assertFailureCode<T, const C extends string>(
  result: Result<T, Error>,
  code: C,
): asserts result is { success: false; error: CodedError<C> } {
  assertFailure(result);
  if (!(result.error instanceof CodedError)) throw result.error;
  CodedError.assertErrorCode(result.error, code);
}

/**
 * Exhaustiveness check for `switch` `default` branches (e.g. on `error.code`).
 * Takes `never`, so it only type-checks when every union member is handled —
 * adding a new member upstream makes `default` stop being `never` and fails to compile.
 * At runtime it throws; that path should be unreachable if types are honest.
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
