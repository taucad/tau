import { describe, expect, it, vi } from 'vitest';

import type { GeoSpecDiscoveryFileSystem } from 'geospec/runner';

import { hasGeoSpecSelectionFilters, runGeoSpecTests } from '#geospec/run-tests.js';

const discoveryOver = (tree: Record<string, readonly string[]>): GeoSpecDiscoveryFileSystem => ({
  readdir: async (path: string) => tree[path] ?? [],
  stat: async (path: string) => ({ kind: path in tree ? 'directory' : 'file' }),
});

const passingRunner = () => ({
  run: vi.fn(async ({ files }: { files: readonly string[] }) => ({
    success: true,
    passed: 1,
    failed: 0,
    selectedTests: 1,
    files: files.map(
      (file) =>
        ({
          file,
          result: {
            success: true,
            issues: [],
            tests: [{ suite: ['cube'], name: 'is watertight', status: 'passed', assertions: [], diagnostics: [] }],
          },
        }) as const,
    ),
  })),
});

describe('runGeoSpecTests', () => {
  it('discovers project-relative files and projects the runner verdict', async () => {
    const runner = passingRunner();
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fake supplies exactly the `run` slice this adapter uses.
    const output = await runGeoSpecTests({
      discovery: discoveryOver({ '': ['cube.geospec.ts'] }),
      runner: runner as never,
      args: {},
    });

    expect(runner.run).toHaveBeenCalledWith({ files: ['cube.geospec.ts'] });
    expect(output).toMatchObject({ passed: 1, total: 1, failures: [] });
    expect(output.passes[0]).toMatchObject({ requirement: 'cube > is watertight', targetFile: 'cube.geospec.ts' });
  });

  it('never runs, and names the missing-file failure, when nothing is discovered', async () => {
    const runner = passingRunner();
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fake supplies exactly the `run` slice this adapter uses.
    const output = await runGeoSpecTests({ discovery: discoveryOver({ '': [] }), runner: runner as never, args: {} });

    expect(runner.run).not.toHaveBeenCalled();
    expect(output.failures[0]).toMatchObject({ id: 'missing_geospec_file' });
  });

  it('reports a filtered empty selection differently from an empty project', async () => {
    const runner = passingRunner();
    const output = await runGeoSpecTests({
      discovery: discoveryOver({ '': [] }),
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fake supplies exactly the `run` slice this adapter uses.
      runner: runner as never,
      args: { include: ['parts/**/*.geospec.ts'] },
    });

    expect(output.failures[0]).toMatchObject({ id: 'NO_MATCHING_GEOSPEC_TESTS' });
  });

  it('forwards only the selection options the caller supplied', async () => {
    const runner = passingRunner();
    await runGeoSpecTests({
      discovery: discoveryOver({ '': ['cube.geospec.ts'] }),
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fake supplies exactly the `run` slice this adapter uses.
      runner: runner as never,
      args: { testNamePattern: 'watertight', testTimeout: 5000 },
    });

    expect(runner.run).toHaveBeenCalledWith({
      files: ['cube.geospec.ts'],
      testNamePattern: 'watertight',
      testTimeout: 5000,
    });
  });
});

describe('hasGeoSpecSelectionFilters', () => {
  it.each([
    { args: {}, expected: false },
    { args: { files: [] }, expected: false },
    { args: { testNamePattern: '' }, expected: false },
    { args: { files: ['a.geospec.ts'] }, expected: true },
    { args: { include: ['**/*.geospec.ts'] }, expected: true },
    { args: { exclude: ['slow/**'] }, expected: true },
    { args: { testNamePattern: 'watertight' }, expected: true },
  ])('answers $expected for $args', ({ args, expected }) => {
    expect(hasGeoSpecSelectionFilters(args)).toBe(expected);
  });
});
