/**
 * Result type for handling operations that can succeed or fail.
 * Uses discriminated unions for type-safe error handling.
 */

import { CodedError } from '../coded-error/coded-error';

export type Success<T = unknown> = { success: true; data: T };
export type Failure<E = Error> = { success: false; error: E };
export type Result<T = unknown, E = Error> = Success<T> | Failure<E>;
export type SuccessOf<R extends Result> = R extends Success<infer T> ? Success<T> : never;
export type FailureOf<R extends Result> = R extends Failure<infer E> ? Failure<E> : never;

/**
 * Creates a success result
 */
export function success<T>(data: T): Success<T> {
  return { success: true, data };
}

/**
 * Creates an error result
 */
export function failure<E = Error>(error: E): Failure<E> {
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
export function flatten<E, R extends Result>(result: Result<R, E>): Failure<E> | R {
  if (!result.success) return result;
  return result.data;
}

/**
 * Maps a successful result to a new Result. The callback may narrow the success
 * or replace it with a failure. An input failure is returned unchanged.
 */
export function map<T, E, R extends Result>(result: Result<T, E>, fn: (data: T) => R): Failure<E> | R {
  if (result.success) {
    return fn(result.data);
  }
  return result;
}

/**
 * Chains result-returning operations. `fn` may be sync or async — the return type
 * is inferred from `fn` (a `Result` or `Promise<Result>`). Failed inputs short-circuit
 * without calling `fn`.
 */
export function chain<T, E, R>(result: Result<T, E>, fn: (data: Success<T>) => R): Failure<E> | R {
  if (result.success) {
    return fn(result);
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

export type FailureCodeOptions = {
  cause?: unknown;
  extra?: Record<string, unknown>;
};

export function failureCode<const C extends string>(
  code: C,
  message?: string,
  options?: FailureCodeOptions,
): Result<never, CodedError<C>>;
export function failureCode<const C extends string>(code: C, options: FailureCodeOptions): Result<never, CodedError<C>>;
export function failureCode<const C extends string>(
  code: C,
  messageOrOptions?: string | FailureCodeOptions,
  options?: FailureCodeOptions,
): Result<never, CodedError<C>> {
  if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
    return codedFailure(code, undefined, messageOrOptions);
  }
  return codedFailure(code, messageOrOptions, options ?? {});
}

function codedFailure<const C extends string>(
  code: C,
  message: string | undefined,
  options: FailureCodeOptions,
): Result<never, CodedError<C>> {
  const cause =
    options.cause === undefined
      ? undefined
      : options.cause instanceof Error
        ? options.cause
        : new Error(String(options.cause), { cause: options.cause });
  const inheritedExtra = cause instanceof CodedError ? cause.extra : undefined;
  const mergedExtra = { ...inheritedExtra, ...options.extra };
  const err = new CodedError(code, message, {
    cause,
    extra: Object.keys(mergedExtra).length > 0 ? mergedExtra : undefined,
  });
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(err, failureCode);
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
