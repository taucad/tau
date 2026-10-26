import {
  closeSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';

import type { ShellFilesystem } from '#shell/shell-provider.js';

const inside = (path: string, root: string): boolean => {
  const fold = (value: string): string => (process.platform === 'darwin' ? value.toLowerCase() : value);
  const step = relative(fold(root), fold(path));
  return step === '' || (!step.startsWith('..') && !isAbsolute(step));
};

/** Validate explicit mask boundaries without interpreting a project's reserved layout. @internal */
export const maskProblem = (filesystem: ShellFilesystem): string | undefined => {
  const masked = filesystem.masked ?? [];
  for (const root of masked) {
    if (!isAbsolute(root) || root.includes('\0')) {
      return 'every masked container must be an absolute path.';
    }
    // A firmlinked data-volume spelling is not the path the kernel reports, so no mask rule would match it.
    if (root === '/System/Volumes/Data' || root.startsWith('/System/Volumes/Data/')) {
      return 'a masked container must not be spelled through /System/Volumes/Data; use its firmlinked path.';
    }
    // The native realpath returns each component's stored case on macOS, so a root spelled in another case is
    // refused rather than compiled into a mask that matches nothing.
    const canonical = (path: string): string => realpathSync.native(path);
    try {
      const info = lstatSync(root, { throwIfNoEntry: false });
      if (info === undefined) {
        const parent = dirname(root);
        if (!lstatSync(parent).isDirectory() || canonical(parent) !== parent) {
          return 'an absent masked container must have a canonical directory parent.';
        }
      } else if (!info.isDirectory() || canonical(root) !== root) {
        return 'a masked container must be a real directory without symbolic-link ancestors.';
      }
    } catch {
      return 'a masked container or its immediate parent is unavailable.';
    }
    if (
      filesystem.denied.some((deny) => inside(root, deny)) ||
      masked.some((other) => other !== root && inside(root, other))
    ) {
      return 'a masked container overlaps a denied path or another masked container.';
    }
    const opened = [...filesystem.readable, ...filesystem.writable, ...(filesystem.readOnly ?? [])];
    for (const path of opened.filter((path) => inside(path, root))) {
      if (path === root || filesystem.denied.some((deny) => inside(path, deny))) {
        return 'a masked container may open only strict descendants outside denied paths.';
      }
      try {
        if (realpathSync(path) !== path) {
          return 'an opened masked child must not resolve through a symbolic link.';
        }
      } catch {
        if (process.platform === 'linux' && filesystem.writable.includes(path)) {
          return 'an opened masked child is missing; Linux can only rebind existing paths.';
        }
      }
    }
  }
  return undefined;
};

/**
 * Append deny-only masks after the runtime's rules. Explicit child grants are subtracted from these masks,
 * never re-allowed after an existing runtime denial. The reserved container's folded spellings stay closed.
 * @internal
 */
export const bindMaskedDirectories = (
  argv: readonly string[],
  filesystem: ShellFilesystem,
): readonly string[] | undefined => {
  const masked = filesystem.masked ?? [];
  if (masked.length === 0) {
    return argv;
  }
  const [shell, flag, wrapped] = argv;
  const marker = " /usr/bin/sandbox-exec -p '(version 1)";
  const start = wrapped?.indexOf(marker) ?? -1;
  if (
    argv.length !== 3 ||
    shell === undefined ||
    flag !== '-c' ||
    wrapped === undefined ||
    start === -1 ||
    wrapped.includes(marker, start + 1)
  ) {
    return undefined;
  }
  let close = wrapped.indexOf("'", start + marker.length);
  while (close !== -1 && wrapped.startsWith(`'"'"'`, close)) {
    close = wrapped.indexOf("'", close + `'"'"'`.length);
  }
  if (close === -1) {
    return undefined;
  }
  const regexEscape = (path: string): string => path.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  // Seatbelt matches the path of the resolved vnode, not the caller's spelling, so the parent keeps its physical
  // spelling: C16 reaches an authored child, and is refused a hidden one, through an upper-cased checkout path.
  // Only the reserved name is folded, for distinct spellings on a case-sensitive volume.
  const fold = (text: string): string =>
    [...text]
      .map((character) =>
        /[A-Za-z]/u.test(character) ? `[${character.toLowerCase()}${character.toUpperCase()}]` : regexEscape(character),
      )
      .join('');
  const rules = masked
    .flatMap((root) => {
      // Registry-reserved names are ASCII. Match their trailing dot/space/colon spellings without interpreting
      // arbitrary path bytes as SBPL or regex syntax.
      const container = `^${regexEscape(dirname(root))}/${fold(basename(root))}[. ]*(:[^/]*)?`;
      const region = `(regex ${JSON.stringify(`${container}(/.*)?$`)})`;
      const itself = `(regex ${JSON.stringify(`${container}$`)})`;
      const within = (paths: readonly string[]): string[] =>
        paths.filter((path) => path !== root && inside(path, root));
      const explicit = (paths: readonly string[]): string[] =>
        within(paths).map((path) => `(subpath ${JSON.stringify(path)})`);
      const opened = [...filesystem.readable, ...filesystem.writable, ...(filesystem.readOnly ?? [])];
      // Directories between the container and an opened child, which a lookup of that child must stat.
      const between = within(opened).flatMap((path) => {
        const steps: string[] = [];
        for (let step = dirname(path); step !== root && inside(step, root); step = dirname(step)) {
          steps.push(`(literal ${JSON.stringify(step)})`);
        }
        return steps;
      });
      const subtract = (filters: readonly string[]): string =>
        filters.length === 0
          ? region
          : `(require-all ${region} ${[...new Set(filters)].map((filter) => `(require-not ${filter})`).join(' ')})`;
      return [
        `(deny file-read* ${subtract([itself, ...between, ...explicit(opened)])})`,
        // The container and the directories leading to opened children stay traversable, but listing any of
        // them would disclose hidden names.
        `(deny file-read-data ${[itself, ...new Set(between)].join(' ')})`,
        // The runtime allows directory metadata everywhere with an operation-specific rule, which outranks the
        // wildcard above; hidden directories must not even be stat-able.
        `(deny file-read-metadata ${subtract([itself, ...between, ...explicit(opened)])})`,
        `(deny file-write* ${subtract(explicit(filesystem.writable))})`,
        // Seatbelt prefers an operation-specific rule over a wildcard regardless of order, and the runtime
        // re-allows create and unlink beneath every write root. Name both so the mask outranks that allow.
        `(deny file-write-create file-write-unlink ${subtract(explicit(filesystem.writable))})`,
      ];
    })
    .join('\n');
  // The profile is already shell-quoted by SRT; escape only the appended text into that same quoted argument.
  const appended = `\n; Reserved directory creation boundary\n${rules}\n`.replaceAll("'", `'"'"'`);
  return [shell, flag, `${wrapped.slice(0, close)}${appended}${wrapped.slice(close)}`];
};

/** A stand-in this process created, the identity it was created with, and how many live launches rely on it. */
type StandIn = { holders: number; directory: boolean; dev: string; ino: string };

/** One journal row: what a crashed process may have left behind. */
type JournalRow = Readonly<{ path: string; directory: boolean; dev: string; ino: string }>;

const standIns = new Map<string, StandIn>();
let journalPath: string | undefined;
let exitHookRegistered = false;
let privateNames = 0;

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
 * by `rmdir`, which refuses a non-empty directory atomically. A file is first renamed to a private name in the same
 * directory, so a real file renamed into place meanwhile is never the one unlinked; anything that is not the empty
 * stand-in is put back.
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
    privateNames += 1;
    const aside = join(dirname(path), `.${basename(path)}.tau-stand-in-${String(process.pid)}-${String(privateNames)}`);
    renameSync(path, aside);
    const moved = identity(aside);
    if (sameEntry(moved, expected) && moved!.isFile() && moved!.size === 0n) {
      unlinkSync(aside);
      return;
    }
    // Not ours any more: put it back without replacing anything that has since appeared at the path.
    linkSync(aside, path);
    unlinkSync(aside);
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
