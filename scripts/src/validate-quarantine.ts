/**
 * Validate every project's `quarantine.json` (testing policy § 16.3 and § 16.4).
 *
 * Each tracked `quarantine.json` must sit at an Nx project root (beside its `project.json`), and each entry must
 * meet the schema, the age and renewal bounds and the never-quarantine set of `@taucad/vitest-ci/quarantine`, the
 * same rules the reporter's verdict applies. On top of those, this check needs the repository: the entry's file is a
 * tracked file of the project, its suites and title are string literals of that file (the title the first argument of
 * an `it` or `test` call, so an entry never names a suite), a project holds at most 8 entries and the workspace at
 * most 20. An expired entry fails here: the test gates again and the entry must go. A test whose name is built at run
 * time from something other than a literal template cannot be resolved and cannot be quarantined.
 *
 * Usage: pnpm nx run scripts:validate-quarantine
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  parseQuarantine,
  quarantineBounds,
  quarantineFileName,
  readQuarantine,
  splitTest,
  testSeparator,
  utcDay,
} from '@taucad/vitest-ci/quarantine';

/** One project's quarantine file, as the validator reads it. */
export type QuarantineSource = {
  /** Workspace-relative path of the `quarantine.json`. */
  path: string;
  /** The Nx project at that directory, or `undefined` when the directory is not a project root. */
  project: { name: string; root: string; tags: readonly string[] } | undefined;
  /** The file's text. */
  text: string;
};

/** A string literal of a test file: its text, or a pattern when it has placeholders, and whether it titles a test. */
type Literal = { text: string; pattern: RegExp | undefined; title: boolean };

const escapeRegExp = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

const unescapeLiteral = (body: string): string =>
  body.replaceAll(/\\(u{[\dA-Fa-f]+}|u[\dA-Fa-f]{4}|x[\dA-Fa-f]{2}|.)/gs, (_match, escape: string) => {
    if (escape.startsWith('u{')) {
      return String.fromCodePoint(Number.parseInt(escape.slice(2, -1), 16));
    }
    if (escape.startsWith('u') || escape.startsWith('x')) {
      return String.fromCodePoint(Number.parseInt(escape.slice(1), 16));
    }
    return escape === 'n' ? '\n' : escape === 't' ? '\t' : escape;
  });

