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

import { pathRegistry, reservedTauDirectory, tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { PathClassification, PathPolicy } from '@taucad/filesystem';

/**
 * The row fields a generated ignore pattern is derived from (PP5).
 *
 * Structural, so this module names the classification vocabulary and not the
 * registry's own row type: what a pattern needs to know is where the row
 * matches and whether its bytes are versioned.
 *
 * @public
 */
export type IgnoreRegistryRow = PathClassification &
  Readonly<{ prefix: string; anchored: boolean; directory: boolean }>;

/**
 * What a generated ignore block is derived from (PP5): the layout's rows and,
 * when it has one, the directory whose members no row names are unversioned.
 *
 * @public
 */
export type IgnoreLayout = Readonly<{
  rows: readonly IgnoreRegistryRow[];
  /**
   * A directory whose unlisted members are unversioned. The block excludes its
   * members (`/<dir>/*`, never `/<dir>/`) and re-includes each versioned row
   * directly inside it.
   */
  reservedDirectory?: string;
}>;

/**
 * Tau's own layout: the classifier revisions default to, and the rows and
 * reserved directory the generated ignore block that must agree with it is
 * derived from (EQ6, PP5).
 *
 * **The one place `@taucad/filesystem/path-registry` is imported** in this
 * package's non-test source (`import-boundary.test.ts` pins it, mirroring L1's
 * own rule). The classifier and its layout travel as one value because PP5 is a
 * property of the *pair*: every unversioned path must be excluded by the ignore
 * block, so a project that answers with another policy has to supply that
 * policy's layout in the same breath, and the type makes it do so.
 *
 * @public
 */
export const tauRevisionPolicy: Readonly<{ policy: PathPolicy } & Required<IgnoreLayout>> = Object.freeze({
  policy: tauPathPolicy,
  rows: pathRegistry,
  reservedDirectory: reservedTauDirectory,
});

/**
 * One row's ignore pattern, without the anchor.
 *
 * @param row - The registry row.
 * @returns Its prefix, with the directory-only `/` when the row takes one.
 */
const rowPattern = (row: IgnoreRegistryRow): string =>
  `${row.prefix}${row.directory && row.class !== 'control-plane' ? '/' : ''}`;

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
 * A reserved directory leads the block: `/<dir>/*` excludes its members rather
 * than the directory, so the `!` line after it can re-include each versioned
 * row inside it — which `/<dir>/` would make impossible. The rows it already
 * covers keep their own lines so the block still names each family.
 *
 * @param layout - The layout's rows and reserved directory; every unversioned
 *   path is excluded (PP5), so this must be the layout of the policy this
 *   project classifies with.
 * @returns The reserved directory's head, then one ignore pattern per
 *   unversioned row, in registry order.
 * @public
 */
export const generatedIgnoreEntries = ({ rows, reservedDirectory }: IgnoreLayout): readonly string[] => [
  /* ponytail: one negation re-includes a direct member only; a versioned row
   * nested deeper (`.tau/a/b`) needs a `!/.tau/a/` + `/.tau/a/*` chain. The
   * unit test pins that Tau's layout has none. */
  ...(reservedDirectory === undefined
    ? []
    : [
        `/${reservedDirectory}/*`,
        ...rows
          .filter((row) => row.versioned && row.prefix.startsWith(`${reservedDirectory}/`))
          /* No trailing `/`: a directory row classifies its bare path too, so a
           * file named `.tau/skills` is versioned and must be re-included. */
          .map((row) => `!/${row.prefix}`),
      ]),
  ...rows.filter((row) => !row.versioned).map((row) => `${row.anchored ? '/' : '**/'}${rowPattern(row)}`),
];

/** Project-relative path of the generated ignore file. @public */
export const generatedIgnorePath = '.gitignore';

const ignoreMarker = '# BEGIN Tau generated — derived content is never versioned';
const attributesMarker = '# BEGIN Tau generated — large objects are git LFS objects';
const markerEnd = '# END Tau generated';

/**
 * Whether an ignore or attributes file carries one of Tau's generated blocks.
 *
 * A store Tau created writes its ignore block before `git init`, so a
 * repository already at the project path whose files carry neither block is
 * one the person made.
 *
 * @param content - File content, or `undefined` when absent.
 * @returns Whether a generated block is present.
 */
export const hasGeneratedBlock = (content: string | undefined): boolean =>
  content !== undefined && (content.includes(ignoreMarker) || content.includes(attributesMarker));

/**
 * Replace Tau's generated block in a file, in place, or append it.
 *
 * Existing content is preserved: every line outside the block stays where it
 * was, so a person's line after the block still overrides it, and re-running
 * this is a no-op once the block is current. A block with no end marker is
 * malformed, and the file comes back unchanged.
 *
 * @param existing - Current file content, or `undefined` when absent.
 * @param markerStart - The block's opening comment.
 * @param lines - The block's body.
 * @returns The full file content to write.
 */
const withGeneratedBlock = (existing: string | undefined, markerStart: string, lines: readonly string[]): string => {
  const previous = existing ?? '';
  const block = `${markerStart}\n${lines.join('\n')}\n${markerEnd}\n`;
  const start = previous.indexOf(markerStart);
  if (start !== -1) {
    const end = previous.indexOf(markerEnd, start);
    /* A block that lost its end marker is malformed: nothing after it is
     * known to be Tau's, so the file is left exactly as it is until a person
     * mends it (W11.2 review). */
    if (end === -1) {
      return previous;
    }
    return previous.slice(0, start) + block + previous.slice(end + markerEnd.length).replace(/^\n/u, '');
  }
  const head = previous === '' ? '' : previous.endsWith('\n') ? previous : `${previous}\n`;
  return `${head}${block}`;
};

/**
 * Merge Tau's required ignore lines into any existing ignore file.
 *
 * @param existing - Current ignore file content, or `undefined` when absent.
 * @param additional - Extra project-specific lines to include in the block.
 * @param layout - The layout, defaulting to Tau's own. A project that
 *   classifies with another policy passes that policy's layout, or the block
 *   and the capture disagree (PP5).
 * @returns The full file content to write.
 * @public
 */
export const generatedIgnoreContent = (
  existing: string | undefined,
  additional: readonly string[] = [],
  layout: IgnoreLayout = tauRevisionPolicy,
): string => withGeneratedBlock(existing, ignoreMarker, [...generatedIgnoreEntries(layout), ...additional]);

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
 * Whether one path's family is in the families table, case-insensitively.
 *
 * Decides only which lines a cut adds to Tau's generated attributes block:
 * a path is stored as a pointer when the attributes say so
 * ({@link isTrackedLargeObjectPath}), never because of its family alone.
 *
 * @param projectRelativePath - Path relative to the project root.
 * @returns Whether the path's extension is a large-object family.
 * @public
 */
export const isLargeObjectPath = (projectRelativePath: string): boolean => {
  const name = projectRelativePath.slice(projectRelativePath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && largeObjectExtensions.includes(name.slice(dot + 1).toLowerCase());
};

/** Project-relative path of the generated attributes file. @public */
export const generatedGitattributesPath = '.gitattributes';

/** The files Tau owns as project setup: what it generates at the project root (A4). @public */
export const generatedSetupPaths: ReadonlySet<string> = new Set([generatedIgnorePath, generatedGitattributesPath]);

const lfsAttributes = 'filter=lfs diff=lfs merge=lfs -text';

/**
 * One project-relative path as a `.gitattributes` pattern.
 *
 * Anchored with a leading `/` so it names this file and not every file of that
 * name in every directory.
 *
 * The glob characters wildmatch reads — `\`, `[`, `*` and `?` — are escaped
 * with `\`, so `renders/shot[final].exr` names that file and not
 * `renders/shotf.exr`. Whitespace becomes `?` (gitattributes has no quoting —
 * the pattern ends at the first space — and `?` matches the one character).
 * The leading `/` means a `#` or `!` in the name is never the line's first
 * character.
 *
 * @param path - Project-relative path.
 * @returns The pattern naming exactly that path.
 */
const attributePattern = (path: string): string =>
  `/${path.replaceAll(/[*?[\\]/gu, String.raw`\$&`).replaceAll(/\s/gu, '?')}`;

/**
 * One per-path line of Tau's block as an older build wrote it, before glob
 * characters were escaped: everything literal except `?`, which stood for
 * whitespace. Only ever asked which path the line meant, so the block is
 * rewritten escaped before a cut decides that path (W11.2 re-review).
 *
 * @param pattern - An anchored per-path pattern from Tau's block.
 * @returns A matcher over a root-relative path.
 */
const legacyPathMatcher = (pattern: string): ((relative: string) => boolean) => {
  const body = pattern.slice(1);
  const expression = new RegExp(
    `^${[...body].map((character) => (character === '?' ? '[^/]' : character.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`))).join('')}$`,
    'u',
  );
  return (relative) => expression.test(relative);
};

/**
 * The paths an older build's unescaped per-path lines in Tau's block named,
 * where Git no longer reads them as naming (`/renders/shot[final].bin` is a
 * class to Git, so the file itself is unspecified). Never a verdict: a cut
 * whose new or changed content such a line names rewrites the block, escaped,
 * and the verdict is read from what Git reads (W11.2 re-review).
 *
 * @param content - The root attributes file, or `undefined`.
 * @returns A matcher over project-relative paths, or `undefined` when no such line stands.
 * @internal
 */
export const legacyBlockMatcher = (content: string | undefined): ((path: string) => boolean) | undefined => {
  const legacy =
    generatedAttributesBlock(content)
      ?.split(/\r?\n/u)
      .filter((line) => line.startsWith('/'))
      .map((line) => line.split(/\s/u, 1)[0]!)
      .filter((pattern) => escapedLegacyPattern(pattern) !== pattern) ?? [];
  if (legacy.length === 0) {
    return undefined;
  }
  const matchers = legacy.map((pattern) => legacyPathMatcher(pattern));
  return (path) => matchers.some((matches) => matches(path));
};

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
  const block = generatedAttributesBlock(existing);
  const patterns =
    block === undefined
      ? new Set<string>()
      : new Set(
          block
            .split('\n')
            .filter((line) => line.startsWith('/'))
            .map((line) => escapedLegacyPattern(line.slice(0, line.indexOf(' ')))),
        );
  parsedTrackedPatterns = { source: existing, patterns };
  return patterns;
};

let parsedTrackedPatterns: Readonly<{ source: string | undefined; patterns: ReadonlySet<string> }> | undefined;

/**
 * The body of Tau's large-object block, when the file holds a well-formed one:
 * its start marker, then its end marker.
 *
 * @param content - Attributes file content, or `undefined` when absent.
 * @returns The lines between the markers, or `undefined`.
 */
const generatedAttributesBlock = (content: string | undefined): string | undefined => {
  const start = content?.indexOf(attributesMarker) ?? -1;
  const end = start === -1 ? -1 : content!.indexOf(markerEnd, start);
  return end === -1 ? undefined : content!.slice(start + attributesMarker.length, end);
};

/**
 * A per-path pattern an older build wrote, rewritten with its glob characters
 * escaped, so a regenerated block names the path for a stock Git too. A
 * pattern already escaped is returned as it is: an older build never wrote a
 * `\`, and this build never writes `[` or `*` bare.
 *
 * ponytail: a `?` stays a wildcard either way; an older build wrote it for
 * whitespace, and it still matches the one character it stood for.
 *
 * @param pattern - An anchored per-path pattern from Tau's block.
 * @returns The pattern as this build writes it.
 */
const escapedLegacyPattern = (pattern: string): string =>
  pattern.includes('\\') ? pattern : pattern.replaceAll(/[*[]/gu, String.raw`\$&`);

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
 * Whether an attributes file carries Tau's generated large-object block.
 *
 * The block is what makes Tau a writer of the file at all: a cut that must
 * add a per-path line regenerates it (the families, the per-path lines it
 * already holds, and the new lines), and a file without a well-formed one is
 * the person's alone, never written.
 *
 * @param content - Attributes file content, or `undefined` when absent.
 * @returns Whether Tau's large-object block is present.
 * @internal
 */
export const hasGeneratedAttributesBlock = (content: string | undefined): boolean =>
  generatedAttributesBlock(content) !== undefined;

/**
 * Whether one path's attributes put it on git LFS, by the root attributes file.
 *
 * The whole pointer rule, on both legs and for every repository, as stock Git
 * decides it: a path is stored as a pointer exactly when `.gitattributes` says
 * `filter=lfs` for it (D16). Tau's families table and size threshold decide
 * only which lines a cut adds to Tau's own block (P15), never a pointer
 * directly, so a stock clone smudges every pointer Tau writes.
 *
 * ponytail: only the root file is read here; a cut reads every attributes file
 * in the tree (`cleanLargeObjects`). The checkout-read and adoption seams that
 * call this hold the root file alone.
 *
 * @param projectRelativePath - Path relative to the project root.
 * @param attributes - Root attributes file content, or `undefined` when absent.
 * @returns Whether this path's bytes are an LFS object.
 * @public
 */
export const isTrackedLargeObjectPath = (projectRelativePath: string, attributes: string | undefined): boolean => {
  /* One entry: every path in a cut asks about the same file. */
  if (rootMatcher === undefined || rootMatcher.source !== attributes) {
    rootMatcher = {
      source: attributes,
      matches:
        attributes === undefined
          ? () => false
          : repositoryLargeObjectMatcher(new Map([[generatedGitattributesPath, attributes]])),
    };
  }
  return rootMatcher.matches(projectRelativePath);
};

let rootMatcher: Readonly<{ source: string | undefined; matches: (path: string) => boolean }> | undefined;

/**
 * One `.gitattributes` pattern as a matcher over a path relative to the
 * file's directory, in git's wildmatch spelling (`gitignore(5)`): `*` and `?`
 * stop at `/`, `[...]` is a class (`!` or `^` negates), `\` escapes the next
 * character, and `**` between slashes spans any number of directories. A
 * pattern with no slash but a trailing one names a file at any depth by its
 * own name.
 *
 * @param pattern - The pattern, unquoted, with no trailing `/`.
 * @param ignoreCase - Whether case is folded (`core.ignoreCase`).
 * @returns A matcher over the path relative to the attributes file's directory.
 */
const attributeMatcher = (pattern: string, ignoreCase = false): ((relative: string) => boolean) => {
  const anchored = pattern.includes('/');
  const body = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  let source = '';
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]!;
    if (character === '*' && body[index + 1] === '*') {
      const atStart = index === 0 || body[index - 1] === '/';
      const atEnd = index + 2 === body.length || body[index + 2] === '/';
      if (atStart && atEnd) {
        // A leading or inner double star spans zero or more directories; a trailing one, everything inside.
        source += index + 2 === body.length ? '.*' : '(?:.*/)?';
        index += index + 2 === body.length ? 1 : 2;
        continue;
      }
    }
    if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else if (character === '\\' && index + 1 < body.length) {
      index += 1;
      source += body[index]!.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
    } else if (character === '[' && body.includes(']', index + 2)) {
      const close = body.indexOf(']', index + 2);
      const inner = body.slice(index + 1, close);
      const negated = inner.startsWith('!') || inner.startsWith('^');
      const members = (negated ? inner.slice(1) : inner).replaceAll(/[\\\]^]/gu, String.raw`\$&`);
      source += negated ? `[^/${members}]` : `[${members}]`;
      index = close;
    } else {
      source += character.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
    }
  }
  const expression = new RegExp(`^${source}$`, ignoreCase ? 'iu' : 'u');
  return anchored
    ? (relative) => expression.test(relative)
    : (relative) => expression.test(relative.slice(relative.lastIndexOf('/') + 1));
};

/** One attributes line that can decide `filter`, directly or through a macro, with its tokens as written. */
type FilterRule = Readonly<{ matches: (relative: string) => boolean; tokens: readonly string[] }>;

/** How a tree's attributes are read: git's case folding, when the host's repository asks for it. @internal */
export type AttributesReading = Readonly<{
  /** `core.ignoreCase`: patterns match whatever the case (a native host on a case-insensitive disk). */
  ignoreCase?: boolean;
}>;

/** Git's one built-in macro; it never names `filter`. */
const builtInMacros: ReadonlyMap<string, readonly string[]> = new Map([['binary', ['-diff', '-merge', '-text']]]);

/**
 * The macros a root attributes file defines (`[attr]name attributes…`).
 *
 * Git honours a macro only in the top-level file, and refuses one elsewhere.
 *
 * ponytail: every definition in the file counts, wherever it stands; git
 * reads them in order, and a macro used above its own definition is rare.
 *
 * @param content - The root attributes file, or `undefined`.
 * @returns Each macro's attribute tokens by its name, the built-in ones included.
 */
const macrosOf = (content: string | undefined): ReadonlyMap<string, readonly string[]> => {
  const macros = new Map(builtInMacros);
  for (const raw of content?.split(/\r?\n/u) ?? []) {
    const line = raw.trim();
    if (line.startsWith('[attr]')) {
      const [name, ...tokens] = line.slice('[attr]'.length).split(/\s+/u);
      if (name !== undefined && name !== '') {
        macros.set(name, tokens);
      }
    }
  }
  return macros;
};

/* A token's attribute name, and its state: `set`, `unset` (`-name`), `unspecified` (`!name`) or a value. */
const tokenState = (token: string): Readonly<{ name: string; state: string }> => {
  if (token.startsWith('-')) {
    return { name: token.slice(1), state: 'unset' };
  }
  if (token.startsWith('!')) {
    return { name: token.slice(1), state: 'unspecified' };
  }
  const equals = token.indexOf('=');
  return equals === -1
    ? { name: token, state: 'set' }
    : { name: token.slice(0, equals), state: `=${token.slice(equals + 1)}` };
};

/**
 * The macros whose expansion reaches `filter`, however deep.
 *
 * @param macros - Every macro the root file defines.
 * @returns Their names.
 */
const filterMacrosOf = (macros: ReadonlyMap<string, readonly string[]>): ReadonlySet<string> => {
  const reaching = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, tokens] of macros) {
      if (
        !reaching.has(name) &&
        tokens.some((token) => {
          const { name: named } = tokenState(token);
          return named === 'filter' || reaching.has(named);
        })
      ) {
        reaching.add(name);
        grew = true;
      }
    }
  }
  return reaching;
};

/**
 * Fill attributes from one line's tokens as git's `fill_one` does: the
 * line's tokens last to first, each attribute taking the first state it is
 * given (lines are visited last to first, so the last line wins), and a macro
 * expanding only when it is set — `-name` and `!name` decide the macro
 * itself and stop a set it would have made, never undo one already made.
 *
 * @param tokens - One line's or one macro's tokens, in order.
 * @param fill - The attributes decided so far, and every macro the root file defines.
 * @param depth - How deep in macro expansion this is; a cycle stops.
 */
const fillAttributes = (
  tokens: readonly string[],
  fill: Readonly<{ filled: Map<string, string>; macros: ReadonlyMap<string, readonly string[]> }>,
  depth = 0,
): void => {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const { name, state } = tokenState(tokens[index]!);
    if (fill.filled.has(name)) {
      continue;
    }
    fill.filled.set(name, state);
    const expanded = state === 'set' && depth < 8 ? fill.macros.get(name) : undefined;
    if (expanded !== undefined) {
      fillAttributes(expanded, fill, depth + 1);
    }
  }
};

/**
 * The `filter` rules of one attributes file, in file order.
 *
 * Only lines that can decide `filter` count, directly or through a macro (see
 * {@link fillAttributes}). A negative pattern is refused by git and ignored
 * here too, as are macro definitions and a directory pattern (`dir/`), which
 * matches no file. Every pattern means what Git reads it as, an older build's
 * unescaped line in Tau's block included (see {@link legacyBlockMatcher}).
 *
 * ponytail: a C-quoted pattern (`"a b" filter=lfs`) is read with its quotes
 * dropped and `\"` unescaped; octal escapes are left as written.
 *
 * @param content - The attributes file.
 * @param macros - The macros the root file defines.
 * @param reading - Case folding.
 * @returns Its filter rules.
 */
const filterRules = (
  content: string,
  macros: ReadonlyMap<string, readonly string[]>,
  reading: AttributesReading,
): readonly FilterRule[] => {
  const reaching = filterMacrosOf(macros);
  return content.split(/\r?\n/u).flatMap((raw): FilterRule[] => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('[attr]') || line.startsWith('!')) {
      return [];
    }
    const quoted = line.startsWith('"') ? /^"((?:[^"\\]|\\.)*)"/u.exec(line) : undefined;
    const pattern = quoted?.[1]?.replaceAll(/\\(.)/gu, '$1') ?? line.split(/\s/u, 1)[0]!;
    const rest = line.slice(quoted ? quoted[0].length : pattern.length);
    const tokens = rest.split(/\s+/u).filter((token) => token !== '');
    const decides = tokens.some((token) => {
      const { name } = tokenState(token);
      return name === 'filter' || reaching.has(name);
    });
    if (!decides || pattern === '' || pattern.endsWith('/')) {
      return [];
    }
    return [{ matches: attributeMatcher(pattern, reading.ignoreCase === true), tokens }];
  });
};

