/**
 * Renders every Picovoxel acceptance case twice through fresh public Node clients.
 *
 * The matrix is defined by the checked-in provenance ledger from
 * docs/research/picovoxel-kernel-integration-blueprint.md.
 *
 * Usage:
 *   pnpm nx run tau-examples:verify-picovoxel
 *
 * Exit codes:
 *   0  All cases produced valid, non-empty, deterministically named GLB.
 *   1  A render, geometry invariant, or deterministic-hash check failed.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { createNodeIo } from '@taucad/geometry-core';
import { createNodeClient } from '@taucad/runtime/node';
import { exampleRuntime } from '#scripts/runtime.js';

type VisualCase = {
  readonly project: string;
  readonly parameters: Record<string, unknown>;
};

type Provenance = { readonly visualCases: readonly VisualCase[] };

const sourceDirectory = join(import.meta.dirname, '../src');
const fixtureDirectory = join(sourceDirectory, 'kernels');
const provenance = JSON.parse(
  readFileSync(join(fixtureDirectory, 'picovoxel/provenance.json'), 'utf8'),
) as Provenance;

const renderCase = async (visualCase: VisualCase): Promise<string> => {
  const client = await createNodeClient(fixtureDirectory, { runtime: exampleRuntime });
  try {
    const outcome = await client.render({
      source: { path: `picovoxel/${visualCase.project}/main.ts` },
      parameters: visualCase.parameters,
      renderOptions: { lane: 'exact' },
      content: { includeEdges: true },
    });
    if (outcome.superseded) {
      throw new Error('render was superseded');
    }
    if (!outcome.geometry.success) {
      throw new Error(outcome.geometry.issues.map((issue) => issue.message).join('; '));
    }
    if (outcome.geometry.data.format !== 'gltf') {
      throw new Error(`expected glTF geometry, received ${outcome.geometry.data.format}`);
    }

    const bytes = outcome.geometry.data.content;
    if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'glTF') {
      throw new Error('invalid GLB header');
    }
    const io = await createNodeIo();
    const document = await io.readBinary(bytes);
    const root = document.getRoot();
    const meshes = root.listMeshes();
    let vertexCount = 0;
    let faceCount = 0;
    const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const mesh of meshes) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4) {
          continue;
        }
        const positions = primitive.getAttribute('POSITION');
        const indices = primitive.getIndices();
        if (!positions || !indices) {
          throw new Error('triangle primitive is missing positions or indices');
        }
        vertexCount += positions.getCount();
        faceCount += indices.getCount() / 3;
        const primitiveMinimum = positions.getMin([0, 0, 0]);
        const primitiveMaximum = positions.getMax([0, 0, 0]);
        for (const axis of [0, 1, 2]) {
          minimum[axis] = Math.min(minimum[axis]!, primitiveMinimum[axis]!);
          maximum[axis] = Math.max(maximum[axis]!, primitiveMaximum[axis]!);
        }
      }
    }
    if (vertexCount <= 0 || faceCount <= 0 || meshes.length <= 0) {
      throw new Error(`empty geometry: ${JSON.stringify({ vertexCount, faceCount, meshCount: meshes.length })}`);
    }
    const size = maximum.map((value, axis) => value - minimum[axis]!);
    if (size.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error(`invalid volumetric bounds: ${JSON.stringify({ minimum, maximum })}`);
    }
    const nodeNames = root.listNodes().map((node) => node.getName());
    const meshNames = meshes.map((mesh) => mesh.getName());
    if (
      nodeNames.length !== meshes.length ||
      nodeNames.some((name, index) => name !== `Shape ${index + 1}`) ||
      meshNames.some((name, index) => name !== nodeNames[index])
    ) {
      throw new Error(`invalid node/mesh naming: ${JSON.stringify({ nodeNames, meshNames })}`);
    }
    return createHash('sha256').update(bytes).digest('hex');
  } finally {
    client.terminate();
  }
};

const main = async (): Promise<void> => {
  for (const [index, visualCase] of provenance.visualCases.entries()) {
    const label = `${visualCase.project} ${JSON.stringify(visualCase.parameters)}`;
    console.log(`→ ${index + 1}/${provenance.visualCases.length} ${label}`);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Picovoxel WASM cases are deliberately serial.
    const first = await renderCase(visualCase);
    // oxlint-disable-next-line eslint/no-await-in-loop -- A second fresh client proves exact-lane determinism.
    const second = await renderCase(visualCase);
    if (first !== second) {
      throw new Error(`${label} produced nondeterministic GLB hashes: ${first} != ${second}`);
    }
  }
  console.log(`✓ verified ${provenance.visualCases.length} Picovoxel render cases`);
};

try {
  await main();
} catch (error) {
  console.error('Picovoxel acceptance failed:', error);
  process.exit(1);
}
