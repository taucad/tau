import type { CheckedEntryResult, NodeFsRootScope } from '@taucad/filesystem/backend/node';
import { classify, reservedTauDirectory } from '@taucad/filesystem/path-registry';
import type { CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';
import { assertRootedPath } from '@taucad/utils/path';

type FileBytes = FileWritePrecondition['expected'];

/** One regular-file observation; absence is distinct from an empty file. @internal */
export type ShellProjectionFile = Readonly<{
  path: string;
  baseline: FileBytes;
  projected: FileBytes;
}>;

/** The caller retains this observation until durable reconciliation acknowledges it. @internal */
export type ShellProjectionPublication =
  | Readonly<{ status: 'refused'; reason: 'protected-path' | 'size-limit' }>
  | Readonly<{ status: 'settled'; observation: ShellProjectionFile; result: CheckedFileWriteResult }>;

/**
 * Publish one captured regular-file change through the held root claim of its admitted checkout.
 *
 * This is only the outbound reconciliation primitive. It neither observes disk nor launches a shell. The owner
 * must capture a stable regular file, retain its journal and checkout custody, and stop publication when that
 * admission is revoked. A conflict preserves the captured bytes and never retries against a newer baseline.
 * Directory moves, symlinks, inbound updates, quotas and recovery are deliberately not implemented here.
 * The scope comes from the served filesystem owner's `run`, never from a wire client: a wire mutation of the
 * same root awaited inside a held claim waits on that claim forever (PO-Q5).
 *
 * The path is admitted only by {@link shellProjectionAccess}, which composes the launch's grant set with the path
 * registry, so a projection bound over a checkout publishes exactly what that launch was granted and never widens
 * it. An unknown grant set refuses.
 *
 * @internal
 * @param scope - The held claim's checked mutation methods for the exact admitted checkout.
 * @param observation - The last acknowledged bytes and newly captured shell bytes for one root-relative file.
 * @param options - The launch's grant set, the maximum combined bytes retained for this publication, and
 * cancellation.
 * @returns The authority's conflict or commit result alongside owned copies of the observation.
 */
export const publishShellProjectionFile = async (
  scope: Pick<NodeFsRootScope, 'writeFileChecked' | 'deleteFileChecked'>,
  observation: ShellProjectionFile,
  options: Readonly<{
    grants: ShellProjectionGrantSet | undefined;
    maximumBytes: number;
    signal: AbortSignal;
  }>,
): Promise<ShellProjectionPublication> => {
  options.signal.throwIfAborted();
  assertRootedPath(observation.path);
  if (observation.path === '') {
    throw new TypeError('A shell projection file must name a file inside its checkout.');
  }
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 0) {
    throw new TypeError('The shell projection publication limit must be a nonnegative safe integer.');
  }
  if (shellProjectionAccess(options.grants, observation.path) !== 'read-write') {
    return { status: 'refused', reason: 'protected-path' };
  }
  const size = (value: FileBytes): number =>
    typeof value === 'string' ? Buffer.byteLength(value) : (value?.byteLength ?? 0);
  if (size(observation.baseline) + size(observation.projected) > options.maximumBytes) {
    return { status: 'refused', reason: 'size-limit' };
  }
  const copy = (value: FileBytes): FileBytes => (value instanceof Uint8Array ? new Uint8Array(value) : value);
  const owned: ShellProjectionFile = {
    path: observation.path,
    baseline: copy(observation.baseline),
    projected: copy(observation.projected),
  };
  const input = {
    path: owned.path,
    preconditions: [{ path: owned.path, expected: owned.baseline }],
    signal: options.signal,
  };
  const result =
    owned.projected === null
      ? await scope.deleteFileChecked(input)
      : await scope.writeFileChecked({ ...input, data: owned.projected });
  return { status: 'settled', observation: owned, result };
};

/** One captured directory or rename change, root-relative. A rename names every entry below a moved directory. @internal */
export type ShellProjectionEntryChange =
  | Readonly<{ kind: 'mkdir' | 'rmdir'; path: string }>
  | Readonly<{
      kind: 'rename';
      from: string;
      to: string;
      preconditions: readonly FileWritePrecondition[];
      /**
       * Every file and directory below a moved directory, relative to it; empty for a file. It must equal what
       * the held claim finds below `from`, or the rename is refused.
       */
      descendants: readonly string[];
    }>;

