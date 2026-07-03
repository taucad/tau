// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { createRuntimeClient } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/runtime/bundler';
import { openscad } from '@taucad/openscad';
import { countConnectedComponents } from '#geometry/connected-components.js';

async function renderOpenScadGlb(relativePath: string, code: string): Promise<Uint8Array<ArrayBuffer>> {
  const filePath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const runtime = defineRuntime({ kernels: [openscad()], bundlers: [esbuild()] });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ [filePath]: code }),
    }),
  });
  try {
    const result = await client.export('glb', { source: { path: filePath } });
    if (!result.success) {
      throw new Error(`Export failed: ${result.issues.map((issue) => issue.message).join('; ')}`);
    }
    return result.data.bytes;
  } finally {
    client.terminate();
  }
}

const singleCube = `cube([10, 10, 10]);`;

const twoSameColorSeparated = `color("yellow") cube([10, 10, 10]);
translate([50, 0, 0]) color("yellow") cube([10, 10, 10]);
`;

const twoSameColorTouching = `color("yellow") cube([10, 10, 10]);
translate([10, 0, 0]) color("yellow") cube([10, 10, 10]);
`;

const twoDifferentColorSeparated = `color("yellow") cube([10, 10, 10]);
translate([50, 0, 0]) color("#ff0000") cube([10, 10, 10]);
`;

const threeSameColorRow = `color("yellow") cube([10, 10, 10]);
translate([50, 0, 0]) color("yellow") cube([10, 10, 10]);
translate([100, 0, 0]) color("yellow") cube([10, 10, 10]);
`;

describe('OpenSCAD → GLB: connectedComponents (color-binned unwelded mesh)', { timeout: 120_000 }, () => {
  let singleGlb: Uint8Array<ArrayBuffer>;
  let twoSameSeparatorGlb: Uint8Array<ArrayBuffer>;
  let twoSameTouchGlb: Uint8Array<ArrayBuffer>;
  let twoDiffSeparatorGlb: Uint8Array<ArrayBuffer>;
  let threeSameGlb: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    [singleGlb, twoSameSeparatorGlb, twoSameTouchGlb, twoDiffSeparatorGlb, threeSameGlb] = await Promise.all([
      renderOpenScadGlb('one.scad', singleCube),
      renderOpenScadGlb('two-same-sep.scad', twoSameColorSeparated),
      renderOpenScadGlb('two-same-touch.scad', twoSameColorTouching),
      renderOpenScadGlb('two-diff-sep.scad', twoDifferentColorSeparated),
      renderOpenScadGlb('three-same.scad', threeSameColorRow),
    ]);
  });

  it('reports 1 component for a single cube', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(singleGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(1);
  });

  it('reports 2 components for two same-color disjoint cubes (one glTF primitive)', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(twoSameSeparatorGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(2);
  });

  it('reports 1 component for two same-color cubes sharing a face', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(twoSameTouchGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(1);
  });

  it('reports 2 components for two different-color disjoint cubes', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(twoDiffSeparatorGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(2);
  });

  it('reports 3 components for three same-color disjoint cubes in a row', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(threeSameGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(3);
  });
});
