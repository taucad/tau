#!/usr/bin/env node
/**
 * Regenerate the committed slicer fixtures.
 *
 * Writes a 20 mm cube and a 30 × 30 × 25 mm pyramid as self-contained GLBs in
 * Tau's export convention (glTF Y-up metres) and copies the S-L1 ST reference
 * and MT G-code from the research artifacts when that checkout is present. Output is
 * byte-deterministic; run from the workspace root:
 *
 *   node --import @oxc-node/core/register packages/plugins/slicer/scripts/generate-fixtures.mts
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../src/__fixtures__');
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

type Solid = {
  name: string;
  vertices: ReadonlyArray<readonly [number, number, number]>;
  triangles: ReadonlyArray<readonly [number, number, number]>;
};

// Z-up millimetres, counter-clockwise from outside.
const cube: Solid = {
  name: 'cube',
  vertices: [
    [-10, -10, 0],
    [10, -10, 0],
    [10, 10, 0],
    [-10, 10, 0],
    [-10, -10, 20],
    [10, -10, 20],
    [10, 10, 20],
    [-10, 10, 20],
  ],
  triangles: [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ],
};

const pyramid: Solid = {
  name: 'pyramid',
  vertices: [
    [-15, -15, 0],
    [15, -15, 0],
    [15, 15, 0],
    [-15, 15, 0],
    [0, 0, 25],
  ],
  triangles: [
    [0, 2, 1],
    [0, 3, 2],
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4],
  ],
};

const padTo4 = (length: number): number => Math.ceil(length / 4) * 4;

const writeGlb = (solid: Solid): Uint8Array<ArrayBuffer> => {
  // Z-up millimetres → glTF Y-up metres.
  const positions = Float32Array.from(solid.vertices.flatMap(([x, y, z]) => [x / 1000, z / 1000, -y / 1000]));
  const indices = Uint32Array.from(solid.triangles.flat());
  const min = [0, 1, 2].map((axis) => Math.min(...positions.filter((_, index) => index % 3 === axis)));
  const max = [0, 1, 2].map((axis) => Math.max(...positions.filter((_, index) => index % 3 === axis)));
  const positionBytes = positions.byteLength;
  const indexBytes = indices.byteLength;
  const binary = new Uint8Array(padTo4(positionBytes + indexBytes));
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), positionBytes);
  const json = {
    asset: { version: '2.0', generator: '@taucad/slicer fixtures' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: solid.name }],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantic names are fixed.
    meshes: [{ name: solid.name, primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: solid.vertices.length, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes, target: 34_962 },
      { buffer: 0, byteOffset: positionBytes, byteLength: indexBytes, target: 34_963 },
    ],
    buffers: [{ byteLength: binary.byteLength }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunk = new Uint8Array(padTo4(jsonBytes.byteLength)).fill(0x20);
  jsonChunk.set(jsonBytes);
  const total = 12 + 8 + jsonChunk.byteLength + 8 + binary.byteLength;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.byteLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  glb.set(jsonChunk, 20);
  const binaryOffset = 20 + jsonChunk.byteLength;
  view.setUint32(binaryOffset, binary.byteLength, true);
  view.setUint32(binaryOffset + 4, 0x00_4e_49_42, true);
  glb.set(binary, binaryOffset + 8);
  return glb;
};

mkdirSync(fixtures, { recursive: true });
for (const solid of [cube, pyramid]) {
  writeFileSync(join(fixtures, `${solid.name}.glb`), writeGlb(solid));
}

// The S-L1 spike's real engine outputs: ST is the qualified generic subset, MT reproduces the
// upstream preamble-order defect the parser must refuse.
for (const name of ['st', 'mt']) {
  const source = join(
    repoRoot,
    `docs/research/artifacts/agentic-manufacturing-spike-blueprint/runs/2026-09-05-wave-s/S-L1/results/${name}.gcode`,
  );
  if (existsSync(source)) {
    copyFileSync(source, join(fixtures, `${name}.gcode`));
  } else {
    console.warn(`S-L1 fixture not found at ${source}; ${name}.gcode left unchanged.`);
  }
}
