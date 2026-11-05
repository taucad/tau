/**
 * Where a commit's head listing lives in its repository, apart from the code
 * that builds one, so the catalogue route can name listing keys without
 * reaching git or a store write (DC1, DC3).
 *
 * @module
 */

/** Where one commit's listing lives in its repository. */
export const listingKeyFor = (commit: string): string => `listings/${commit}.tsv.gz`;

/** The commit a listing key names, or `undefined` for any other key. */
export const commitOfListingKey = (key: string): string | undefined =>
  /^listings\/(?<commit>[\da-f]{40}(?:[\da-f]{24})?)\.tsv\.gz$/u.exec(key)?.groups?.['commit'];
