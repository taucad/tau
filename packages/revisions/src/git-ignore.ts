/**
 * Git's ignore rules, read as `git check-ignore` reads them, for a leg that has
 * no Git of its own to ask (the browser).
 *
 * The sources are the tree's own `.gitignore` files, nested, and the store's
 * `info/exclude`, which holds Tau's derived ignores. `core.excludesFile` is per
 * device, so neither leg reads it: a cut predicts its tree from what every
 * device holds (I5). `core.ignoreCase` is the repository's own, and folds
 * ASCII letters as Git does.
 *
 * The rules are gitignore(5)'s, and each piece follows Git's own code (Git
 * 2.43, `dir.c` and `wildmatch.c`) so a corner of the format answers as Git
 * answers it:
 *
 * - a leading UTF-8 byte-order mark is dropped; an empty line or a `#` line is
 *   nothing; a trailing space is dropped unless a `\` escapes it, and a line
 *   ending in a lone `\` never matches;
 * - `!` re-includes what an earlier line excluded, but never a path under an
 *   excluded directory: Git does not descend into one;
 * - a trailing `/` matches a directory only (a symbolic link is not one);
 * - a pattern with a `/` before its end is anchored at its file's directory,
 *   one without matches a name at any depth below it;
 * - matching is wildmatch's, byte by byte over UTF-8: `*`, `?` and `[...]`
 *   never match a `/` in an anchored pattern, `**` matches any number of
 *   directories where it stands alone between slashes (after the pattern's
 *   literal prefix, as Git strips it), and a malformed class (an unterminated
 *   one, an unknown `[:name:]`) makes the line match nothing;
 * - a deeper file's lines win over a shallower one's, every `.gitignore` over
 *   `info/exclude`, and within one file the last matching line wins.
 *
 * A tracked path is never ignored, a `.gitignore` that is a symbolic link is
 * never read, anything named `.git` is never listed, and an untracked
 * repository inside the checkout is one entry Git never looks inside.
 */

/** One ignore line, compiled. */
type IgnoreRule = Readonly<{
  negated: boolean;
  directoryOnly: boolean;
  /** Matches the path relative to the rule's directory (anchored) or the name alone. */
  anchored: boolean;
  /** The pattern's bytes, an anchored one without its leading `/`. */
  pattern: Uint8Array<ArrayBuffer>;
  /** How many leading bytes hold no wildcard (`simple_length`). */
  literal: number;
}>;

/** The rules of one source, and the directory its patterns are relative to (`''` or `a/b/`). */
type IgnoreSource = Readonly<{ base: string; rules: readonly IgnoreRule[] }>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* Wildmatch's answers (`wildmatch.h`). */
const matchFound = 0;
const noMatch = 1;
const abortAll = -1;
const abortToStarStar = -2;

/** One wildmatch: its pattern and text, and its flags (`WM_PATHNAME`, `WM_CASEFOLD`). */
type Wildmatch = Readonly<{
  pattern: Uint8Array<ArrayBuffer>;
  text: Uint8Array<ArrayBuffer>;
  pathname: boolean;
  caseFold: boolean;
}>;

const slash = 0x2f;
const star = 0x2a;
const backslash = 0x5c;
const openBracket = 0x5b;
const closeBracket = 0x5d;
const bang = 0x21;
const caret = 0x5e;
const dash = 0x2d;
const colon = 0x3a;
const question = 0x3f;

/* Git's own ctype: ASCII only, whatever the locale. */
const isUpper = (byte: number): boolean => byte >= 0x41 && byte <= 0x5a;
const isLower = (byte: number): boolean => byte >= 0x61 && byte <= 0x7a;
const isDigit = (byte: number): boolean => byte >= 0x30 && byte <= 0x39;
const isAlpha = (byte: number): boolean => isUpper(byte) || isLower(byte);
const isSpace = (byte: number): boolean => byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
const isPrint = (byte: number): boolean => byte >= 0x20 && byte <= 0x7e;
const lower = (byte: number): number => (isUpper(byte) ? byte + 0x20 : byte);
const upper = (byte: number): number => (isLower(byte) ? byte - 0x20 : byte);
const isGlobSpecial = (byte: number): boolean =>
  byte === star || byte === question || byte === openBracket || byte === backslash;

