import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { smlibpyProjectLibraries, libraryVersionMismatches } from '#project-manifest.js';

const packageRoot = resolve(import.meta.dirname, '..');

const pyproject = (dependencies: string, tail = ''): string =>
  `[project]\nname = "plate"\nversion = "0.1.0"\ndependencies = [\n${dependencies}\n]\n${tail}`;

describe('smlibpy project libraries', () => {
  it('equal the CAD pins of requirements.in and the project template', async () => {
    const requirements = await readFile(resolve(packageRoot, 'python/requirements.in'), 'utf8');
    const template = await readFile(resolve(packageRoot, 'project/pyproject.toml'), 'utf8');

    for (const [name, version] of Object.entries(smlibpyProjectLibraries)) {
      expect(requirements).toMatch(new RegExp(`^${name}==${version.replaceAll('.', String.raw`\.`)}$`, 'mu'));
    }
    expect(libraryVersionMismatches(template)).toEqual([]);
    expect(template).toContain('dependencies = [\n  "smlibpy==0.3.5",\n  "numpy==2.5.2",\n]');
  });
});

describe('libraryVersionMismatches', () => {
  it('warns at each pin of a kernel library to another version, with the typed details', () => {
    const text = pyproject('  "smlibpy == 0.2.0",\n  "NumPy[extra]===2.4.0 ; python_version >= \'3.13\'",');

    const [first, second, ...rest] = libraryVersionMismatches(text);

    expect(rest).toEqual([]);
    expect(second?.location).toEqual({ fileName: 'pyproject.toml', startLineNumber: 6, startColumn: 1 });
    expect(second?.details).toEqual({
      producer: { kernelId: 'smlibpy' },
      manifest: 'pyproject.toml',
      library: 'numpy',
      declared: '2.4.0',
      runs: '2.5.2',
    });
    expect([first]).toEqual([
      {
        message:
          'pyproject.toml pins smlibpy==0.2.0, but the smlibpy kernel runs smlibpy 0.3.5. Pin "smlibpy==0.3.5" in [project] dependencies so the project runs the same library inside and outside Tau.',
        code: 'LIBRARY_VERSION_MISMATCH',
        type: 'kernel',
        severity: 'warning',
        location: { fileName: 'pyproject.toml', startLineNumber: 5, startColumn: 1 },
        details: {
          producer: { kernelId: 'smlibpy' },
          manifest: 'pyproject.toml',
          library: 'smlibpy',
          declared: '0.2.0',
          runs: '0.3.5',
        },
      },
    ]);
  });

  it('accepts the kernel versions, ranges, unpinned and other libraries', () => {
    const text = pyproject('  "smlibpy==0.3.5",\n  "numpy>=2.5",\n  "scipy==1.0.0",\n  \'trimesh\',');

    expect(libraryVersionMismatches(text)).toEqual([]);
  });

  it('reads only [project] dependencies', () => {
    expect(libraryVersionMismatches('[tool.uv]\nconstraint-dependencies = ["smlibpy==0.1.0"]\n')).toEqual([]);
    expect(
      libraryVersionMismatches('[project]\nname = "plate"\n[tool.x]\ndependencies = ["smlibpy==0.1.0"]\n'),
    ).toEqual([]);
    expect(
      libraryVersionMismatches(pyproject('  "smlibpy==0.1.0",', '\n[tool.uv]\nconstraint-dependencies = []\n')),
    ).toHaveLength(1);
  });
});