/** Attributes files by their own project-relative path, as a tree holds them. @internal */
export type RepositoryAttributes = ReadonlyMap<string, string>;

/**
 * Which paths a tree's own attributes files put on git LFS (D16).
 *
 * The one rule on every leg: a path is a large object exactly when the tree's
 * `.gitattributes` files say `filter=lfs` for it, as `git add` would decide —
 * later lines override earlier ones, and a deeper file overrides a shallower
 * one. Tau's families table and size threshold never apply here directly, so
 * nothing is converted that a stock Git would have stored as a blob.
 *
 * ponytail: `$GIT_DIR/info/attributes` and `core.attributesFile` are not read:
 * a cut has to predict the tree from the tree alone (I4), so only the
 * versioned files decide.
 *
 * @param attributes - Every attributes file the tree holds, by its path.
 * @param reading - Case folding, as the host's repository asks.
 * @returns Whether one project-relative path is a large object.
 * @internal
 */
export const repositoryLargeObjectMatcher = (
  attributes: RepositoryAttributes,
  reading: AttributesReading = {},
): ((path: string) => boolean) => {
  const verdict = largeObjectVerdict(attributes, reading);
  return (path) => verdict(path) === true;
};

/**
 * The tree's attributes' verdict on one path, or `undefined` when no line
 * sets or unsets `filter` for it — the paths Tau's block may still name.
 *
 * @param attributes - Every attributes file the tree holds, by its path.
 * @param reading - Case folding, as the host's repository asks.
 * @returns `true` for `filter=lfs`, `false` for another filter or an unset one,
 *   `undefined` when the attributes say nothing about the path.
 * @internal
 */
