// @vitest-environment node
/*
 * The app state ownership ratchet (app state orchestration charter I1, I15; plan § 4 A0.6). The React event-layer
 * counter is lexical and misses actor ownership and time, so this test counts them per file in two scan sets held in
 * app-state-ownership.ratchet.json:
 *
 * - `components`: the scoped files and every `.tsx` or `use-*.ts` file a lane creates or moves scoped code into.
 *   Counted: `useActorRef`, `createActor` and `.start()` calls, `storeMounts` references, `queueMicrotask`,
 *   `setTimeout`, `setInterval` and `requestAnimationFrame` calls, `useFlushOnClose` registrations and `waitFor`
 *   calls with a timeout.
 * - `modules`: the non-React modules the programme creates and every other file under `runtime/`. Only the timers
 *   are counted; a runtime root may create and start its children.
 *
 * `counts` holds one line per file and pattern above zero. A measured count above or below its line fails, so a lane
 * that removes a site lowers its line (and deletes it at 0) in the same PR. A listed file that does not exist fails,
 * and so does a non-test file under `apps/ui/app/runtime/` that is in neither set. Test files are never scanned.
 * Lanes edit the manifest, never this test.
 *
 * End state (A10): one line, `.start()` at 1 in `apps/ui/app/runtime/app-runtime-provider.tsx`, in `components`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const timerPatterns = ['queueMicrotask', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'waitFor timeout'];
const componentPatterns = [
  'useActorRef',
  'createActor',
  '.start()',
  'storeMounts',
  'queueMicrotask',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'useFlushOnClose',
  'waitFor timeout',
];
const scanSets = { components: componentPatterns, modules: timerPatterns } as const;
type ScanSet = keyof typeof scanSets;

type OwnershipManifest = Readonly<{
  components: Readonly<{ files: readonly string[] }>;
  modules: Readonly<{ files: readonly string[] }>;
  counts: Readonly<Record<string, number>>;
}>;

const testFilePattern = /\.(?:test|spec)(?:-d)?\./u;
const sourceFilePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

function calleeName(node: ts.CallExpression): string | undefined {
  const callee = ts.isNonNullExpression(node.expression) ? node.expression.expression : node.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

/** A `waitFor(actor, predicate, options)` call whose options may set a timeout. */
function isWaitForWithTimeout(node: ts.CallExpression): boolean {
  const options = node.arguments[2];
  if (calleeName(node) !== 'waitFor' || options === undefined) {
    return false;
  }
  if (!ts.isObjectLiteralExpression(options)) {
    return true;
  }
  return options.properties.some(
    (property) =>
      ts.isSpreadAssignment(property) || (ts.isIdentifier(property.name) && property.name.text === 'timeout'),
  );
}

/** The pattern a node is counted under, if any. */
function patternOf(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.text === 'storeMounts' ? 'storeMounts' : undefined;
  }
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  if (isWaitForWithTimeout(node)) {
    return 'waitFor timeout';
  }
  const name = calleeName(node);
  if (name === 'start') {
    return ts.isPropertyAccessExpression(node.expression) && node.arguments.length === 0 ? '.start()' : undefined;
  }
  return name !== undefined && componentPatterns.includes(name) ? name : undefined;
}

/**
 * Counts each pattern in one module. Comments, imports and type positions are not calls, so they are not counted.
 * @param fileName - Chooses TSX parsing for `.tsx` files.
 * @param sourceText - The module's source.
 * @param patterns - The patterns its scan set counts.
 * @returns The non-zero counts by pattern.
 */
