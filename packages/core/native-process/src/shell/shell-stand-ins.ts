/**
 * Host-side stand-ins for absent protected paths on Linux, shared by every launch of this process.
 */
import {
  closeSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';

/** A stand-in this process created, the identity it was created with, and how many live launches rely on it. */
type StandIn = { holders: number; directory: boolean; dev: string; ino: string };

/** One journal row: what a crashed process may have left behind. */
type JournalRow = Readonly<{ path: string; directory: boolean; dev: string; ino: string }>;

const standIns = new Map<string, StandIn>();
let journalPath: string | undefined;
let exitHookRegistered = false;

const inside = (path: string, root: string): boolean => {
  const step = relative(root, path);
  return step === '' || (!step.startsWith('..') && !isAbsolute(step));
};

const identity = (path: string): BigIntStats | undefined => lstatSync(path, { bigint: true, throwIfNoEntry: false });

const sameEntry = (info: BigIntStats | undefined, expected: Readonly<{ dev: string; ino: string }>): boolean =>
  info !== undefined && String(info.dev) === expected.dev && String(info.ino) === expected.ino;

/** Persist the live stand-ins, so the next start can sweep what a crash left behind. */
const writeJournal = (): void => {
  if (journalPath === undefined) {
    return;
  }
  const rows: JournalRow[] = [...standIns].map(([path, { directory, dev, ino }]) => ({ path, directory, dev, ino }));
  const staging = `${journalPath}.${String(process.pid)}.tmp`;
  try {
    writeFileSync(staging, `${JSON.stringify(rows)}\n`, { mode: 0o600 });
    renameSync(staging, journalPath);
  } catch {
    // The journal is a crash backstop; a launch never fails for it.
  }
};

/**
 * Remove one stand-in only while it is still the entry this process created, and still empty. A directory is removed
 * by `rmdir`, which refuses a non-empty directory atomically. A file is first renamed inside an exclusively allocated
 * sibling directory, so no existing destination is overwritten. Anything that is not the empty stand-in is put back
 * without replacing a newer entry, or retained in the private directory if restoration fails.
 *
 * @param path - The claimed stand-in path.
 * @param expected - The entry kind and identity recorded when it was created.
 */
const removeStandIn = (path: string, expected: Readonly<{ directory: boolean; dev: string; ino: string }>): void => {
  try {
    const info = identity(path);
    if (!sameEntry(info, expected)) {
      return;
    }
    if (expected.directory) {
      if (info!.isDirectory()) {
        rmdirSync(path);
      }
      return;
    }
    if (!info!.isFile() || info!.size !== 0n) {
      return;
    }
    const privateDirectory = mkdtempSync(join(dirname(path), `.${basename(path)}.tau-stand-in-`));
    const aside = join(privateDirectory, 'entry');
    try {
      renameSync(path, aside);
      const moved = identity(aside);
      if (sameEntry(moved, expected) && moved!.isFile() && moved!.size === 0n) {
        unlinkSync(aside);
        return;
      }
      // Not ours any more: put it back without replacing anything that has since appeared at the path.
      linkSync(aside, path);
      unlinkSync(aside);
    } finally {
      // Only remove an empty container; a replacement we could not restore must survive.
      rmdirSync(privateDirectory);
    }
  } catch {
    // Already gone, no longer ours, or not empty: left in place.
  }
};

/**
 * Sweep the stand-ins a previous process journalled and never released, then journal this process's own there. Only
 * an entry that is still the journalled one (device and inode) and still empty is removed, deepest first.
 *
 * @internal
 * @param path - A journal file under host-owned state, outside every checkout.
 */
export const useStandInJournal = (path: string): void => {
  if (journalPath === path) {
    return;
  }
  journalPath = path;
  let rows: JournalRow[] = [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    rows = Array.isArray(parsed) ? (parsed as JournalRow[]) : [];
  } catch {
    // No journal yet, or unreadable: nothing to sweep.
  }
  for (const row of rows.toSorted((left, right) => right.path.length - left.path.length)) {
    if (typeof row.path === 'string' && isAbsolute(row.path) && !standIns.has(row.path)) {
      removeStandIn(row.path, row);
    }
  }
  writeJournal();
};

/** The runtime configuration a hold is computed from: exactly what the sandbox runtime is handed. */
export type StandInProfile = Readonly<{
  /** The runtime's `denyWrite` list: the only paths it creates mount points for. */
  denyWrite: readonly string[];
  /** The runtime's `allowWrite` list. */
  allowWrite: readonly string[];
  /** The protected paths that are directories when present. */
  directories?: readonly string[] | undefined;
  /** The masked containers, as the runtime is handed them; each is stood in for as a directory. */
  masked?: readonly string[] | undefined;
  /** The explicit writable children a mask leaves open. */
  writable?: readonly string[] | undefined;
}>;

type Claim = Readonly<{
  root: string;
  profile: StandInProfile;
  protectedPaths: ReadonlySet<string>;
  directories: ReadonlySet<string>;
  claimed: string[];
}>;

/** Whether `step` is a masked container that covers `path`: the runtime's mask hides the whole of it. */
const coveredByMask = (step: string, path: string, profile: StandInProfile): boolean =>
  (profile.masked ?? []).includes(step) &&
  !(profile.writable ?? []).some((child) => child !== step && inside(child, step) && inside(path, child));

/**
 * Claim the stand-ins for one protected path: every absent component from the writable root down to the path itself,
 * so the runtime finds the whole path present and creates no mount point of its own, stopping at a masked container
 * that covers it. Components this process already stands in for are held again. Each claim is pushed onto `claimed`
 * as soon as it is taken, so a throw midway leaves an exact record of what to release.
 */
const claimSteps = (path: string, { root, profile, protectedPaths, directories, claimed }: Claim): void => {
  const steps: string[] = [];
  for (let step = path; step !== root && inside(step, root); step = dirname(step)) {
    steps.unshift(step);
  }
  for (const step of steps) {
    const existing = standIns.get(step);
    if (existing !== undefined) {
      existing.holders += 1;
      claimed.push(step);
      if (coveredByMask(step, path, profile)) {
        return;
      }
      continue;
    }
    const info = lstatSync(step, { throwIfNoEntry: false });
    if (info === undefined) {
      // An intermediate component, a masked container or a protected path the registry declares a directory is an
      // empty directory: what Tau itself would create there. Only a file row is stood in for by an empty file.
      const directory = step !== path || directories.has(path);
      try {
        if (directory) {
          mkdirSync(step);
        } else {
          closeSync(openSync(step, 'wx'));
        }
      } catch {
        // Created by someone else meanwhile, or not creatable: the runtime handles the rest as before.
        return;
      }
      const created = identity(step)!;
      standIns.set(step, { holders: 1, directory, dev: String(created.dev), ino: String(created.ino) });
      claimed.push(step);
      writeJournal();
      if (coveredByMask(step, path, profile)) {
        return;
      }
      continue;
    }
    if (
      step === path ||
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      protectedPaths.has(step) ||
      coveredByMask(step, path, profile)
    ) {
      return;
    }
  }
};

const release = (claimed: readonly string[]): void => {
  let changed = false;
  for (const step of claimed.toSorted((left, right) => right.length - left.length)) {
    const standIn = standIns.get(step);
    if (standIn === undefined) {
      continue;
    }
    standIn.holders -= 1;
    if (standIn.holders === 0) {
      standIns.delete(step);
      removeStandIn(step, standIn);
      changed = true;
    }
  }
  if (changed) {
    writeJournal();
  }
};

/**
 * Hold host-side stand-ins for every absent component of each protected path inside a writable root, shared by
 * every Linux launch of this process, before the launch's sandbox runtime observes the filesystem.
 *
 * Bubblewrap can only mask a name that exists, so the runtime creates such a mount point itself and its supervisor
 * deletes it on exit, even while another launch's sandbox is mounted on it: that sandbox's mask detaches, and a launch
 * configured against the vanished entry binds a source that is gone. A stand-in instead exists from before any launch
 * that relies on it is configured until the last of them has ended, so the runtime never creates or deletes one. Each
 * is an empty directory for an intermediate component, a masked container or a directory row, and an empty file only
 * for a file row, so the product never finds a file where it reads a directory. Paths under an existing protected
 * directory, a symbolic link, a file, or a masked container outside its writable children are left alone: those are
 * already covered, and the host never writes there.
 *
 * The set is computed from the exact `denyWrite` and `allowWrite` arrays handed to the runtime, so a baseline deny or
 * a physical spelling inside a writable root is stood in for too. A hold that throws midway releases what it took.
 *
 * @internal
 * @param profile - The runtime's deny and write lists, the masked containers and the directory rows.
 * @returns Release, idempotent: call it once the launch's sandbox and supervisor are gone.
 */
export const holdProtectedStandIns = (profile: StandInProfile): (() => void) => {
  if (process.platform !== 'linux') {
    return () => undefined;
  }
  const protectedPaths = new Set(profile.denyWrite);
  const directories = new Set([...(profile.directories ?? []), ...(profile.masked ?? [])]);
  const claimed: string[] = [];
  try {
    for (const path of new Set([...(profile.masked ?? []), ...protectedPaths])) {
      const root = profile.allowWrite
        .filter((candidate) => candidate !== path && inside(path, candidate))
        // The outermost root: the runtime's write list also pins absent ancestors, which a walk must create.
        .toSorted((left, right) => left.length - right.length)[0];
      if (root !== undefined) {
        claimSteps(path, { root, profile, protectedPaths, directories, claimed });
      }
    }
  } catch (error) {
    release(claimed);
    throw error;
  }
  if (claimed.length > 0 && !exitHookRegistered) {
    exitHookRegistered = true;
    process.once('exit', () => {
      for (const [path, standIn] of [...standIns].toSorted(([left], [right]) => right.length - left.length)) {
        removeStandIn(path, standIn);
      }
      standIns.clear();
      writeJournal();
    });
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    release(claimed);
  };
};