export const largeObjectVerdict = (
  attributes: RepositoryAttributes,
  reading: AttributesReading = {},
): ((path: string) => boolean | undefined) => {
  const macros = macrosOf(attributes.get(generatedGitattributesPath));
  const fold = (text: string): string => (reading.ignoreCase === true ? text.toLowerCase() : text);
  const files = [...attributes]
    .map(([file, content]) => ({
      directory: fold(file.slice(0, file.length - generatedGitattributesPath.length)),
      rules: filterRules(content, macros, reading),
    }))
    .filter(({ rules }) => rules.length > 0)
    /* Shallowest first, so a deeper file's verdict is the one that stands. */
    .toSorted((left, right) => left.directory.split('/').length - right.directory.split('/').length);
  if (files.length === 0) {
    return () => undefined;
  }
  /* Deepest file first and each file's last line first, as git fills: the first state an attribute gets stands. */
  const reversed = files.toReversed().map(({ directory, rules }) => ({ directory, rules: rules.toReversed() }));
  return (path) => {
    const filled = new Map<string, string>();
    for (const { directory, rules } of reversed) {
      if (!fold(path).startsWith(directory)) {
        continue;
      }
      const relative = path.slice(directory.length);
      for (const rule of rules) {
        if (rule.matches(relative)) {
          fillAttributes(rule.tokens, { filled, macros });
          const filter = filled.get('filter');
          if (filter !== undefined) {
            return filter === '=lfs';
          }
        }
      }
    }
    return undefined;
  };
};

/**
 * Whether a project-relative path is an attributes file, at the root or nested.
 *
 * @param path - Project-relative path.
 * @returns Whether git reads attributes from it.
 * @internal
 */
export const isAttributesPath = (path: string): boolean =>
  path === generatedGitattributesPath || path.endsWith(`/${generatedGitattributesPath}`);
