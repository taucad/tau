// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicad } from '@taucad/runtime/kernels';
import { esbuild } from '@taucad/runtime/bundler';
import { Document, NodeIO } from '@gltf-transform/core';
import { isWatertight } from '#geometry/watertight.js';

async function renderGlb(filename: string, code: string): Promise<Uint8Array<ArrayBuffer>> {
  const filePath = filename.startsWith('/') ? filename : `/${filename}`;
  const runtime = defineRuntime({ kernels: [replicad()], bundlers: [esbuild()] });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ [filePath]: code }),
    }),
  });

  try {
    const result = await client.export('glb', { file: filePath });
    if (!result.success) {
      throw new Error(`Export failed: ${result.issues.map((issue) => issue.message).join('; ')}`);
    }
    return result.data.bytes;
  } finally {
    client.terminate();
  }
}

const boxCode = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    return makeBaseBox(10, 20, 30);
  }
`;

const sphereCode = `
  import { makeSphere } from 'replicad';
  export default function main() {
    return makeSphere(15);
  }
`;

const fusedCode = `
  import { makeBaseBox, makeSphere } from 'replicad';
  export default function main() {
    const box = makeBaseBox(20, 20, 20);
    const sphere = makeSphere(12);
    return box.fuse(sphere);
  }
`;

describe('isWatertight', () => {
  let boxGlb: Uint8Array<ArrayBuffer>;
  let sphereGlb: Uint8Array<ArrayBuffer>;
  let fusedGlb: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    [boxGlb, sphereGlb, fusedGlb] = await Promise.all([
      renderGlb('box.ts', boxCode),
      renderGlb('sphere.ts', sphereCode),
      renderGlb('fused.ts', fusedCode),
    ]);
  }, 120_000);

  it('should return true for a closed solid box', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(boxGlb);
    expect(isWatertight(document)).toBe(true);
  });

  it('should return true for a closed sphere', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(sphereGlb);
    expect(isWatertight(document)).toBe(true);
  });

  it('should return true for a fused solid', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(fusedGlb);
    expect(isWatertight(document)).toBe(true);
  });

  it('should return false for empty mesh (no triangles)', () => {
    const document = new Document();
    expect(isWatertight(document)).toBe(false);
  });

  it('should return false for an open triangle strip', () => {
    // Build a synthetic Document with 3 triangles forming an open strip (not closed)
    const document = new Document();
    const buffer = document.createBuffer();

    // 5 vertices forming an open triangle strip
    const positions = document
      .createAccessor()
      .setType('VEC3')
      .setBuffer(buffer)
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0, 1.5, 1, 0, 2, 0, 0]));

    // 3 triangles: (0,1,2), (1,3,2), (1,4,3)
    // Edge (0,2) is only used once (boundary), so not watertight
    const indices = document
      .createAccessor()
      .setBuffer(buffer)
      .setArray(new Uint16Array([0, 1, 2, 1, 3, 2, 1, 4, 3]));

    const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);

    const mesh = document.createMesh().addPrimitive(primitive);
    const node = document.createNode().setMesh(mesh);
    document.createScene().addChild(node);

    expect(isWatertight(document)).toBe(false);
  });
});