const classTests: Readonly<Record<string, (byte: number, caseFold: boolean) => boolean>> = {
  alnum: (byte) => isAlpha(byte) || isDigit(byte),
  alpha: (byte) => isAlpha(byte),
  blank: (byte) => byte === 0x20 || byte === 0x09,
  cntrl: (byte) => byte < 0x20 || byte === 0x7f,
  digit: (byte) => isDigit(byte),
  graph: (byte) => isPrint(byte) && !isSpace(byte),
  lower: (byte) => isLower(byte),
  print: (byte) => isPrint(byte),
  punct: (byte) => isPrint(byte) && !isSpace(byte) && !isAlpha(byte) && !isDigit(byte),
  space: (byte) => isSpace(byte),
  upper: (byte, caseFold) => isUpper(byte) || (caseFold && isLower(byte)),
  xdigit: (byte) => isDigit(byte) || (byte >= 0x41 && byte <= 0x46) || (byte >= 0x61 && byte <= 0x66),
};

/* One byte of a NUL-terminated string, as the C reads it. */
const at = (bytes: Uint8Array<ArrayBuffer>, index: number): number => (index < bytes.length ? bytes[index]! : 0);

/**
 * One bracket expression (`wildmatch.c`'s `[` case), from the byte after its `[`.
 *
 * @param match - The match.
 * @param start - The index after the `[`.
 * @param textByte - The text's byte, folded when the match folds case.
 * @returns Whether the class matched and the index of its `]`, or `abortAll` for a malformed class.
 */
const matchClass = (
  match: Wildmatch,
  start: number,
  textByte: number,
): Readonly<{ matched: boolean; end: number }> | typeof abortAll => {
  const { pattern, caseFold } = match;
  let index = start;
  let patternByte = at(pattern, index);
  if (patternByte === caret) {
    patternByte = bang;
  }
  const negated = patternByte === bang;
  if (negated) {
    index += 1;
    patternByte = at(pattern, index);
  }
  let previous = 0;
  let matched = false;
  do {
    if (patternByte === 0) {
      return abortAll;
    }
    if (patternByte === backslash) {
      index += 1;
      patternByte = at(pattern, index);
      if (patternByte === 0) {
        return abortAll;
      }
      if (textByte === patternByte) {
        matched = true;
      }
    } else if (
      patternByte === dash &&
      previous !== 0 &&
      at(pattern, index + 1) !== 0 &&
      at(pattern, index + 1) !== closeBracket
    ) {
      index += 1;
      patternByte = at(pattern, index);
      if (patternByte === backslash) {
        index += 1;
        patternByte = at(pattern, index);
        if (patternByte === 0) {
          return abortAll;
        }
      }
      /* A range whose ends are reversed (`[z-a]`) holds nothing, as in Git. */
      if (textByte <= patternByte && textByte >= previous) {
        matched = true;
      } else if (caseFold && isLower(textByte)) {
        const folded = upper(textByte);
        if (folded <= patternByte && folded >= previous) {
          matched = true;
        }
      }
      patternByte = 0;
    } else if (patternByte === openBracket && at(pattern, index + 1) === colon) {
      index += 2;
      const nameStart = index;
      while ((patternByte = at(pattern, index)) !== 0 && patternByte !== closeBracket) {
        index += 1;
      }
      if (patternByte === 0) {
        return abortAll;
      }
      const length = index - nameStart - 1;
      if (length < 0 || at(pattern, index - 1) !== colon) {
        /* No `:]`: the `[` is an ordinary member. */
        index = nameStart - 2;
        patternByte = openBracket;
        if (textByte === patternByte) {
          matched = true;
        }
        previous = patternByte;
        index += 1;
        patternByte = at(pattern, index);
        continue;
      }
      const test = classTests[decoder.decode(pattern.subarray(nameStart, nameStart + length))];
      if (test === undefined) {
        return abortAll;
      }
      if (test(textByte, caseFold)) {
        matched = true;
      }
      patternByte = 0;
    } else if (textByte === patternByte) {
      matched = true;
    }
    previous = patternByte;
    index += 1;
    patternByte = at(pattern, index);
  } while (patternByte !== closeBracket);
  return { matched: matched !== negated && !(match.pathname && textByte === slash), end: index };
};

