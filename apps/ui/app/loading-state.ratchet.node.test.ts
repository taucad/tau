// @vitest-environment node
/*
 * The loading state ratchet (loading states UX blueprint, lane A15a; UI Policy § 5). A loading region keeps its own
 * node at its final geometry and shows real content, its bare frame, or `WaitIndicator`; it never draws a skeleton.
 * This test holds today's skeleton sites per file in loading-state.ratchet.json, and they only go down.
 *
 * A site is one of:
 * - a JSX element whose tag is `Skeleton`, ends in `Skeleton` (`SidebarRowSkeleton`, `WorkspaceSkeleton`) or is one
 *   of the named skeleton components (`SettingsRowsLoading`);
 * - the declaration of such a component (`function ChatTextareaSkeleton`, `const Foo = () => …`), so a file that
 *   only defines one still has a line.
 *
 * Types, imports, comments and strings are not sites. Test files and stories are never scanned.
 *
 * `counts` holds one line per file above zero. A measured count above or below its line fails, so a lane that removes
 * a site lowers its line (and deletes it at 0) in the same PR, and a file with no line must measure 0: a new skeleton
 * fails here. A listed file that does not exist fails, so a moved file carries its line.
 *
 * `loadPath` names the Home and editor files the blueprint's lanes (A13, A15b to A15g) bring to zero. Its row is an
 * expected failure (C1) until the last of them lands; the lane that brings the set to zero flips it.
 *
 * Lanes edit the manifest, never this test.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type LoadingStateManifest = Readonly<{
  roots: readonly string[];
  loadPath: readonly string[];
  counts: Readonly<Record<string, number>>;
}>;

/** Skeleton components whose names do not end in `Skeleton`. */
const namedSkeletons = new Set(['SettingsRowsLoading']);
const skeletonNamePattern = /^[A-Z]\w*Skeleton$|^Skeleton$/u;

const excludedFilePattern = /\.(?:test|spec|stories)(?:-d)?\.|\.d\.ts$/u;
const sourceFilePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

const isSkeletonName = (name: string): boolean => skeletonNamePattern.test(name) || namedSkeletons.has(name);

/** The rightmost name of a JSX tag: `Skeleton` for `<Skeleton>`, `MenuSkeleton` for `<Sidebar.MenuSkeleton>`. */
function tagName(tag: ts.JsxTagNameExpression): string | undefined {
  if (ts.isIdentifier(tag)) {
    return tag.text;
  }
  return ts.isPropertyAccessExpression(tag) ? tag.name.text : undefined;
}

/** The component a declaration introduces: a function, a class, or a variable initialised with a function or call. */
function declaredName(node: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name !== undefined) {
    return node.name.text;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
    return node.name.text;
  }
  return undefined;
}

/**
 * Counts the skeleton sites in one module.
 * @param fileName - Chooses TSX parsing for `.tsx` files.
 * @param sourceText - The module's source.
 * @returns The number of skeleton elements and skeleton component declarations.
 */
function countSkeletonSites(fileName: string, sourceText: string): number {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let count = 0;
  const visit = (node: ts.Node): void => {
    const name =
      ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? tagName(node.tagName) : declaredName(node);
    if (name !== undefined && isSkeletonName(name)) {
      count += 1;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return count;
}

function sortedUniqueProblems(name: string, values: readonly string[]): string[] {
  return values.flatMap((value, index) => {
    const previous = values[index - 1];
    return previous !== undefined && previous >= value
      ? [`${name}: ${value} must be listed once, in sorted order`]
      : [];
  });
}

/** File lines the manifest names more than once; `JSON.parse` keeps only the last. */
function duplicateKeys(manifestText: string): string[] {
  const counts = manifestText.slice(manifestText.indexOf('"counts"'));
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const match of counts.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/gu)) {
    const key = match[1] ?? '';
    if (key === 'counts') {
      continue;
    }
    if (seen.has(key)) {
      problems.push(`counts: ${key} is listed more than once`);
    }
    seen.add(key);
  }
  return problems;
}

/**
 * Checks the manifest against the measured files.
 * @param input - The manifest, its raw text, a reader that returns a workspace-relative file's source (undefined when
 *   it does not exist) and the workspace-relative source files under the manifest's roots.
 * @returns One message per problem; empty when the ratchet holds.
 */