/** The caller retains this change until durable reconciliation acknowledges it. @internal */
export type ShellProjectionEntryPublication =
  | Readonly<{ status: 'refused'; reason: 'protected-path' | 'descendant-mismatch' | 'size-limit' }>
  | Readonly<{ status: 'settled'; result: CheckedEntryResult }>;

/**
 * One launch's authority grant set, as root-relative grant roots of the admitted checkout.
 *
 * These are the same four lists the provider compiles for a launch (`writable`, `readOnly`, `denied`, `masked`),
 * carried here as checkout-relative roots instead of absolute native paths: the projection serves one checkout and
 * has no business resolving host paths. `''` is the checkout root itself. A root may appear in more than one list;
 * the most restrictive one wins.
 *
 * @internal
 */
export type ShellProjectionGrants = Readonly<{
  /** Roots the launch may read and write. */
  writable: readonly string[];
  /** Roots the launch may read but never write, move or replace. */
  readOnly: readonly string[];
  /** Roots the launch may not touch at all; this wins over every other list. */
  denied: readonly string[];
  /**
   * Containers hidden except for the grant roots strictly below them. A masked root is readable in itself, so the
   * grants below it stay reachable, and everything else below it is denied however broad an ancestor grant is.
   */
  masked: readonly string[];
}>;

/** The composed verdict for one path: what the launch may do with it after both policies have spoken. @internal */
export type ShellProjectionAccess = 'read-write' | 'read-only' | 'denied';

/** How restrictive each verdict is; the composition always keeps the larger. */
const severity: Readonly<Record<ShellProjectionAccess, number>> = { 'read-write': 0, 'read-only': 1, denied: 2 };

/** Which list a grant root came from, most restrictive first when one root is named by several. */
const grantKinds = ['denied', 'masked', 'readOnly', 'writable'] as const;

/** One normalized grant set: each root canonical and rooted, each kept with the list it came from. @internal */
export type ShellProjectionGrantSet = Readonly<{
  roots: ReadonlyArray<readonly [string, (typeof grantKinds)[number]]>;
}>;

/**
 * Normalize one launch's grant set once, so every later decision is a lookup rather than a re-parse.
 *
 * Every root must already be a canonical root-relative path of this checkout; an absolute path, a traversal or a
 * noncanonical spelling throws rather than being narrowed, because a grant root nobody can place is a grant root
 * nobody can honour. A root named by several lists keeps its most restrictive list.
 *
 * @internal
 * @param grants - The launch's grant roots, root-relative.
 * @returns The normalized set {@link shellProjectionAccess} decides from.
 * @throws {@link TypeError} When a root is not a canonical root-relative path.
 */
export const shellProjectionGrantSet = (grants: ShellProjectionGrants): ShellProjectionGrantSet => {
  const strongest = new Map<string, (typeof grantKinds)[number]>();
  for (const kind of grantKinds) {
    for (const root of grants[kind]) {
      if (typeof root !== 'string') {
        throw new TypeError('A shell projection grant root must be a canonical root-relative path.');
      }
      assertRootedPath(root);
      if (!strongest.has(root)) {
        strongest.set(root, kind);
      }
    }
  }
  return { roots: [...strongest] };
};

/** Whether `path` is `root` or lies below it, as root-relative names nest. */
const below = (path: string, root: string): boolean => root === '' || path === root || path.startsWith(`${root}/`);

/**
 * What the launch's grant set alone says about `path`: the deepest grant root covering it decides, and nothing
 * decides when nothing covers it.
 */
const grantedAccess = (set: ShellProjectionGrantSet, path: string): ShellProjectionAccess => {
  /* A masked container is readable in itself and denied below itself: that is what keeps the grant roots strictly
   * inside it reachable while an ancestor grant over it reopens nothing. */
  const verdictOf = (kind: (typeof grantKinds)[number], root: string): ShellProjectionAccess => {
    switch (kind) {
      case 'denied': {
        return 'denied';
      }
      case 'masked': {
        return path === root ? 'read-only' : 'denied';
      }
      case 'readOnly': {
        return 'read-only';
      }
      default: {
        return 'read-write';
      }
    }
  };
  /* The deepest grant root covering the path decides; a root's string length is its depth, because every root is
   * canonical and only ancestors of the path are considered. Depth starts below the checkout root's own, so a path
   * no root covers keeps the refusal this starts from. */
  let depth = -1;
  let verdict: ShellProjectionAccess = 'denied';
  for (const [root, kind] of set.roots) {
    if (!below(path, root) || root.length < depth) {
      continue;
    }
    const answer = verdictOf(kind, root);
    if (root.length > depth) {
      depth = root.length;
      verdict = answer;
    } else if (severity[answer] > severity[verdict]) {
      verdict = answer;
    }
  }
  return verdict;
};

