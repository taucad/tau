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
 * the UI plane — including `.tau/parameters/**`, `.tau/skills/**` and the rest
 * of the authored `.tau` controls, which a blanket `.tau` exclusion used to
 * swallow.
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
 * Sources, `tau.json`, `.gitignore`, `.gitattributes` and every authored
 * `.tau` control land here: they are the revision.
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
  /* Chat transcripts are host records like the event log they sit beside; the
   * two UI classifiers this registry replaced excluded them at HEAD, so the row
   * keeps that answer until W17 reconciles it with the chat file set. */
  {
    prefix: '.tau/transcripts',
    class: 'records',
    versioned: false,
    agentAccess: 'read-only',
    watch: 'ui',
    anchored: true,
    directory: true,
  },
  /* The agent's own `export_geometry` writes its artifacts through the agent's
   * provider, so these three stay writable until the host owns that write.
   * A9 ("records are read-only to agents") lands on them with that move. */
  {
    prefix: '.tau/artifacts',
    class: 'records',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    directory: true,
  },
  {
    prefix: '.tau/tool-results',
    class: 'records',
    versioned: false,
    agentAccess: 'read-write',
    watch: 'ui',
    anchored: true,
    directory: true,
  },
  {
    prefix: '.tau/offloaded-tool-results',
    class: 'records',
    versioned: false,
    agentAccess: 'read-write',
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
    prefix: '.tau/revisions',
    class: 'control-plane',
    versioned: false,
    agentAccess: 'hidden',
    watch: 'none',
    anchored: true,
    directory: true,
  },
  // W3 removes this row with the candidate checkouts it names.
  {
    prefix: '.tau/workspaces',
    class: 'control-plane',
    versioned: false,
    agentAccess: 'hidden',
    watch: 'none',
    anchored: true,
    directory: true,
  },
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
 * classify('.tau/revisions/HEAD').agentAccess; // 'hidden'
 * classify('src/part.ts').versioned; // true
 * ```
 */
export const classify = (projectRelativePath: string): PathClassification => {
  const relative = projectRelativePath.replace(/^\/+/u, '');
  return pathRegistry.find((row) => covers(row, relative)) ?? unlistedPathClassification;
};
