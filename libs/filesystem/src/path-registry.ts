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

/** Rule 16's four storage classes. @public */
export type PathClass = 'authored' | 'records' | 'cache' | 'control-plane';

/** What the composed view lets an agent do with a path. @public */
export type PathAgentAccess = 'read-write' | 'read-only' | 'hidden';

/** Which watch plane observes a path. @public */
export type PathWatchPlane = 'ui' | 'kernel' | 'none';

/** Everything the registry answers about one path. @public */
export type PathClassification = Readonly<{
  class: PathClass;
  /** Whether the bytes enter a revision. */
  versioned: boolean;
  agentAccess: PathAgentAccess;
  watch: PathWatchPlane;
}>;

/** One reserved path family and its answers. @public */
export type PathRegistryRow = PathClassification &
  Readonly<{
    /** Project-relative prefix, or the exact path when `directory` is false. */
    prefix: string;
    /** Whether an ignore pattern for this row is anchored at the project root. */
    anchored: boolean;
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
    directory: true,
  },
  {
    prefix: '.tau/tsconfig.generated.json',
    class: 'authored',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    directory: false,
  },
  {
    prefix: '.tau/lockfile.json',
    class: 'authored',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
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
    directory: true,
  },
  {
    prefix: '.tau/skills',
    class: 'authored',
    versioned: true,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    directory: true,
  },
  {
    prefix: '.tau/AGENTS.md',
    class: 'authored',
    versioned: true,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
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
    directory: true,
  },
  {
    prefix: '.tau/runs',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
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
    directory: true,
  },
  {
    prefix: '.tau/tool-results',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    directory: true,
  },
  {
    prefix: '.tau/offloaded-tool-results',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    directory: true,
  },
  {
    prefix: 'exports',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    directory: true,
  },
  {
    prefix: 'thumbnail.webp',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
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
    directory: true,
  },
  /* Unanchored: a nested `node_modules` is derived too. */
  {
    prefix: 'node_modules',
    class: 'cache',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'none',
    anchored: false,
    directory: true,
  },

  /* Control plane: hidden from every composed view, refused before provider
   * I/O. A revision hash never covers its own store. */
  {
    prefix: '.tau/binding.json',
    class: 'control-plane',
    versioned: false,
    agentAccess: 'hidden',
    watch: 'none',
    anchored: true,
    directory: false,
  },
  {
    prefix: '.jj',
    class: 'control-plane',
    versioned: false,
    agentAccess: 'hidden',
    watch: 'none',
    anchored: true,
    directory: true,
  },
  {
    prefix: '.git',
    class: 'control-plane',
    versioned: false,
    agentAccess: 'hidden',
    watch: 'none',
    anchored: true,
    directory: true,
  },
] satisfies readonly PathRegistryRow[]);

/**
 * Whether one row covers one already-normalized path.
 *
 * An anchored row matches at the project root; an unanchored one matches any
 * segment, so `lib/node_modules/x` is cache too. A file row matches exactly.
 */
const covers = (row: PathRegistryRow, relative: string): boolean => {
  if (!row.anchored) {
    return relative.split('/').includes(row.prefix);
  }
  return row.directory ? relative === row.prefix || relative.startsWith(`${row.prefix}/`) : relative === row.prefix;
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
  return (
    rowClassifications[index] ??
    (relative.startsWith('.tau/') ? reservedTauPathClassification : unlistedPathClassification)
  );
};
