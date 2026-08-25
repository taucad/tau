/**
 * Shared-pool lookup errors raised by the geometry materialisation layer.
 *
 * Public so consumers can classify failures via `error.code` or the realm-safe
 * guard re-exported from the runtime root.
 */

/**
 * Error raised when a consumer requests a pooled geometry entry whose key
 * is not present in the SAB-backed `SharedPool`.
 *
 * @public
 */
export class SharedPoolEntryNotFoundError extends Error {
  public readonly key: string;

  /**
   * @param key - The pool entry key that was missing.
   */
  public constructor(key: string) {
    super(`SharedPool entry not found: key=${key}`);
    this.name = 'SharedPoolEntryNotFoundError';
    this.key = key;
  }

  /** Stable machine-readable diagnostic code for a missing shared-pool entry. */
  public get code(): 'RUNTIME_SHARED_POOL_KEY_MISSING' {
    return 'RUNTIME_SHARED_POOL_KEY_MISSING';
  }
}

/**
 * Realm-safe type guard for {@link SharedPoolEntryNotFoundError}.
 *
 * @param error - Value to test.
 * @returns Whether the value is a shared-pool lookup error.
 * @public
 */
export function isSharedPoolEntryNotFoundError(error: unknown): error is SharedPoolEntryNotFoundError {
  return error instanceof Error && error.name === 'SharedPoolEntryNotFoundError';
}
