/* oxlint-disable typescript/no-restricted-types -- Capability identity accepts callable and class instances, not arbitrary record fields. */
const identities = new WeakMap<object, number>();
let sequence = 0;

/** A query-cache identity for the actual capability incarnation, independent of its path. */
export const filesystemSourceIdentity = (source: object): number => {
  let identity = identities.get(source);
  if (identity === undefined) {
    identity = ++sequence;
    identities.set(source, identity);
  }
  return identity;
};
