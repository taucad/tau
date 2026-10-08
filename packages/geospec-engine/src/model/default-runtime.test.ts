import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
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
      'gltf',
      'brep',
      'rhino',
      'assimp',
      'tscircuit',
    ]);
    expect(ids(defaultRuntime.middleware)).toStrictEqual([
      'parameterFileResolver',
      'parameterUnits',
      'geometryCache',
      'gltfEdgeDetection',
    ]);
    expect(ids(defaultRuntime.bundlers)).toStrictEqual(['esbuild']);
    expect(ids(defaultRuntime.transcoders)).toStrictEqual(['gltf', 'image', 'svg-image', 'assimp']);
  });

  it('should match the production @taucad package dependencies', async () => {
    const sourceUrl = new URL('default-runtime.ts', import.meta.url);
    const nativeWorkerUrl = new URL('../runner/node/native-pool-worker-entry.ts', import.meta.url);
    const manifestUrl = new URL('../../package.json', import.meta.url);
    const [source, nativeWorkerSource, manifestSource] = await Promise.all([
      readFile(sourceUrl, 'utf8'),
      readFile(nativeWorkerUrl, 'utf8'),
      readFile(manifestUrl, 'utf8'),
    ]);
    const manifest = JSON.parse(manifestSource) as { dependencies?: Record<string, string> };
    const expected = Object.keys(manifest.dependencies ?? {}).filter(
      (name) => name.startsWith('@taucad/') && !['@taucad/runtime', '@taucad/geospec-engine-native'].includes(name),
    );
    const actual = ts
      .preProcessFile(source, true, true)
      .importedFiles.map(({ fileName }) => fileName)
      .filter((specifier) => specifier.startsWith('@taucad/') && !specifier.startsWith('@taucad/runtime'));

    expect(actual.toSorted()).toEqual(expected.toSorted());
    expect(manifest.dependencies).toHaveProperty('@taucad/geospec-engine-native');
    expect(ts.preProcessFile(nativeWorkerSource, true, true).importedFiles.map(({ fileName }) => fileName)).toContain(
      '@taucad/geospec-engine-native/node',
    );
  });
});
