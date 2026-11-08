/**
 * Git's ignore rules, read as `git check-ignore` reads them, for a leg that has
 * no Git of its own to ask (the browser).
 *
 * The sources are the tree's own `.gitignore` files, nested, and the store's
 * `info/exclude`, which holds Tau's derived ignores. `core.excludesFile` is per
 * device, so neither leg reads it: a cut predicts its tree from what every
 * device holds (I5).
 *
 * The rules are gitignore(5)'s:
 *
 * - a blank line or a `#` line is nothing; `\#` and `\!` start a literal; a
 *   trailing space is dropped unless escaped;
 * - `!` re-includes what an earlier line excluded, but never a path under an
 *   excluded directory: Git does not descend into one;
 * - a trailing `/` matches a directory only;
 * - a pattern with a `/` before its end is anchored at its file's directory,
 *   one without matches a name at any depth below it;
 * - `*`, `?` and `[...]` never match a `/`; `**` between slashes, at the start
 *   or at the end matches any number of directories;
 * - a deeper file's lines win over a shallower one's, every `.gitignore` over
 *   `info/exclude`, and within one file the last matching line wins.
 *
 * A tracked path is never ignored, as in Git.
 */

/** One ignore line, compiled. */
type IgnoreRule = Readonly<{
  negated: boolean;
  directoryOnly: boolean;
  /** Matches the path relative to the rule's directory (anchored) or the name alone. */
  anchored: boolean;
  expression: RegExp | undefined;
}>;

/** The rules of one source, and the directory its patterns are relative to (`''` or `a/b/`). */
type IgnoreSource = Readonly<{ base: string; rules: readonly IgnoreRule[] }>;

const posixClasses: Readonly<Record<string, string>> = {
  alnum: 'a-zA-Z0-9',
  alpha: 'a-zA-Z',
  blank: ' \\t',
  cntrl: '\\x00-\\x1f\\x7f',
  digit: '0-9',
  graph: '\\x21-\\x7e',
  lower: 'a-z',
  print: '\\x20-\\x7e',
  punct: '!-\\/:-@\\[-`{-~',
  space: ' \\t\\n\\r\\f\\v',
  upper: 'A-Z',
  xdigit: '0-9a-fA-F',
};

const escapeForClass = (character: string): string => (/[\\\]^-]/u.test(character) ? `\\${character}` : character);
const escapeLiteral = (character: string): string => character.replaceAll(/[$()*+.?[\\\]^{|}/]/gu, String.raw`\$&`);

/**
 * One bracket expression from `pattern[start]` (the `[`), as wildmatch reads it.
 *
 * @param pattern - The pattern.
 * @param start - The index of its `[`.
 * @returns The class as a regular-expression source and the index after its `]`, or `undefined` when unterminated.
 */
const bracketAt = (pattern: string, start: number): Readonly<{ source: string; end: number }> | undefined => {
  let index = start + 1;
  const negated = pattern[index] === '!' || pattern[index] === '^';
  if (negated) {
    index += 1;
  }
  let body = '';
  let first = true;
  while (index < pattern.length) {
    const character = pattern[index]!;
    if (character === ']' && !first) {
      /* A class never matches `/` (WM_PATHNAME), negated or not. */
      return { source: negated ? `[^/${body}]` : `(?!/)[${body}]`, end: index + 1 };
    }
    first = false;
    if (character === '[' && pattern[index + 1] === ':') {
      const close = pattern.indexOf(':]', index + 2);
      const name = close === -1 ? undefined : pattern.slice(index + 2, close);
      if (name !== undefined && posixClasses[name] !== undefined) {
        body += posixClasses[name];
        index = close + 2;
        continue;
      }
    }
    let literal = character;
    if (character === '\\' && index + 1 < pattern.length) {
      index += 1;
      literal = pattern[index]!;
    }
    if (pattern[index + 1] === '-' && pattern[index + 2] !== undefined && pattern[index + 2] !== ']') {
      let upper = pattern[index + 2]!;
      let skip = 3;
      if (upper === '\\' && pattern[index + 3] !== undefined) {
        upper = pattern[index + 3]!;
        skip = 4;
      }
      body += `${escapeForClass(literal)}-${escapeForClass(upper)}`;
      index += skip;
      continue;
    }
    body += escapeForClass(literal);
    index += 1;
  }
  return undefined;
};

/**
 * A wildmatch pattern (WM_PATHNAME) as a regular expression over a whole path.
 *
 * @param pattern - The pattern, its leading `/` and trailing `/` already removed.
 * @returns The expression, or `undefined` for a pattern Git can never match (an unterminated class).
 */
const wildmatchExpression = (pattern: string): RegExp | undefined => {
  let source = '';
  for (let index = 0; index < pattern.length; ) {
    const character = pattern[index]!;
    switch (character) {
      case '\\': {
        source += escapeLiteral(pattern[index + 1] ?? '\\');
        index += 2;
        break;
      }
      case '*': {
        const atStart = index === 0 || pattern[index - 1] === '/';
        const after = pattern[index + 2];
        if (pattern[index + 1] === '*' && atStart && after === '/') {
          source += '(?:.*/)?';
          index += 3;
        } else if (pattern[index + 1] === '*' && atStart && after === undefined) {
          source += '.*';
          index += 2;
        } else {
          /* `**` anywhere else is two `*`s: neither crosses a `/`. */
          while (pattern[index] === '*') {
            index += 1;
          }
          source += '[^/]*';
        }
        break;
      }
      case '?': {
        source += '[^/]';
        index += 1;
        break;
      }
      case '[': {
        const bracket = bracketAt(pattern, index);
        if (bracket === undefined) {
          return undefined;
        }
        source += bracket.source;
        index = bracket.end;
        break;
      }
      default: {
        source += escapeLiteral(character);
        index += 1;
      }
    }
  }
  return new RegExp(`^${source}$`, 'u');
};