/**
 * The one place the projection decides what a launch may do with a path (D8).
 *
 * The path registry's classification of the checkout and the launch's own authority grant set are both consulted
 * and the more restrictive answer is kept, so a grant can never reopen what the registry protects and the registry
 * can never reopen what the grant withheld. Everything is fail-closed: an absent grant set refuses, a path no grant
 * root covers refuses, a root named by several lists keeps its most restrictive list, and a masked container denies
 * everything below it that a deeper grant root does not name.
 *
 * @internal
 * @param grants - The launch's normalized grant set, or `undefined` when the launch's authority is not known.
 * @param path - A canonical root-relative path of the admitted checkout.
 * @returns The composed verdict.
 */
export const shellProjectionAccess = (
  grants: ShellProjectionGrantSet | undefined,
  path: string,
): ShellProjectionAccess => {
  if (grants === undefined) {
    return 'denied';
  }
  const { agentAccess } = classify(path);
  const classified: ShellProjectionAccess =
    agentAccess === 'read-write' ? 'read-write' : agentAccess === 'read-only' ? 'read-only' : 'denied';
  const granted = grantedAccess(grants, path);
  return severity[granted] > severity[classified] ? granted : classified;
};

/** Entries a rename's descendant walk may visit; it matches the scope's own checked rename bound. */
const maximumDescendants = 4096;

const classifiedReadWrite = (path: string): boolean => classify(path).agentAccess === 'read-write';

/**
 * A container is a path the registry leaves read-write while what lies below it is reserved: `.tau` and every
 * spelling that folds onto it. Its contents are what makes it protected, so it may never be moved or removed.
 */
const isContainer = (path: string): boolean =>
  classifiedReadWrite(path) && !classifiedReadWrite(`${path}/tau-container-probe`);

/**
 * The one spelling of a container the registry itself uses. Every other spelling — `.TAU`, `.tau.`,
 * `.tau:alias` — folds onto it, so the shell asking for one asks for a second name for the same reserved
 * container. Creation is admitted under the canonical name only: an alias directory on a case-sensitive
 * filesystem is a real second entry in the checkout, and nothing authored ever needs it.
 */
const isCanonicalContainer = (path: string): boolean => path === reservedTauDirectory;

/**
 * What one walk below `from` found, as it found it: how many entries there were, whether every one of them was a
 * name the caller claimed, and whether both ends of every one stayed publishable. `count` is `undefined` past the
 * walk bound. Nothing names an entry, so one change holds a bounded working set however many entries it moves.
 */
type ShellProjectionDescendants = Readonly<{ count: number | undefined; claimed: boolean; publishable: boolean }>;

/** Nothing below `from`: the source is absent or is not a directory, so the move carries no entry. */
const noDescendants: ShellProjectionDescendants = { count: 0, claimed: true, publishable: true };

/**
 * Walk every entry below `from` once, counting, matching and classifying each one as it is found.
 *
 * The walk runs under the same whole-root claim as the rename, so no Tau writer changes the tree between them. It
 * retains no entry list and builds no list of moved ends: each name is counted against the bound, matched against
 * the caller's claim and classified at both ends in the one pass that finds it, and only the three verdicts come
 * back. The walk still runs to its end rather than stopping at the first unclaimed or protected name, because the
 * refusal a caller sees is the bound, then the claim, then the classification, in that order, and only a complete
 * count tells a claim that matches from one that does not.
 */
