/**
 * The one spelling fold every reserved-path comparison uses (G0b-8, G0b-9):
 * the path registry classifies through it, and the import's path policy and
 * the commit's reserved-path check refuse through it, so a spelling the
 * filesystem resolves onto a reserved path is that path everywhere.
 *
 * @module
 */

/**
 * Spellings whose fold can differ from the path as written.
 *
 * Cheap enough to run on every classified path: a lowercase printable-ASCII path
 * with no `:`, and no trailing dot or space on any segment, already *is* its
 * fold, and only the paths this admits pay for one below. Any other character
 * may fold under Unicode case folding (`ſ`, the Kelvin sign), so it folds.
 */
const mayFold = /[A-Z:]|[^ -~]|[. ](?:\/|$)/u;

/**
 * One path as the filesystem underneath will fold it.
 *
 * Every filesystem a `NodeFsProvider` runs on folds case; Win32 folds trailing
 * dots and spaces, and NTFS resolves an alternate data stream to the entry it
 * hangs off — so `vendor/.Git/config`, `vendor/.git./HEAD` and
 * `.git::$INDEX_ALLOCATION/config` all open the real store while a byte
 * comparison calls them the user's content (G0-1, G0-5, G0b-3). The same defence
 * `portable-tree.ts` applies to a revision tree, spelled the same way.
 * Normalization is in it for that reason rather than because it can change an
 * answer: every prefix is ASCII, which normalization never rewrites. Case folds
 * through upper then lower case, the full Unicode folding that ext4 casefold,
 * APFS and NTFS approximate: `ſ` (U+017F) becomes `s` and the Kelvin sign `k`,
 * which a lower-case mapping alone leaves for `ſ`.
 *
 * A `:` is legal in a name a person types, so the stream suffix is dropped here
 * rather than rejected by the canonicaliser: `notes: draft.md` stays the user's
 * file, it simply classifies as `notes` would. Win32 8.3 short names (`GIT~1`)
 * are a recorded non-goal — no Windows target ships, and the alias is minted by
 * the filesystem rather than spelled by a caller.
 *
 * @param relative - Path relative to the project root, leading `/` already dropped.
 * @returns The spelling every supported filesystem resolves this path to.
 */
const foldSpelling = (relative: string): string =>
  relative
    .normalize('NFC')
    .toUpperCase()
    .toLowerCase()
    .replaceAll(/:[^/]*(?=\/|$)/gu, '')
    .replaceAll(/[. ]+(?=\/|$)/gu, '');

/**
 * One project-relative path as every supported filesystem resolves it: NFC,
 * case folded, each segment's `:stream` suffix and trailing dots and spaces
 * dropped. A path that is already its own fold pays one regex test.
 *
 * @param relative - Path relative to the project root, leading `/` already dropped.
 * @returns The folded spelling.
 * @public
 */
export const foldPathSpelling = (relative: string): string =>
  mayFold.test(relative) ? foldSpelling(relative) : relative;
