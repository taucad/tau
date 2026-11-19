/**
 * Which durable compute store a project root uses (compute-reuse charter D9, audit R19).
 *
 * Cache keys are content-addressed and path-free, so the store's workspace partition is the only thing that kept a
 * second worktree, an agent checkout or a copy of a project cold. The partition is the project's generated identity,
 * `.tau/project.json`, which a plain copy carries. A Git worktree carries none (`.tau/*` is unversioned), or one Tau
 * minted for it on admission, so a linked worktree reads the identity of the same folder in its main worktree first.
 * A root with no identity keeps its path, which is what every root was keyed by before.
 */
import { lstatSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { parseProjectIdentityBytes, projectIdentityPath } from '@taucad/project-core/identity';

/** The identity record and a `.git` pointer are a few dozen bytes; anything larger is not one. */
const metadataLimit = 4096;

const readSmallFile = (path: string): Uint8Array<ArrayBuffer> | undefined => {
  try {
    const entry = lstatSync(path);
    return entry.isFile() && entry.size <= metadataLimit ? new Uint8Array(readFileSync(path)) : undefined;
  } catch {
    return undefined;
  }
};

const projectIdAt = (root: string): string | undefined => {
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
 * The same folder in the main worktree, when `root` sits in a linked Git worktree of a non-bare repository.
 * @param root - Absolute project root.
 * @returns The counterpart folder, or `undefined` in a main worktree, a submodule, a bare repository or no repository.
 */
const mainWorktreeCounterpart = (root: string): string | undefined => {
  for (let directory = root; ; directory = dirname(directory)) {
    const dotGit = join(directory, '.git');
    let isDirectory = false;
    try {
      isDirectory = lstatSync(dotGit).isDirectory();
    } catch {
      /* No `.git` here: look further up. */
    }
    if (isDirectory) {
      return undefined;
    }
    const pointer = readSmallFile(dotGit);
    if (pointer !== undefined) {
      const gitDirectory = /^gitdir:\s*(.+?)\s*$/mu.exec(new TextDecoder().decode(pointer))?.[1];
      /* Only a linked worktree's admin directory has `commondir`; a submodule's has none. */
      const common =
        gitDirectory === undefined ? undefined : readSmallFile(join(resolve(directory, gitDirectory), 'commondir'));
      if (gitDirectory === undefined || common === undefined) {
        return undefined;
      }
      const commonDirectory = resolve(resolve(directory, gitDirectory), new TextDecoder().decode(common).trim());
      return basename(commonDirectory) === '.git'
        ? join(dirname(commonDirectory), relative(directory, root))
        : undefined;
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