function countOwnershipPatterns(
  fileName: string,
  sourceText: string,
  patterns: readonly string[],
): Record<string, number> {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const counts: Record<string, number> = {};
  const visit = (node: ts.Node): void => {
    const pattern = patternOf(node);
    if (pattern !== undefined && patterns.includes(pattern)) {
      counts[pattern] = (counts[pattern] ?? 0) + 1;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return counts;
}

function countKey(path: string, pattern: string): string {
  return `${path}#${pattern}`;
}

function sortedUniqueProblems(name: string, values: readonly string[]): string[] {
  return values.flatMap((value, index) => {
    const previous = values[index - 1];
    return previous !== undefined && previous >= value
      ? [`${name}: ${value} must be listed once, in sorted order`]
      : [];
  });
}

/** Count lines (`<path>#<pattern>`) the manifest names more than once; `JSON.parse` keeps only the last. */
function duplicateKeys(manifestText: string): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const match of manifestText.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/gu)) {
    const key = match[1] ?? '';
    if (!key.includes('#')) {
      continue;
    }
    if (seen.has(key)) {
      problems.push(`counts: ${key} is listed more than once`);
    }
    seen.add(key);
  }
  return problems;
}

/** The problems with one `counts` line: an unknown file or pattern, a malformed count, or a count off its line. */
function countLineProblems(
  [key, line]: readonly [string, number],
  setOf: ReadonlyMap<string, ScanSet>,
  measured: ReadonlyMap<string, number>,
): string[] {
  const separator = key.lastIndexOf('#');
  const set = separator === -1 ? undefined : setOf.get(key.slice(0, separator));
  if (set === undefined) {
    return [`counts: ${key} names a file in neither set`];
  }
  if (!scanSets[set].includes(key.slice(separator + 1))) {
    return [`counts: ${key} is not a pattern ${set} counts (${scanSets[set].join(', ')})`];
  }
  if (!Number.isInteger(line) || line < 1) {
    return [`counts: ${key} must be a positive integer; delete the line at 0`];
  }
  const count = measured.get(key) ?? 0;
  if (count > line) {
    return [`${key}: measures ${count}, above its line of ${line}; move the work into an actor or \`after\``];
  }
  return count < line ? [`${key}: measures ${count}, below its line of ${line}; lower the line (delete it at 0)`] : [];
}

/**
 * Checks the manifest against the measured files.
 * @param input - The manifest, its raw text, a reader that returns a workspace-relative file's source (undefined when
 *   it does not exist) and the workspace-relative non-test source files under `apps/ui/app/runtime/`.
 * @returns One message per problem; empty when the ratchet holds.
 */
function ownershipRatchetProblems(input: {
  readonly manifest: OwnershipManifest;
  readonly manifestText: string;
  readonly readSource: (path: string) => string | undefined;
  readonly runtimeFiles: readonly string[];
}): string[] {
  const { manifest, manifestText, readSource, runtimeFiles } = input;
  const problems: string[] = [...duplicateKeys(manifestText)];
  const setOf = new Map<string, ScanSet>();
  for (const set of ['components', 'modules'] as const) {
    const { files } = manifest[set];
    problems.push(...sortedUniqueProblems(`${set}.files`, files));
    for (const path of files) {
      if (setOf.has(path)) {
        problems.push(`${path}: listed in both components and modules; a file is in one set`);
      }
      setOf.set(path, set);
      if (testFilePattern.test(path)) {
        problems.push(`${path}: a test file is never scanned; remove it from ${set}.files`);
      }
    }
  }
  problems.push(...sortedUniqueProblems('counts', Object.keys(manifest.counts)));

  const measured = new Map<string, number>();
  for (const [path, set] of setOf) {
    const source = readSource(path);
    if (source === undefined) {
      problems.push(`${path}: listed in ${set}.files but does not exist; remove it, or carry it to the moved path`);
      continue;
    }
    for (const [pattern, count] of Object.entries(countOwnershipPatterns(path, source, scanSets[set]))) {
      measured.set(countKey(path, pattern), count);
    }
  }

  for (const entry of Object.entries(manifest.counts)) {
    problems.push(...countLineProblems(entry, setOf, measured));
  }
  for (const [key, count] of measured) {
    if (!Object.hasOwn(manifest.counts, key)) {
      problems.push(`${key}: measures ${count} with no line in counts, so its line is 0`);
    }
  }

  for (const path of runtimeFiles) {
    if (!setOf.has(path)) {
      problems.push(
        `${path}: under runtime/ but in neither set; add it to components (a .tsx or use-*.ts file) or modules`,
      );
    }
  }
  return problems;
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function findWorkspaceRoot(start: string): string {
  for (let directory = start; ; directory = dirname(directory)) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) {
      return directory;
    }
    if (dirname(directory) === directory) {
      throw new Error(`No pnpm-workspace.yaml above ${start}`);
    }
  }
}