/**
 * `wildmatch.c`'s `dowild`, over bytes.
 *
 * @param match - The pattern, the text and the flags.
 * @param patternIndex - Where this call's pattern begins: a `**` looks no further back (C's `pattern`).
 * @param textIndex - Where matching resumes in the text.
 * @returns `matchFound`, `noMatch`, `abortAll` or `abortToStarStar`.
 */
// oxlint-disable-next-line complexity -- one port of one C function, kept whole so it reads against its source.
const doWild = (match: Wildmatch, patternIndex: number, textIndex: number): number => {
  const { pattern, text, caseFold } = match;
  const patternStart = patternIndex;
  let p = patternIndex;
  let t = textIndex;
  for (; at(pattern, p) !== 0; t += 1, p += 1) {
    let patternByte = at(pattern, p);
    let textByte = at(text, t);
    if (textByte === 0 && patternByte !== star) {
      return abortAll;
    }
    if (caseFold) {
      textByte = lower(textByte);
      patternByte = lower(patternByte);
    }
    switch (patternByte) {
      case backslash: {
        /* The next byte, literally; a lone trailing `\` compares with the end and fails. */
        p += 1;
        if (textByte !== at(pattern, p)) {
          return noMatch;
        }
        break;
      }
      case question: {
        if (match.pathname && textByte === slash) {
          return noMatch;
        }
        break;
      }
      case star: {
        let matchSlash: boolean;
        p += 1;
        if (at(pattern, p) === star) {
          const before = p - 2;
          while (at(pattern, p + 1) === star) {
            p += 1;
          }
          p += 1;
          const next = at(pattern, p);
          if (
            (before < patternStart || at(pattern, before) === slash) &&
            (next === 0 || next === slash || (next === backslash && at(pattern, p + 1) === slash))
          ) {
            if (next === slash && doWild(match, p + 1, t) === matchFound) {
              return matchFound;
            }
            matchSlash = true;
          } else {
            matchSlash = false;
          }
        } else {
          matchSlash = !match.pathname;
        }
        if (at(pattern, p) === 0) {
          /* A trailing `**` matches everything; a trailing `*` only what has no more slashes. */
          if (!matchSlash && text.includes(slash, t)) {
            return abortToStarStar;
          }
          return matchFound;
        }
        if (!matchSlash && at(pattern, p) === slash) {
          /* One `*` and a slash: the next directory. */
          const found = text.indexOf(slash, t);
          if (found === -1) {
            return abortAll;
          }
          t = found;
          break;
        }
        for (;;) {
          if (textByte === 0) {
            break;
          }
          if (!isGlobSpecial(at(pattern, p))) {
            const wanted = caseFold ? lower(at(pattern, p)) : at(pattern, p);
            // oxlint-disable-next-line no-unmodified-loop-condition -- the C's loop: `matchSlash` is fixed for this star, the text moves.
            while ((textByte = at(text, t)) !== 0 && (matchSlash || textByte !== slash)) {
              if (caseFold) {
                textByte = lower(textByte);
              }
              if (textByte === wanted) {
                break;
              }
              t += 1;
            }
            if (textByte !== wanted) {
              return matchSlash ? abortToStarStar : abortAll;
            }
          }
          const matched = doWild(match, p, t);
          if (matched !== noMatch) {
            if (!matchSlash || matched !== abortToStarStar) {
              return matched;
            }
          } else if (!matchSlash && textByte === slash) {
            return abortToStarStar;
          }
          t += 1;
          textByte = at(text, t);
        }
        return abortAll;
      }
      case openBracket: {
        const result = matchClass(match, p + 1, textByte);
        if (result === abortAll) {
          return abortAll;
        }
        if (!result.matched) {
          return noMatch;
        }
        p = result.end;
        break;
      }
      default: {
        if (textByte !== patternByte) {
          return noMatch;
        }
      }
    }
  }
  return at(text, t) === 0 ? matchFound : noMatch;
};