function loadingStateRatchetProblems(input: {
  readonly manifest: LoadingStateManifest;
  readonly manifestText: string;
  readonly readSource: (path: string) => string | undefined;
  readonly scannedFiles: readonly string[];
}): string[] {
  const { manifest, manifestText, readSource, scannedFiles } = input;
  const problems: string[] = [
    ...duplicateKeys(manifestText),
    ...sortedUniqueProblems('roots', manifest.roots),
    ...sortedUniqueProblems('loadPath', manifest.loadPath),
    ...sortedUniqueProblems('counts', Object.keys(manifest.counts)),
  ];

  const isScanned = (path: string): boolean =>
    manifest.roots.some((root) => path.startsWith(`${root}/`)) && !excludedFilePattern.test(path);
  for (const path of [...manifest.loadPath, ...Object.keys(manifest.counts)]) {
    if (!isScanned(path)) {
      problems.push(`${path}: not a scanned source file under ${manifest.roots.join(', ')}`);
    }
  }
  for (const path of manifest.loadPath) {
    if (readSource(path) === undefined) {
      problems.push(`loadPath: ${path} does not exist; carry it to the moved path, or delete it with its file`);
    }
  }

  for (const [path, line] of Object.entries(manifest.counts)) {
    if (!Number.isInteger(line) || line < 1) {
      problems.push(`counts: ${path} must be a positive integer; delete the line at 0`);
      continue;
    }
    const source = readSource(path);
    if (source === undefined) {
      problems.push(`${path}: has a line but does not exist; delete the line, or carry it to the moved path`);
      continue;
    }
    const count = countSkeletonSites(path, source);
    if (count > line) {
      problems.push(`${path}: measures ${count} skeleton sites, above its line of ${line}; draw the frame instead`);
    } else if (count < line) {
      problems.push(`${path}: measures ${count} skeleton sites, below its line of ${line}; lower it (delete it at 0)`);
    }
  }

  for (const path of scannedFiles) {
    if (Object.hasOwn(manifest.counts, path) || !isScanned(path)) {
      continue;
    }
    const count = countSkeletonSites(path, readSource(path) ?? '');
    if (count > 0) {
      problems.push(`${path}: measures ${count} skeleton sites with no line, so its line is 0; draw the frame instead`);
    }
  }
  return problems;
}

/** The load-path files that still draw a skeleton, with their counts. */
function loadPathSkeletons(manifest: LoadingStateManifest, readSource: (path: string) => string | undefined): string[] {
  return manifest.loadPath.flatMap((path) => {
    const source = readSource(path);
    const count = source === undefined ? 0 : countSkeletonSites(path, source);
    return count > 0 ? [`${path}: ${count}`] : [];
  });
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

const skippedDirectories = new Set(['build', 'dist', 'node_modules']);

/** Source files under `directory`, without descending into dependencies or build output. */
function sourceFilesUnder(directory: string, workspaceRoot: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) {
          walk(join(current, entry.name));
        }
      } else if (entry.isFile() && sourceFilePattern.test(entry.name) && !excludedFilePattern.test(entry.name)) {
        files.push(toPosix(relative(workspaceRoot, join(current, entry.name))));
      }
    }
  };
  walk(directory);
  return files.sort();
}

const fixtureSources: Record<string, string> = {
  'app/frame.tsx': `import { Skeleton } from '@taucad/ui/components/skeleton';
import type { SkeletonProps } from './types';
// <Skeleton /> in a comment is not a site
type RowSkeletonProps = { rows: number };
export function RowSkeleton({ rows }: RowSkeletonProps) {
  return <div>{Array.from({ length: rows }, () => <Skeleton className='h-4' />)}</div>;
}
export const Page = () => (
  <>
    <RowSkeleton rows={3} />
    <Sidebar.MenuSkeleton />
    <SettingsRowsLoading />
    <span>{'Skeleton'}</span>
  </>
);
`,
  'app/clean.tsx': `export const Clean = () => <div aria-busy='true' />;\n`,
};

const readFixture = (path: string): string | undefined => fixtureSources[path];

const fixtureManifest = (
  counts: Record<string, number>,
  overrides: Partial<LoadingStateManifest> = {},
): { manifest: LoadingStateManifest; manifestText: string } => {
  const manifest: LoadingStateManifest = { roots: ['app'], loadPath: ['app/clean.tsx'], counts, ...overrides };
  return { manifest, manifestText: JSON.stringify(manifest) };
};

