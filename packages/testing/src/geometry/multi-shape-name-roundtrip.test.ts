// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/runtime/bundler';
import { replicad, opencascade } from '@taucad/runtime/kernels';
import { openscad } from '@taucad/openscad';
import type { MeasurementTestRequirement } from '#schemas.js';
import type { CheckResult } from '#geometry/types.js';
import { analyzeGlb } from '#geometry/analyze-glb.js';
import { evaluateRequirement } from '#geometry/evaluate-requirement.js';

const multiNamedReplicad = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    const body = makeBaseBox(20, 20, 20);
    const orphan = makeBaseBox(5, 5, 5).translate(100, 0, 0);
    return [
      { shape: body, color: '#F5C518', name: 'BodyShell' },
      { shape: orphan, color: '#1F1F1F', name: 'CarryHandle' },
    ];
  }
`;

const multiNamedOcct = `
import { BRepPrimAPI_MakeBox, gp_Pnt } from 'opencascade.js';
export default function main() {
  const bodyMaker = new BRepPrimAPI_MakeBox(20, 20, 20);
  const body = bodyMaker.Shape();
  const handleOrigin = new gp_Pnt(100, 0, 0);
  const handleMaker = new BRepPrimAPI_MakeBox(handleOrigin, 5, 5, 5);
  const handle = handleMaker.Shape();
  handleOrigin.delete();
  bodyMaker.delete();
  handleMaker.delete();
  return [
    { shape: body, name: 'BodyShell', color: '#F5C518' },
    { shape: handle, name: 'CarryHandle', color: '#1F1F1F' },
  ];
}
`;

const twoYellowSeparatedScad = `color("yellow") cube([10, 10, 10]);
translate([50, 0, 0]) color("yellow") cube([10, 10, 10]);
`;

async function exportGlbForKernel(
  kernel: ReturnType<typeof replicad> | ReturnType<typeof opencascade> | ReturnType<typeof openscad>,
  filePath: string,
  code: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const runtime = defineRuntime({ kernels: [kernel], bundlers: [esbuild()] });
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

describe('multi-shape ShapeConfig names → GLB → spatial test feedback', () => {
  it('replicad: names round-trip into connectedComponents failure payload', async () => {
    const glb = await exportGlbForKernel(replicad(), '/robot.ts', multiNamedReplicad);
    const stats = await analyzeGlb(glb);
    const requirement: MeasurementTestRequirement = {
      id: 'cohesion',
      type: 'measurement',
      description: 'assembly is one solid',
      check: 'connectedComponents',
      expected: { count: 1 },
    };
    const result: CheckResult = evaluateRequirement(requirement, stats);
    if (result.passed) {
      throw new Error('expected failure');
    }
    if (result.check !== 'connectedComponents') {
      throw new Error(`expected connectedComponents, got ${result.check}`);
    }
    const primNames = result.failure.clusters.flatMap((c) => c.primitives.map((p) => p.name)).sort();
    expect(primNames).toContain('BodyShell');
    expect(primNames).toContain('CarryHandle');
    expect(result.failure.gaps.length).toBeGreaterThan(0);
    expect(result.failure.gaps[0]!.gapMm).toBeGreaterThan(0);
    expect(result.reason).toContain('CarryHandle');
    expect(result.suggestion).toContain('CarryHandle');
  }, 120_000);

  it('opencascade: names round-trip through XCAF → RWGltf_CafWriter → analyser', async () => {
    const glb = await exportGlbForKernel(opencascade(), '/robot.ts', multiNamedOcct);
    const stats = await analyzeGlb(glb);
    const requirement: MeasurementTestRequirement = {
      id: 'cohesion',
      type: 'measurement',
      description: 'assembly is one solid',
      check: 'connectedComponents',
      expected: { count: 1 },
    };
    const result: CheckResult = evaluateRequirement(requirement, stats);
    if (result.passed) {
      throw new Error('expected failure');
    }
    if (result.check !== 'connectedComponents') {
      throw new Error(`expected connectedComponents, got ${result.check}`);
    }
    const primNames = result.failure.clusters.flatMap((c) => c.primitives.map((p) => p.name)).sort();
    expect(primNames).toContain('BodyShell');
    expect(primNames).toContain('CarryHandle');
    expect(result.reason).toContain('CarryHandle');
    expect(result.suggestion).toContain('CarryHandle');
  }, 120_000);

  it('openscad: same-color disjoint cubes — connectedComponents, watertight, boundingBox (glTF meters)', async () => {
    const glb = await exportGlbForKernel(openscad(), '/parts.scad', twoYellowSeparatedScad);
    const stats = await analyzeGlb(glb);
    expect(stats.watertight).toBe(true);

    const boundingBoxRequest: MeasurementTestRequirement = {
      id: 'footprint_x',
      type: 'measurement',
      description: 'extent along X (0.06 m = 60 mm)',
      check: 'boundingBox',
      expected: { size: { x: 0.06 } },
      tolerance: 0.01,
    };
    expect(evaluateRequirement(boundingBoxRequest, stats).passed).toBe(true);

    const passTwoPieces: MeasurementTestRequirement = {
      id: 'two_lumps',
      type: 'measurement',
      description: 'two separate yellow chunks',
      check: 'connectedComponents',
      expected: { count: 2 },
    };
    expect(evaluateRequirement(passTwoPieces, stats).passed).toBe(true);

    const wantOneLump: MeasurementTestRequirement = {
      id: 'one_lump',
      type: 'measurement',
      description: 'single solid',
      check: 'connectedComponents',
      expected: { count: 1 },
    };
    const oneLumpResult = evaluateRequirement(wantOneLump, stats);
    if (oneLumpResult.passed) {
      throw new Error('expected failure when asserting 1 component');
    }
    if (oneLumpResult.check !== 'connectedComponents') {
      throw new Error(`expected connectedComponents, got ${oneLumpResult.check}`);
    }
    expect(oneLumpResult.failure.got).toBe(2);
    expect(oneLumpResult.failure.clusters.length).toBe(2);
    const primNames = oneLumpResult.failure.clusters.flatMap((c) => c.primitives.map((p) => p.name)).sort();
    expect(primNames.some((n) => n.includes('#part'))).toBe(true);
    expect(oneLumpResult.failure.gaps[0]!.gapMm).toBeGreaterThan(35);
    expect(oneLumpResult.failure.gaps[0]!.gapMm).toBeLessThan(45);
  }, 120_000);
});
