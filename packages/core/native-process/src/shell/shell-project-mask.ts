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
    try {
      const info = lstatSync(root, { throwIfNoEntry: false });
      if (info === undefined) {
        const parent = dirname(root);
        if (!lstatSync(parent).isDirectory() || realpathSync(parent) !== parent) {
          return 'an absent masked container must have a canonical directory parent.';
        }
      } else if (!info.isDirectory() || realpathSync(root) !== root) {
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
  const rules = masked
    .flatMap((root) => {
      // Registry-reserved names are ASCII. Match their case and trailing dot/space/colon spellings without
      // interpreting arbitrary path bytes as SBPL or regex syntax. Parent paths retain their physical spelling.
      const name = [...basename(root)]
        .map((character) =>
          /[A-Za-z]/u.test(character)
            ? `[${character.toLowerCase()}${character.toUpperCase()}]`
            : regexEscape(character),
        )
        .join('');
      const region = `(regex ${JSON.stringify(`^${regexEscape(dirname(root))}/${name}[. ]*(:[^/]*)?(/.*)?$`)})`;
      const explicit = (paths: readonly string[]): string[] =>
        paths.filter((path) => path !== root && inside(path, root)).map((path) => `(subpath ${JSON.stringify(path)})`);
      const subtract = (filters: readonly string[]): string =>
        filters.length === 0
          ? region
          : `(require-all ${region} ${[...new Set(filters)].map((filter) => `(require-not ${filter})`).join(' ')})`;
      return [
        `(deny file-read* ${subtract([
          `(literal ${JSON.stringify(root)})`,
          ...explicit([...filesystem.readable, ...filesystem.writable, ...(filesystem.readOnly ?? [])]),
        ])})`,
        `(deny file-write* ${subtract(explicit(filesystem.writable))})`,
      ];
    })
    .join('\n');
  // The profile is already shell-quoted by SRT; escape only the appended text into that same quoted argument.
  const appended = `\n; Reserved directory creation boundary\n${rules}\n`.replaceAll("'", `'"'"'`);
  return [shell, flag, `${wrapped.slice(0, close)}${appended}${wrapped.slice(close)}`];
};