const check = (fixture: ReturnType<typeof fixtureManifest>): string[] =>
  loadingStateRatchetProblems({
    ...fixture,
    readSource: readFixture,
    scannedFiles: Object.keys(fixtureSources).sort(),
  });

describe('countSkeletonSites', () => {
  it('should count skeleton elements and skeleton component declarations, and nothing in types, imports or text', () => {
    expect(countSkeletonSites('app/frame.tsx', fixtureSources['app/frame.tsx'] ?? '')).toBe(5);
    expect(countSkeletonSites('app/clean.tsx', fixtureSources['app/clean.tsx'] ?? '')).toBe(0);
  });
});

describe('loadingStateRatchetProblems', () => {
  it('should pass when every line equals its measured count', () => {
    expect(check(fixtureManifest({ 'app/frame.tsx': 5 }))).toEqual([]);
  });

  it('should fail a new skeleton in a file with no line', () => {
    expect(check(fixtureManifest({}))).toEqual([
      'app/frame.tsx: measures 5 skeleton sites with no line, so its line is 0; draw the frame instead',
    ]);
  });

  it('should fail a count above its line, and a count below it', () => {
    expect(check(fixtureManifest({ 'app/frame.tsx': 4 }))).toEqual([
      'app/frame.tsx: measures 5 skeleton sites, above its line of 4; draw the frame instead',
    ]);
    expect(check(fixtureManifest({ 'app/frame.tsx': 6 }))).toEqual([
      'app/frame.tsx: measures 5 skeleton sites, below its line of 6; lower it (delete it at 0)',
    ]);
  });

  it('should fail a line for a file that does not exist, and a malformed manifest', () => {
    const fixture = fixtureManifest(
      { 'app/frame.tsx': 5, 'app/gone.tsx': 1, 'app/clean.tsx': 0 },
      { loadPath: ['app/frame.tsx', 'app/clean.tsx', 'lib/elsewhere.tsx', 'app/moved.tsx'] },
    );
    expect(check(fixture)).toEqual([
      'loadPath: app/clean.tsx must be listed once, in sorted order',
      'loadPath: app/moved.tsx must be listed once, in sorted order',
      'counts: app/clean.tsx must be listed once, in sorted order',
      'lib/elsewhere.tsx: not a scanned source file under app',
      'loadPath: lib/elsewhere.tsx does not exist; carry it to the moved path, or delete it with its file',
      'loadPath: app/moved.tsx does not exist; carry it to the moved path, or delete it with its file',
      'app/gone.tsx: has a line but does not exist; delete the line, or carry it to the moved path',
      'counts: app/clean.tsx must be a positive integer; delete the line at 0',
    ]);
    expect(duplicateKeys('{ "counts": { "a.tsx": 1, "a.tsx": 2 } }')).toEqual([
      'counts: a.tsx is listed more than once',
    ]);
  });

  it('should report the load-path files that still draw a skeleton', () => {
    const { manifest } = fixtureManifest({}, { loadPath: ['app/clean.tsx', 'app/frame.tsx'] });
    expect(loadPathSkeletons(manifest, readFixture)).toEqual(['app/frame.tsx: 5']);
  });
});

describe('loading state ratchet', () => {
  const workspaceRoot = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
  const manifestText = readFileSync(new URL('loading-state.ratchet.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(manifestText) as LoadingStateManifest;
  const readSource = (path: string): string | undefined => {
    const file = join(workspaceRoot, path);
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  };

  it('should hold every file at its committed skeleton count', () => {
    const scannedFiles = manifest.roots.flatMap((root) => sourceFilesUnder(join(workspaceRoot, root), workspaceRoot));
    const problems = loadingStateRatchetProblems({ manifest, manifestText, readSource, scannedFiles });
    expect(problems, problems.join('\n')).toEqual([]);
  }, 60_000);

  // Blueprint row C1, expected to fail until the A13 and A15b–A15g lanes have landed; the lane that brings the set to zero flips it.
  it.fails('should draw no skeleton in any Home or editor load-path file (H1, U3, U4, U5, U6, U17, U18, M1)', () => {
    const remaining = loadPathSkeletons(manifest, readSource);
    expect(remaining, `load-path files that still draw a skeleton:\n${remaining.join('\n')}`).toEqual([]);
  });
});