function runtimeSourceFiles(directory: string, workspaceRoot: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && sourceFilePattern.test(entry.name) && !testFilePattern.test(entry.name))
    .map((entry) => toPosix(relative(workspaceRoot, join(entry.parentPath, entry.name))))
    .sort();
}

const fixtureManifest = (counts: Record<string, number>, overrides: Partial<OwnershipManifest> = {}) => {
  const manifest: OwnershipManifest = {
    components: { files: ['app/host.tsx'] },
    modules: { files: ['app/runtime/root.ts'] },
    counts,
    ...overrides,
  };
  return { manifest, manifestText: JSON.stringify(manifest) };
};

const fixtureSources: Record<string, string> = {
  'app/host.tsx': `import { useActorRef } from '@xstate/react';
// useActorRef and setTimeout in a comment are not counted
const storeMounts = new WeakMap();
function Host() {
  const ref = useActorRef(machine);
  const actor = createActor(machine).start();
  storeMounts.set(store, 1);
  globalThis.setTimeout(run, 10);
  useFlushOnClose(flush, { stage: 'producer' });
  void waitFor(ref, ready, { timeout: 10 });
  void waitFor(ref, ready);
  port.start(options);
  let timer: ReturnType<typeof setTimeout>;
}
`,
  'app/runtime/root.ts': `const child = createActor(machine).start();
queueMicrotask(flush);
requestAnimationFrame(draw);
void waitFor(child, ready, options);
`,
};

const readFixture = (path: string): string | undefined => fixtureSources[path];

describe('countOwnershipPatterns', () => {
  it('should count calls, references and timed waits, and nothing in comments, imports or types', () => {
    expect(countOwnershipPatterns('app/host.tsx', fixtureSources['app/host.tsx'] ?? '', componentPatterns)).toEqual({
      '.start()': 1,
      createActor: 1,
      setTimeout: 1,
      storeMounts: 2,
      useActorRef: 1,
      useFlushOnClose: 1,
      'waitFor timeout': 1,
    });
  });

  it('should count only the timers in a module', () => {
    expect(
      countOwnershipPatterns('app/runtime/root.ts', fixtureSources['app/runtime/root.ts'] ?? '', timerPatterns),
    ).toEqual({ queueMicrotask: 1, requestAnimationFrame: 1, 'waitFor timeout': 1 });
  });
});

