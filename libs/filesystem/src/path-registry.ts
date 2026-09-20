/**
 * The one classifier for a project-relative path (A5, Rule 16).
 *
 * Versioning, agent access, visibility and watch plane used to be six private
 * prefix tests that agreed by coincidence: the revision path policy, the
 * generated ignore file, the agent write mask, the restore timeline's
 * `.tau/` test, the project machine's activity test, and the file tree's
 * `node_modules` checks. They are one table here, and every caller asks it.
 *
 * The table is structural, not a glob: its rows are the project's reserved
 * layout as the architecture states it, and a linked checkout classifies its
 * own `.tau/**` exactly as the live one does, so no checkout context is
 * needed to answer.
 *
 * A path no row names is authored, versioned, agent-writable and observed on
 * the UI plane — except inside `.tau`, where the default is
 * {@link reservedTauPathClassification} (P13). The authored `.tau` controls —
 * `.tau/parameters/**`, `.tau/skills/**`, `.tau/AGENTS.md` — are rows of their
 * own, which is what keeps that default from swallowing them the way a blanket
 * `.tau` exclusion once did.
 *
 * @module
 */

import type { PathClassification, PathPolicy } from '#types.js';

/** One reserved path family and its answers. @public */
export type PathRegistryRow = PathClassification &
  Readonly<{
    /** Project-relative prefix, or the exact path when `directory` is false. */
    prefix: string;
    /**
     * Whether an ignore pattern for this row is anchored at the project root.
     *
     * The generated ignore file's spelling and nothing else. How the row
     * *classifies* a path is {@link PathRegistryRow.match}: one flag meant both
     * once, which is how a nested `.git` became the agent's to write.
     */
    anchored: boolean;
    /**
     * Where the row matches: only at the project root, or wherever its name
     * appears as a path segment.
     *
     * Control-plane rows are `segment` so their answer cannot depend on how deep
     * a repository sits (PP3); the `.tau/*`, `exports` and `thumbnail.webp` rows
     * are `root` because that is the only place they are Tau's.
     */
    match: 'root' | 'segment';
    directory: boolean;
  }>;

/**
 * What an unlisted path is.
 *
 * Sources, `tau.json`, `.gitignore` and `.gitattributes` land here: they are
 * the revision. The authored `.tau` controls answer the same, through their own
 * rows — inside `.tau` the default is the reserved one below (P13).
 *
 * @public
 */
export const unlistedPathClassification: PathClassification = Object.freeze({
  class: 'authored',
  versioned: true,
  agentAccess: 'read-write',
  watch: 'ui',
});

/**
 * What an unlisted path *inside* `.tau` is (P13).
 *
 * `.tau` is Tau's own directory, so a member of it that no row names is either
 * a residue of a retired layout — the `.tau/workspaces` trees no migration
 * deletes (I15) — or a family this build does not know. Either way it is not
 * the user's design: never versioned, never the agent's. Watched on the UI
 * plane like the records rows, so the file tree still sees it move.
 *
 * It is the fallback rather than a row because a row would name `.tau` itself:
 * the directory holds the authored controls too, and hiding the container hides
 * their discovery. It stays out of {@link pathRegistry} for the same reason the
 * generated ignore file must not carry `/.tau/` — git cannot re-include a path
 * under an excluded directory, so that one pattern would un-version
 * `.tau/parameters` in the user's own checkout.
 *
 * @public
 */
export const reservedTauPathClassification: PathClassification = Object.freeze({
  class: 'records',
  versioned: false,
  agentAccess: 'hidden',
  watch: 'ui',
});

/**
 * The reserved project layout, most specific first.
 *
 * `versioned: false` is the single source of the generated ignore file and of
 * every capture exclusion, so the two can no longer drift — which is how
 * `.git/HEAD` and `node_modules` once reached a captured tree.
 *
 * @public
 */
