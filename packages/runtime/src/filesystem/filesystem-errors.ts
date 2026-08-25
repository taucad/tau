/**
 * Whether an unknown filesystem error means that the requested path is absent.
 *
 * @param error - Unknown provider error.
 * @returns `true` only for the cross-platform missing-path codes.
 * @public
 */
export const isNotFoundError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const { code } = error as { readonly code?: unknown };
  return code === 'ENOENT' || code === 'ENOTDIR';
};
