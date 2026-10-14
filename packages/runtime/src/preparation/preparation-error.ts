import type { PreparationErrorCode } from '#preparation/preparation.types.js';

/**
 * Options of {@link PreparationError}.
 * @public
 */
export type PreparationErrorOptions = {
  /** The manifest field a `MANIFEST_INVALID` error is about, such as `dependencies.engine[0].payloads[2].integrity`. */
  readonly field?: string;
  readonly cause?: unknown;
};

/**
 * A typed preparation failure with a stable `code`.
 * @public
 */
export class PreparationError extends Error {
  public override readonly name = 'PreparationError';
  public readonly code: PreparationErrorCode;
  public readonly field: string | undefined;

  public constructor(code: PreparationErrorCode, message: string, options: PreparationErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.field = options.field;
  }
}