export const pathRegistry: readonly PathRegistryRow[] = Object.freeze([
  /* Control plane: hidden from every composed view, refused before provider
   * I/O. A revision hash never covers its own store — its own or a vendored
   * dependency's, a submodule's, a second project's (EQ1, CI1), which is why
   * every row here matches a segment and none of them is anchored in the ignore
   * file: `versioned` and the generated block have to agree at every depth
   * (PP5).
   *
   * They lead the table because {@link classify} takes the *first* match: behind
   * the rows below, a store vendored into `node_modules` was the cache's and one
   * under `.tau/skills` was authored — and therefore versioned, captured into
   * every revision (G0-3). */
  {
    prefix: '.tau/binding.json',
    class: 'control-plane',
    versioned: false,
    agentAccess: 'hidden',
    watch: 'none',
    anchored: false,
    match: 'segment',
    directory: false,
  },
  {
    prefix: '.jj',
    class: 'control-plane',
    versioned: false,
    agentAccess: 'hidden',
    watch: 'none',
    anchored: false,
    match: 'segment',
    directory: true,
  },
  {
    prefix: '.git',
    class: 'control-plane',
    versioned: false,
    agentAccess: 'hidden',
    watch: 'none',
    anchored: false,
    match: 'segment',
    directory: true,
  },

  /* Generated from the registry itself on every host, so versioning them would
   * put tooling output into revisions. `.gitignore` and `.gitattributes` are
   * deliberately absent: git needs them in the tree, so they take the authored
   * default. */
  {
    prefix: '.tau/types',
    class: 'authored',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  {
    prefix: '.tau/tsconfig.generated.json',
    class: 'authored',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: false,
  },
  {
    prefix: '.tau/lockfile.json',
    class: 'authored',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: false,
  },

  /* The authored `.tau` controls: the user's own bytes that happen to live in
   * Tau's directory. They answer exactly the authored default and exist only to
   * win over {@link reservedTauPathClassification}. */
  {
    prefix: '.tau/parameters',
    class: 'authored',
    versioned: true,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  {
    prefix: '.tau/skills',
    class: 'authored',
    versioned: true,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  {
    prefix: '.tau/AGENTS.md',
    class: 'authored',
    versioned: true,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: false,
  },

  /* Records: host-written bytes inside the project. Read-only to agents, never
   * versioned (they ship on their own refs when sync is on). */
  {
    prefix: '.tau/chats',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  {
    prefix: '.tau/runs',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  /* `.tau/transcripts` is *not* a row: W17's reconciliation (W1 review R3)
   * found it is `.tau/chats` under an older name. Nothing has written it since
   * `refactor(api)!: Remove the agent execution plane` deleted its only writer,
   * and nothing ever read it from disk — the two remaining spellings were a
   * synthetic @-mention path and a prompt line, both now pointing at the chat's
   * real log. One records family, one row. */
  {
    prefix: '.tau/artifacts',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  {
    prefix: '.tau/tool-results',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  {
    prefix: '.tau/offloaded-tool-results',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  {
    prefix: 'exports',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: true,
  },
  {
    prefix: 'thumbnail.webp',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    match: 'root',
    directory: false,
  },

  /* Cache: regenerable, never versioned, never transferred, never watched. */
  {
    prefix: '.tau/cache',
    class: 'cache',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'none',
    anchored: true,
    match: 'root',
    directory: true,
  },
  /* A nested `node_modules` is derived too, so the ignore file names it wherever
   * it appears as well. */
  {
    prefix: 'node_modules',
    class: 'cache',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'none',
    anchored: false,
    match: 'segment',
    directory: true,
  },
] satisfies readonly PathRegistryRow[]);

/**
 * Whether one row covers one already-normalized path.
 *
 * A `root` row matches at the project root only; a `segment` row matches
 * wherever its prefix sits on segment boundaries, so `lib/node_modules/x` is
 * cache and `vendor/dep/.git/config` is the control plane however deep the
 * repository is. A directory row covers itself and everything beneath it; a file
 * row covers that path alone — which still catches a `.git` that is a worktree
 * or submodule pointer file rather than a directory, because the directory row
 * matches the segment either way.
 */
const covers = (row: PathRegistryRow, relative: string): boolean => {
  if (row.directory) {
    const bounded = `/${relative}/`;
    const pattern = `/${row.prefix}/`;
    return row.match === 'segment' ? bounded.includes(pattern) : bounded.startsWith(pattern);
  }
  const bounded = `/${relative}`;
  const pattern = `/${row.prefix}`;
  return row.match === 'segment' ? bounded.endsWith(pattern) : bounded === pattern;
};

/**
 * Each row's answer alone, built once.
 *
 * A row carries its prefix and matching rules as well as its answer; callers
 * (and equality in tests) get the answer, so the projection happens here rather
 * than on every classified path.
 */
const rowClassifications: readonly PathClassification[] = Object.freeze(
  pathRegistry.map(({ class: storageClass, versioned, agentAccess, watch }) =>
    Object.freeze({ class: storageClass, versioned, agentAccess, watch }),
  ),
);

/**
 * The control-plane rows alone, in registry order.
 *
 * They lead the registry, so an index here is that row's index there — which is
 * what lets the folded re-test below share {@link rowClassifications}.
 */
const controlPlane: readonly PathRegistryRow[] = Object.freeze(
  pathRegistry.filter((row) => row.class === 'control-plane'),
);

/**
 * Spellings whose fold can differ from the path as written.
 *
 * Cheap enough to run on every classified path: a lowercase path with no
 * trailing dot or space on any segment already *is* its fold, and only the paths
 * this admits pay for one below.
 */
const mayFold = /[A-Z]|[. ](?:\/|$)/u;

/**
 * The control-plane row a filesystem's own folding of this path lands on, if any.
 *
 * Every filesystem a `NodeFsProvider` runs on folds case, and Win32 folds
 * trailing dots and spaces too, so `vendor/.Git/config` and `vendor/.git./HEAD`
 * open the real store while a byte comparison calls them the user's content
 * (G0-1, G0-5). Only the control plane folds — a user's `Exports` directory is
 * theirs — and it folds on every host, because a genuinely separate `.GIT`
 * directory on a case-sensitive disk being hidden is the fail-closed answer and
 * asking the provider would make the mask depend on where the project sits.
 *
 * The same defence `portable-tree.ts` applies to a revision tree, spelled the
 * same way. Normalization is in it for that reason rather than because it can
 * change the answer: all three prefixes are ASCII, which normalization never
 * rewrites.
 *
 * @param relative - Path relative to the project root, leading `/` already dropped.
 * @returns The row's index, or `-1`.
 */
const foldedControlPlaneIndex = (relative: string): number => {
  if (!mayFold.test(relative)) {
    return -1;
  }
  const folded = relative
    .normalize('NFC')
    .toLowerCase()
    .replaceAll(/[. ]+(?=\/|$)/gu, '');
  return controlPlane.findIndex((row) => covers(row, folded));
};

/**
 * Classify one project-relative path.
 *
 * @param projectRelativePath - Path relative to the project root; a leading `/` is tolerated.
 * @returns Storage class, whether the bytes are versioned, the agent's access and the watch plane.
 * @public
 *
 * @example <caption>The agent mask asks once</caption>
 * ```typescript
 * import { classify } from '@taucad/filesystem/path-registry';
 *
 * classify('.git/HEAD').agentAccess; // 'hidden'
 * classify('src/part.ts').versioned; // true
 * ```
 */
export const classify = (projectRelativePath: string): PathClassification => {
  const relative = projectRelativePath.replace(/^\/+/u, '');
  const index = pathRegistry.findIndex((row) => covers(row, relative));
  /* The control plane answers first, and for a spelling the filesystem folds
   * onto one it answers instead of the row that matched (G0-1, G0-3, G0-5). */
  const folded = index !== -1 && index < controlPlane.length ? -1 : foldedControlPlaneIndex(relative);
  return (
    rowClassifications[folded === -1 ? index : folded] ??
    (relative.startsWith('.tau/') ? reservedTauPathClassification : unlistedPathClassification)
  );
};

/**
 * Tau's own reserved layout as the port a composed view takes (D6).
 *
 * The one instance every composition site passes: `composeView` never imports
 * this module, so the mask carries no layout of its own and a test can compose
 * a view over a layout that is not Tau's at all.
 *
 * @public
 */
export const tauPathPolicy: PathPolicy = Object.freeze({ classify });
