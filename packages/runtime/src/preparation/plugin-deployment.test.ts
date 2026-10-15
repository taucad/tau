import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parsePluginDeployment, targetKey, wheelDataDestination } from '#preparation/plugin-deployment.js';
import { PreparationError } from '#preparation/preparation-error.js';

type Manifest = Record<string, unknown> & {
  dependencies: Record<string, Array<{ target: Record<string, unknown>; payloads: Array<Record<string, unknown>> }>>;
  kernels: Record<string, Record<string, unknown>>;
};

const fixtures = fileURLToPath(new URL('fixtures/', import.meta.url));
const readFixture = (name: string): Manifest => JSON.parse(readFileSync(join(fixtures, name), 'utf8')) as Manifest;

const refusal = (manifest: unknown): PreparationError => {
  try {
    parsePluginDeployment(manifest, '@taucad/build123d tau-plugin.json');
  } catch (error) {
    if (error instanceof PreparationError) {
      return error;
    }
    throw error;
  }
  return expect.fail('should have refused the manifest');
};

/** The build123d design manifest with one edit applied to a deep copy. */
const edited = (edit: (manifest: Manifest) => void): Manifest => {
  const manifest = structuredClone(readFixture('build123d.tau-plugin.json'));
  edit(manifest);
  return manifest;
};

const engine = (manifest: Manifest) => manifest.dependencies['engine']![0]!;

