/**
 * The resident set of a native worker's process tree, read for observation only.
 *
 * A sandboxed worker sits several processes below the one this process spawned: on Linux the shell wrapper, bwrap and
 * its init, the sandbox runtime's script and its listeners, apply-seccomp and its nested init. A sample sums `VmRSS`
 * over that tree, walked to its leaves. It is a sum of per-process resident sets, so a page shared by two of them is
 * counted twice; it is not a heap and not a proportional set size. Nothing here feeds a recycling decision.
 *
 * @module
 */
import { readFile as readTextFile } from 'node:fs/promises';

import { ownedProcesses, processTable } from '#shell/process-tree.js';
import type { ProcessRow } from '#shell/process-tree.js';

/** Levels below the spawned process a walk descends; the worker sits about six below it. */
export const childResidentDepth = 10;
/** Processes a sample sums at most. */
export const childResidentPids = 32;

/** What a Linux sample reads; injectable for tests. @internal */
export type LinuxResidentSources = Readonly<{
  /** Reads one `/proc` file as text; rejects when it does not exist. */
  readFile: (path: string) => Promise<string>;
  /** The host process table, read where the children files are absent. */
  table: () => Promise<readonly ProcessRow[]>;
}>;

const defaultSources: LinuxResidentSources = {
  readFile: async (path) => readTextFile(path, 'utf8'),
  table: processTable,
};

const residentPattern = /^VmRSS:\s+(\d+)\s+kB$/mu;

/**
 * Bytes of one process's resident set.
 *
 * @param pid - The process.
 * @param sources - The `/proc` reader.
 * @returns The bytes, or `undefined` when it exited or has none (a zombie).
 */
const residentBytes = async (pid: number, sources: LinuxResidentSources): Promise<number | undefined> => {
  try {
    const kibibytes = residentPattern.exec(await sources.readFile(`/proc/${String(pid)}/status`))?.[1];
    return kibibytes === undefined ? undefined : Number(kibibytes) * 1024;
  } catch {
    return undefined;
  }
};

const childrenOf = async (pid: number, sources: LinuxResidentSources): Promise<readonly number[] | undefined> => {
  try {
    const text = await sources.readFile(`/proc/${String(pid)}/task/${String(pid)}/children`);
    return text
      .split(/\s+/u)
      .filter((field) => field.length > 0)
      .map(Number)
      .filter((child) => Number.isSafeInteger(child) && child > 0);
  } catch {
    return undefined;
  }
};

/**
 * The process tree below `root` from the kernel's children files, breadth first, to the leaves.
 *
 * @param root - The spawned process.
 * @param sources - The `/proc` reader.
 * @returns The tree's process ids, `root` first, at most {@link childResidentPids} of them and at most
 *   {@link childResidentDepth} levels deep; `undefined` when the kernel has no children files (no `CONFIG_PROC_CHILDREN`).
 */
export const linuxChildrenTree = async (
  root: number,
  sources: LinuxResidentSources,
): Promise<readonly number[] | undefined> => {
  const rootChildren = await childrenOf(root, sources);
  if (rootChildren === undefined) {
    return undefined;
  }
  const seen = new Set<number>([root]);
  let level: readonly number[] = rootChildren;
  for (let depth = 1; depth <= childResidentDepth && level.length > 0; depth += 1) {
    const next: number[] = [];
    for (const pid of level) {
      if (seen.size >= childResidentPids) {
        return [...seen];
      }
      if (!seen.has(pid)) {
        seen.add(pid);
        next.push(pid);
      }
    }
    if (depth === childResidentDepth) {
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- each level is read from the previous one.
    const children = await Promise.all(next.map(async (pid) => childrenOf(pid, sources)));
    level = children.flatMap((pids) => pids ?? []);
  }
  return [...seen];
};

/**
 * One resident sample of a Linux process tree: `VmRSS` summed over the tree below `root`, walked through the children
 * files, or through the host process table (the set `terminateOwnedProcesses` stops) where those files are absent.
 *
 * @param tree - The spawned process and the process group it leads.
 * @param sources - The readers; the real `/proc` by default.
 * @returns The summed bytes, or `undefined` when no process of the tree reported a resident set.
 */
export const sampleLinuxResident = async (
  tree: Readonly<{ root: number; group: number }>,
  sources: LinuxResidentSources = defaultSources,
): Promise<number | undefined> => {
  const pids =
    (await linuxChildrenTree(tree.root, sources)) ??
    [...ownedProcesses(await sources.table(), tree.root, tree.group)].slice(0, childResidentPids);
  const sizes = await Promise.all(pids.map(async (pid) => residentBytes(pid, sources)));
  const reported = sizes.filter((size) => size !== undefined);
  return reported.length === 0 ? undefined : reported.reduce((sum, size) => sum + size, 0);
};
