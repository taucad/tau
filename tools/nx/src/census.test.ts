import { describe, expect, it } from 'vitest';
import {
  buildRows,
  countLines,
  countTestCases,
  countsTestCases,
  createOwner,
  flagRow,
  isSourceFile,
  isTestFile,
  reach,
  renderTable,
  reverseEdges,
  simulateRates,
  sizeProjects,
  sizeThresholds,
} from '#census.js';
import type { CensusGraph, CensusReport } from '#census.js';

// App -> lib -> core; tool is a root project that owns everything else.
const graph: CensusGraph = {
  projects: [
    { name: 'app', root: 'apps/app', hasTest: true },
    { name: 'app-e2e', root: 'apps/app/e2e-project', hasTest: true },
    { name: 'lib', root: 'libs/lib', hasTest: true },
    { name: 'core', root: 'libs/core/', hasTest: false },
    { name: 'tool', root: '.', hasTest: false },
  ],
  dependencies: { app: ['lib', 'npm:react'], 'app-e2e': ['app', 'app-e2e'], lib: ['core', 'core'], core: [] },
};

const globals = { shared: ['.github/workflows/ci.yml'], lockfiles: ['pnpm-lock.yaml'] };

describe('file classification', () => {
  it.each([
    ['src/a.test.ts', true],
    ['src/a.spec.tsx', true],
    ['src/a.test-d.ts', true],
    ['src/__tests__/helper.ts', true],
    ['test/fixture.mjs', true],
    ['pkg/test_kernel.py', true],
    ['pkg/kernel_test.py', true],
    ['src/a.ts', false],
    ['src/testing.ts', false],
    ['README.md', false],
  ])('isTestFile(%s) is %s', (path, expected) => {
    expect(isTestFile(path)).toBe(expected);
  });

  it('counts only non-test code as source, and only JS/TS test cases', () => {
    expect(isSourceFile('src/a.ts')).toBe(true);
    expect(isSourceFile('src/a.d.ts')).toBe(true);
    expect(isSourceFile('src/a.test.ts')).toBe(false);
    expect(isSourceFile('src/a.json')).toBe(false);
    expect(countsTestCases('src/a.test.ts')).toBe(true);
    expect(countsTestCases('pkg/test_kernel.py')).toBe(false);
    expect(countsTestCases('src/a.ts')).toBe(false);
  });
});

describe('countTestCases', () => {
  it('counts it/test call sites with modifiers, not describe or method calls', () => {
    const text = [
      "describe('x', () => {",
      "  it('a', () => {});",
      "  it.skip('b', () => {});",
      "  test.each([1, 2])('c %s', () => {});",
      '  it.each`\n  a\n`',
      '  expect(/x/.test(value)).toBe(true);',
      '  submit(value);',
      '});',
    ].join('\n');
    expect(countTestCases(text)).toBe(4);
    expect(countTestCases('export {};')).toBe(0);
  });
});

describe('countLines', () => {
  it('does not count a trailing newline as a line', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
  });
});

describe('createOwner', () => {
  it('picks the deepest root and leaves the rest to a root project', () => {
    const owner = createOwner(graph.projects);
    expect(owner('apps/app/src/main.ts')).toBe('app');
    expect(owner('apps/app/e2e-project/spec.ts')).toBe('app-e2e');
    expect(owner('libs/core/index.ts')).toBe('core');
    expect(owner('libs/corelib/index.ts')).toBe('tool');
    expect(owner('package.json')).toBe('tool');
  });

  it('returns undefined when no root project exists', () => {
    expect(createOwner([{ name: 'lib', root: 'libs/lib', hasTest: true }])('other.ts')).toBeUndefined();
  });
});

describe('sizeProjects', () => {
  it('sums source files, lines, test files and cases per owner', () => {
    const sizes = sizeProjects(graph.projects, [
      { path: 'libs/lib/src/a.ts', lines: 10 },
      { path: 'libs/lib/src/b.ts' },
      { path: 'libs/lib/src/a.test.ts', testCases: 3 },
      { path: 'libs/lib/src/test_b.py' },
      { path: 'libs/lib/README.md' },
    ]);
    expect(sizes.get('lib')).toEqual({ sourceFiles: 2, sourceLines: 10, testFiles: 2, testCases: 3 });
    expect(sizes.get('core')).toEqual({ sourceFiles: 0, sourceLines: 0, testFiles: 0, testCases: 0 });
  });

  it('skips files no project owns', () => {
    const sizes = sizeProjects([{ name: 'lib', root: 'libs/lib', hasTest: true }], [{ path: 'other/a.ts' }]);
    expect(sizes.get('lib')?.sourceFiles).toBe(0);
  });
});