const wildmatch = (match: Wildmatch): boolean => doWild(match, 0, 0) === matchFound;

/* Whether `right` begins with `left`'s bytes, folding ASCII letters where asked. */
const startsWithBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>, caseFold: boolean): boolean => {
  if (left.length > right.length) {
    return false;
  }
  return left.every((byte, index) => {
    const other = right[index]!;
    return byte === other || (caseFold && lower(byte) === lower(other));
  });
};

/**
 * Whether one rule matches (`dir.c`'s `match_basename` and `match_pathname`).
 *
 * @param rule - The rule.
 * @param relative - The path relative to the rule's directory, as bytes.
 * @param caseFold - Whether `core.ignoreCase` is set.
 * @returns Whether it matches.
 */
const ruleMatches = (rule: IgnoreRule, relative: Uint8Array<ArrayBuffer>, caseFold: boolean): boolean => {
  if (!rule.anchored) {
    const name = relative.subarray(relative.lastIndexOf(slash) + 1);
    return wildmatch({ pattern: rule.pattern, text: name, pathname: false, caseFold });
  }
  /* The literal prefix is compared first and stripped, so a `**` right after it stands at the pattern's start. */
  const { literal, pattern } = rule;
  if (!startsWithBytes(pattern.subarray(0, literal), relative, caseFold)) {
    return false;
  }
  if (literal === pattern.length && literal === relative.length) {
    return true;
  }
  return wildmatch({ pattern: pattern.subarray(literal), text: relative.subarray(literal), pathname: true, caseFold });
};

/* `dir.c`'s `trim_trailing_spaces`: a space a `\` escapes stays, and a lone trailing `\` keeps the line as it is. */
const trimTrailingSpaces = (line: string): string => {
  let lastSpace = -1;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === ' ') {
      if (lastSpace === -1) {
        lastSpace = index;
      }
    } else if (character === '\\') {
      index += 1;
      if (index >= line.length) {
        return line;
      }
      lastSpace = -1;
    } else {
      lastSpace = -1;
    }
  }
  return lastSpace === -1 ? line : line.slice(0, lastSpace);
};

/**
 * One file's ignore lines, compiled (`add_patterns_from_buffer` and `parse_path_pattern`).
 *
 * @param content - The file's text.
 * @returns Its rules, in file order.
 */
