import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profileCanonicalPerTestLoadPath, profileNodeCliLoadPath } from '#experiments/load-path/profiler.js';

const createTriangleGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]));
  const indices = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['SCALAR']!)
    .setArray(new Uint16Array([0, 1, 2]));
  const primitive = document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  document.createScene().addChild(node);
  return new WebIO().writeBinary(document);
};

describe('load-path canonical per-test profiler', () => {
  it('should prove per-test loadModel authoring reuses one underlying loader call', async () => {
    const result = await profileCanonicalPerTestLoadPath({
      glbBytes: await createTriangleGlb(),
    });

    expect(result.authoredLoadModelCalls).toBe(4);
    expect(result.underlyingModelLoaderCalls).toBe(1);
    expect(result.passed).toBe(4);
    expect(result.failed).toBe(0);
    expect(result.summary.buckets.geospecRun?.count).toBe(1);
    expect(result.summary.buckets.glbParse?.count).toBe(1);
    expect(result.summary.buckets.recordBuild?.count).toBe(1);
    expect(result.summary.buckets.statsFacade?.count).toBe(1);
    expect(result.summary.buckets.partition?.count).toBe(1);
  });

  it('should profile direct Node CLI invocations with structured counters', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'geospec-node-cli-profile-'));
    try {
      await writeFile(
        join(projectPath, 'main.geospec.ts'),
        [
          "import { describe, it } from 'geospec';",
          "describe('direct node cli profile', () => {",
          "  it('runs a deterministic smoke test', () => {});",
          '});',
        ].join('\n'),
        'utf8',
      );

      const result = await profileNodeCliLoadPath({
        projectPath,
        iterations: 1,
      });

      expect(result.command.nodeExecutable).toBe(process.execPath);
      expect(result.command.args).toContain('--json');
      expect(result.counters).toMatchObject({
        cliInvocations: 1,
        successfulInvocations: 1,
        failedInvocations: 0,
        runtimeCreations: {},
        aggregateModelLoadCache: {
          hits: 0,
          misses: 0,
          bypasses: 0,
          failures: 0,
        },
        moduleModelLoadCache: {
          hits: 0,
          misses: 0,
          bypasses: 0,
          failures: 0,
        },
        resourceScope: {
          trackedSubjects: 0,
          registeredDisposables: 0,
          disposedScopes: 1,
          disposedResources: 0,
        },
      });
      expect(result.runs).toEqual([
        expect.objectContaining({
          exitCode: 0,
          stdoutBytes: expect.any(Number),
          stderrBytes: expect.any(Number),
          profile: expect.objectContaining({
            version: 1,
            runtime: { runtimeCreations: { default: 0 } },
          }),
        }),
      ]);
      expect(result.counters.resourceScope.overlap).toMatchObject({
        cacheCreations: 0,
        cacheDisposals: 0,
        preparedComponentHits: 0,
        preparedComponentMisses: 0,
        pairVolumeHits: 0,
        pairVolumeMisses: 0,
      });
      expect(result.summary.buckets.nodeCli?.count).toBe(1);
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });
});
