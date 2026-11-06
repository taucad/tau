/**
 * Where a commit's head listing lives in its repository, apart from the code
 * that builds one, so the catalogue route can name listing keys without
 * reaching git or a store write (DC1, DC3).
 *
 * @module
 */

/** Where one commit's listing lives in its repository. */
export const listingKeyFor = (commit: string): string => `listings/${commit}.tsv.gz`;

/**
 * The marker that dates when a commit's listing stopped being named by any
 * ref: `retired-listings/<unix ms>-<commit>`. The sweep ages a listing from
 * its marker, as packs are aged from theirs, not from when it was written.
 */
export const listingRetirementKeyFor = (commit: string, at: Date): string =>
  `retired-listings/${String(at.getTime())}-${commit}`;

/** A listing retirement marker's time and commit, or `undefined` for any other key. */
export const listingRetirementOf = (key: string): { readonly at: number; readonly commit: string } | undefined => {
  const named = /^retired-listings\/(?<at>\d{1,15})-(?<commit>[\da-f]{40}(?:[\da-f]{24})?)$/u.exec(key)?.groups;
  return named === undefined ? undefined : { at: Number(named['at']), commit: named['commit']! };
};

/** The commit a listing key names, or `undefined` for any other key. */
export const commitOfListingKey = (key: string): string | undefined =>
  /^listings\/(?<commit>[\da-f]{40}(?:[\da-f]{24})?)\.tsv\.gz$/u.exec(key)?.groups?.['commit'];
