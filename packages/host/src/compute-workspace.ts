/**
 * Which durable compute store a project root uses (compute-reuse charter D9, audit R19).
 *
 * Cache keys are content-addressed and path-free, so the store's workspace partition is the only thing that kept a
 * second worktree, an agent checkout or a copy of a project cold. The partition is the project's generated identity,
 * `.tau/project.json`, which a plain copy carries. A Git worktree carries none (`.tau/*` is unversioned), or one Tau
 * minted for it on admission, so a linked worktree reads the identity of the same folder in its main worktree first.
 * A root with no identity keeps its path, which is what every root was keyed by before.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { parseProjectIdentityBytes, projectIdentityPath } from '@taucad/project-core/identity';

/** The identity record and Git's pointer files are a few dozen bytes; anything larger is not one. */
const metadataLimit = 4096;

const decode = (bytes: Uint8Array<ArrayBuffer>): string => new TextDecoder().decode(bytes).trim();

/**
 * Read a regular file of at most {@link metadataLimit} bytes, never following a final symbolic link, from one open
 * descriptor, so a file swapped after the check is still read within the bound.
 * @param path - Absolute file path.
 * @returns Its bytes, or `undefined` when it is missing, not a regular file or too large.
 */
const readSmallFile = (path: string): Uint8Array<ArrayBuffer> | undefined => {
  let descriptor: number;
  try {
    // oxlint-disable-next-line eslint/no-bitwise -- combine native open flags to refuse a symbolic link.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return undefined;
  }
  try {
    const entry = fstatSync(descriptor);
    if (!entry.isFile() || entry.size > metadataLimit) {
      return undefined;
    }
    const buffer = new Uint8Array(metadataLimit + 1);
    let length = 0;
    for (let read = 1; read > 0 && length < buffer.length; length += read) {
      read = readSync(descriptor, buffer, length, buffer.length - length, length);
    }
    return length > metadataLimit ? undefined : buffer.slice(0, length);
  } catch {
    return undefined;
  } finally {
    closeSync(descriptor);
  }
};

const isRealDirectory = (path: string): boolean => {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Whether two paths name the same file. Git records real paths, so a root reached through a symbolic link still
 * matches its own `.git`.
 * @param left - One path.
 * @param right - The other path.
 * @returns Whether both resolve to one real path; `false` when either is missing.
 */
const sameFile = (left: string, right: string): boolean => {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
};

/**
 * A root's identity, read only through a real `.tau` directory so a symlinked one cannot lend another's.
 * @param root - Absolute folder.
 * @returns Its validated `projectId`, or `undefined`.
 */
const projectIdAt = (root: string): string | undefined => {
  if (!isRealDirectory(join(root, '.tau'))) {
    return undefined;
  }
  const bytes = readSmallFile(join(root, projectIdentityPath));
  if (bytes === undefined) {
    return undefined;
  }
  try {
    return parseProjectIdentityBytes(bytes).projectId;
  } catch {
    return undefined;
  }
};

/**
 * The main worktree a linked worktree's `.git` file belongs to, accepted only as Git lays it out: the admin
 * directory is `<common>/worktrees/<id>` and its `gitdir`, which only Git writes, names this `.git` back. A pointer
 * a folder forged for itself names no other repository.
 * @param dotGit - The worktree's `.git` file.
 * @returns The main worktree's root, or `undefined`.
 */
const linkedMainWorktree = (dotGit: string): string | undefined => {
  const pointer = readSmallFile(dotGit);
  const gitDirectory = pointer === undefined ? undefined : /^gitdir:\s*(.+?)\s*$/mu.exec(decode(pointer))?.[1];
  if (gitDirectory === undefined) {
    return undefined;
  }
  const admin = resolve(dirname(dotGit), gitDirectory);
  /* Only a linked worktree's admin directory has `commondir`; a submodule's has none. */
  const common = readSmallFile(join(admin, 'commondir'));
  const backLink = readSmallFile(join(admin, 'gitdir'));
  if (common === undefined || backLink === undefined) {
    return undefined;
  }
  const commonDirectory = resolve(admin, decode(common));
  if (
    dirname(admin) !== join(commonDirectory, 'worktrees') ||
    !sameFile(resolve(admin, decode(backLink)), dotGit) ||
    basename(commonDirectory) !== '.git'
  ) {
    return undefined;
  }
  return dirname(commonDirectory);
};

/**
 * The same folder in the main worktree, when `root` sits in a linked Git worktree of a non-bare repository.
 * @param root - Absolute project root.
 * @returns The counterpart folder, or `undefined` in a main worktree, a submodule, a bare repository, no repository
 *   or a layout Git did not write.
 */
const mainWorktreeCounterpart = (root: string): string | undefined => {
  for (let directory = root; ; directory = dirname(directory)) {
    const dotGit = join(directory, '.git');
    let entry;
    try {
      entry = lstatSync(dotGit);
    } catch {
      /* No `.git` here: look further up. */
    }
    if (entry !== undefined) {
      /* The nearest `.git` of any kind decides; the walk never passes it. */
      const main = entry.isFile() ? linkedMainWorktree(dotGit) : undefined;
      return main === undefined ? undefined : join(main, relative(directory, root));
    }
    if (dirname(directory) === directory) {
      return undefined;
    }
  }
};

/**
 * The workspace key of the durable compute store a project root connects to.
 *
 * The root's project identity when one resolves, so its worktrees, Tau's linked checkouts and plain copies share one
 * store; otherwise the root exactly as given. It reads two or three small files and never writes.
 *
 * @param root - The absolute project root the host would otherwise key the store by.
 * @returns `project:<projectId>`, or `root` unchanged.
 * @public
 *
 * @example <caption>Connecting a worktree to its project's store</caption>
 * ```typescript
 * import { computeStoreWorkspace } from '@taucad/host';
 *
 * const workspace = computeStoreWorkspace('/srv/project-feature'); // 'project:proj_…' when /srv/project has identity
 * ```
 */
export const computeStoreWorkspace = (root: string): string => {
  const counterpart = mainWorktreeCounterpart(root);
  const projectId = (counterpart === undefined ? undefined : projectIdAt(counterpart)) ?? projectIdAt(root);
  return projectId === undefined ? root : `project:${projectId}`;
};
