/**
 * Stable failure classes of `@taucad/archive-core`. Nothing is written when any of them is thrown.
 *
 * - `DOWNLOAD_FAILED`: no attempt returned the declared bytes (HTTP status, transport error, length, redirect).
 * - `INTEGRITY_MISMATCH`: the bytes do not match their SRI pin, or a wheel member does not match its `RECORD` row.
 * - `EXTRACTION_REFUSED`: a hostile or malformed entry, an escaping link, a special file or an exceeded cap.
 * - `UNSUPPORTED_FEATURE`: a well-formed archive uses something this reader does not install.
 * @public
 */
export type ArchiveErrorCode = 'DOWNLOAD_FAILED' | 'INTEGRITY_MISMATCH' | 'EXTRACTION_REFUSED' | 'UNSUPPORTED_FEATURE';

/**
 * Refines an {@link ArchiveErrorCode} so a host can phrase its own message without parsing text.
 * @public
 */
export type ArchiveErrorReason =
  | 'http-status'
  | 'transport'
  | 'byte-length'
  | 'redirect'
  | 'digest'
  | 'record'
  | 'unsafe-path'
  | 'escaping-link'
  | 'special-entry'
  | 'duplicate-path'
  | 'limit'
  | 'malformed'
  | 'data-scheme'
  | 'compression-method'
  | 'encryption'
  | 'zip-symlink';

/**
 * Options of {@link ArchiveError}.
 * @public
 */
export type ArchiveErrorOptions = {
  readonly reason: ArchiveErrorReason;
  /** The archive entry or URL the failure is about. */
  readonly path?: string;
  /** The raw transport or format detail, such as `HTTP 404`. */
  readonly detail?: string;
  readonly cause?: unknown;
};

/**
 * A typed archive failure with a stable `code` and `reason`.
 * @public
 */
export class ArchiveError extends Error {
  public override readonly name = 'ArchiveError';
  public readonly code: ArchiveErrorCode;
  public readonly reason: ArchiveErrorReason;
  public readonly path: string | undefined;
  public readonly detail: string | undefined;

  public constructor(code: ArchiveErrorCode, message: string, options: ArchiveErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.reason = options.reason;
    this.path = options.path;
    this.detail = options.detail;
  }
}
