declare const materializedWorkspaceIdBrand: unique symbol;

/** Opaque identity of an isolated materialized workspace. @public */
export type MaterializedWorkspaceId = string & { readonly [materializedWorkspaceIdBrand]: true };

/**
 * Validate and brand an externally supplied workspace identity.
 *
 * @param value - Path-safe opaque workspace identifier.
 * @returns The validated nominal identity.
 * @public
 */
export const materializedWorkspaceId = (value: string): MaterializedWorkspaceId => {
  if (value.length === 0 || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value)) {
    throw new TypeError('MaterializedWorkspaceId must be a non-empty path-safe opaque identifier.');
  }
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- runtime validation establishes the opaque brand.
  return value as MaterializedWorkspaceId;
};