describe('parsePluginDeployment', () => {
  describe('the two design manifests', () => {
    it('should parse the build123d manifest: one interpreter, two wheels and three raw worker files', () => {
      const deployment = parsePluginDeployment(readFixture('build123d.tau-plugin.json'));

      expect(deployment.kernels).toEqual({ build123d: { requires: ['engine'], extensions: ['py'] } });
      expect(
        deployment.dependencies['engine']?.[0]?.payloads.map(({ name, format, destination, stripComponents }) => [
          name,
          format,
          destination,
          stripComponents,
        ]),
      ).toEqual([
        ['python', 'tar.gz', 'python', 1],
        ['cadquery-ocp-novtk', 'wheel', 'python/lib/python3.13/site-packages', undefined],
        ['numpy', 'wheel', 'python/lib/python3.13/site-packages', undefined],
        ['worker.py', 'raw', 'tau-worker', undefined],
        ['analyzer.py', 'raw', 'tau-worker', undefined],
        ['glb.py', 'raw', 'tau-worker', undefined],
      ]);
      expect(deployment.dependencies['engine']?.[0]?.target).toEqual({
        runtime: 'native',
        os: 'darwin',
        arch: 'arm64',
        minimumOsVersion: '12.0',
      });
    });

    it('should parse the PicoGK manifest: the Microsoft runtime beside the Tau layer', () => {
      const deployment = parsePluginDeployment(readFixture('picogk.tau-plugin.json'));

      expect(
        deployment.dependencies['runtime']?.[0]?.payloads.map(({ name, integrity, destination, origin }) => ({
          name,
          algorithm: integrity.slice(0, 6),
          destination,
          urls: origin.kind === 'url' ? origin.urls.length : 0,
        })),
      ).toEqual([
        { name: 'dotnet', algorithm: 'sha512', destination: 'dotnet', urls: 1 },
        { name: 'worker', algorithm: 'sha256', destination: 'tau-worker', urls: 2 },
      ]);
    });

    it('should return a copy without the comment field', () => {
      const manifest = readFixture('picogk.tau-plugin.json');

      expect(Object.keys(parsePluginDeployment(manifest))).toEqual(['schemaVersion', 'dependencies', 'kernels']);
    });
  });

  describe('MANIFEST_INVALID names the field', () => {
    it.each([
      [
        'an unknown top-level field',
        edited((manifest) => {
          manifest['entries'] = {};
        }),
        'entries',
      ],
      [
        'an unknown payload field',
        edited((manifest) => {
          engine(manifest).payloads[2]!['sha256'] = 'abc';
        }),
        'dependencies.engine[0].payloads[2].sha256',
      ],
      [
        'a CPU-feature target axis',
        edited((manifest) => {
          engine(manifest).target['cpu'] = 'x86_64_v3';
        }),
        'dependencies.engine[0].target.cpu',
      ],
      [
        'a hex integrity in the North Star spelling',
        edited((manifest) => {
          engine(manifest).payloads[2]!['integrity'] = `sha256:${'0'.repeat(64)}`;
        }),
        'dependencies.engine[0].payloads[2].integrity',
      ],
      [
        'an integrity of the wrong digest length',
        edited((manifest) => {
          engine(manifest).payloads[0]!['integrity'] =
            'sha256-6WqKgQjVo7cOgnVnskk+3lQPNwXBIJ5/NHNrpqo5jdTQ0V8x62Z8nMo9vNMK2DsxWobV6aE/0sNw4vwM7OckNg==';
        }),
        'dependencies.engine[0].payloads[0].integrity',
      ],
      [
        'unpadded base64',
        edited((manifest) => {
          engine(manifest).payloads[0]!['integrity'] = 'sha256-uQVKnT1U9MtVc9RJB/3bKYdLCJCb3nPynyhoz4ciI+4';
        }),
        'dependencies.engine[0].payloads[0].integrity',
      ],
      [
        'a sha1 integrity',
        edited((manifest) => {
          engine(manifest).payloads[0]!['integrity'] = 'sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk=';
        }),
        'dependencies.engine[0].payloads[0].integrity',
      ],
      [
        'a destination that escapes the closure root',
        edited((manifest) => {
          engine(manifest).payloads[3]!['destination'] = '../outside';
        }),
        'dependencies.engine[0].payloads[3].destination',
      ],
      [
        'an absolute destination',
        edited((manifest) => {
          engine(manifest).payloads[3]!['destination'] = '/usr/local/bin';
        }),
        'dependencies.engine[0].payloads[3].destination',
      ],
      [
        'a Windows drive destination',
        edited((manifest) => {
          engine(manifest).payloads[3]!['destination'] = 'C:/Windows';
        }),
        'dependencies.engine[0].payloads[3].destination',
      ],
      [
        '"." on a non-raw payload',
        edited((manifest) => {
          engine(manifest).payloads[0]!['destination'] = '.';
        }),
        'dependencies.engine[0].payloads[0].destination',
      ],
      [
        'a wheel outside site-packages',
        edited((manifest) => {
          engine(manifest).payloads[1]!['destination'] = 'python/lib';
        }),
        'dependencies.engine[0].payloads[1].destination',
      ],
      [
        'stripComponents on a wheel',
        edited((manifest) => {
          engine(manifest).payloads[1]!['stripComponents'] = 1;
        }),
        'dependencies.engine[0].payloads[1].stripComponents',
      ],
      [
        'an escaping package path',
        edited((manifest) => {
          engine(manifest).payloads[3]!['origin'] = { kind: 'packagePath', path: '../../secrets' };
        }),
        'dependencies.engine[0].payloads[3].origin.path',
      ],
      [
        'a plain-http origin',
        edited((manifest) => {
          engine(manifest).payloads[2]!['origin'] = { kind: 'url', urls: ['http://files.pythonhosted.org/numpy.whl'] };
        }),
        'dependencies.engine[0].payloads[2].origin.urls[0]',
      ],
      [
        'an origin without its canonical URL',
        edited((manifest) => {
          engine(manifest).payloads[2]!['origin'] = { kind: 'url', urls: [] };
        }),
        'dependencies.engine[0].payloads[2].origin.urls',
      ],
      [
        'a repeated payload name',
        edited((manifest) => {
          engine(manifest).payloads[2]!['name'] = 'python';
        }),
        'dependencies.engine[0].payloads[2].name',
      ],
      [
        'an undeclared requires',
        edited((manifest) => {
          manifest.kernels['build123d']!['requires'] = ['engine', 'ocp'];
        }),
        'kernels.build123d.requires[1]',
      ],
      [
        'an extension with its dot',
        edited((manifest) => {
          manifest.kernels['build123d']!['extensions'] = ['.py'];
        }),
        'kernels.build123d.extensions[0]',
      ],
      [
        'a Linux target without libc',
        edited((manifest) => {
          engine(manifest).target = { runtime: 'native', os: 'linux', arch: 'x64' };
        }),
        'dependencies.engine[0].target.libc',
      ],
      [
        'an OS floor on a Linux target',
        edited((manifest) => {
          engine(manifest).target = {
            runtime: 'native',
            os: 'linux',
            arch: 'x64',
            libc: 'glibc',
            minimumOsVersion: '12.0',
          };
        }),
        'dependencies.engine[0].target.minimumOsVersion',
      ],
      [
        'libc on a macOS target',
        edited((manifest) => {
          engine(manifest).target['libc'] = 'glibc';
        }),
        'dependencies.engine[0].target.libc',
      ],
      [
        'memory64 on a browser target',
        edited((manifest) => {
          engine(manifest).target = { runtime: 'browser', wasmFeatures: ['memory64'] };
        }),
        'dependencies.engine[0].target.wasmFeatures',
      ],
      [
        'two variants with the same target key and floor',
        edited((manifest) => {
          manifest.dependencies['engine']!.push(structuredClone(engine(manifest)));
        }),
        'dependencies.engine[1].target',
      ],
      [
        'another schema version',
        edited((manifest) => {
          manifest['schemaVersion'] = 2;
        }),
        'schemaVersion',
      ],
    ])('should refuse %s', (_label, manifest, field) => {
      const error = refusal(manifest);

      expect({ code: error.code, field: error.field }).toEqual({ code: 'MANIFEST_INVALID', field });
      expect(error.message).toMatch(
        new RegExp(`^@taucad/build123d tau-plugin\\.json: ${field.replaceAll(/[.[\]]/gu, String.raw`\$&`)} `, 'u'),
      );
      expect(error.message).toMatch(/The package is broken; report it or pin another version\.$/u);
    });

    it('should accept two variants that differ only by floor', () => {
      const manifest = edited((draft) => {
        const newer = structuredClone(engine(draft));
        newer.target['minimumOsVersion'] = '14.0';
        draft.dependencies['engine']!.push(newer);
      });

      expect(parsePluginDeployment(manifest).dependencies['engine']).toHaveLength(2);
    });

    it('should accept "." on a raw payload', () => {
      const manifest = edited((draft) => {
        engine(draft).payloads[3]!['destination'] = '.';
      });

      expect(parsePluginDeployment(manifest).dependencies['engine']?.[0]?.payloads[3]?.destination).toBe('.');
    });

    it('should accept a Linux target with libc and a libc floor', () => {
      const manifest = edited((draft) => {
        engine(draft).target = {
          runtime: 'native',
          os: 'linux',
          arch: 'arm64',
          libc: 'glibc',
          minimumLibcVersion: '2.31',
        };
      });

      expect(targetKey(parsePluginDeployment(manifest).dependencies['engine']![0].target)).toBe('linux-arm64-glibc');
    });
  });
});

describe('targetKey', () => {
  it.each([
    [{ runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '12.0' } as const, 'darwin-arm64'],
    [{ runtime: 'native', os: 'win32', arch: 'x64' } as const, 'win32-x64'],
    [{ runtime: 'native', os: 'linux', arch: 'x64', libc: 'musl' } as const, 'linux-x64-musl'],
    [{ runtime: 'browser', threads: true } as const, 'browser-threads'],
    [{ runtime: 'browser' } as const, 'browser'],
  ])('should spell %j as %s', (target, key) => {
    expect(targetKey(target)).toBe(key);
  });
});

describe('wheelDataDestination', () => {
  it.each([
    ['python/lib/python3.13/site-packages', 'python'],
    ['python/Lib/site-packages', 'python'],
    ['runtimes/cpython/lib/python3.13t/site-packages', 'runtimes/cpython'],
    ['lib/python3.13/site-packages', '.'],
  ])('should install the data scheme of a wheel in %s under %s', (destination, prefix) => {
    expect(wheelDataDestination(destination)).toBe(prefix);
  });
});