export const parseIgnoreRules = (content: string): readonly IgnoreRule[] =>
  content
    .replace(/^﻿/u, '')
    .split('\n')
    .flatMap((raw): IgnoreRule[] => {
      if (raw === '' || raw.startsWith('#')) {
        return [];
      }
      let line = trimTrailingSpaces(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
      const negated = line.startsWith('!');
      if (negated) {
        line = line.slice(1);
      }
      const directoryOnly = line.endsWith('/');
      if (directoryOnly) {
        line = line.slice(0, -1);
      }
      const anchored = line.includes('/');
      if (anchored && line.startsWith('/')) {
        line = line.slice(1);
      }
      if (line === '') {
        return [];
      }
      const pattern = encoder.encode(line);
      const literal = pattern.findIndex((byte) => isGlobSpecial(byte));
      return [{ negated, directoryOnly, anchored, pattern, literal: literal === -1 ? pattern.length : literal }];
    });

/** An entry's kind, without following a symbolic link. */
export type IgnoreEntryKind = 'directory' | 'file' | 'symlink' | 'other';

/** A checkout's files, as much of the provider surface as the ignore rules need. */
export type IgnoreWalkFiles = Readonly<{
  readdir: (path: string) => Promise<readonly string[]>;
  /** The entry's kind (`lstat`), or `undefined` when there is none. */
  kind: (path: string) => Promise<IgnoreEntryKind | undefined>;
  /** A regular file's text, or `undefined` when it cannot be read. */
  readText: (path: string) => Promise<string | undefined>;
}>;

/** What the rules read besides the checkout's files. */
export type IgnoreInputs = Readonly<{
  /** The checkout's tracked paths (its head's files). */
  tracked: ReadonlySet<string>;
  /** The store's `info/exclude`. */
  exclude?: string | undefined;
  /** The repository's own `core.ignoreCase`. */
  ignoreCase?: boolean | undefined;
  /** Names never walked (the store's own directory). */
  skip?: ((path: string) => boolean) | undefined;
}>;

/* A `HEAD` Git accepts (`validate_headref`): a symbolic ref under `refs/`, or an object id. */
const validHead = (text: string): boolean => /^ref:\s*refs\//u.test(text) || /^[\da-f]{40}/iu.test(text);

/* A checkout-relative path, normalised, or `undefined` when it leaves the checkout or is absolute. */
const within = (directory: string, target: string): string | undefined => {
  if (target.startsWith('/') || /^[a-z]:[\\/]/iu.test(target)) {
    return undefined;
  }
  const parts: string[] = directory === '' ? [] : directory.split('/');
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.length === 0) {
        return undefined;
      }
      parts.pop();
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }
  return parts.join('/');
};

/**
 * The rules over one checkout: what the walk and the per-path answer share.
 *
 * @param files - The checkout's files.
 * @param inputs - The tracked paths, the store's `info/exclude`, `core.ignoreCase` and names never walked.
 * @returns The rule reader.
 */
const ignoreReader = (files: IgnoreWalkFiles, inputs: IgnoreInputs) => {
  const caseFold = inputs.ignoreCase === true;
  const fold = (path: string): string => (caseFold ? path.replaceAll(/[A-Z]+/gu, (run) => run.toLowerCase()) : path);
  const tracked = new Set<string>();
  const trackedDirectories = new Set<string>();
  for (const path of inputs.tracked) {
    const folded = fold(path);
    tracked.add(folded);
    for (let at = folded.indexOf('/'); at !== -1; at = folded.indexOf('/', at + 1)) {
      trackedDirectories.add(folded.slice(0, at));
    }
  }
  const excludeSource: IgnoreSource = { base: '', rules: parseIgnoreRules(inputs.exclude ?? '') };
  const verdictOf = (source: IgnoreSource, path: string, directory: boolean): boolean | undefined => {
    if (!path.startsWith(source.base)) {
      return undefined;
    }
    const relative = encoder.encode(path.slice(source.base.length));
    for (let index = source.rules.length - 1; index >= 0; index -= 1) {
      const rule = source.rules[index]!;
      if (!(rule.directoryOnly && !directory) && ruleMatches(rule, relative, caseFold)) {
        return !rule.negated;
      }
    }
    return undefined;
  };
  return {
    isTracked: (path: string): boolean => tracked.has(fold(path)),
    holdsTracked: (directory: string): boolean => trackedDirectories.has(fold(directory)),
    isGitName: (name: string): boolean => fold(name) === '.git',
    skipped: (path: string): boolean => inputs.skip?.(path) === true,
    /* Deepest source first, `info/exclude` last: the first that speaks decides. */
    isExcluded: (sources: readonly IgnoreSource[], path: string, directory: boolean): boolean => {
      for (let index = sources.length - 1; index >= 0; index -= 1) {
        const verdict = verdictOf(sources[index]!, path, directory);
        if (verdict !== undefined) {
          return verdict;
        }
      }
      return verdictOf(excludeSource, path, directory) === true;
    },
    /* A directory's own `.gitignore`, never through a symbolic link (Git opens it with `O_NOFOLLOW`). */
    sourceOf: async (directory: string): Promise<IgnoreSource | undefined> => {
      const prefix = directory === '' ? '' : `${directory}/`;
      if ((await files.kind(`${prefix}.gitignore`)) !== 'file') {
        return undefined;
      }
      const text = await files.readText(`${prefix}.gitignore`);
      return text === undefined ? undefined : { base: prefix, rules: parseIgnoreRules(text) };
    },
    /* `is_nonbare_repository_dir`: a `.git` directory Git accepts, or a gitfile naming one. */
    isRepository: async (directory: string): Promise<boolean> => {
      const isGitDirectory = async (gitDirectory: string): Promise<boolean> => {
        const head = await files.readText(`${gitDirectory}/HEAD`);
        if (head === undefined || !validHead(head)) {
          return false;
        }
        const common = await files.readText(`${gitDirectory}/commondir`);
        const commonDirectory = common === undefined ? gitDirectory : within(gitDirectory, common.trim());
        if (commonDirectory === undefined) {
          return false;
        }
        const [objects, references] = await Promise.all([
          files.kind(`${commonDirectory}/objects`),
          files.kind(`${commonDirectory}/refs`),
        ]);
        return objects === 'directory' && references === 'directory';
      };
      const dotGit = `${directory}/.git`;
      const kind = await files.kind(dotGit);
      if (kind === 'directory') {
        return isGitDirectory(dotGit);
      }
      if (kind !== 'file') {
        return false;
      }
      const text = await files.readText(dotGit);
      if (text === undefined) {
        /* Git counts a gitfile it cannot read as a repository. */
        return true;
      }
      if (!text.startsWith('gitdir: ')) {
        return false;
      }
      /* A gitfile naming a path outside the checkout cannot be checked here: Git would walk it if it is gone. */
      const target = within(directory, text.slice('gitdir: '.length).replace(/[\r\n]+$/u, ''));
      return target !== undefined && isGitDirectory(target);
    },
  };
};