/** Placeholders Vitest fills in a test name: template expressions, `each` formats and `$name` fields. */
const placeholderPattern = /\${[^}]*}|%[#$%cdfijos]|\$[A-Z_a-z][\w.]*/g;

/**
 * A test is titled by the first argument of `it(…)`, `test.concurrent(…)`, `it.each([…])(…)` or `it.runIf(…)(…)`; the
 * modifier's own arguments may nest one level of parentheses.
 */
const titleCallPattern = /\b(?:it|test|bench)(?:\.\w+)*(?:\((?:[^()]|\([^()]*\))*\))?\s*\(\s*$/;

/** Index just past a quoted string or template that opens at `start`; template expressions are skipped whole. */
const skipString = (source: string, start: number): number => {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    if (source[index] === '\\') {
      index += 2;
    } else if (quote === '`' && source.startsWith('${', index)) {
      index = skipExpression(source, index + 2);
    } else {
      index += 1;
    }
  }
  return index + 1;
};

/** Index just past the `}` that closes a template expression whose body starts at `start`. */
const skipExpression = (source: string, start: number): number => {
  let depth = 1;
  let index = start;
  while (index < source.length && depth > 0) {
    const character = source[index];
    if (character === "'" || character === '"' || character === '`') {
      index = skipString(source, index);
      continue;
    }
    depth += character === '{' ? 1 : character === '}' ? -1 : 0;
    index += 1;
  }
  return index;
};

/**
 * The string literals of a test file, outside comments, each with whether it is a test's title.
 *
 * @param source - The file's text.
 * @returns Every single-quoted, double-quoted and template literal.
 */
export const testLiterals = (source: string): Literal[] => {
  const literals: Literal[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? source.length : newline;
    } else if (source.startsWith('/*', index)) {
      const close = source.indexOf('*/', index + 2);
      index = close === -1 ? source.length : close + 2;
    } else if (character === "'" || character === '"' || character === '`') {
      const end = skipString(source, index);
      const text = unescapeLiteral(source.slice(index + 1, end - 1));
      const placeholders = character === '`' || /%[#$cdfijos]|\$[A-Z_a-z]/.test(text);
      const parts = text.split(placeholderPattern);
      literals.push({
        text,
        pattern:
          placeholders && parts.length > 1
            ? new RegExp(`^${parts.map((part) => escapeRegExp(part)).join('.*')}$`, 's')
            : undefined,
        title: titleCallPattern.test(source.slice(Math.max(0, index - 200), index)),
      });
      index = end;
    } else {
      index += 1;
    }
  }
  return literals;
};

const literalMatches = (literal: Literal, segment: string): boolean =>
  literal.text === segment || (literal.pattern?.test(segment) ?? false);

/**
 * Whether a full test name (`suite > … > title`) is made of the file's literals, its last part a test's title.
 *
 * @param literals - The file's literals.
 * @param name - The entry's full name.
 * @returns `true` when the name resolves.
 */
export const resolvesTest = (literals: readonly Literal[], name: string): boolean => {
  const segments = name.split(testSeparator);
  // Entry i is true when the first i segments split into literal parts.
  const reachable = Array.from({ length: segments.length + 1 }, (_, index) => index === 0);
  for (let end = 1; end <= segments.length; end += 1) {
    for (let start = 0; start < end && !reachable[end]; start += 1) {
      if (!reachable[start]) {
        continue;
      }
      const chunk = segments.slice(start, end).join(testSeparator);
      const isTitle = end === segments.length;
      reachable[end] = literals.some((literal) => (!isTitle || literal.title) && literalMatches(literal, chunk));
    }
  }
  return reachable[segments.length] === true;
};

/**
 * Every problem with the workspace's quarantine files.
 *
 * @param sources - Each tracked `quarantine.json` with its project.
 * @param readTracked - Reads a tracked workspace-relative file, or returns `undefined` when it is not tracked.
 * @param today - `YYYY-MM-DD` (UTC).
 * @returns One line per problem, each naming its file.
 */
export const quarantineProblems = (
  sources: readonly QuarantineSource[],
  readTracked: (path: string) => string | undefined,
  today: string,
): string[] => {
  const problems: string[] = [];
  let total = 0;
  for (const source of sources) {
    const { project } = source;
    if (project === undefined) {
      problems.push(`${source.path}: a quarantine.json sits at the root of the Nx project that owns the test`);
      continue;
    }
    const raw = parseQuarantine(source.text).entries;
    total += raw.length;
    if (raw.length > quarantineBounds.projectEntries) {
      problems.push(
        `${source.path}: ${raw.length} entries; a project holds at most ${quarantineBounds.projectEntries} (no new quarantine: fix one first)`,
      );
    }
    const { entries, problems: entryProblems } = readQuarantine(
      source.text,
      { projectRoot: project.root, tags: project.tags },
      today,
    );
    problems.push(...entryProblems.map((problem) => `${source.path}: ${problem}`));
    for (const entry of entries) {
      // A valid entry has a file and a name.
      const { file, name } = splitTest(entry.test) ?? { file: '', name: '' };
      const path = project.root === '' ? file : `${project.root}/${file}`;
      const text = readTracked(path);
      if (text === undefined) {
        problems.push(`${source.path}: "${entry.test}": ${path} is not a tracked file of ${project.name}`);
      } else if (!resolvesTest(testLiterals(text), name)) {
        problems.push(
          `${source.path}: "${entry.test}" resolves to no test in ${path}: each suite and the title must be literals of the file, the title an it or test call's`,
        );
      }
    }
  }
  if (total > quarantineBounds.workspaceEntries) {
    problems.push(
      `the workspace holds ${total} quarantine entries; at most ${quarantineBounds.workspaceEntries} (the debt is full: no new quarantine)`,
    );
  }
  return problems;
};

type ProjectJson = { name?: string; tags?: string[] };

const main = (): number => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
      .split('\0')
      .filter((path) => path !== ''),
  );
  const sources = [...tracked]
    .filter((path) => path === quarantineFileName || path.endsWith(`/${quarantineFileName}`))
    .map((path): QuarantineSource => {
      const directory = dirname(path) === '.' ? '' : dirname(path);
      const projectJson = join(root, directory, 'project.json');
      const parsed = existsSync(projectJson)
        ? (JSON.parse(readFileSync(projectJson, 'utf8')) as ProjectJson)
        : undefined;
      return {
        path,
        project:
          parsed === undefined
            ? undefined
            : { name: parsed.name ?? directory, root: directory, tags: parsed.tags ?? [] },
        text: readFileSync(join(root, path), 'utf8'),
      };
    });
  const problems = quarantineProblems(
    sources,
    (path) => (tracked.has(path) ? readFileSync(join(root, path), 'utf8') : undefined),
    utcDay(),
  );
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    return 1;
  }
  const count = sources.reduce((sum, source) => sum + parseQuarantine(source.text).entries.length, 0);
  console.log(
    `${count} quarantine entries in ${sources.length} projects; at most ${quarantineBounds.workspaceEntries} in the workspace and ${quarantineBounds.projectEntries} per project.`,
  );
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
