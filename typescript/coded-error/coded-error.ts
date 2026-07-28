/**
 * Distributes a union of codes into a union of single-code errors:
 * `CodedUnion<'a' | 'b'>` = `CodedError<'a'> | CodedError<'b'>` (not the
 * collapsed `CodedError<'a' | 'b'>`, which wouldn't narrow on `switch`).
 *
 * For the rare public-interface annotation that inference can't reach — prefer
 * letting error unions infer everywhere else.
 */
export type CodedUnion<C extends string> = C extends infer U extends string ? CodedError<U> : never;

export class CodedError<out C extends string = string> extends Error {
  readonly code: C;

  constructor(code: C, message?: string, options?: ErrorOptions) {
    super(message ?? code, options);
    this.name = new.target.name;
    this.code = code;
  }

  static fromCause<const C extends string>(code: C, error: unknown, message?: string): CodedError<C> {
    const cause = toErrorCause(error);
    const wrapped = new CodedError(code, message ?? messageFromCause(cause), { cause });
    captureStackFromCaller(wrapped, CodedError.fromCause);
    return wrapped;
  }

  /**
   * Narrow a {@link CodedError} to `CodedError<C>` after `switch (error.code)`.
   * Prefer {@link isCodedError} when the value is still a union of specific codes —
   * bare `instanceof CodedError` widens to `CodedError<string>` and kills exhaustiveness.
   */
  static assertErrorCode<const C extends string>(error: CodedError, code: C): asserts error is CodedError<C> {
    if (error.code !== code) throw error;
  }

  override toString(): string {
    const code = `[${this.code}]`;
    return this.message === this.code ? code : `${code} ${this.message}`;
  }

  toJSON(): { code: C; message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * `instanceof CodedError` that keeps members of a known error union.
 * Bare `instanceof` widens to `CodedError<string>` / `CodedError<any>` and kills exhaustiveness.
 *
 * When the value is only typed as `Error` / `unknown` (e.g. `resultify` catch), there is nothing
 * to extract — falls back to `CodedError` (open codes; close with `default: throw`).
 */
export function isCodedError<E>(error: E): error is NarrowCodedError<E> {
  return error instanceof CodedError;
}

type NarrowCodedError<E> = [Extract<E, CodedError<string>>] extends [never]
  ? E & CodedError
  : Extract<E, CodedError<string>>;


function toErrorCause(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error), { cause: error });
}

function messageFromCause(error: unknown): string {
  const cause = toErrorCause(error);
  if (!cause.message) return cause.name;
  if (!cause.name || cause.name === 'Error') return cause.message;
  return `${cause.name}: ${cause.message}`;
}

function captureStackFromCaller(error: Error, fn: (...args: never[]) => unknown): void {
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(error, fn);
  }
}
