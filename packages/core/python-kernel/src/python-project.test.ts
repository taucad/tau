import { describe, expect, it } from 'vitest';

import { pyprojectPath, pythonLibraryVersionMismatches } from '#python-project.js';

const kernel = { kernelId: 'example', libraries: { 'example-cad': '2.0.0', 'example-ocp': '8.0.1' } };

const pyproject = (dependencies: string, tail = ''): string =>
  `[project]\nname = "plate"\nversion = "0.1.0"\ndependencies = [\n${dependencies}\n]\n${tail}`;

describe('pythonLibraryVersionMismatches', () => {
  it('warns at each pin of a kernel library to another version, with the typed details', () => {
    const text = pyproject('  "example-cad == 1.0.0",\n  "Example_OCP[extra]===7.8.0 ; python_version >= \'3.13\'",');

    const [first, second, ...rest] = pythonLibraryVersionMismatches(text, kernel);

    expect(rest).toEqual([]);
    expect(first).toEqual({
      message:
        'pyproject.toml pins example-cad==1.0.0, but the example kernel runs example-cad 2.0.0. Pin "example-cad==2.0.0" in [project] dependencies so the project runs the same library inside and outside Tau.',
      code: 'LIBRARY_VERSION_MISMATCH',
      type: 'kernel',
      severity: 'warning',
      location: { fileName: pyprojectPath, startLineNumber: 5, startColumn: 1 },
      details: {
        producer: { kernelId: 'example' },
        manifest: 'pyproject.toml',
        library: 'example-cad',
        declared: '1.0.0',
        runs: '2.0.0',
      },
    });
    expect(second?.location).toEqual({ fileName: 'pyproject.toml', startLineNumber: 6, startColumn: 1 });
    expect(second?.details).toMatchObject({ library: 'example-ocp', declared: '7.8.0', runs: '8.0.1' });
  });

  it('accepts the kernel versions, ranges, unpinned and other libraries', () => {
    const text = pyproject('  "example-cad==2.0.0",\n  "example-ocp>=7.8",\n  "numpy==1.0.0",\n  \'trimesh\',');

    expect(pythonLibraryVersionMismatches(text, kernel)).toEqual([]);
  });

  it('reads only [project] dependencies', () => {
    expect(
      pythonLibraryVersionMismatches('[tool.uv]\nconstraint-dependencies = ["example-cad==0.1.0"]\n', kernel),
    ).toEqual([]);
    expect(
      pythonLibraryVersionMismatches(
        '[project]\nname = "plate"\n[tool.x]\ndependencies = ["example-cad==0.1.0"]\n',
        kernel,
      ),
    ).toEqual([]);
    expect(
      pythonLibraryVersionMismatches(
        pyproject('  "example-cad==0.1.0",', '\n[tool.uv]\nconstraint-dependencies = []\n'),
        kernel,
      ),
    ).toHaveLength(1);
  });
});
