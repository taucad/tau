/**
 * Type guard for abort errors thrown by `AbortController` / `AbortSignal`.
 *
 * Covers both the standard `DOMException` with `name === 'AbortError'`
 * (thrown by `fetch`, XState's `waitFor`, etc.) and any `Error` subclass
 * whose `name` has been set to `'AbortError'`.
 * @public
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return false;
}

/**
 * Reads a POSIX-style `code` field from `ErrnoException`-shaped errors.
 *
 * @public
 */
export function getErrno(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