/**
 * One file's ignore lines, compiled.
 *
 * @param content - The file's text.
 * @returns Its rules, in file order.
 */
export const parseIgnoreRules = (content: string): readonly IgnoreRule[] =>
  content.split(/\r?\n/u).flatMap((raw): IgnoreRule[] => {
    /* Trailing spaces go unless escaped; a trailing `\` alone keeps the space after it. */
    let line = raw.replace(/(?<!\\)[ ]+$/u, '');
    if (line.endsWith(String.raw`\ `)) {
      line = line.replace(/\\ $/u, ' ');
    }
    if (line === '' || line.startsWith('#')) {
      return [];
    }
    let negated = false;
    if (line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    } else if (line.startsWith(String.raw`\!`) || line.startsWith(String.raw`\#`)) {
      line = line.slice(1);
    }
    const directoryOnly = line.endsWith('/') && !line.endsWith(String.raw`\/`);
    if (directoryOnly) {
      line = line.slice(0, -1);
    }
    if (line === '') {
      return [];
    }
    const anchored = line.includes('/');
    if (line.startsWith('/')) {
      line = line.slice(1);
    }
    return [{ negated, directoryOnly, anchored, expression: wildmatchExpression(line) }];
  });

/**
 * Whether one source decides a path: `true` excluded, `false` re-included, `undefined` silent.
 *
 * @param source - The source.
 * @param path - Project-relative, without a trailing `/`.
 * @param directory - Whether the path is a directory.
 * @returns The last matching line's verdict.
 */
const verdictOf = (source: IgnoreSource, path: string, directory: boolean): boolean | undefined => {
  if (!path.startsWith(source.base)) {
    return undefined;
  }
  const relative = path.slice(source.base.length);
  const name = relative.slice(relative.lastIndexOf('/') + 1);
  for (let index = source.rules.length - 1; index >= 0; index -= 1) {
    const rule = source.rules[index]!;
    if ((rule.directoryOnly && !directory) || rule.expression === undefined) {
      continue;
    }
    if (rule.expression.test(rule.anchored ? relative : name)) {
      return !rule.negated;
    }
  }
  return undefined;
};

/** A directory's entries, as much of the provider surface as the walk needs. */
export type IgnoreWalkFiles = Readonly<{
  readdir: (path: string) => Promise<readonly string[]>;
  /** Whether a path is a directory (a symbolic link is not: Git never follows one). */
  isDirectory: (path: string) => Promise<boolean>;
  /** A `.gitignore`'s text, or `undefined` when there is none. */
  readText: (path: string) => Promise<string | undefined>;
}>;

/**
 * The untracked paths a checkout's own Git rules ignore, listed as
 * `git ls-files --others --ignored --exclude-standard --directory` lists
 * them: an ignored directory that holds no tracked file once, with its
 * trailing `/`, and every other ignored path by itself.
 *
 * @param files - The checkout's files.
 * @param inputs - The tracked paths (the checkout head's files), the store's `info/exclude`, and names never walked (the store's own directory).
 * @returns Paths relative to the checkout root, sorted.
 */
export const ignoredUntrackedPaths = async (
  files: IgnoreWalkFiles,
  inputs: Readonly<{ tracked: ReadonlySet<string>; exclude?: string | undefined; skip?: (path: string) => boolean }>,
): Promise<readonly string[]> => {
  const trackedDirectories = new Set<string>();
  for (const path of inputs.tracked) {
    for (let slash = path.indexOf('/'); slash !== -1; slash = path.indexOf('/', slash + 1)) {
      trackedDirectories.add(path.slice(0, slash));
    }
  }
  const excludeSource: IgnoreSource = { base: '', rules: parseIgnoreRules(inputs.exclude ?? '') };
  const ignored: string[] = [];
  /* Deepest source first, `info/exclude` last: the first that speaks decides. */
  const isExcluded = (sources: readonly IgnoreSource[], path: string, directory: boolean): boolean => {
    for (let index = sources.length - 1; index >= 0; index -= 1) {
      const verdict = verdictOf(sources[index]!, path, directory);
      if (verdict !== undefined) {
        return verdict;
      }
    }
    return verdictOf(excludeSource, path, directory) === true;
  };
  const walk = async (directory: string, sources: readonly IgnoreSource[], excluded: boolean): Promise<void> => {
    const prefix = directory === '' ? '' : `${directory}/`;
    const own = excluded ? undefined : await files.readText(`${prefix}.gitignore`);
    const here = own === undefined ? sources : [...sources, { base: prefix, rules: parseIgnoreRules(own) }];
    const names = [...(await files.readdir(directory))].toSorted();
    /* An untracked repository inside the checkout is one entry to Git, which never looks inside it. */
    if (directory !== '' && names.includes('.git') && !trackedDirectories.has(directory)) {
      return;
    }
    for (const name of names) {
      const path = `${prefix}${name}`;
      if (inputs.skip?.(path) === true || inputs.tracked.has(path)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one entry at a time keeps the walk's order Git's.
      const isDirectory = await files.isDirectory(path);
      const ignoredHere = excluded || isExcluded(here, path, isDirectory);
      if (!isDirectory) {
        if (ignoredHere) {
          ignored.push(path);
        }
        continue;
      }
      if (ignoredHere && !trackedDirectories.has(path)) {
        ignored.push(`${path}/`);
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await walk(path, here, ignoredHere);
    }
  };
  await walk('', [], false);
  return ignored.toSorted();
};
