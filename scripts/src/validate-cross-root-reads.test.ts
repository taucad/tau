import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkAllowlist,
  findCrossRootReads,
  formatAllowlistCheck,
  globToRegExp,
  loadAllowlist,
  loadSourceFiles,
  parseAllowlist,
  trackedPaths,
} from '#validate-cross-root-reads.js';
import type { CrossRootRead, ProjectRoot, SourceFile } from '#validate-cross-root-reads.js';

const projects: readonly ProjectRoot[] = [
  { name: 'a', root: 'libs/a' },
  { name: 'b', root: 'libs/b' },
  { name: 'ui', root: 'apps/ui' },
  { name: 'ui-e2e', root: 'apps/ui/e2e' },
];

const fixtures: string[] = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Writes a fixture tree to a temporary directory and loads its files back as the validator would. */
const tree = (files: Record<string, string>): SourceFile[] => {
  const root = mkdtempSync(resolve(tmpdir(), 'tau-cross-root-reads-'));
  fixtures.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), content);
  }
  return loadSourceFiles(root, Object.keys(files));
};

const summarize = (reads: readonly CrossRootRead[]): string[] =>
  reads.map(({ file, line, kind, target, project }) => `${file}:${String(line)} ${kind} ${target} [${project.name}]`);

const scan = (files: Record<string, string>): string[] => summarize(findCrossRootReads(tree(files), projects));

const liveGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

