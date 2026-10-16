/** Typed share failure categories safe for UI branching and logging. @public */
export type ShareErrorCode =
  | 'SHARE_ARTIFACT_INVALID'
  | 'SHARE_ARTIFACT_LIMIT'
  | 'SHARE_AUTH_REQUIRED'
  | 'SHARE_PERMISSION_REQUIRED'
  | 'SHARE_PROVIDER_INVALID_RESPONSE'
  | 'SHARE_PROVIDER_UNAVAILABLE'
  | 'SHARE_LOCATOR_INVALID'
  | 'SHARE_PASSWORD_REQUIRED'
  | 'SHARE_PROVIDER_UNKNOWN';

/** Error containing only a stable code and non-sensitive presentation message. @public */
export class ShareError extends Error {
  public readonly code: ShareErrorCode;

  /** Create a typed share error. @public */
  public constructor(code: ShareErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ShareError';
    this.code = code;
  }
}

/** Realm-safe guard for {@link ShareError}. @public */
export const isShareError = (error: unknown): error is ShareError =>
  error instanceof Error && error.name === 'ShareError' && 'code' in error;
