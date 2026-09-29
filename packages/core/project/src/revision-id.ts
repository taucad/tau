declare const revisionIdBrand: unique symbol;

/** Opaque identity of one immutable revision. @public */
export type RevisionId = string & { readonly [revisionIdBrand]: true };

const assertOpaqueId = (value: string, label: string): void => {
  if (value.length === 0 || value.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)) {
    throw new TypeError(`${label} must be a non-empty opaque identifier without path separators.`);
  }
};

/**
 * Validate and brand an externally supplied revision identity.
 *
 * @param value - Durable opaque revision identifier.
 * @returns The validated nominal identifier.
 * @public
 */
export const revisionId = (value: string): RevisionId => {
  assertOpaqueId(value, 'RevisionId');
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- runtime validation establishes the opaque brand.
  return value as RevisionId;
};
