import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    return stat.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });

describe('@taucad/filesystem import boundary', () => {
  it('should not import rpc, runtime, fs-bridge, or app code', () => {
    const files = sourceFiles(new URL('.', import.meta.url).pathname);
    const forbidden = /from ['"](?:@taucad\/rpc|@taucad\/runtime|@taucad\/fs-bridge|apps\/)/u;

    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});

/**
 * Layer-1 mechanism-core boundary for the filesystem north star (W0).
 *
 * Each rule names one dependency the mechanism core must not carry. Today's
 * violators are listed explicitly so the suite is green while the program runs;
 * the list may only shrink, and it shrinks truthfully because a stale entry
 * fails just as loudly as an unlisted violation.
 */

/** Code with `//` and block comments removed, so a JSDoc example is not a violation. */
const withoutComments = (source: string): string =>
  source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/(^|[^:])\/\/.*$/gmu, '$1');

type BoundaryRule = {
  /** Allow-list key. */
  readonly id: string;
  /** What the rule forbids, for the failure message. */
  readonly forbids: string;
  /** Files the rule is checked against, by path relative to `src`. */
  readonly appliesTo: (relativePath: string) => boolean;
  /** Matches the forbidden construct in comment-stripped code. */
  readonly pattern: RegExp;
};

const boundaryRules: readonly BoundaryRule[] = [
  {
    id: 'path-registry',
    forbids: 'importing the path registry (D6: `PathPolicy` is injected into L4 and capture)',
    appliesTo: (path) => path !== 'path-registry.ts',
    pattern: /['"][^'"]*path-registry[^'"]*['"]/u,
  },
  {
    id: 'archive-format',
    forbids: 'importing `jszip` (D2/D15: ZIP encoding lives in the `archive` content operation)',
    appliesTo: (path) => !path.startsWith('content-ops/'),
    pattern: /['"]jszip['"]/u,
  },
  {
    id: 'project-manifest',
    forbids: 'naming `ProjectManifest` (D5: manifest I/O belongs to `project-directories.ts`)',
    appliesTo: (path) => path !== 'project-directories.ts',
    pattern: /\bProjectManifest\b/u,
  },
  {
    id: 'revision-algorithms',
    forbids: 'importing a revision algorithm module (D9: they move to `@taucad/revisions`)',
    appliesTo: () => true,
    pattern: /['"][^'"]*revision-(?:merge|tree|metadata|capture)[^'"]*['"]/u,
  },
  {
    id: 'backend-identity',
    forbids: 'comparing backend identity (D13: backends declare capabilities instead)',
    appliesTo: (path) => !path.startsWith('backend/'),
    pattern: /\bbackend\s*[!=]==\s*['"]/u,
  },
  {
    id: 'route-literals',
    forbids: 'spelling a product route (D10: `project-routes.ts` is the only speller)',
    appliesTo: (path) => path !== 'project-routes.ts',
    pattern: /['"`]\/(?:projects|checkouts|previews|node_modules)\b/u,
  },
];

/**
 * Today's violations, each cleared by the named work package.
 *
 * | Work package | Clears |
 * | --- | --- |
 * | W9 | `backend-identity` |
 *
 * `project-manifest` is cleared: W7 moved the manifest I/O — and the discovery
 * vocabulary that names a manifest — into `project-directories.ts`, which the
 * rule exempts.
 */
const allowList: ReadonlyArray<readonly [file: string, rule: string, workPackage: string]> = [
  /* Discovery locators and the pending-commit scope schema discriminate on the
   * backend. They moved out of the Service with W7's extraction, so the same
   * violation now has two homes until W9 gives backends a declared capability. */
  ['project-directories.ts', 'backend-identity', 'W9'],
  ['workspace-file-service.ts', 'backend-identity', 'W9'],
];

describe('@taucad/filesystem layer-1 core boundary', () => {
  const base = new URL('.', import.meta.url).pathname;
  const violations = sourceFiles(base)
    .map((file) => ({ file: file.slice(base.length), code: withoutComments(readFileSync(file, 'utf8')) }))
    .filter(({ file }) => !file.endsWith('.test.ts') && !file.endsWith('.test-d.ts'))
    .flatMap(({ file, code }) =>
      boundaryRules
        .filter((rule) => rule.appliesTo(file) && rule.pattern.test(code))
        .map((rule) => `${file} — ${rule.forbids}`),
    )
    .sort();

  const allowed = allowList.map(([file, rule, workPackage]) => {
    const { forbids } = boundaryRules.find((candidate) => candidate.id === rule)!;
    return { entry: `${file} — ${forbids}`, workPackage };
  });

  it('should carry no forbidden core dependency outside the allow-list', () => {
    const allowedEntries = new Set(allowed.map(({ entry }) => entry));

    expect(violations.filter((violation) => !allowedEntries.has(violation))).toEqual([]);
  });

  it('should carry no allow-list entry that has already been cleared', () => {
    const current = new Set(violations);
    const stale = allowed
      .filter(({ entry }) => !current.has(entry))
      .map(({ entry, workPackage }) => `${entry} [${workPackage}]`);

    expect(stale).toEqual([]);
  });
});

const sourceDirectory = new URL('.', import.meta.url).pathname;

/** Resolve one `#…` or relative specifier to its source file, or `undefined` when external. */
const resolveLocal = (specifier: string, from: string): string | undefined => {
  const relative = specifier.startsWith('#')
    ? join(sourceDirectory, specifier.slice(1))
    : specifier.startsWith('.')
      ? join(from, '..', specifier)
      : undefined;
  if (relative === undefined) {
    return undefined;
  }
  const base = relative.replace(/\.js$/u, '');
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Try the next spelling.
    }
  }
  return undefined;
};

/** Every specifier reachable from `entry` through local imports, plus the externals hit. */
const reachableSpecifiers = (entry: string): { files: string[]; externals: Set<string> } => {
  const seen = new Set<string>();
  const externals = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
      const specifier = match[1]!;
      const local = resolveLocal(specifier, file);
      if (local === undefined) {
        externals.add(specifier);
      } else {
        queue.push(local);
      }
    }
  }
  return { files: [...seen], externals };
};

describe('@taucad/filesystem node backend containment', () => {
  it('keeps node builtins out of everything the browser barrel reaches', () => {
    const { externals } = reachableSpecifiers(join(sourceDirectory, 'backend/index.ts'));

    expect([...externals].filter((specifier) => specifier.startsWith('node:'))).toEqual([]);
  });

  it('proves the walk would see a node builtin — the node subpath does import them', () => {
    const { externals } = reachableSpecifiers(join(sourceDirectory, 'backend/node/index.ts'));

    expect([...externals].filter((specifier) => specifier.startsWith('node:')).sort()).toEqual([
      'node:child_process',
      'node:crypto',
      'node:fs',
      'node:fs/promises',
      'node:path',
    ]);
  });
});