/**
 * The untracked paths a checkout's own Git rules ignore, listed as
 * `git ls-files --others --ignored --exclude-standard --directory` lists
 * them: an ignored directory that holds no tracked file once, with its
 * trailing `/`, and every other ignored path by itself.
 *
 * @param files - The checkout's files.
 * @param inputs - The tracked paths, the store's `info/exclude`, `core.ignoreCase` and names never walked.
 * @returns Paths relative to the checkout root, sorted.
 */
export const ignoredUntrackedPaths = async (
  files: IgnoreWalkFiles,
  inputs: IgnoreInputs,
): Promise<readonly string[]> => {
  const reader = ignoreReader(files, inputs);
  const ignored: string[] = [];
  const walk = async (directory: string, sources: readonly IgnoreSource[], excluded: boolean): Promise<void> => {
    const prefix = directory === '' ? '' : `${directory}/`;
    /* An untracked repository inside the checkout is one entry to Git, which never looks inside it. */
    if (directory !== '' && !reader.holdsTracked(directory) && (await reader.isRepository(directory))) {
      return;
    }
    const own = excluded ? undefined : await reader.sourceOf(directory);
    const here = own === undefined ? sources : [...sources, own];
    const names = [...(await files.readdir(directory))].toSorted();
    for (const name of names) {
      const path = `${prefix}${name}`;
      if (reader.isGitName(name) || reader.skipped(path) || reader.isTracked(path)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one entry at a time keeps the walk's order Git's.
      const isDirectory = (await files.kind(path)) === 'directory';
      const ignoredHere = excluded || reader.isExcluded(here, path, isDirectory);
      if (!isDirectory) {
        if (ignoredHere) {
          ignored.push(path);
        }
        continue;
      }
      if (ignoredHere && !reader.holdsTracked(path)) {
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

/** What the rules say of one directory on the way down to a path. */
type DirectoryState = Readonly<
  | { kind: 'open'; sources: readonly IgnoreSource[]; excluded: boolean }
  /* Git lists this directory whole, or never looks inside it. */
  | { kind: 'listed'; entry: string }
  | { kind: 'hidden' }
>;

/**
 * The same answer as {@link ignoredUntrackedPaths}, for the named paths only:
 * each one Git would leave out, or the ignored directory above it that Git
 * would list instead. Only the named paths' own directories are read, so a
 * capture that names what changed costs what changed.
 *
 * @param files - The checkout's files.
 * @param inputs - As for {@link ignoredUntrackedPaths}.
 * @param paths - Checkout-relative paths; one that does not exist is left out.
 * @returns The entries that cover the ignored ones, sorted.
 */
export const ignoredAmong = async (
  files: IgnoreWalkFiles,
  inputs: IgnoreInputs,
  paths: readonly string[],
): Promise<readonly string[]> => {
  const reader = ignoreReader(files, inputs);
  const states = new Map<string, Promise<DirectoryState>>();
  const stateOf = async (directory: string): Promise<DirectoryState> => {
    const held = states.get(directory);
    if (held !== undefined) {
      return held;
    }
    const computed = (async (): Promise<DirectoryState> => {
      if (directory === '') {
        const own = await reader.sourceOf('');
        return { kind: 'open', sources: own === undefined ? [] : [own], excluded: false };
      }
      const parentPath = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : '';
      const parent = await stateOf(parentPath);
      const name = directory.slice(directory.lastIndexOf('/') + 1);
      if (parent.kind !== 'open' || reader.isGitName(name) || reader.skipped(directory)) {
        return parent.kind === 'listed' ? parent : { kind: 'hidden' };
      }
      if ((await files.kind(directory)) !== 'directory') {
        return { kind: 'hidden' };
      }
      const tracked = reader.holdsTracked(directory);
      const excluded = parent.excluded || reader.isExcluded(parent.sources, directory, true);
      if (excluded && !tracked) {
        return { kind: 'listed', entry: `${directory}/` };
      }
      if (!tracked && (await reader.isRepository(directory))) {
        return { kind: 'hidden' };
      }
      const own = excluded ? undefined : await reader.sourceOf(directory);
      return { kind: 'open', sources: own === undefined ? parent.sources : [...parent.sources, own], excluded };
    })();
    states.set(directory, computed);
    return computed;
  };
  const entries = new Set<string>();
  for (const path of new Set(paths)) {
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    // oxlint-disable-next-line no-await-in-loop -- directories are shared, so each is read once, in order.
    const parent = await stateOf(parentPath);
    if (parent.kind === 'listed') {
      entries.add(parent.entry);
      continue;
    }
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (parent.kind === 'hidden' || reader.isGitName(name) || reader.skipped(path) || reader.isTracked(path)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    const kind = await files.kind(path);
    if (kind === undefined) {
      continue;
    }
    if (kind === 'directory') {
      // oxlint-disable-next-line no-await-in-loop -- see above.
      const state = await stateOf(path);
      if (state.kind === 'listed') {
        entries.add(state.entry);
      }
      continue;
    }
    if (parent.excluded || reader.isExcluded(parent.sources, path, false)) {
      entries.add(path);
    }
  }
  return [...entries].toSorted();
};

/**
 * Whether a listing of ignored paths covers one path: the path itself, or an
 * ignored directory above it, which Git names once with its trailing `/`.
 *
 * @public
 * @param listing - The listing.
 * @param path - Checkout-relative, without a trailing `/`.
 * @returns Whether the listing leaves the path out.
 */
export const coveredByIgnoreListing = (listing: ReadonlySet<string>, path: string): boolean => {
  if (listing.size === 0) {
    return false;
  }
  if (listing.has(path) || listing.has(`${path}/`)) {
    return true;
  }
  for (let at = path.indexOf('/'); at !== -1; at = path.indexOf('/', at + 1)) {
    if (listing.has(path.slice(0, at + 1))) {
      return true;
    }
  }
  return false;
};
