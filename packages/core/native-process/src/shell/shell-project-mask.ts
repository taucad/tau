import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative } from 'node:path';

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
      if (!lstatSync(root).isDirectory() || realpathSync(root) !== root) {
        return 'a masked container must be a real directory without symbolic-link ancestors.';
      }
    } catch {
      return 'a masked container is missing; restore the project directory before trying a new command.';
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

/** Append creation restrictions after the runtime's broader writable-root rules. @internal */
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
    .flatMap((root) => [
      `(deny file-write-create (regex ${JSON.stringify(`^${regexEscape(root)}/[^/]+$`)}))`,
      ...filesystem.writable
        .filter((path) => dirname(path) === root && !filesystem.denied.some((deny) => inside(path, deny)))
        .map((path) => `(allow file-write-create (literal ${JSON.stringify(path)}))`),
    ])
    .join('\n');
  // The profile is already shell-quoted by SRT; escape only the appended text into that same quoted argument.
  const appended = `\n; Reserved directory creation boundary\n${rules}\n`.replaceAll("'", `'"'"'`);
  return [shell, flag, `${wrapped.slice(0, close)}${appended}${wrapped.slice(close)}`];
};
