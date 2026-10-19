import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { assertKernelRosterCoverage } from '@taucad/runtime-testing/roster';
import { kernelConfigurations } from '@taucad/types/constants';
import { defaultRuntime } from '#model/default-runtime.js';

const ids = (entries: ReadonlyArray<{ id: string }> | undefined): string[] => (entries ?? []).map(({ id }) => id);

describe('default runtime', () => {
  it('should compose the single-threaded kernel, middleware, bundler and transcoder roster', () => {
    expect(ids(defaultRuntime.kernels)).toStrictEqual([
      'replicad',
      'opencascade',
      'openrscad',
      'jscad',
      'manifold',
      'picovoxel',
      'smlib',
      'gltf',
      'brep',
      'rhino',
      'assimp',
      'smlibpy',
      'build123d',
      'picogk',
      'tscircuit',
    ]);
    expect(ids(defaultRuntime.middleware)).toStrictEqual([
      'parameterFileResolver',
      'parameterUnits',
      'geometryCache',
      'gltfEdgeDetection',
      'displaySimplification',
    ]);
    expect(ids(defaultRuntime.bundlers)).toStrictEqual(['esbuild']);
    expect(ids(defaultRuntime.transcoders)).toStrictEqual(['gltf', 'image', 'svg-image', 'assimp']);
  });

  it('should cover the product catalog, leaving out only what it cannot run unattended', () => {
    assertKernelRosterCoverage({
      runtime: defaultRuntime,
      catalog: kernelConfigurations,
      omitted: {
        zoo: 'credentialed: GeoSpec evidence runs offline, with no Zoo proxy token',
      },
    });
  });

  it('should match the production @taucad package dependencies and optional native peers', async () => {
    const sourceUrl = new URL('default-runtime.ts', import.meta.url);
    const nativeWorkerUrl = new URL('../runner/node/native-pool-worker-entry.ts', import.meta.url);
    const manifestUrl = new URL('../../package.json', import.meta.url);
    const [source, nativeWorkerSource, manifestSource] = await Promise.all([
      readFile(sourceUrl, 'utf8'),
      readFile(nativeWorkerUrl, 'utf8'),
      readFile(manifestUrl, 'utf8'),
    ]);
    const manifest = JSON.parse(manifestSource) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    const optionalPeers = Object.keys(manifest.peerDependencies ?? {}).filter(
      (name) => manifest.peerDependenciesMeta?.[name]?.optional === true,
    );
    const nativeKernelPackages = ['@taucad/smlibpy', '@taucad/build123d', '@taucad/picogk'];
    const expected = [
      ...Object.keys(manifest.dependencies ?? {}).filter(
        (name) => name.startsWith('@taucad/') && name !== '@taucad/runtime',
      ),
      ...nativeKernelPackages,
    ];
    const actual = ts
      .preProcessFile(source, true, true)
      .importedFiles.map(({ fileName }) => fileName)
      .filter((specifier) => specifier.startsWith('@taucad/') && !specifier.startsWith('@taucad/runtime'));

    expect(actual.toSorted()).toEqual(expected.toSorted());
    expect(manifest.dependencies).toHaveProperty('geospec-engine');
    expect(optionalPeers.toSorted()).toEqual([...nativeKernelPackages, '@taucad/native-process-core'].toSorted());
    for (const name of optionalPeers) {
      expect(manifest.dependencies).not.toHaveProperty(name);
    }
    expect(ts.preProcessFile(nativeWorkerSource, true, true).importedFiles.map(({ fileName }) => fileName)).toEqual(
      expect.arrayContaining(['geospec-engine/node', '@taucad/native-process-core/store']),
    );
  });

  it('should leave out a native kernel whose optional peer is not installed', async () => {
    vi.resetModules();
    // Vitest wraps a throwing mock factory, so the plugin factory raises the error Node's import would.
    vi.doMock('@taucad/build123d', () => ({
      build123d: () => {
        throw Object.assign(new Error("Cannot find package '@taucad/build123d'"), { code: 'ERR_MODULE_NOT_FOUND' });
      },
    }));
    try {
      const { defaultRuntime: withoutBuild123d } = await import('#model/default-runtime.js');
      expect(ids(withoutBuild123d.kernels)).toStrictEqual(
        ids(defaultRuntime.kernels).filter((id) => id !== 'build123d'),
      );
    } finally {
      vi.doUnmock('@taucad/build123d');
    }
  });

  it('should not hide a native kernel that fails to load for another reason', async () => {
    vi.resetModules();
    vi.doMock('@taucad/picogk', () => ({
      picogk: () => {
        throw new TypeError('broken picogk module');
      },
    }));
    try {
      await expect(import('#model/default-runtime.js')).rejects.toThrow('broken picogk module');
    } finally {
      vi.doUnmock('@taucad/picogk');
    }
  });
});
