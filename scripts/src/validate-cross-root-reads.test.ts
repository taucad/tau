import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkAllowlist,
  checkCoverage,
  everyLandingTargets,
  coverageContext,
  findCrossRootReads,
  formatCoverage,
  formatAllowlistCheck,
  globToRegExp,
  loadAllowlist,
  loadSourceFiles,
  parseAllowlist,
  trackedPaths,
} from '#validate-cross-root-reads.js';
import type {
  AllowlistEntry,
  CoverageContext,
  CrossRootRead,
  GraphProject,
  ProjectRoot,
  SourceFile,
} from '#validate-cross-root-reads.js';

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

describe('checkCoverage()', () => {
  const graphProjects: readonly GraphProject[] = [
    { name: 'a', root: 'libs/a', targets: { test: { inputs: ['default'] }, typecheck: {} } },
    { name: 'b', root: 'libs/b', targets: { build: {} } },
    {
      name: 'c',
      root: 'libs/c',
      targets: {
        test: { inputs: ['default', 'policy'] },
        'check-x': { options: { command: 'node libs/c/scripts/check.ts' }, inputs: ['{workspaceRoot}/x/allowed.json'] },
        e2e: { options: { commands: ['nx run b:build', 'vitest'] } },
      },
      namedInputs: { policy: ['{workspaceRoot}/infra/policy.json', '!{workspaceRoot}/infra/ignored.json'] },
    },
    { name: 'plugin-p', root: 'plugins/p', targets: {} },
    { name: 'plugin-q', root: 'plugins/q', targets: {} },
  ];
  const context: CoverageContext = {
    projects: graphProjects,
    dependencies: { a: ['b'], b: [], c: [], 'plugin-p': [], 'plugin-q': [] },
    namedInputs: { default: ['{projectRoot}/**/*'] },
    tracked: [
      'infra/policy.json',
      'infra/ignored.json',
      'libs/b/src/index.ts',
      'libs/b/x.json',
      'plugins/AGENTS.md',
      'plugins/p/package.json',
      'plugins/p/src/index.ts',
      'plugins/q/package.json',
      'x/allowed.json',
      'x/other.json',
    ],
  };
  const read = (file: string, kind: string, target: string): CrossRootRead => {
    const project = graphProjects.find(({ root }) => file.startsWith(`${root}/`));
    if (!project) {
      throw new Error(`no project for ${file}`);
    }
    return { file, line: 1, kind, target, project: { name: project.name, root: project.root } };
  };
  const uncovered = (reads: readonly CrossRootRead[], allowlist: readonly AllowlistEntry[] = []): string[] =>
    checkCoverage(reads, context, allowlist).map(({ read: { file, target }, fix }) => `${file} ${target}: ${fix}`);

  it('covers a read by a graph edge, a declared input through a named input, or nx.json', () => {
    expect(
      uncovered([
        read('libs/a/src/x.test.ts', 'fs.readFileSync', 'libs/b/x.json'),
        read('libs/a/src/peer.ts', 'import', 'libs/b/src/index.js'),
        read('libs/c/src/policy.test.ts', 'fs.readFileSync', 'infra/policy.json'),
        read('libs/c/scripts/check.ts', 'fs.readFileSync', 'x/allowed.json'),
        read('libs/c/src/config.test.ts', 'fs.readFileSync', 'nx.json'),
      ]),
    ).toEqual([]);
  });

  it('names the input or implicit dependency to add, on the target that runs the read', () => {
    expect(
      uncovered([
        read('libs/c/src/policy.test.ts', 'fs.readFileSync', 'infra/ignored.json'),
        read('libs/c/src/b.test.ts', 'fs.readFileSync', 'libs/b/x.json'),
        // The input sits on `test`, but `check-x` runs this script.
        read('libs/c/scripts/check.ts', 'fs.readFileSync', 'infra/policy.json'),
        read('libs/c/scripts/check.ts', 'fs.readFileSync', 'x/other.json'),
      ]),
    ).toEqual([
      'libs/c/src/policy.test.ts infra/ignored.json: add "{workspaceRoot}/infra/ignored.json" to the inputs of c:test',
      'libs/c/src/b.test.ts libs/b/x.json: add "{workspaceRoot}/libs/b/x.json" to the inputs of c:test, or add "b" to the implicitDependencies of c',
      'libs/c/scripts/check.ts infra/policy.json: add "{workspaceRoot}/infra/policy.json" to the inputs of c:check-x',
      'libs/c/scripts/check.ts x/other.json: add "{workspaceRoot}/x/other.json" to the inputs of c:check-x',
    ]);
  });

  it('runs a test file in a test set by its assigned targets alone, and needs nothing for one CI runs uncached on every landing', () => {
    const suite = read('libs/a/src/policy.test.ts', 'fs.readFileSync', 'x/other.json');
    const module = read('libs/a/src/plugin.test.ts', 'import', 'plugins/p/src/index.js');
    const partitioned: CoverageContext = {
      ...context,
      projects: graphProjects.map((project) =>
        project.name === 'a'
          ? {
              ...project,
              targets: {
                test: { inputs: ['default', '{workspaceRoot}/x/other.json'] },
                typecheck: {},
                'validate-suites': { options: { command: 'vitest run' } },
              },
            }
          : project,
      ),
      testRunners: {
        'libs/a/src/policy.test.ts': ['validate-suites'],
        'libs/a/src/plugin.test.ts': ['validate-suites'],
      },
    };
    // `a:test` declares the file, but excludes this suite, so its input selects nothing for it.
    expect(checkCoverage([suite], partitioned).map(({ fix, runningTargets }) => [fix, runningTargets])).toEqual([
      ['add "{workspaceRoot}/x/other.json" to the inputs of a:validate-suites', ['validate-suites']],
    ]);
    const landing = { ...partitioned, everyLanding: ['a:validate-suites'] };
    expect(checkCoverage([suite], landing)).toEqual([]);
    // The type check still compiles an imported module, and caches.
    expect(checkCoverage([module], landing).map(({ fix }) => fix)).toEqual([
      'add "{workspaceRoot}/plugins/p/src/index.ts" to the inputs of a:typecheck, or add "plugin-p" to the implicitDependencies of a',
    ]);
  });

  it('takes the uncached targets the landing gate depends on as run on every landing', () => {
    expect(
      everyLandingTargets({
        nodes: {
          scripts: {
            name: 'scripts',
            type: 'lib',
            data: {
              root: 'scripts',
              targets: {
                validate: { dependsOn: [{ target: 'validate-*' }, 'lint', '^build', { target: 'x', projects: ['b'] }] },
                'validate-suites': { cache: false },
                'validate-cached': {},
                lint: { cache: false },
                test: { cache: false },
              },
            },
          },
        },
      }),
    ).toEqual(['scripts:validate-suites', 'scripts:lint']);
    expect(everyLandingTargets({ nodes: {} })).toEqual([]);
  });

  it('covers a directory listing by an edge to every entry or a fileset with a wildcard entry', () => {
    const listing = read('libs/a/src/plugins.test.ts', 'fs.readdirSync', 'plugins');
    expect(uncovered([listing])).toEqual([
      'libs/a/src/plugins.test.ts plugins: add "{workspaceRoot}/plugins/*/package.json" (narrowed to the entries it reads) to the inputs of a:test',
    ]);
    const declared = {
      ...context,
      projects: graphProjects.map((project) =>
        project.name === 'a'
          ? { ...project, targets: { test: { inputs: ['default', '{workspaceRoot}/plugins/*/package.json'] } } }
          : project,
      ),
    };
    expect(checkCoverage([listing], declared)).toEqual([]);
    expect(checkCoverage([listing], { ...context, dependencies: { a: ['plugin-p', 'plugin-q'] } })).toEqual([]);
  });

  it('covers build output by a dependsOn or an nx run of its owner, and exempts what is not workspace source', () => {
    expect(
      uncovered([
        read('libs/c/e2e/setup.ts', 'fs.existsSync', 'libs/b/dist/main.js'),
        read('libs/c/src/install.test.ts', 'fs.readFileSync', 'node_modules/x/package.json'),
        read('libs/c/src/env.test.ts', 'fs.readFileSync', 'libs/b/.env'),
        read('libs/c/src/out.test.ts', 'fs.readdirSync', 'out/reports'),
        read('libs/c/src/root.test.ts', 'fs.readdirSync', '.'),
        read('libs/c/src/real.test.ts', 'fs.realpathSync', 'infra/ignored.json'),
      ]),
    ).toEqual([]);
    expect(uncovered([read('libs/c/scripts/check.ts', 'fs.existsSync', 'libs/b/dist/main.js')])).toEqual([
      'libs/c/scripts/check.ts libs/b/dist/main.js: add { "projects": ["b"], "target": "<the target that writes libs/b/dist/main.js>" } to the dependsOn of c:check-x',
    ]);
  });

  it('accepts an unscheduled entry only for a runtime read by a script no target names', () => {
    const script = read('libs/a/scripts/regenerate.ts', 'fs.readFileSync', 'x/other.json');
    const entry = { file: 'libs/a/scripts/*.ts', target: 'x/**', reason: 'r', unscheduled: 'run by hand' };
    expect(uncovered([script], [entry])).toEqual([]);
    expect(
      uncovered([read('libs/a/src/x.test.ts', 'fs.readFileSync', 'x/other.json')], [{ ...entry, file: '**' }]),
    ).toEqual(['libs/a/src/x.test.ts x/other.json: add "{workspaceRoot}/x/other.json" to the inputs of a:test']);
    expect(
      uncovered([read('libs/c/scripts/check.ts', 'fs.readFileSync', 'x/other.json')], [{ ...entry, file: '**' }]),
    ).toHaveLength(1);
    expect(() => parseAllowlist('[{ "file": "a", "target": "b", "reason": "r", "unscheduled": "" }]')).toThrow(
      /unscheduled/u,
    );
    expect(parseAllowlist(JSON.stringify([entry]))).toEqual([entry]);
  });

  it('resolves a module specifier to its TypeScript source and asks for the input on typecheck', () => {
    expect(uncovered([read('libs/a/scripts/entry.ts', 'import', 'plugins/p/src/index.js')])).toEqual([
      'libs/a/scripts/entry.ts plugins/p/src/index.js: add "{workspaceRoot}/plugins/p/src/index.ts" to the inputs of a:typecheck, or add "plugin-p" to the implicitDependencies of a',
    ]);
  });

  it('formats each uncovered read with its fix and the rule', () => {
    const lines = formatCoverage(
      checkCoverage([read('libs/c/src/b.test.ts', 'fs.readFileSync', 'libs/b/x.json')], context),
    );
    expect(lines[0]).toBe(
      'libs/c/src/b.test.ts:1: fs.readFileSync reads libs/b/x.json, but a change to libs/b/x.json does not select c (run by test, e2e)',
    );
    expect(lines[1]).toBe(
      '  fix: add "{workspaceRoot}/libs/b/x.json" to the inputs of c:test, or add "b" to the implicitDependencies of c',
    );
    expect(lines.slice(2).join('\n')).toMatch(/selects a project as affected only through a graph edge/u);
    expect(formatCoverage([])).toEqual([]);
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

    // Every read is selected by an edge or a declared input; the seeded one, allowlisted or not, is not.
    const tracked = trackedPaths(workspaceRoot);
    const context = coverageContext(graph, readFileSync(resolve(workspaceRoot, 'nx.json'), 'utf8'), tracked);
    expect(formatCoverage(checkCoverage(reads, context, allowlist))).toEqual([]);
    const seededCoverage = checkCoverage(findCrossRootReads([seeded], roots), context, allowlist);
    expect(seededCoverage.map(({ fix }) => fix)).toEqual([
      'add "{workspaceRoot}/apps/ui/package.json" to the inputs of utils:test, or add "ui" to the implicitDependencies of utils',
    ]);
  }, 120_000);
});