const descendantsBelow = async (
  scope: Pick<NodeFsRootScope, 'readdir' | 'stat'>,
  move: Readonly<{
    from: string;
    to: string;
    claimed: ReadonlySet<string>;
    grants: ShellProjectionGrantSet | undefined;
  }>,
  signal: AbortSignal,
): Promise<ShellProjectionDescendants> => {
  let source: Awaited<ReturnType<NodeFsRootScope['stat']>>;
  try {
    source = await scope.stat(move.from);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return noDescendants;
    }
    throw error;
  }
  if (source.type !== 'dir') {
    return noDescendants;
  }
  let count = 0;
  let claimed = true;
  let publishable = true;
  const pending = [''];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    signal.throwIfAborted();
    const directory = next === '' ? move.from : `${move.from}/${next}`;
    // oxlint-disable-next-line no-await-in-loop -- One directory at a time keeps the walk bounded.
    const names = await scope.readdir(directory);
    if (count + names.length > maximumDescendants) {
      return { count: undefined, claimed, publishable };
    }
    for (const name of names) {
      const relative = next === '' ? name : `${next}/${name}`;
      count++;
      claimed = claimed && move.claimed.has(relative);
      /* Both ends of this one entry, decided where it is found against grant set and registry together: an end the
       * launch was not granted read-write, that is reserved, or that is a container whose contents make it
       * protected, refuses the whole move exactly as the whole-list decision did. */
      publishable =
        publishable &&
        [`${move.from}/${relative}`, `${move.to}/${relative}`].every(
          (path) => shellProjectionAccess(move.grants, path) === 'read-write' && !isContainer(path),
        );
      // oxlint-disable-next-line no-await-in-loop -- Kinds are read in walk order under the held claim.
      const child = await scope.stat(`${move.from}/${relative}`);
      if (child.type === 'dir') {
        pending.push(relative);
      }
    }
  }
  return { count, claimed, publishable };
};

/**
 * Publish one captured directory creation, removal or rename through the held root claim.
 *
 * The rooted scope applies no path registry of its own, so every name this change creates, removes or moves is
 * decided here first by {@link shellProjectionAccess} — the launch's grant set composed with the registry, as the
 * filesystem folds it (PP3). A rename's descendants are derived here by walking `from` under the held claim,
 * refused unless they equal the caller's list, and checked at both ends, so moving an ordinary directory onto a
 * reserved spelling, or out of what the launch was granted, cannot carry children past the check. A container may
 * be created under its canonical name `.tau` only, and never renamed or removed; every folded alias of it is
 * refused, and a launch whose grant set masks the container cannot create it at all. An unknown grant set refuses.
 *
 * @internal
 * @param scope - The held claim's reads and checked entry methods for the exact admitted checkout.
 * @param change - The captured change, with root-relative paths.
 * @param options - The launch's grant set and cancellation.
 * @returns The authority's conflict or commit result, or the refusal that left disk untouched.
 */
export const publishShellProjectionEntry = async (
  scope: Pick<NodeFsRootScope, 'mkdirChecked' | 'rmdirChecked' | 'renameChecked' | 'readdir' | 'stat'>,
  change: ShellProjectionEntryChange,
  options: Readonly<{ grants: ShellProjectionGrantSet | undefined; signal: AbortSignal }>,
): Promise<ShellProjectionEntryPublication> => {
  const { grants, signal } = options;
  signal.throwIfAborted();
  const ends = change.kind === 'rename' ? [change.from, change.to] : [change.path];
  for (const path of ends) {
    assertRootedPath(path);
    if (path === '') {
      throw new TypeError('A shell projection entry must name a path inside its checkout.');
    }
  }
  if (
    !ends.every((path) => shellProjectionAccess(grants, path) === 'read-write') ||
    ends.some((path) => isContainer(path) && !(change.kind === 'mkdir' && isCanonicalContainer(path)))
  ) {
    return { status: 'refused', reason: 'protected-path' };
  }
  if (change.kind !== 'rename') {
    const result =
      change.kind === 'mkdir'
        ? await scope.mkdirChecked({ path: change.path, signal })
        : await scope.rmdirChecked({ path: change.path, signal });
    return { status: 'settled', result };
  }
  const claimed = new Set(change.descendants);
  const found = await descendantsBelow(scope, { from: change.from, to: change.to, claimed, grants }, signal);
  if (found.count === undefined) {
    return { status: 'refused', reason: 'size-limit' };
  }
  if (claimed.size !== change.descendants.length || found.count !== claimed.size || !found.claimed) {
    return { status: 'refused', reason: 'descendant-mismatch' };
  }
  if (!found.publishable) {
    return { status: 'refused', reason: 'protected-path' };
  }
  const result = await scope.renameChecked({
    from: change.from,
    to: change.to,
    preconditions: change.preconditions,
    signal,
  });
  return { status: 'settled', result };
};
