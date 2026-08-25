/**
 * Zoo SDK error detection helpers.
 *
 * The Zoo (KCL) SDK does NOT yet expose typed error codes for export
 * failures — every error is an `Error` whose `message` is the only
 * machine-readable signal. This file isolates every substring match against
 * Zoo errors behind named, JSDoc'd helpers so the brittle string contracts
 * are auditable and replaceable in one place.
 *
 * When the Zoo SDK ships structured errors, drop this helper and switch the
 * call sites to a typed `error.code === 'ZOO_NOTHING_TO_EXPORT'` check.
 *
 * @see {@link https://github.com/KittyCAD/modeling-app | Zoo modeling-app source} for the upstream error origin.
 */

/**
 * Detect Zoo's "Nothing to export" empty-result signal.
 *
 * Zoo's KCL execution engine surfaces "Nothing to export" (sometimes prefixed
 * with `internal_engine: `) when the program finished without producing any
 * geometry. Our pipeline treats this as a benign empty result rather than a
 * failure, so the caller can return `[]` to consumers.
 *
 * Substring contract (Zoo SDK boundary — replace when typed errors arrive):
 * - `'Nothing to export'` (current shape)
 * - `'internal_engine: Nothing to export'` (alternative form observed in CI)
 *
 * @param error - candidate error thrown by `kcl.executeWithFiles` / export.
 * @returns `true` when the error is the Zoo empty-export signal.
 */
export function isZooEmptyExportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Nothing to export') || message.includes('internal_engine: Nothing to export');
}
