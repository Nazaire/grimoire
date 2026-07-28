/**
 * Generalized examples of absorbing a CodedError: what to do with an upstream
 * failure. Every failure takes exactly one exit — pass through, remap, or throw.
 * A switch that doesn't cover every code is swallowing.
 *
 * CodedError lives here; the Result container it rides in lives in the `result`
 * topic. This file imports both and focuses on the *behaviour* at the call site.
 */

import {
  success,
  failure,
  failureCode,
  failureFromCause,
  resultify,
  assertNever,
  assertFailureCode,
  type Result,
} from '../result/result';
import { CodedError } from './coded-error';

declare const orders: {
  reserve(
    id: string,
  ): Promise<
    Result<{ id: string }, CodedError<'not_found'> | CodedError<'conflict'> | CodedError<'service_unavailable'>>
  >;
};
declare const db: { $transaction<T>(fn: () => Promise<T>): Promise<T> };

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCING: bad input to *this* API is a Result code, never a throw.
// The code IS the signal to the caller; throwing would hide it and force try/catch.
// ─────────────────────────────────────────────────────────────────────────────
export async function checkout(quantity: number) {
  if (quantity <= 0) return failureCode('invalid_quantity'); // caller's input → Result
  return success({ quantity });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSUMING a typed upstream Result: exhaustive switch on error.code, then decide.
// Heuristic per code: "my bug" → throw; "caller's problem" → pass through / remap.
// Close a KNOWN union with assertNever — a new upstream code becomes a compile error.
// ─────────────────────────────────────────────────────────────────────────────
export async function placeOrder(orderId: string) {
  const result = await orders.reserve(orderId);
  if (!result.success) {
    switch (result.error.code) {
      case 'not_found':
        // Caller may branch on this — remap into vocabulary this API owns, keep the cause.
        return failureFromCause('order_unavailable', result.error);
      case 'conflict':
        // Domain outcome the caller can act on — pass the same instance through unchanged.
        return failure(result.error);
      case 'service_unavailable':
        // Transient upstream health — usually pass through.
        return failure(result.error);
      default:
        // Known union: if `reserve` adds a code, this stops being `never` and fails the build.
        return assertNever(result.error);
    }
  }
  return success(result.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// BOUNDARY (catch / resultify): `instanceof CodedError` widens to CodedError<string>.
// Exhaustiveness is impossible, so close with `default: throw` — an unnamed code
// becomes a thrown programmer error. This is NOT assertNever (type never narrows to never).
// ─────────────────────────────────────────────────────────────────────────────
export async function transfer() {
  const result = await resultify(
    db.$transaction(async () => {
      if (Math.random() > 1) throw new CodedError('insufficient_balance', 'not enough'); // aborts txn
      return { moved: true };
    }),
  );

  if (!result.success) {
    if (result.error instanceof CodedError) {
      switch (result.error.code) {
        case 'insufficient_balance':
          // Pass through same instance, correctly typed — no `as` cast, no re-wrap.
          assertFailureCode(result, 'insufficient_balance');
          return result;
        default:
          throw result.error; // CodedError<string> here — cannot be exhaustive
      }
    }
    throw result.error; // non-coded throw = a bug in this layer
  }
  return success(result.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS — what "swallowing" looks like.
// ─────────────────────────────────────────────────────────────────────────────
export async function swallowsByIncompleteSwitch(orderId: string) {
  const result = await orders.reserve(orderId);
  if (!result.success) {
    switch (result.error.code) {
      case 'service_unavailable':
        return failure(result.error);
      // ✗ 'not_found' and 'conflict' fall through...
    }
  }
  return success({ ok: true }); // ✗ ...and look like success. Swallowed.
}

export async function swallowsByStringifying(orderId: string) {
  const result = await orders.reserve(orderId);
  if (!result.success) {
    // ✗ remaps every code into one, stringifies the message, drops the cause chain.
    return failureCode('order_failed', result.error.toString());
  }
  return success({ ok: true });
}
