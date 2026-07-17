// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicad } from '@taucad/runtime/kernels';
import { esbuild } from '@taucad/runtime/bundler';
import { analyzeGlb } from '#geometry/analyze-glb.js';

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
    const result = await client.export('glb', { source: { path: filePath } });
    if (!result.success) {
      throw new Error(`Export failed: ${result.issues.map((issue) => issue.message).join('; ')}`);
    }
    if (result.data.length !== 1 || result.data[0]?.name.endsWith('.glb') !== true) {
      throw new Error(
        `GLB export expected exactly one .glb artifact, received: ${result.data.map(({ name }) => name).join(', ')}`,
      );
    }
    return result.data[0].bytes;
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

describe('analyzeGlb', () => {
  let boxGlb: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    boxGlb = await renderGlb('box.ts', boxCode);
  }, 120_000);

  it('should return valid stats for a simple box', async () => {
    const stats = await analyzeGlb(boxGlb);

    expect(stats.vertexCount).toBeGreaterThan(0);
    expect(stats.meshCount).toBe(1);
    expect(typeof stats.connectedComponents).toBe('function');
    expect(stats.connectedComponents(0.1)).toBe(1);
    expect(stats.watertight).toBe(true);
    expect(stats.boundingBox).toBeDefined();
  });

  it('should expose connectedComponents as a memoised getter parameterised on tolerance', async () => {
    const stats = await analyzeGlb(boxGlb);

    // Same tolerance returns the same answer; distinct tolerances are valid
    // independent calls. A single primitive collapses to 1 across all
    // tolerances we'd care about for a 30mm-tall box.
    expect(stats.connectedComponents(0.1)).toBe(1);
    expect(stats.connectedComponents(0.1)).toBe(1);
    expect(stats.connectedComponents(50)).toBe(1);
  });

  it('should handle misaligned buffer (Socket.IO simulation)', async () => {
    const padded = new ArrayBuffer(boxGlb.byteLength + 3);
    const misaligned = new Uint8Array(padded, 3);
    misaligned.set(boxGlb);

    const stats = await analyzeGlb(misaligned);

    expect(stats.vertexCount).toBeGreaterThan(0);
    expect(stats.meshCount).toBe(1);
  });

  it('should throw for invalid GLB data', async () => {
    const garbage = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    await expect(analyzeGlb(garbage)).rejects.toThrow();
  });

  it('should throw for empty buffer', async () => {
    await expect(analyzeGlb(new Uint8Array(0))).rejects.toThrow();
  });

  it('should report watertight=true for a closed solid', async () => {
    const stats = await analyzeGlb(boxGlb);
    expect(stats.watertight).toBe(true);
  });

  it('should compute bounding box dimensions', async () => {
    const stats = await analyzeGlb(boxGlb);

    expect(stats.boundingBox).toBeDefined();
    expect(stats.boundingBox!.size).toHaveLength(3);
    expect(stats.boundingBox!.center).toHaveLength(3);
    // MakeBaseBox(10, 20, 30) → glTF meters: 0.01 × 0.02 × 0.03
    for (const dim of stats.boundingBox!.size) {
      expect(dim).toBeGreaterThan(0);
    }
  });

  it('should expose per-primitive bbox contributors and memoised analysers', async () => {
    const stats = await analyzeGlb(boxGlb);

    expect(stats.boundingBox?.primitives.length).toBeGreaterThan(0);
    const cc = stats.analyseConnectedComponents(0.1);
    expect(cc.count).toBe(stats.connectedComponents(0.1));
    const wt = stats.analyseWatertight();
    expect(wt.watertight).toBe(stats.watertight);
  });
});