describe('findCrossRootReads()', () => {
  it('flags fs reads of literal and anchored paths that leave the project root', () => {
    expect(
      scan({
        'libs/a/src/reads.ts': [
          "import { existsSync, readFileSync } from 'node:fs';",
          "import { readFile } from 'node:fs/promises';",
          "import * as fs from 'fs';",
          "import path, { dirname, join } from 'node:path';",
          "import { fileURLToPath } from 'node:url';",
          "readFileSync('../b/package.json');",
          "readFileSync(join(__dirname, '../../b/README.md'));",
          "await readFile(path.resolve(import.meta.dirname, '..', '..', '..', 'nx.json'));",
          "fs.readdirSync(new URL('../../../apps/ui/', import.meta.url));",
          "fs.promises.readFile(join(process.cwd(), '../../apps/ui/package.json'));",
          'const here = dirname(fileURLToPath(import.meta.url));',
          "const root = join(here, '../../..');",
          `existsSync(\`\${root}/libs/b/src/index.ts\`);`,
          "existsSync(root + '/pnpm-lock.yaml');",
        ].join('\n'),
      }),
    ).toEqual([
      'libs/a/src/reads.ts:6 fs.readFileSync libs/b/package.json [a]',
      'libs/a/src/reads.ts:7 fs.readFileSync libs/b/README.md [a]',
      'libs/a/src/reads.ts:8 fs.readFile nx.json [a]',
      'libs/a/src/reads.ts:9 fs.readdirSync apps/ui [a]',
      'libs/a/src/reads.ts:10 fs.readFile apps/ui/package.json [a]',
      'libs/a/src/reads.ts:13 fs.existsSync libs/b/src/index.ts [a]',
      'libs/a/src/reads.ts:14 fs.existsSync pnpm-lock.yaml [a]',
    ]);
  });

  it('flags createRequire and require.resolve calls with relative specifiers that leave the project root', () => {
    expect(
      scan({
        'libs/a/src/require.mts': [
          "import { createRequire } from 'node:module';",
          'const require = createRequire(import.meta.url);',
          "const manifest = require('../../b/package.json');",
          "const entry = require.resolve('../../../apps/ui/vite.config.ts');",
          "const own = require('./own.json');",
        ].join('\n'),
        'libs/a/src/legacy.cjs': "const helper = require('../../b/src/helper.cjs');\n",
      }),
    ).toEqual([
      'libs/a/src/legacy.cjs:1 require libs/b/src/helper.cjs [a]',
      'libs/a/src/require.mts:3 require libs/b/package.json [a]',
      'libs/a/src/require.mts:4 require.resolve apps/ui/vite.config.ts [a]',
    ]);
  });

  it('flags relative imports and re-exports that leave the project root', () => {
    expect(
      scan({
        'libs/a/src/index.ts': [
          "import { b } from '../../b/src/index.js';",
          "import type { B } from '../../b/src/types.js';",
          "export * from '../../b/src/barrel.js';",
          "const lazy = await import('../../../apps/ui/app/root.js');",
          "type Late = typeof import('../../b/src/late.js');",
        ].join('\n'),
      }),
    ).toEqual([
      'libs/a/src/index.ts:1 import libs/b/src/index.js [a]',
      'libs/a/src/index.ts:2 import type libs/b/src/types.js [a]',
      'libs/a/src/index.ts:3 export libs/b/src/barrel.js [a]',
      'libs/a/src/index.ts:4 import() apps/ui/app/root.js [a]',
      'libs/a/src/index.ts:5 import type libs/b/src/late.js [a]',
    ]);
  });

  it('passes reads that stay in the project root, package imports and absolute paths', () => {
    expect(
      scan({
        'libs/a/src/fine.ts': [
          "import { readFileSync } from 'node:fs';",
          "import { join } from 'node:path';",
          "import { b } from '@taucad/b';",
          "import { local } from '../test/local.js';",
          "export { other } from './other.js';",
          "readFileSync(join(import.meta.dirname, '../package.json'));",
          "readFileSync(new URL('../README.md', import.meta.url));",
          "readFileSync('/etc/hosts');",
          "const sibling = await import('@taucad/ui');",
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('ignores computed paths, shadowed constants and functions that are not fs reads', () => {
    expect(
      scan({
        'libs/a/src/computed.ts': [
          "import { readFileSync, writeFileSync } from 'node:fs';",
          "import { join } from 'node:path';",
          "const root = join(import.meta.dirname, '../../..');",
          'const read = (path: string): string => readFileSync(join(root, path), "utf8");',
          'readFileSync(join(root, process.env.TARGET ?? ""));',
          "writeFileSync(join(root, 'out/report.json'), '');",
          'export const shadowed = (root: string): string => readFileSync(join(root, "nx.json"), "utf8");',
          'const virtual = { readFileSync: (path: string) => path };',
          "virtual.readFileSync('../../b/package.json');",
          `await import(\`../../b/src/\${process.env.NAME}.js\`);`,
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('owns a file by the deepest project root above it and skips files outside every project', () => {
    expect(
      scan({
        'apps/ui/e2e/src/spec.ts': [
          "import { readFileSync } from 'node:fs';",
          "import { route } from '../../app/routes.js';",
          "readFileSync('package.json');",
        ].join('\n'),
        'apps/ui/app/nested.ts': "import { spec } from '../e2e/src/spec.js';\n",
        'tools/outside.ts': "import { a } from '../libs/a/src/index.js';\n",
        'libs/a/node_modules/x/index.js': "require('../../../b/package.json');\n",
      }),
    ).toEqual([
      'apps/ui/app/nested.ts:1 import apps/ui/e2e/src/spec.js [ui]',
      'apps/ui/e2e/src/spec.ts:2 import apps/ui/app/routes.js [ui-e2e]',
    ]);
  });
});

describe('checkAllowlist()', () => {
  const reads = findCrossRootReads(
    [
      {
        path: 'libs/a/src/fixture.test.ts',
        text: "import { readFileSync } from 'node:fs';\nreadFileSync('../b/x.json');\n",
      },
      { path: 'libs/b/src/peer.ts', text: "export * from '../../a/src/index.js';\n" },
    ],
    projects,
  );

  it('passes allowlisted reads, matched exactly or by glob', () => {
    expect(
      checkAllowlist(reads, [
        { file: 'libs/a/src/fixture.test.ts', target: 'libs/b/x.json', reason: 'test fixture read from b' },
        { file: 'libs/b/src/*.ts', target: 'libs/a/**', reason: 're-exports a by relative path' },
      ]),
    ).toEqual({ unlisted: [], stale: [] });
  });

  it('reports an unlisted read and a stale entry, with a fix hint', () => {
    const check = checkAllowlist(reads, [
      { file: 'libs/a/src/fixture.test.ts', target: 'libs/b/x.json', reason: 'test fixture read from b' },
      { file: 'libs/a/src/gone.ts', target: 'libs/b/**', reason: 'no longer read' },
    ]);

    expect(check.stale).toEqual([{ file: 'libs/a/src/gone.ts', target: 'libs/b/**', reason: 'no longer read' }]);
    expect(formatAllowlistCheck(check, 'allowlist.json')).toEqual([
      'libs/b/src/peer.ts:1: export reads libs/a/src/index.js outside project b (libs/b)',
      '',
      'Each read above bypasses the Nx graph, so the reading task is neither re-run nor re-hashed when the target changes.',
      'Fix it by importing the target through its package with a declared dependency, by moving the file into the',
      'reading project, or, if the read must stay, by adding { "file", "target", "reason" } to allowlist.json.',
      'allowlist.json: stale entry { "file": "libs/a/src/gone.ts", "target": "libs/b/**" } matches no read; remove it.',
    ]);
  });

  it('rejects an allowlist entry without a reason', () => {
    expect(() => parseAllowlist('[{ "file": "a.ts", "target": "b.ts", "reason": " " }]')).toThrow(/non-empty reason/u);
    expect(() => parseAllowlist('{}')).toThrow(/JSON array/u);
  });
});

describe('globToRegExp()', () => {
  it('matches dot segments, the directory a trailing /** names, and alternatives', () => {
    expect(globToRegExp('**/node_modules/**').test('node_modules/.pnpm')).toBe(true);
    expect(globToRegExp('**/node_modules/**').test('libs/a/node_modules/x/package.json')).toBe(true);
    expect(globToRegExp('repos/**').test('repos/tau-brain/.git')).toBe(true);
    expect(globToRegExp('.github/workflows/**').test('.github/workflows')).toBe(true);
    expect(globToRegExp('scripts/src/*.{ts,mts}').test('scripts/src/a.mts')).toBe(true);
    expect(globToRegExp('scripts/src/*.ts').test('scripts/src/nested/a.ts')).toBe(false);
    expect(globToRegExp('libs/a/x.json').test('libs/a/xxjson')).toBe(false);
  });
});

describe('the workspace', () => {
  it('blocks a seeded cross-root read that the checked-in allowlist does not cover', async () => {
    const workspaceRoot = resolve(import.meta.dirname, '../..');
    const graph = await liveGraph();
    const roots = Object.entries(graph.nodes).map(([name, node]) => ({ name, root: node.data.root }));
    const library = roots.find(({ root }) => root === 'libs/utils');
    expect(library).toBeDefined();

    const files = loadSourceFiles(workspaceRoot, trackedPaths(workspaceRoot));
    const seeded: SourceFile = {
      path: 'libs/utils/src/seeded-cross-root-read.ts',
      text: "import { readFileSync } from 'node:fs';\n\nexport const ui = readFileSync('../../apps/ui/package.json', 'utf8');\n",
    };
    const allowlist = loadAllowlist(workspaceRoot);

    const reads = findCrossRootReads(files, roots);
    expect(checkAllowlist(reads, allowlist)).toEqual({ unlisted: [], stale: [] });

    // Files scan independently, so the seeded file's reads join the tree's without a second full scan.
    const check = checkAllowlist([...reads, ...findCrossRootReads([seeded], roots)], allowlist);
    expect(check.stale).toEqual([]);
    expect(formatAllowlistCheck(check, 'allowlist.json')[0]).toBe(
      'libs/utils/src/seeded-cross-root-read.ts:3: fs.readFileSync reads apps/ui/package.json outside project utils (libs/utils)',
    );
    expect(check.unlisted).toHaveLength(1);
  }, 120_000);
});
