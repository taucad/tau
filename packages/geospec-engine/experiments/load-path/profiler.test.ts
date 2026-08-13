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

  it('should profile direct Node CLI invocation outcomes', async () => {
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
      expect(result.command.cliPath).toMatch(/packages\/geospec-engine\/src\/cli\/main\.ts$/);
      expect(result.command.args).toContain('--json');
      expect(result.counters).toEqual({
        cliInvocations: 1,
        successfulInvocations: 1,
        failedInvocations: 0,
      });
      expect(result.runs).toEqual([
        expect.objectContaining({
          exitCode: 0,
          stdoutBytes: expect.any(Number),
          stderrBytes: expect.any(Number),
        }),
      ]);
      expect(result.summary.buckets.nodeCli?.count).toBe(1);
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  }, 15_000);
});
