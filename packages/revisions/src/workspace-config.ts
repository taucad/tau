/**
 * The generated ignore file, derived from the path registry.
 *
 * The revision engine tracks whatever the ignore file does not exclude, so
 * derived content is excluded by a generated file rather than by hope
 * (I-DERIVED). What counts as derived is not restated here: it is every
 * {@link pathRegistry} row whose bytes are not versioned, so the ignore file
 * and the recorder's capture exclusions cannot drift — which is how
 * `.git/HEAD`, `.tau/artifacts/**` and `node_modules` once reached a captured
 * tree.
 *
 * The content is pure. Each adapter supplies its own writer, so the same bytes
 * land on a Node host and in the browser provider.
 */

import { pathRegistry } from '@taucad/filesystem/path-registry';

const unversioned = pathRegistry.filter((row) => !row.versioned);

/**
 * Paths never carried by a revision, as ignore patterns. The `.tau` families and
 * `exports` are anchored to the project root because that is the only place they
 * are Tau's; `node_modules` and the control plane are not, because a nested one
 * is derived or private too.
 *
 * An unanchored row is spelled `**\/` rather than bare: git anchors any pattern
 * that holds a slash to the directory of the ignore file, so a bare
 * `.tau/binding.json` would leave a nested one versioned and disagree with
 * `classify` (PP5).
 *
 * A control-plane directory row is spelled without the trailing `/` that every
 * other directory row carries. A trailing slash restricts the pattern to
 * directories, and the row also covers the one-line `.git` a worktree or
 * submodule leaves behind — unversioned by `classify`, so a directory-only
 * pattern breaks PP5 for exactly the shape the row exists to catch. The cache
 * keeps its slash: a file named `node_modules` is not the cache.
 *
 * @public
 */
export const generatedIgnoreEntries: readonly string[] = Object.freeze(
  unversioned.map(
    (row) => `${row.anchored ? '/' : '**/'}${row.prefix}${row.directory && row.class !== 'control-plane' ? '/' : ''}`,
  ),
);

/** Project-relative path of the generated ignore file. @public */
export const generatedIgnorePath = '.gitignore';

const ignoreMarker = '# BEGIN Tau generated — derived content is never versioned';
const attributesMarker = '# BEGIN Tau generated — large objects are git LFS objects';
const markerEnd = '# END Tau generated';

/**
 * Replace Tau's generated block in a hand-written file, or append it.
 *
 * Existing content is preserved: a hand-written file keeps every line it had,
 * and re-running this is a no-op once the block is present.
 *
 * @param existing - Current file content, or `undefined` when absent.
 * @param markerStart - The block's opening comment.
 * @param lines - The block's body.
 * @returns The full file content to write.
 */
const withGeneratedBlock = (existing: string | undefined, markerStart: string, lines: readonly string[]): string => {
  const previous = existing ?? '';
  const withoutBlock = previous.includes(markerStart)
    ? previous.slice(0, previous.indexOf(markerStart)) +
      previous.slice(previous.indexOf(markerEnd) + markerEnd.length).replace(/^\n/u, '')
    : previous;
  const head = withoutBlock === '' ? '' : withoutBlock.endsWith('\n') ? withoutBlock : `${withoutBlock}\n`;
  return `${head}${markerStart}\n${lines.join('\n')}\n${markerEnd}\n`;
};

/**
 * Merge Tau's required ignore lines into any existing ignore file.
 *
 * @param existing - Current ignore file content, or `undefined` when absent.
 * @param additional - Extra project-specific lines to include in the block.
 * @returns The full file content to write.
 * @public
 */
export const generatedIgnoreContent = (existing: string | undefined, additional: readonly string[] = []): string =>
  withGeneratedBlock(existing, ignoreMarker, [...generatedIgnoreEntries, ...additional]);

/**
 * The file families whose bytes are large objects wherever they appear (A24).
 *
 * Extensions, not registry rows: the registry classifies *paths* — which
 * `.tau` subtree a file is in, whether its bytes are versioned — and says
 * nothing about what a file is made of. A `.step` is a large object in `src/`
 * and in `models/` alike, so the two tables answer different questions and the
 * second one lives here, next to its only consumer.
 *
 * Text-shaped members are deliberate: an imported STEP or OBJ is ASCII and
 * routinely tens of megabytes, and the design names exactly those as the
 * expected LFS objects. `-text` keeps git out of their bytes either way.
 *
 * @public
 */
export const largeObjectExtensions: readonly string[] = Object.freeze([
  // CAD interchange and native part files.
  '3dm',
  'brep',
  'catpart',
  'iges',
  'igs',
  'ipt',
  'iam',
  'sat',
  'sldasm',
  'sldprt',
  'step',
  'stp',
  'x_b',
  'x_t',
  // Meshes and scenes.
  '3ds',
  '3mf',
  'blend',
  'dae',
  'fbx',
  'glb',
  'obj',
  'off',
  'ply',
  'stl',
  'usd',
  'usda',
  'usdc',
  'usdz',
  // Images, media and fonts.
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'mov',
  'mp3',
  'mp4',
  'otf',
  'png',
  'tif',
  'tiff',
  'ttf',
  'wav',
  'webm',
  'webp',
  'woff',
  'woff2',
  // Archives and compiled artifacts.
  '7z',
  'gz',
  'pdf',
  'tar',
  'tgz',
  'wasm',
  'zip',
]);

