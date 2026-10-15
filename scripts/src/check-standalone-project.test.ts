import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/* oxlint-disable no-restricted-imports -- the catalog the oracle covers, by path as the oracle reads it. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- the catalog the oracle covers.
import { kernelConfigurations } from '../../libs/types/src/constants/kernel.constants.ts';
/* oxlint-enable no-restricted-imports */
import { createProject, ecosystemKernels, fixturesDirectory, standaloneRows } from '#check-standalone-project.js';

describe('standalone-project oracle', () => {
  it('should have a row and a fixture for every template Tau creates', () => {
    const kernels = kernelConfigurations.map(({ id }) => id).toSorted();

    expect(Object.keys(standaloneRows).toSorted()).toEqual(kernels);
    expect(readdirSync(fixturesDirectory).toSorted()).toEqual(kernels);
    for (const { id, mainFile } of kernelConfigurations) {
      expect(existsSync(join(fixturesDirectory, id, mainFile)), `${id}/${mainFile}`).toBe(true);
    }
  });

  it('should install every row with its ecosystem tool only', () => {
    const tools: Record<string, readonly string[]> = {
      npm: ['npm'],
      pypi: ['uv'],
      nuget: ['dotnet'],
      none: [],
      kcl: [],
    };
    for (const { id, ecosystem } of kernelConfigurations) {
      expect(
        standaloneRows[id]?.install.map(([tool]) => tool),
        id,
      ).toEqual(tools[ecosystem]);
    }
  });

  it('should group the catalog by ecosystem', () => {
    expect(ecosystemKernels('pypi')).toEqual(['build123d']);
    expect(ecosystemKernels('nuget')).toEqual(['picogk']);
    expect(ecosystemKernels('none')).toEqual(['openscad']);
    expect(ecosystemKernels('kcl')).toEqual(['zoo']);
    expect(ecosystemKernels('npm')).toEqual(
      expect.arrayContaining(['replicad', 'manifold', 'jscad', 'opencascadejs', 'picovoxel', 'tscircuit']),
    );
  });

  it('should create the project with its ecosystem files, tau.json and the fixture model', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-standalone-test-'));
    try {
      expect(createProject('build123d', join(directory, 'python'))).toBe('main.py');
      expect(readdirSync(join(directory, 'python')).toSorted()).toEqual([
        'main.py',
        'pylock.toml',
        'pyproject.toml',
        'tau.json',
        'uv.lock',
      ]);
      expect(createProject('picogk', join(directory, 'csharp'))).toBe('main.cs');
      expect(readdirSync(join(directory, 'csharp')).toSorted()).toEqual([
        'StandalonePicoGK.csproj',
        'main.cs',
        'packages.lock.json',
        'tau.json',
      ]);
      expect(createProject('jscad', join(directory, 'js'))).toBe('main.ts');
      expect(readdirSync(join(directory, 'js')).toSorted()).toEqual(['main.ts', 'package.json', 'run.mjs', 'tau.json']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
