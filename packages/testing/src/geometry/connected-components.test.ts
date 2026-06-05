// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { createRuntimeClient } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicad } from '@taucad/runtime/kernels';
import { esbuild } from '@taucad/runtime/bundler';
import { countConnectedComponents } from '#geometry/connected-components.js';
import { analyzeGlb } from '#geometry/analyze-glb.js';
import { evaluateRequirement } from '#geometry/evaluate-requirement.js';
import type { MeasurementTestRequirement } from '#schemas.js';

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

// Two non-overlapping ShapeConfig boxes positioned 40mm apart (box1 right
// edge at x=5mm, box2 left edge at x=45mm, gap = 40mm). The kernel emits two
// glTF primitives (one per ShapeConfig), so at the default tolerance (0.1mm)
// the per-primitive AABB clustering reports 2 disjoint chunks; at
// tolerance: 50 (mm) the AABBs collapse into 1.
const farApartMultiShapeCode = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    const box1 = makeBaseBox(10, 10, 10);
    const box2 = makeBaseBox(10, 10, 10).translate(50, 0, 0);
    return [{ shape: box1, name: 'A' }, { shape: box2, name: 'B' }];
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

// Two ShapeConfig parts whose AABBs are far apart (sphere lifted 50mm above
// the box). The agent-facing semantic is "spatially-disjoint chunks" so this
// must report 2 at the default tolerance.
const disjointMultiShapeCode = `
  import { makeBaseBox, makeSphere } from 'replicad';
  export default function main() {
    const box = makeBaseBox(10, 20, 30);
    const sphere = makeSphere(5).translateZ(50);
    return [{ shape: box, name: 'box' }, { shape: sphere, name: 'sphere' }];
  }
`;

// Helicopter regression repro from docs/research/mesh-continuity-test-semantics.md
// §Problem Statement (F1 + F8): two ShapeConfig boxes that share a face but
// are returned as independent shapes (so glTF emits two primitives without
// vertex welding). Under the rewritten algorithm their AABBs touch at x=5mm,
// so countConnectedComponents → 1 at the default tolerance.
const touchingMultiShapeCode = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    const a = makeBaseBox(10, 10, 10);
    const b = makeBaseBox(10, 10, 10).translateX(10);
    return [{ shape: a, name: 'A' }, { shape: b, name: 'B' }];
  }
`;

describe('countConnectedComponents', () => {
  let boxGlb: Uint8Array<ArrayBuffer>;
  let farApartMultiShapeGlb: Uint8Array<ArrayBuffer>;
  let fusedGlb: Uint8Array<ArrayBuffer>;
  let disjointMultiShapeGlb: Uint8Array<ArrayBuffer>;
  let touchingMultiShapeGlb: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    [boxGlb, farApartMultiShapeGlb, fusedGlb, disjointMultiShapeGlb, touchingMultiShapeGlb] = await Promise.all([
      renderGlb('box.ts', boxCode),
      renderGlb('far-apart.ts', farApartMultiShapeCode),
      renderGlb('fused.ts', fusedCode),
      renderGlb('disjoint.ts', disjointMultiShapeCode),
      renderGlb('touching.ts', touchingMultiShapeCode),
    ]);
  }, 120_000);

  it('should report 1 component for a single solid at the default tolerance', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(boxGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(1);
  });

  it('should report 2 components for two far-apart ShapeConfig boxes at a tight tolerance', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(farApartMultiShapeGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(2);
  });

  it('should collapse far-apart ShapeConfig boxes into 1 component when tolerance covers the gap', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(farApartMultiShapeGlb);
    expect(countConnectedComponents(document, 50)).toBe(1);
  });

  it('should report 1 component for overlapping fused shapes at the default tolerance', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(fusedGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(1);
  });

  it('should report separate components for spatially-disjoint multi-shape returns', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(disjointMultiShapeGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(2);
  });

  it('should report 1 component for two ShapeConfig parts that share a face (helicopter regression repro)', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(touchingMultiShapeGlb);
    expect(countConnectedComponents(document, 0.1)).toBe(1);
  });

  it('should return 0 for an empty document with no primitives', () => {
    const document = new Document();
    expect(countConnectedComponents(document, 0.1)).toBe(0);
  });

  it('should skip primitives without a POSITION attribute without throwing', () => {
    const document = new Document();
    const mesh = document.createMesh();
    const primitive = document.createPrimitive().setMode(4); // TRIANGLES, no POSITION
    mesh.addPrimitive(primitive);
    document.createScene().addChild(document.createNode().setMesh(mesh));

    expect(() => countConnectedComponents(document, 0.1)).not.toThrow();
    expect(countConnectedComponents(document, 0.1)).toBe(0);
  });

  it('does not add #part suffix when each glTF primitive is already one connected sub-mesh', async () => {
    const stats = await analyzeGlb(boxGlb);
    const analysis = stats.analyseConnectedComponents(0.1);
    const names = analysis.clusters.flatMap((c) => c.primitives.map((p) => p.name));
    for (const name of names) {
      expect(name).not.toContain('#part');
    }
  });

  it('should pass connectedComponents:1 for the helicopter ShapeConfig regression repro', async () => {
    // End-to-end regression: feeds the touching multi-ShapeConfig fixture through
    // analyzeGlb + evaluateRequirement and asserts the user-reported bug
    // (multi-ShapeConfig assemblies failing connectedComponents: 1 even when
    // parts touch) is fixed under the new AABB clustering algorithm.
    // Cross-ref: docs/research/mesh-continuity-test-semantics.md §Problem Statement.
    const stats = await analyzeGlb(touchingMultiShapeGlb);
    const requirement: MeasurementTestRequirement = {
      id: 'req_helicopter',
      type: 'measurement',
      description: 'Helicopter assembly is one cohesive piece',
      check: 'connectedComponents',
      expected: { count: 1 },
    };

    const result = evaluateRequirement(requirement, stats);

    expect(result.passed).toBe(true);
  });
});
