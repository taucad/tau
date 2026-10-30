/**
 * One `Range` request header, read against the signed size before any storage call.
 *
 * Only a single `bytes=` range is honoured. Several ranges, another unit or a
 * value that does not parse are ignored and the whole object is served, as RFC
 * 9110 §14.2 allows; a well-formed range that starts at or past the end is
 * unsatisfiable (`416`).
 */

/** What a request asked for, resolved against the object's size. */
export type RangeRequest =
  | Readonly<{ kind: 'full' }>
  | Readonly<{ kind: 'partial'; offset: number; length: number }>
  | Readonly<{ kind: 'unsatisfiable' }>;

const singleRange = /^bytes=(\d{0,15})-(\d{0,15})$/u;

/**
 * Resolve a `Range` header against the signed size.
 *
 * @param header - The request's `Range` value, if any.
 * @param size - The object's size, as the link signed it.
 * @returns The whole object, one byte range within it, or unsatisfiable.
 */
export const resolveRange = (header: string | undefined, size: number): RangeRequest => {
  const match = header === undefined ? undefined : (singleRange.exec(header.trim()) ?? undefined);
  if (match === undefined) {
    return { kind: 'full' };
  }
  const [, firstText = '', lastText = ''] = match;
  if (firstText === '' && lastText === '') {
    return { kind: 'full' };
  }
  if (firstText === '') {
    /* `bytes=-n`: the last n bytes. */
    const suffix = Number(lastText);
    if (suffix === 0 || size === 0) {
      return { kind: 'unsatisfiable' };
    }
    const length = Math.min(suffix, size);
    return { kind: 'partial', offset: size - length, length };
  }
  const first = Number(firstText);
  const last = lastText === '' ? undefined : Number(lastText);
  if (last !== undefined && last < first) {
    return { kind: 'full' };
  }
  if (first >= size) {
    return { kind: 'unsatisfiable' };
  }
  const end = Math.min(last ?? size - 1, size - 1);
  return { kind: 'partial', offset: first, length: end - first + 1 };
};