/**
 * Bytes at or above which any file is a large object, whatever its extension.
 *
 * The Jujutsu `snapshot.max-new-file-size` default, kept because it is the
 * threshold every neighbouring tool already uses. `.gitattributes` cannot
 * express it — git has no size predicate — so this value is read by the port's
 * clean step at write time, and the attributes file carries only the families.
 *
 * @public
 */
export const largeObjectThresholdBytes = 1024 * 1024;

/**
 * Whether one path's family is always a large object.
 *
 * @param projectRelativePath - Path relative to the project root.
 * @returns Whether `.gitattributes` tracks this path with git LFS.
 * @public
 */
export const isLargeObjectPath = (projectRelativePath: string): boolean => {
  const name = projectRelativePath.slice(projectRelativePath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && largeObjectExtensions.includes(name.slice(dot + 1).toLowerCase());
};

/** Project-relative path of the generated attributes file. @public */
export const generatedGitattributesPath = '.gitattributes';

const lfsAttributes = 'filter=lfs diff=lfs merge=lfs -text';

/**
 * One project-relative path as a `.gitattributes` pattern.
 *
 * Anchored with a leading `/` so it names this file and not every file of that
 * name in every directory.
 *
 * ponytail: whitespace becomes `?` (gitattributes has no quoting — the pattern
 * ends at the first space — and `?` is gitignore's single-character wildcard,
 * so the pattern still matches the file). `#`, `!` and `[` in a path would need
 * the same treatment; no CAD workspace has produced one yet.
 *
 * @param path - Project-relative path.
 * @returns The pattern naming exactly that path.
 */
const attributePattern = (path: string): string => `/${path.replaceAll(/\s/gu, '?')}`;

/**
 * The patterns Tau's generated block already tracks by name.
 *
 * @param existing - Current attributes file content, or `undefined` when absent.
 * @returns Anchored patterns, exactly as {@link attributePattern} wrote them.
 */
const generatedTrackedPatterns = (existing: string | undefined): ReadonlySet<string> => {
  /* One entry, because there is one attributes file per cut and every path in
   * that cut asks about it: `cleanLargeObjects` asks twice per file, so a
   * 4,000-file project re-split the same string 8,000 times. The cache is the
   * string itself, so a changed file is a miss by construction. */
  const held = parsedTrackedPatterns;
  if (held !== undefined && held.source === existing) {
    return held.patterns;
  }
  const start = existing?.indexOf(attributesMarker) ?? -1;
  const patterns =
    existing === undefined || start === -1
      ? new Set<string>()
      : new Set(
          existing
            .slice(start, existing.indexOf(markerEnd, start))
            .split('\n')
            .filter((line) => line.startsWith('/'))
            .map((line) => line.slice(0, line.indexOf(' '))),
        );
  parsedTrackedPatterns = { source: existing, patterns };
  return patterns;
};

let parsedTrackedPatterns: Readonly<{ source: string | undefined; patterns: ReadonlySet<string> }> | undefined;

/**
 * Merge Tau's LFS tracking rules into any existing attributes file.
 *
 * One line per family, in git-lfs's own `git lfs track` spelling, so a stock
 * clone of the project resolves the same pointers with no Tau client, plus one
 * line per path a cut tracked by size (P15) — the families table cannot name
 * those, and without a line for them a stock clone never smudges their bytes
 * back.
 *
 * @param existing - Current attributes file content, or `undefined` when absent.
 * @param additionalPaths - Project-relative paths to track by name.
 * @returns The full file content to write.
 * @public
 */
export const generatedGitattributesContent = (
  existing: string | undefined,
  additionalPaths: readonly string[] = [],
): string =>
  withGeneratedBlock(existing, attributesMarker, [
    ...largeObjectExtensions.map((extension) => `*.${extension} ${lfsAttributes}`),
    ...[...new Set([...generatedTrackedPatterns(existing), ...additionalPaths.map((path) => attributePattern(path))])]
      .toSorted()
      .map((pattern) => `${pattern} ${lfsAttributes}`),
  ]);

/**
 * Whether the project's attributes already track one path as a large object.
 *
 * The whole pointer rule, on both legs: a path is stored as a pointer when
 * `.gitattributes` says so — by its family, or by its own name — and never
 * because of what it weighs. Size decides whether a cut *adds* a line, and that
 * line is what a stock clone reads (P15).
 *
 * @param projectRelativePath - Path relative to the project root.
 * @param attributes - Current attributes file content, or `undefined` when absent.
 * @returns Whether this path's bytes are an LFS object.
 * @public
 */
export const isTrackedLargeObjectPath = (projectRelativePath: string, attributes: string | undefined): boolean =>
  isLargeObjectPath(projectRelativePath) ||
  generatedTrackedPatterns(attributes).has(attributePattern(projectRelativePath));
