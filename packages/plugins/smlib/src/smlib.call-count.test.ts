// @vitest-environment node
/**
 * Call-count regression tests for the SMLib kernel's render-with-edges, drawing and export paths
 * (cad-performance-policy Rule 3; wasm-kernel-call-batching-policy-blueprint P3).
 *
 * Each test spies on the public `@classcad/smlibwasm` methods Tau's render code calls, drives the
 * kernel through a real runtime client, and asserts how many calls Tau made. Paths that are already
 * batched assert O(shapes): the count does not change when the fixture's element count grows. Known
 * per-element paths pin today's counts, named by blueprint finding and the work package that will
 * lower them; a later change that lowers a count updates the number here.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import * as smlib from '@classcad/smlibwasm';
import { smlibKernel } from '#smlib.kernel.js';

vi.setConfig({ testTimeout: 30_000 });

/** A filleted plate with an n × n grid of through holes: edges grow with n, shapes stay one. */
const plateCode = `
  import { Box, Cylinder, GridLocations, Z } from '@classcad/smlibwasm';

  export const defaultParams = { holes: 2 };

  export default function main(params: typeof defaultParams) {
    const plate = Box(80, 60, 10);
    const rounded = plate.fillet(plate.edges().parallelTo(Z), 3);
    const pitch = 40 / params.holes;
    const holes = GridLocations(pitch, pitch, params.holes, params.holes).mul(Cylinder(pitch / 6, 20));
    return rounded.cut(holes);
  }
`;

/** One circular drawing edge of the given radius. */
const circleCode = `
  import { Circle } from '@classcad/smlibwasm';

  export const defaultParams = { radius: 10 };

  export default function main(params: typeof defaultParams) {
    return { shape: Circle(params.radius).edges()[0], name: 'Circle' };
  }
`;

type Counts = Record<string, number>;

/** Spy on the public smlibwasm members Tau's render, edge and drawing code calls. */
const spyOnSmlib = (): (() => Counts) => {
  const spies: Record<string, MockInstance> = {
    'Edge.pointAt': vi.spyOn(smlib.Edge.prototype, 'pointAt'),
    'Edge.start': vi.spyOn(smlib.Edge.prototype, 'start', 'get'),
    'Edge.end': vi.spyOn(smlib.Edge.prototype, 'end', 'get'),
    'Edge.isSeam': vi.spyOn(smlib.Edge.prototype, 'isSeam', 'get'),
    'Edge.bbox': vi.spyOn(smlib.Edge.prototype, 'bbox'),
    'Edge.distanceTo': vi.spyOn(smlib.Edge.prototype, 'distanceTo'),
    'Vertex.x': vi.spyOn(smlib.Vertex.prototype, 'x', 'get'),
  };
  return () => Object.fromEntries(Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]));
};

const createClient = (files: Record<string, string>) =>
  createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [smlibKernel()], bundlers: [esbuildBundler()] }),
    files,
  });

type Measured = { render: Counts; glb: Counts; step: Counts };

/** Evaluate, then count calls made by a render with edges, a GLB export with edges and a STEP export. */
const measurePlate = async (holes: number): Promise<Measured> => {
  const client = createClient({ 'plate.ts': plateCode });
  const document = client.open({ source: { path: 'plate.ts' }, parameters: { holes }, watch: false });
  try {
    const evaluated = await document.evaluation();
    expect(evaluated.superseded).toBe(false);

    let read = spyOnSmlib();
    const view = document.view('model', { content: { includeEdges: true } });
    const outcome = await view.rendering();
    view.close();
    if (outcome.superseded) {
      throw new Error('render was superseded');
    }
    assertRenderingSuccess(outcome.rendering);
    const render = read();
    vi.restoreAllMocks();

    read = spyOnSmlib();
    const glbResult = await document.export('glb', { content: { includeEdges: true } });
    expect(glbResult.success).toBe(true);
    const glb = read();
    vi.restoreAllMocks();

    read = spyOnSmlib();
    const stepResult = await document.export('step');
    expect(stepResult.success).toBe(true);
    const step = read();
    return { render, glb, step };
  } finally {
    vi.restoreAllMocks();
    document.close();
    await client.shutdown();
  }
};

/** Count calls made while evaluating one circle drawing (drawings are sampled at evaluation). */
const measureCircleDrawing = async (radius: number): Promise<Counts> => {
  const client = createClient({ 'circle.ts': circleCode });
  const read = spyOnSmlib();
  const document = client.open({ source: { path: 'circle.ts' }, parameters: { radius }, watch: false });
  try {
    const evaluated = await document.evaluation();
    if (evaluated.superseded || !evaluated.evaluation.success) {
      throw new Error('circle drawing did not evaluate');
    }
    return read();
  } finally {
    vi.restoreAllMocks();
    document.close();
    await client.shutdown();
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

/** No call at all: the path reads none of the spied members. */
const none: Counts = {
  'Edge.pointAt': 0,
  'Edge.start': 0,
  'Edge.end': 0,
  'Edge.isSeam': 0,
  'Edge.bbox': 0,
  'Edge.distanceTo': 0,
  'Vertex.x': 0,
};

describe('SMLib kernel call counts', () => {
  let small: Measured;
  let large: Measured;

  beforeAll(async () => {
    // 2 × 2 holes: 32 edges and 24 vertices; 4 × 4 holes: 56 edges and 48 vertices.
    small = await measurePlate(2);
    large = await measurePlate(4);
  });

  it('should record per-edge calls on the render-with-edges and GLB export paths', () => {
    // Blueprint A8 (WP4, charter B3): `edge.start` + `edge.end` per edge and the x/y/z of every
    // B-rep vertex, read once per render to match mesh chains to edges by their end vertices. B3
    // replaces them with one `ext.brep_dump` (or `Edge.vertices()`) per body, so these become
    // independent of the hole count. A7 (`isSeam` and `pointAt` for edges the mesh does not
    // bound) and A9 (`bbox` + `distanceTo` for ambiguous chains) stay at zero on this plate.
    expect({ small: small.render, large: large.render }).toEqual({
      small: { ...none, 'Edge.start': 32, 'Edge.end': 32, 'Vertex.x': 24 },
      large: { ...none, 'Edge.start': 56, 'Edge.end': 56, 'Vertex.x': 48 },
    });
    // The GLB export draws edges through the same path, so it pins the same counts.
    expect(small.glb).toEqual(small.render);
    expect(large.glb).toEqual(large.render);
  });

  it('should write STEP without any per-edge call', () => {
    // STEP is one `toStep` per export: no edge or vertex is read, whatever the hole count.
    expect({ small: small.step, large: large.step }).toEqual({ small: none, large: none });
  });

  it('should record per-sample calls when a drawing is sampled', async () => {
    const small = await measureCircleDrawing(10);
    const large = await measureCircleDrawing(50);

    // Blueprint A6 (WP3, charter B4): a drawing edge is sampled by bisection with one
    // `Edge.pointAt` per sample, so the count grows with the curve's size at the 0.01 mm print
    // tolerance. B4 reads the curve once with `ext.curve_data(curve, nurbs=true)` and evaluates it in
    // JavaScript: one kernel call per edge, whatever the radius.
    expect({ small, large }).toEqual({
      small: { ...none, 'Edge.pointAt': 257 },
      large: { ...none, 'Edge.pointAt': 513 },
    });
  });
});
