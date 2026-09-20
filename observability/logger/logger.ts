/**
 * Logger contract for Sentry + CodedError. Console / New Relic live on the
 * same class; this file is the path that turns `{ error }` into a Sentry log
 * (and, at error level, a captured exception).
 */

import { CodedError, isCodedError } from '../../typescript/coded-error/coded-error';

export enum Level {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export interface ILogger {
  withFields(...fields: Record<string, unknown>[]): ILogger;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

function isZodError(error: unknown): error is Error & { issues: unknown[] } {
  return (
    error instanceof Error &&
    (error.name === 'ZodError' || error.name === '$ZodError') &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

/** Walks `error` / `error.cause` for a ZodError and returns its issues. */
export function zodIssuesFrom(error: unknown): unknown[] | undefined {
  const seen = new Set<unknown>();
  let current = error;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (isZodError(current)) return current.issues;
    current = current.cause;
  }

  return undefined;
}

type SentryLike = {
  logger: Record<string, (message: string, attrs: Record<string, unknown>) => void>;
  captureException(
    error: unknown,
    context?: { level?: string; extra?: Record<string, unknown>; tags?: Record<string, string> },
  ): void;
};

/**
 * Pull an Error out of log arguments.
 *
 * - a raw `Error` argument → `attrs.error`
 * - `{ error: Error }` → `attrs.error` (the key **must** be `error`)
 * - other object keys are copied as fields
 */
export function attrsFromArgs(args: unknown[]): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const arg of args) {
    if (arg instanceof Error) {
      attrs.error = arg;
    } else if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        attrs[key] = value;
      }
    }
  }
  if (attrs.issues === undefined) {
    const issues = zodIssuesFrom(attrs.error);
    if (issues !== undefined) attrs.issues = issues;
  }
  return attrs;
}

/**
 * Sentry write for one log line. Warn/info → `sentry.logger` only.
 * Error → that, plus `captureException`.
 *
 * CodedError: tag `failure_code`, copy `extra` onto both the log and the exception.
 */
export function writeSentry(
  sentry: SentryLike,
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  attrs: Record<string, unknown>,
): void {
  let logAttrs: Record<string, unknown> = { ...attrs };
  let error: Error | string | undefined;
  if ('error' in logAttrs) {
    if (logAttrs.error instanceof Error || (typeof logAttrs.error === 'string' && logAttrs.error.length > 0)) {
      error = logAttrs.error;
    }
    delete logAttrs.error;
  }

  const failureCode = isCodedError(error) ? error.code : undefined;
  const errorType = error instanceof Error ? error.name : undefined;
  const tags = {
    ...(failureCode ? { failure_code: failureCode } : {}),
    ...(errorType ? { error_type: errorType } : {}),
  };

  if (error instanceof Error) {
    // message / stack are non-enumerable — a raw Error serializes as "{}".
    logAttrs = { ...logAttrs, ...tags, error: error.message, stack: error.stack };
  } else if (typeof error === 'string') {
    logAttrs = { ...logAttrs, error };
  }
  if (isCodedError(error) && error.extra) {
    logAttrs = { ...logAttrs, extra: error.extra };
  }

  sentry.logger[level]?.(message, logAttrs);
  if (level === 'error') {
    sentry.captureException(error ?? message, {
      level: 'error',
      extra: logAttrs,
      tags: Object.keys(tags).length > 0 ? tags : undefined,
    });
  }
}

/** `ServiceBase.llog` — module-stamped logger. Use for info, not the failure the boundary logs. */
export function withModule(logger: ILogger, ctorName: string): ILogger {
  return logger.withFields({ module: ctorName });
}

export { CodedError, isCodedError };
