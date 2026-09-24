#!/usr/bin/env node
/**
 * Export BRep copper, metal and glass fixtures through Tau's runtime into the comparison catalog.
 * Usage: node --import tsx apps/ui/scripts/render-calibration/generate-physical.mts
 * Inputs: the checked-in Replicad example. No environment variables are required.
 * Outputs: out/render-calibration/fixtures/*.glb and catalog entries.
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
  const variants = [
    { id: 'copper-lampshade', label: 'Copper lampshade · standard physical materials', source },
    ...(['metal', 'glass'] as const).map((kind) => ({
      id: `physical-${kind}`,
      label: `Physical ${kind} · roughness and layer matrix`,
      source: `import { makeSphere, makeBox } from 'replicad';
import type { Model, Material } from '@taucad/replicad/model';
export default function main(): Model {
  const roughness = [0.05, 0.25, 0.5, 0.85];
  const parts = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 4; column++) {
      const metal: Material = {
        pbrMetallicRoughness: { baseColorFactor: row === 0 ? [0.7, 0.7, 0.7, 1] : [0.955, 0.638, 0.538, 1], metallicFactor: 1, roughnessFactor: roughness[column] },
        extensions: row === 2 ? { KHR_materials_anisotropy: { anisotropyStrength: 0.8, anisotropyRotation: Math.PI / 4 }, KHR_materials_clearcoat: { clearcoatFactor: 0.7, clearcoatRoughnessFactor: 0.15 } } : {},
      };
      const glass: Material = {
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: roughness[column] },
        extensions: { KHR_materials_transmission: { transmissionFactor: 1 }, KHR_materials_ior: { ior: row === 0 ? 1 : 1.5 }, KHR_materials_volume: { thicknessFactor: row === 0 ? 0 : 0.025, attenuationDistance: 0.04, attenuationColor: row === 2 ? [0.2, 0.8, 0.4] : [1, 1, 1] } },
      };
      parts.push({ name: 'Sphere ' + row + ':' + column, shape: makeSphere(14).translate([column * 38 - 57, 0, row * 38]), material: '${kind}' === 'metal' ? metal : glass });
    }
  }
  if ('${kind}' === 'glass') {
    for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
      parts.push({ name: 'Backdrop ' + row + ':' + col, shape: makeBox([col * 19 - 76, 22, row * 19 - 19], [col * 19 - 57, 23, row * 19]), material: { pbrMetallicRoughness: { baseColorFactor: (row + col) % 2 ? [0.06, 0.15, 0.35, 1] : [0.8, 0.8, 0.8, 1] }, extensions: { KHR_materials_unlit: {} } } });
    }
  }
  return { shapes: parts };
}`,
    })),
  ];
  const exportVariant = async (variant: (typeof variants)[number]): Promise<void> => {
    const runtime = defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({ 'main.ts': variant.source }) }),
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
      assert.ok(json.meshes && json.meshes.length > 0);
      assert.ok(count(1) > 0, 'Exact BRep line primitives are required');
      const fixture = {
        id: variant.id,
        label: variant.label,
        file: `fixtures/${variant.id}.glb`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bounds: await readGltfSceneBounds({ bytes, targetWorld: { up: '+y', forward: '+z', metersPerUnit: 1 } }),
        stats: {
          parts: json.meshes.length,
          meshes: json.meshes.length,
          triangles: count(4) / 3,
          lineSegments: count(1) / 2,
        },
        materials: json.materials ?? [],
        source: {
          file:
            variant.id === 'copper-lampshade'
              ? 'libs/tau-examples/src/kernels/replicad/copper-lampshade/main.ts'
              : 'apps/ui/scripts/render-calibration/generate-physical.mts',
          sha256: createHash('sha256').update(variant.source).digest('hex'),
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
  for (const variant of variants) {
    // oxlint-disable-next-line no-await-in-loop -- Native kernel initialization and catalog writes must be serial.
    await exportVariant(variant);
  }
};

try {
  await main();
} catch (error) {
  console.error('Physical material fixture export failed:', error);
  process.exit(1);
}
