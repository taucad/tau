import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative } from 'node:path';

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