describe('ownershipRatchetProblems', () => {
  const exact = {
    'app/host.tsx#.start()': 1,
    'app/host.tsx#createActor': 1,
    'app/host.tsx#setTimeout': 1,
    'app/host.tsx#storeMounts': 2,
    'app/host.tsx#useActorRef': 1,
    'app/host.tsx#useFlushOnClose': 1,
    'app/host.tsx#waitFor timeout': 1,
    'app/runtime/root.ts#queueMicrotask': 1,
    'app/runtime/root.ts#requestAnimationFrame': 1,
    'app/runtime/root.ts#waitFor timeout': 1,
  };
  const check = (fixture: ReturnType<typeof fixtureManifest>, runtimeFiles = ['app/runtime/root.ts']): string[] =>
    ownershipRatchetProblems({ ...fixture, readSource: readFixture, runtimeFiles });

  it('should pass when every line equals its measured count', () => {
    expect(check(fixtureManifest(exact))).toEqual([]);
  });

  it('should fail a count above its line, and a measured count with no line', () => {
    const withoutLine = Object.fromEntries(Object.entries(exact).filter(([key]) => key !== 'app/host.tsx#useActorRef'));
    expect(check(fixtureManifest({ ...withoutLine, 'app/host.tsx#storeMounts': 1 }))).toEqual([
      'app/host.tsx#storeMounts: measures 2, above its line of 1; move the work into an actor or `after`',
      'app/host.tsx#useActorRef: measures 1 with no line in counts, so its line is 0',
    ]);
  });

  it('should fail a count below its line', () => {
    expect(check(fixtureManifest({ ...exact, 'app/host.tsx#setTimeout': 3 }))).toEqual([
      'app/host.tsx#setTimeout: measures 1, below its line of 3; lower the line (delete it at 0)',
    ]);
  });

  it('should fail a listed file that does not exist', () => {
    const fixture = fixtureManifest(exact, { components: { files: ['app/gone.tsx', 'app/host.tsx'] } });
    expect(check(fixture)).toEqual([
      'app/gone.tsx: listed in components.files but does not exist; remove it, or carry it to the moved path',
    ]);
  });

  it('should fail a non-test file under runtime/ that is in neither set', () => {
    expect(check(fixtureManifest(exact), ['app/runtime/root.ts', 'app/runtime/stray.ts'])).toEqual([
      'app/runtime/stray.ts: under runtime/ but in neither set; add it to components (a .tsx or use-*.ts file) or modules',
    ]);
  });

  it('should not count component patterns in a module, nor accept a line for one', () => {
    const counts = Object.fromEntries(
      Object.entries({ ...exact, 'app/runtime/root.ts#createActor': 1 }).sort(([left], [right]) =>
        left < right ? -1 : 1,
      ),
    );
    expect(check(fixtureManifest(counts))).toEqual([
      'counts: app/runtime/root.ts#createActor is not a pattern modules counts (queueMicrotask, setTimeout, setInterval, requestAnimationFrame, waitFor timeout)',
    ]);
  });

  it('should reject malformed manifests', () => {
    const fixture = fixtureManifest(
      { ...exact, 'app/other.tsx#setTimeout': 1, 'app/host.tsx#setInterval': 0 },
      {
        components: { files: ['app/host.tsx', 'app/host.test.tsx', 'app/runtime/root.ts'] },
      },
    );
    expect(check(fixture)).toEqual([
      'components.files: app/host.test.tsx must be listed once, in sorted order',
      'app/host.test.tsx: a test file is never scanned; remove it from components.files',
      'app/runtime/root.ts: listed in both components and modules; a file is in one set',
      'counts: app/other.tsx#setTimeout must be listed once, in sorted order',
      'counts: app/host.tsx#setInterval must be listed once, in sorted order',
      'app/host.test.tsx: listed in components.files but does not exist; remove it, or carry it to the moved path',
      'counts: app/other.tsx#setTimeout names a file in neither set',
      'counts: app/host.tsx#setInterval must be a positive integer; delete the line at 0',
    ]);
    expect(duplicateKeys('{ "counts": { "a#setTimeout": 1, "a#setTimeout": 2 } }')).toEqual([
      'counts: a#setTimeout is listed more than once',
    ]);
  });
});

describe('app state ownership ratchet', () => {
  it('should hold every scanned file at exactly its committed counts', () => {
    const manifestPath = fileURLToPath(new URL('app-state-ownership.ratchet.json', import.meta.url));
    const workspaceRoot = findWorkspaceRoot(dirname(manifestPath));
    const manifestText = readFileSync(manifestPath, 'utf8');
    const problems = ownershipRatchetProblems({
      manifest: JSON.parse(manifestText) as OwnershipManifest,
      manifestText,
      readSource: (path) => {
        const absolute = join(workspaceRoot, path);
        return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
      },
      runtimeFiles: runtimeSourceFiles(fileURLToPath(new URL('runtime/', import.meta.url)), workspaceRoot),
    });
    expect(problems, problems.join('\n')).toEqual([]);
  }, 60_000);
});
