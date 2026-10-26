import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
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

/** A host-side stand-in this process created for an absent protected path, and how many live launches rely on it. */
type StandIn = { holders: number; directory: boolean };

const standIns = new Map<string, StandIn>();
let exitHookRegistered = false;

const removeStandIn = (path: string, directory: boolean): void => {
  try {
    const info = lstatSync(path, { throwIfNoEntry: false });
    // Only the empty entry this process made is removed; anything written into it since is someone's real data.
    if (directory && info?.isDirectory() === true && readdirSync(path).length === 0) {
      rmdirSync(path);
    } else if (!directory && info?.isFile() === true && info.size === 0) {
      unlinkSync(path);
    }
  } catch {
    // Already gone or no longer ours.
  }
};

/** Claim the stand-in for one protected path: an existing one this process holds, or a new one it creates. */
const standInStep = (path: string, root: string, filesystem: ShellFilesystem): string | undefined => {
  const masked = filesystem.masked ?? [];
  const protectedPaths = new Set([...filesystem.denied, ...(filesystem.readOnly ?? [])]);
  const steps: string[] = [];
  for (let step = path; step !== root && inside(step, root); step = dirname(step)) {
    steps.unshift(step);
  }
  for (const step of steps) {
    const existing = standIns.get(step);
    if (existing !== undefined) {
      existing.holders += 1;
      return step;
    }
    const info = lstatSync(step, { throwIfNoEntry: false });
    if (info === undefined) {
      const directory = step !== path;
      try {
        if (directory) {
          mkdirSync(step);
        } else {
          closeSync(openSync(step, 'wx'));
        }
      } catch {
        // Created by someone else meanwhile, or not creatable: the runtime handles it as before.
        return undefined;
      }
      standIns.set(step, { holders: 1, directory });
      return step;
    }
    const covered =
      protectedPaths.has(step) ||
      (masked.includes(step) &&
        !filesystem.writable.some((child) => child !== step && inside(child, step) && inside(path, child)));
    if (step === path || info.isSymbolicLink() || !info.isDirectory() || covered) {
      return undefined;
    }
  }
  return undefined;
};

/**
 * Hold a host-side stand-in at the first absent component of every protected path inside a writable root, shared by
 * every Linux launch of this process, before the launch's sandbox configuration observes the filesystem.
 *
 * Bubblewrap can only mask a name that exists, so the runtime creates such a mount point itself and its supervisor
 * deletes it on exit, even while another launch's sandbox is mounted on it: that sandbox's mask detaches, and a launch
 * configured against the vanished entry binds a source that is gone. A stand-in instead exists from before any launch
 * that relies on it is configured until the last of them has ended, so the runtime never creates or deletes it, and
 * it is the same empty directory (an intermediate component) or empty file (the protected path itself) the runtime
 * would mount on. Paths under an existing protected directory, a symbolic link, a file, or an existing masked container
 * outside its writable children are left alone: those are already covered, and the host never writes there.
 *
 * @internal
 * @param filesystem - The launch's filesystem grant.
 * @returns Release, idempotent: call it once the launch's sandbox and supervisor are gone.
 */
export const holdProtectedStandIns = (filesystem: ShellFilesystem): (() => void) => {
  if (process.platform !== 'linux') {
    return () => undefined;
  }
  const masked = filesystem.masked ?? [];
  const readOnly = filesystem.readOnly ?? [];
  const protectedPaths = [...filesystem.denied, ...readOnly];
  // The provider marks an absent container by a child it denies; the container is that child's first absent step.
  const candidates = [...protectedPaths, ...masked.map((root) => join(root, '.tau-mask-boundary'))];
  const held: string[] = [];
  for (const path of candidates) {
    const root = filesystem.writable
      .filter((candidate) => candidate !== path && inside(path, candidate))
      .toSorted((left, right) => right.length - left.length)[0];
    if (root === undefined) {
      continue;
    }
    const step = standInStep(path, root, filesystem);
    if (step !== undefined) {
      held.push(step);
    }
  }
  if (held.length > 0 && !exitHookRegistered) {
    exitHookRegistered = true;
    process.once('exit', () => {
      for (const [path, standIn] of standIns) {
        removeStandIn(path, standIn.directory);
      }
    });
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    for (const step of held.toSorted((left, right) => right.length - left.length)) {
      const standIn = standIns.get(step);
      if (standIn === undefined) {
        continue;
      }
      standIn.holders -= 1;
      if (standIn.holders === 0) {
        standIns.delete(step);
        removeStandIn(step, standIn.directory);
      }
    }
  };
};