describe('graph walks', () => {
  it('reverses edges and reaches transitively, starts included', () => {
    const dependents = reverseEdges({ app: ['lib'], lib: ['core'], core: [] });
    expect(dependents).toEqual({ lib: ['app'], core: ['lib'] });
    expect([...reach(['core'], dependents)].sort()).toEqual(['app', 'core', 'lib']);
    expect([...reach(['app'], dependents)]).toEqual(['app']);
  });
});

describe('simulateRates', () => {
  it('closes touches over dependents and separates global and lockfile commits', () => {
    const { rates, globalCommits, lockfileCommits } = simulateRates(
      graph,
      [
        { sha: 'a', files: ['libs/core/x.ts'] },
        { sha: 'b', files: ['apps/app/x.ts'] },
        { sha: 'c', files: ['pnpm-lock.yaml'] },
        { sha: 'd', files: ['.github/workflows/ci.yml'] },
      ],
      globals,
    );
    expect(globalCommits).toBe(2);
    expect(lockfileCommits).toBe(1);
    expect(rates.get('core')).toEqual({
      touched: 0.25,
      affected: 0.75,
      affectedWithoutLockfile: 0.5,
      affectedByGraph: 0.25,
    });
    expect(rates.get('app')).toEqual({
      touched: 0.25,
      affected: 1,
      affectedWithoutLockfile: 0.75,
      affectedByGraph: 0.5,
    });
    // The root project owns the global files themselves.
    expect(rates.get('tool')?.touched).toBe(0.5);
  });

  it('reports zero rates for an empty window', () => {
    const { rates } = simulateRates(graph, [], globals);
    expect(rates.get('app')).toEqual({ touched: 0, affected: 0, affectedWithoutLockfile: 0, affectedByGraph: 0 });
  });
});

describe('flagRow', () => {
  const rates = { touched: 0.1, affected: 0.5, affectedWithoutLockfile: 0.4, affectedByGraph: 0.2 };

  it('flags nothing at the thresholds', () => {
    expect(
      flagRow({
        sourceFiles: sizeThresholds.sourceFiles,
        testCases: sizeThresholds.testCases,
        testSeconds: 180,
        rates,
      }),
    ).toEqual([]);
  });

  it('flags each threshold it exceeds', () => {
    expect(
      flagRow({ sourceFiles: 101, testCases: 301, testSeconds: 181, rates: { ...rates, affectedByGraph: 0.21 } }),
    ).toEqual(['source-files', 'test-cases', 'test-time', 'affected-rate']);
  });

  it('does not judge the affected rate of a rarely touched project', () => {
    expect(
      flagRow({
        sourceFiles: 1,
        testCases: 1,
        testSeconds: undefined,
        rates: { ...rates, touched: 0.01, affectedByGraph: 0.5 },
      }),
    ).toEqual([]);
  });
});

describe('buildRows and renderTable', () => {
  const rows = buildRows({
    graph,
    sizes: new Map([['app', { sourceFiles: 150, sourceLines: 9000, testFiles: 2, testCases: 5 }]]),
    rates: new Map([['app', { touched: 0.1, affected: 0.3, affectedWithoutLockfile: 0.3, affectedByGraph: 0.25 }]]),
    testSeconds: { app: 200, core: 999 },
  });

  it('computes closure, fan-in and flags, flagged rows first', () => {
    const app = rows.find(({ name }) => name === 'app');
    const core = rows.find(({ name }) => name === 'core');
    expect(rows[0]?.name).toBe('app');
    expect(app).toMatchObject({ dependencies: 1, closure: 2, dependents: 1, fanIn: 1, testSeconds: 200 });
    expect(app?.flags).toEqual(['source-files', 'test-time', 'affected-rate']);
    // Duplicate and self edges are dropped; a project without a test target has no test time.
    expect(rows.find(({ name }) => name === 'app-e2e')).toMatchObject({ dependencies: 1, closure: 3 });
    expect(core).toMatchObject({
      dependencies: 0,
      closure: 0,
      dependents: 1,
      fanIn: 3,
      testSeconds: undefined,
      flags: [],
    });
  });

  it('renders flagged rows by default and every row with all', () => {
    const report: CensusReport = {
      generatedAt: '2026-11-09T00:00:00.000Z',
      ref: 'abc1234',
      commits: 10,
      globalCommits: 1,
      lockfileCommits: 1,
      thresholds: sizeThresholds,
      rows,
    };
    const flagged = renderTable(report).split('\n');
    expect(flagged[0]).toContain('5 projects, 10 first-parent commits');
    expect(flagged[1]).toContain('1 project(s) over at least one');
    expect(flagged.slice(3)).toHaveLength(2);
    expect(flagged[4]).toMatch(
      /^app +150 +9000 .* 10\.0% +30\.0% +30\.0% +25\.0% +source-files,test-time,affected-rate$/,
    );
    expect(renderTable(report, { all: true }).split('\n').slice(3)).toHaveLength(6);
    expect(renderTable(report, { all: true })).toMatch(/\ncore .* - /);
  });
});
