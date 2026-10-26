import type { CheckedEntryResult, NodeFsRootScope } from '@taucad/filesystem/backend/node';
import { classify } from '@taucad/filesystem/path-registry';
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
 * @internal
 * @param scope - The held claim's checked mutation methods for the exact admitted checkout.
 * @param observation - The last acknowledged bytes and newly captured shell bytes for one root-relative file.
 * @param options - Maximum combined bytes retained for this publication and cancellation.
 * @returns The authority's conflict or commit result alongside owned copies of the observation.
 */
export const publishShellProjectionFile = async (
  scope: Pick<NodeFsRootScope, 'writeFileChecked' | 'deleteFileChecked'>,
  observation: ShellProjectionFile,
  options: Readonly<{ maximumBytes: number; signal: AbortSignal }>,
): Promise<ShellProjectionPublication> => {
  options.signal.throwIfAborted();
  assertRootedPath(observation.path);
  if (observation.path === '') {
    throw new TypeError('A shell projection file must name a file inside its checkout.');
  }
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 0) {
    throw new TypeError('The shell projection publication limit must be a nonnegative safe integer.');
  }
  if (classify(observation.path).agentAccess !== 'read-write') {
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

/** Entries a rename's descendant walk may visit; it matches the scope's own checked rename bound. */
const maximumDescendants = 4096;

const classifiedReadWrite = (path: string): boolean => classify(path).agentAccess === 'read-write';

/**
 * A container is a path the registry leaves read-write while what lies below it is reserved: `.tau` and every
 * spelling that folds onto it. Its contents are what makes it protected, so it may be created but never moved
 * or removed.
 */
const isContainer = (path: string): boolean =>
  classifiedReadWrite(path) && !classifiedReadWrite(`${path}/tau-container-probe`);

/**
 * Every entry below `from`, relative to it, as the held claim sees it; `undefined` past the walk bound.
 * The walk runs under the same whole-root claim as the rename, so no Tau writer changes the tree between them.
 */
const descendantsBelow = async (
  scope: Pick<NodeFsRootScope, 'readdir' | 'stat'>,
  from: string,
  signal: AbortSignal,
): Promise<string[] | undefined> => {
  let source: Awaited<ReturnType<NodeFsRootScope['stat']>>;
  try {
    source = await scope.stat(from);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
      return [];
    }
    throw error;
  }
  if (source.type !== 'dir') {
    return [];
  }
  const found: string[] = [];
  const pending = [''];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    signal.throwIfAborted();
    const directory = next === '' ? from : `${from}/${next}`;
    // oxlint-disable-next-line no-await-in-loop -- One directory at a time keeps the walk bounded.
    const names = await scope.readdir(directory);
    if (found.length + names.length > maximumDescendants) {
      return undefined;
    }
    for (const name of names) {
      const relative = next === '' ? name : `${next}/${name}`;
      found.push(relative);
      // oxlint-disable-next-line no-await-in-loop -- Kinds are read in walk order under the held claim.
      const child = await scope.stat(`${from}/${relative}`);
      if (child.type === 'dir') {
        pending.push(relative);
      }
    }
  }
  return found;
};

/**
 * Publish one captured directory creation, removal or rename through the held root claim.
 *
 * The rooted scope applies no path registry of its own, so every name this change creates, removes or moves is
 * classified here first, as the filesystem folds it (PP3). A rename's descendants are derived here by walking
 * `from` under the held claim, refused unless they equal the caller's list, and checked at both ends, so moving an
 * ordinary directory onto a reserved spelling cannot carry children past the check. A container such as `.tau`
 * may be created but never renamed or removed.
 *
 * @internal
 * @param scope - The held claim's reads and checked entry methods for the exact admitted checkout.
 * @param change - The captured change, with root-relative paths.
 * @param options - Cancellation.
 * @returns The authority's conflict or commit result, or the refusal that left disk untouched.
 */
export const publishShellProjectionEntry = async (
  scope: Pick<NodeFsRootScope, 'mkdirChecked' | 'rmdirChecked' | 'renameChecked' | 'readdir' | 'stat'>,
  change: ShellProjectionEntryChange,
  options: Readonly<{ signal: AbortSignal }>,
): Promise<ShellProjectionEntryPublication> => {
  const { signal } = options;
  signal.throwIfAborted();
  const ends = change.kind === 'rename' ? [change.from, change.to] : [change.path];
  for (const path of ends) {
    assertRootedPath(path);
    if (path === '') {
      throw new TypeError('A shell projection entry must name a path inside its checkout.');
    }
  }
  if (
    !ends.every((path) => classifiedReadWrite(path)) ||
    (change.kind !== 'mkdir' && ends.some((path) => isContainer(path)))
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
  const found = await descendantsBelow(scope, change.from, signal);
  if (found === undefined) {
    return { status: 'refused', reason: 'size-limit' };
  }
  const claimed = new Set(change.descendants);
  if (
    claimed.size !== change.descendants.length ||
    found.length !== claimed.size ||
    !found.every((entry) => claimed.has(entry))
  ) {
    return { status: 'refused', reason: 'descendant-mismatch' };
  }
  const moved = found.flatMap((entry) => [`${change.from}/${entry}`, `${change.to}/${entry}`]);
  if (!moved.every((path) => classifiedReadWrite(path)) || moved.some((path) => isContainer(path))) {
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
