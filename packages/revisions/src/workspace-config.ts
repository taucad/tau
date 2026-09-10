/**
 * Generated project files that must exist **before** the first snapshot
 * (S-GITIGNORE, S-JJCFG).
 *
 * The revision engine tracks whatever the ignore file does not exclude, so
 * derived content is excluded by a generated ignore file rather than by hope
 * (I-DERIVED); and Jujutsu silently refuses to snapshot an authored file above
 * its 1 MiB default, so the size limit is lifted in a per-project config rather
 * than discovered by a user whose file vanished (I-BIG).
 *
 * Both files are pure content here. Each adapter supplies its own writer, so
 * the same bytes land on a Node host and in the browser provider.
 */

/** What one path family is to a revision (RC6 / S5 work 1). @public */
export type RevisionPathClass = 'authored' | 'derived' | 'authority-metadata';

/** One classified path family. @public */
export type RevisionPathPolicyEntry = Readonly<{
  /** Root-relative prefix, or the exact path when `directory` is false. */
  prefix: string;
  class: RevisionPathClass;
  /** Whether the ignore pattern is anchored at the project root. */
  anchored: boolean;
  directory: boolean;
}>;

/**
 * The one classification table (RC6 / S5 work 2).
 *
 * Every route that decides revision content derives from this and nothing else:
 * {@link generatedIgnoreEntries} is the engine's ignore file, and the recorder's
 * capture exclusions and the Jujutsu adapter's protected entries are
 * {@link excludedRevisionPaths}. Two hand-maintained lists is how
 * `.jj/repo/store/git/HEAD`, `.git/HEAD`, `.tau/artifacts/**` and `node_modules`
 * reached a captured tree while the engine excluded them.
 *
 * A path family absent from this table is `authored`: that is the default, and
 * the one `authored` row below states it for the `.tau` control directory a
 * blanket `.tau` exclusion used to swallow.
 *
 * @public
 */
export const revisionPathPolicy: readonly RevisionPathPolicyEntry[] = Object.freeze([
  { prefix: '.tau/parameters', class: 'authored', anchored: true, directory: true },
  { prefix: '.tau/cache', class: 'derived', anchored: true, directory: true },
  { prefix: '.tau/chats', class: 'authority-metadata', anchored: true, directory: true },
  { prefix: '.tau/workspaces', class: 'authority-metadata', anchored: true, directory: true },
  { prefix: '.tau/revisions', class: 'authority-metadata', anchored: true, directory: true },
  { prefix: '.tau/artifacts', class: 'derived', anchored: true, directory: true },
  { prefix: 'node_modules', class: 'derived', anchored: false, directory: true },
  // The two generated files below are derived as well: `init` rewrites both on
  // every host, so versioning them would put host configuration into revisions
  // and make a tree fail to round-trip through `writeRevision` / `readTree`.
  { prefix: '.gitignore', class: 'derived', anchored: true, directory: false },
  { prefix: '.tau/jj-config.toml', class: 'derived', anchored: true, directory: false },
  // The engines' own stores. Jujutsu never snapshots `.jj`, and Git never
  // snapshots `.git`, but the browser capture walk has no such intrinsic.
  { prefix: '.jj', class: 'authority-metadata', anchored: true, directory: true },
  { prefix: '.git', class: 'authority-metadata', anchored: true, directory: true },
] satisfies readonly RevisionPathPolicyEntry[]);

const excludedPolicy = revisionPathPolicy.filter((entry) => entry.class !== 'authored');

/**
 * Derived paths never carried by a revision, as ignore patterns. The `.tau`
 * entries are anchored to the project root because that is the only place they
 * are Tau's; `node_modules` is unanchored because a nested one is derived too.
 *
 * @public
 */
export const generatedIgnoreEntries: readonly string[] = Object.freeze(
  excludedPolicy.map((entry) => `${entry.anchored ? '/' : ''}${entry.prefix}${entry.directory ? '/' : ''}`),
);

/**
 * The same families as root-relative prefixes: what a capture walk prunes and
 * what a working-copy clear keeps.
 *
 * @public
 */
export const excludedRevisionPaths: readonly string[] = Object.freeze(excludedPolicy.map((entry) => entry.prefix));

/** Project-relative path of the generated ignore file. @public */
export const generatedIgnorePath = '.gitignore';

/** Project-relative path of the per-project Jujutsu configuration. @public */
export const generatedJjConfigPath = '.tau/jj-config.toml';

const markerStart = '# BEGIN Tau generated — derived content is never versioned';
const markerEnd = '# END Tau generated';

/**
 * Merge Tau's required ignore lines into any existing ignore file.
 *
 * Existing content is preserved: a hand-written ignore file keeps every line it
 * had, and re-running this is a no-op once the block is present.
 *
 * @param existing - Current ignore file content, or `undefined` when absent.
 * @param additional - Extra project-specific lines to include in the block.
 * @returns The full file content to write.
 * @public
 */
export const generatedIgnoreContent = (existing: string | undefined, additional: readonly string[] = []): string => {
  const required = [...generatedIgnoreEntries, ...additional];
  const previous = existing ?? '';
  const withoutBlock = previous.includes(markerStart)
    ? previous.slice(0, previous.indexOf(markerStart)) +
      previous.slice(previous.indexOf(markerEnd) + markerEnd.length).replace(/^\n/u, '')
    : previous;
  const head = withoutBlock === '' ? '' : withoutBlock.endsWith('\n') ? withoutBlock : `${withoutBlock}\n`;
  return `${head}${markerStart}\n${required.join('\n')}\n${markerEnd}\n`;
};

/** Identity stamped on generated revisions. @public */
export type GeneratedJjIdentity = Readonly<{ name: string; email: string }>;

const escapeToml = (value: string): string => JSON.stringify(value);

/**
 * Per-project Jujutsu configuration written before `init`.
 *
 * `snapshot.max-new-file-size = 0` lifts the 1 MiB default that otherwise drops
 * an authored file from the snapshot with only a warning. `fsmonitor.backend`
 * is pinned so a host-installed watcher can never change what a snapshot sees.
 *
 * ponytail: the north star also names a pinned `server.watch.ignored`. The
 * pinned Jujutsu 0.44 has no such key — `fsmonitor.backend` is the whole watcher
 * surface it exposes — so that pin is the one to add when the key exists.
 *
 * @param identity - Author identity for revisions this project records.
 * @returns TOML content for the generated config file.
 * @public
 */
export const generatedJjConfigContent = (identity: GeneratedJjIdentity): string =>
  [
    '# Generated by @taucad/revisions before repository initialization. Do not edit by hand.',
    '',
    '[user]',
    `name = ${escapeToml(identity.name)}`,
    `email = ${escapeToml(identity.email)}`,
    '',
    '[snapshot]',
    '# 0 means no limit: an authored file is never silently dropped from a snapshot.',
    'max-new-file-size = 0',
    'auto-track = "all()"',
    '',
    '[fsmonitor]',
    '# Pinned: an ambient watcher must never change what a snapshot observes.',
    'backend = "none"',
    '',
  ].join('\n');
