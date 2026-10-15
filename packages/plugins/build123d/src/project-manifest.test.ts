import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { build123dProjectLibraries, libraryVersionMismatches } from '#project-manifest.js';

const packageRoot = resolve(import.meta.dirname, '..');

const pyproject = (dependencies: string, tail = ''): string =>
  `[project]\nname = "plate"\nversion = "0.1.0"\ndependencies = [\n${dependencies}\n]\n${tail}`;

describe('build123d project libraries', () => {
  it('equal the CAD pins of requirements.in and the project template', async () => {
    const requirements = await readFile(resolve(packageRoot, 'python/requirements.in'), 'utf8');
    const template = await readFile(resolve(packageRoot, 'project/pyproject.toml'), 'utf8');

    for (const [name, version] of Object.entries(build123dProjectLibraries)) {
      expect(requirements).toMatch(new RegExp(`^${name}==${version.replaceAll('.', String.raw`\.`)}$`, 'mu'));
    }
    expect(libraryVersionMismatches(template)).toEqual([]);
    expect(template).toContain('dependencies = [\n  "build123d==0.11.1",\n  "cadquery-ocp-novtk==7.9.3.1.1",\n]');
  });
});

describe('libraryVersionMismatches', () => {
  it('warns at each pin of a kernel library to another version, with the typed details', () => {
    const text = pyproject(
      '  "build123d == 0.10.0",\n  "Cadquery_OCP.novtk[extra]===7.8.0 ; python_version >= \'3.13\'",',
    );

    const [first, second, ...rest] = libraryVersionMismatches(text);

    expect(rest).toEqual([]);
    expect(second?.location).toEqual({ fileName: 'pyproject.toml', startLineNumber: 6, startColumn: 1 });
    expect(second?.details).toEqual({
      producer: { kernelId: 'build123d' },
      manifest: 'pyproject.toml',
      library: 'cadquery-ocp-novtk',
      declared: '7.8.0',
      runs: '7.9.3.1.1',
    });
    expect([first]).toEqual([
      {
        message:
          'pyproject.toml pins build123d==0.10.0, but the build123d kernel runs build123d 0.11.1. Pin "build123d==0.11.1" in [project] dependencies so the project runs the same library inside and outside Tau.',
        code: 'LIBRARY_VERSION_MISMATCH',
        type: 'kernel',
        severity: 'warning',
        location: { fileName: 'pyproject.toml', startLineNumber: 5, startColumn: 1 },
        details: {
          producer: { kernelId: 'build123d' },
          manifest: 'pyproject.toml',
          library: 'build123d',
          declared: '0.10.0',
          runs: '0.11.1',
        },
      },
    ]);
  });

  it('accepts the kernel versions, ranges, unpinned and other libraries', () => {
    const text = pyproject('  "build123d==0.11.1",\n  "cadquery-ocp-novtk>=7.8",\n  "numpy==1.0.0",\n  \'trimesh\',');

    expect(libraryVersionMismatches(text)).toEqual([]);
  });

  it('reads only [project] dependencies', () => {
    expect(libraryVersionMismatches('[tool.uv]\nconstraint-dependencies = ["build123d==0.1.0"]\n')).toEqual([]);
    expect(
      libraryVersionMismatches('[project]\nname = "plate"\n[tool.x]\ndependencies = ["build123d==0.1.0"]\n'),
    ).toEqual([]);
    expect(
      libraryVersionMismatches(pyproject('  "build123d==0.1.0",', '\n[tool.uv]\nconstraint-dependencies = []\n')),
    ).toHaveLength(1);
  });
});
