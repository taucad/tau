#!/usr/bin/env node
/**
 * Export the copper lampshade through Tau's public runtime into the comparison catalog.
 * Usage: node --import tsx apps/ui/scripts/render-calibration/generate-physical.mts
 * Inputs: the checked-in Replicad example. No environment variables are required.
 * Outputs: out/render-calibration/fixtures/copper-lampshade.glb and catalog entry.
 * Exit codes: 0 success; 1 BRep, material, export, or catalog validation failure.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { NodeIO } from '@gltf-transform/core';
import { readGltfSceneBounds } from '@taucad/geometry-core';
import { replicadKernel } from '@taucad/replicad';
import { esbuildBundler } from '@taucad/esbuild';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';

const root = resolve(import.meta.dirname, '../../../..');
const main = async (): Promise<void> => {
  const output = resolve(root, 'out/render-calibration');
  const source = await readFile(
    resolve(root, 'libs/tau-examples/src/kernels/replicad/copper-lampshade/main.ts'),
    'utf8',
  );
  const runtime = defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] });
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({ 'main.ts': source }) }),
  });
  try {
    const result = await client.render({ source: { path: 'main.ts' }, content: { includeEdges: true } });
    assert.ok(!result.superseded, 'Render was superseded');
    assert.ok(result.geometry.success, JSON.stringify(result.geometry.issues));
    assert.equal(result.geometry.data.format, 'gltf');
    const bytes = result.geometry.data.content;
    const { json } = await new NodeIO().binaryToJSON(bytes);
    const primitives = json.meshes?.flatMap((mesh) => mesh.primitives) ?? [];
    const count = (mode: number): number =>
      primitives
        .filter((primitive) => primitive.mode === mode)
        .reduce(
          (sum, primitive) =>
            sum + (json.accessors?.[primitive.indices ?? primitive.attributes['POSITION'] ?? -1]?.count ?? 0),
          0,
        );
    assert.equal(json.meshes?.length, 8);
    assert.ok(count(1) > 0, 'Exact BRep line primitives are required');
    const fixture = {
      id: 'copper-lampshade',
      label: 'Copper lampshade · standard physical materials',
      file: 'fixtures/copper-lampshade.glb',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bounds: await readGltfSceneBounds({ bytes, targetWorld: { up: '+y', forward: '+z', metersPerUnit: 1 } }),
      stats: { parts: 8, meshes: json.meshes.length, triangles: count(4) / 3, lineSegments: count(1) / 2 },
      materials: json.materials ?? [],
      source: {
        file: 'libs/tau-examples/src/kernels/replicad/copper-lampshade/main.ts',
        sha256: createHash('sha256').update(source).digest('hex'),
      },
    };
    const catalogPath = resolve(output, 'catalog.json');
    let catalog: { schemaVersion: number; fixtures: Array<{ id: string }> };
    try {
      catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as typeof catalog;
      assert.equal(catalog.schemaVersion, 1);
      assert.ok(Array.isArray(catalog.fixtures));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
      catalog = { schemaVersion: 1, fixtures: [] };
    }
    catalog.fixtures = [...catalog.fixtures.filter((entry) => entry.id !== fixture.id), fixture];
    await mkdir(resolve(output, 'fixtures'), { recursive: true });
    await writeFile(resolve(output, fixture.file), bytes);
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(JSON.stringify({ file: fixture.file, sha256: fixture.sha256, stats: fixture.stats }));
  } finally {
    await client.shutdown();
  }
};

try {
  await main();
} catch (error) {
  console.error('Physical material fixture export failed:', error);
  process.exit(1);
}
