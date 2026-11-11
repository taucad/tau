/**
 * What `recordSync` needs to know about one kind of record (graphics event-driven state charter D6): how its bytes
 * read, how a record serializes, and the patch algebra that carries a person's change over bytes another party wrote.
 * Every member is pure; the machine calls them inside transitions.
 */

/** The bytes of a record file as the checked filesystem returns them. */
export type RecordBytes = Uint8Array<ArrayBuffer>;

/** Why a record's bytes are kept but not used: they do not parse, or a newer Tau wrote them. */
export type RecordRefusal = Readonly<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string }>;

/** The outcome of reading a record's bytes. */
export type RecordRead<T> =
  | Readonly<{ status: 'current'; record: T }>
  | Readonly<{ status: 'invalid' | 'newer'; code: RecordRefusal['code']; message: string }>;

/**
 * One record kind's codec and patch algebra.
 *
 * The laws, checked by property tests beside each policy:
 *
 * - `merge(base, next, diff(base, next))` is `next`;
 * - `combine` is associative over the patches of one edit history: either grouping merges to the same record;
 * - `merge` is idempotent: applying a patch to its own result changes nothing.
 */
export type RecordPolicy<T, P> = Readonly<{
  read: (bytes: RecordBytes) => RecordRead<T>;
  /** The file's text for a record. Throws when the record cannot be written (too large, a forbidden key). */
  serialize: (record: T) => string;
  /** The fields of `next` that differ from `base`; every field when there is no base. */
  diff: (base: T | undefined, next: T) => P;
  /** One patch that has the effect of `earlier` followed by `later`. */
  combine: (earlier: P | undefined, later: P) => P;
  /** `current` with the patch applied; `next` supplies what a missing or partial `current` lacks. */
  merge: (current: T | undefined, next: T, patch: P) => T;
  /** A patch that changes nothing, so no write is owed for it. */
  isEmpty: (patch: P) => boolean;
}>;

/** Whether two reads returned the same content. Absence (`null`) equals only absence. */
// oxlint-disable-next-line typescript/no-restricted-types -- Checked filesystem absence uses null.
export const sameBytes = (left: RecordBytes | null, right: RecordBytes | null): boolean =>
  left === right ||
  (left !== null &&
    right !== null &&
    right.length === left.length &&
    left.every((value, index) => value === right[index]));
