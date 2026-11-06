// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * Call-count regression tests for the OpenCascade kernel's render-with-edges and export paths
 * (cad-performance-policy Rule 3; wasm-kernel-call-batching-policy-blueprint P3, P4), and the
 * `ocTracing` summary after render and export.
 *
 * Each test spies on the libcascade methods Tau's edge extraction calls and counts them across one
 * render or export. Surfaces and the STL, STEP and GLB writers are one native call each; the
 * B-rep edge overlay still reads every polygon node through embind, so its counts are pinned at
 * today's numbers until a libcascade build with a batched edge reader lands.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type * as KernelModule from '@taucad/runtime/kernel';
import type { TelemetryEntry } from '@taucad/runtime/types';
import type { OpenCascadeInstance } from 'libcascade/init';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { opencascadeKernel } from '#opencascade.kernel.js';

vi.setConfig({ testTimeout: 60_000 });

/** The `libcascade` module object the kernel registered most recently (its OpenCascade instance). */
const registered = vi.hoisted(() => ({ libcascade: undefined as unknown }));

vi.mock('@taucad/runtime/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof KernelModule>();
  return {
    ...actual,
    registerKernelModule(...arguments_: Parameters<typeof actual.registerKernelModule>) {
      if (arguments_[1].name === 'libcascade') {
        registered.libcascade = arguments_[1].exports;
      }
      actual.registerKernelModule(...arguments_);
    },
  };
});

/** A cylinder: three B-rep edges (two circles and a seam) whose polygons grow as the tolerance tightens. */
const cylinderCode = `
import { BRepPrimAPI_MakeCylinder } from 'libcascade';
export default function main() {
  return new BRepPrimAPI_MakeCylinder(10, 20).Shape();
}`;

const coarse = { linearTolerance: 0.5, angularTolerance: 30 };
const fine = { linearTolerance: 0.01, angularTolerance: 5 };

const testClients = new Set<ReturnType<typeof createClient>>();

const createClient = (options?: { ocTracing?: 'off' | 'summary'; telemetry?: TelemetryEntry[] }) => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({
      kernels: [opencascadeKernel({ ocTracing: options?.ocTracing ?? 'off' })],
      bundlers: [esbuildBundler()],
    }),
    files: { 'main.ts': cylinderCode },
  });
  if (options?.telemetry) {
    const { telemetry } = options;
    client.on('telemetry', (batch) => {
      telemetry.push(...batch.entries);
    });
  }
  testClients.add(client);
  return client;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...testClients].map(async (client) => client.shutdown()));
  testClients.clear();
});

type Counts = Record<string, number>;

/**
 * Await an export and assert it succeeded.
 * @param pending - The export in flight.
 */
const expectExported = async (pending: Promise<{ success: boolean }>): Promise<void> => {
  const exported = await pending;
  expect(exported.success).toBe(true);
};

/** Spy on the libcascade members `extractShapeEdges` calls per edge and per polygon node. */
const spyOnEdgeReads = (): (() => Counts) => {
  const oc = registered.libcascade as OpenCascadeInstance | undefined;
  if (!oc) {
    throw new Error('expected the kernel to register libcascade');
  }
  const spies: Record<string, MockInstance> = {
    'BRep_Tool.PolygonOnTriangulation': vi.spyOn(oc.BRep_Tool, 'PolygonOnTriangulation'),
    'gp_Trsf.Value': vi.spyOn(oc.gp_Trsf.prototype, 'Value'),
    'Poly_PolygonOnTriangulation.Node': vi.spyOn(oc.Poly_PolygonOnTriangulation.prototype, 'Node'),
    'Poly_Triangulation.Node': vi.spyOn(oc.Poly_Triangulation.prototype, 'Node'),
    'GCPnts_TangentialDeflection.Value': vi.spyOn(oc.GCPnts_TangentialDeflection.prototype, 'Value'),
    'gp_Pnt.X': vi.spyOn(oc.gp_Pnt.prototype, 'X'),
  };
  return () => Object.fromEntries(Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]));
};

type Measured = { render: Counts; glb: Counts; stl: Counts; step: Counts };

/** Evaluate, then count the edge reads of a render with edges and of GLB, STL and STEP exports. */
const measureCylinder = async (tessellation: typeof coarse): Promise<Measured> => {
  const client = createClient();
  const document = client.open({ source: { path: 'main.ts' }, watch: false });
  try {
    const evaluated = await document.evaluation();
    expect(evaluated.superseded).toBe(false);

    const counted = async (operation: () => Promise<void>): Promise<Counts> => {
      const read = spyOnEdgeReads();
      try {
        await operation();
        return read();
      } finally {
        vi.restoreAllMocks();
      }
    };
    const render = await counted(async () => {
      const view = document.view('model', { options: { tessellation }, content: { includeEdges: true } });
      const outcome = await view.rendering();
      view.close();
      if (outcome.superseded) {
        throw new Error('render was superseded');
      }
      assertRenderingSuccess(outcome.rendering);
    });
    const glb = await counted(async () => {
      await expectExported(document.export('glb', { options: { tessellation }, content: { includeEdges: true } }));
    });
    const stl = await counted(async () => {
      await expectExported(document.export('stl', { options: { tessellation } }));
    });
    const step = await counted(async () => {
      await expectExported(document.export('step'));
    });
    return { render, glb, stl, step };
  } finally {
    document.close();
  }
};

const none: Counts = {
  'BRep_Tool.PolygonOnTriangulation': 0,
  'gp_Trsf.Value': 0,
  'Poly_PolygonOnTriangulation.Node': 0,
  'Poly_Triangulation.Node': 0,
  'GCPnts_TangentialDeflection.Value': 0,
  'gp_Pnt.X': 0,
};

describe('OpenCascade kernel call counts', () => {
  let coarseCounts: Measured;
  let fineCounts: Measured;

  beforeAll(async () => {
    coarseCounts = await measureCylinder(coarse);
    fineCounts = await measureCylinder(fine);
  });

  it('should record per-node edge reads on the render-with-edges and GLB export paths', () => {
    // Blueprint A1-A3 (WP1, deferred: needs a libcascade build with a batched edge reader, charter
    // D6). Each edge looks up its polygon and reads the location's 12 matrix values (A3); each
    // polygon node then costs `Poly_PolygonOnTriangulation.Node`, `Poly_Triangulation.Node` (a new
    // `gp_Pnt`) and `X/Y/Z` (A1). The node counts grow with the tessellation while the cylinder keeps
    // its three edges. The deferred binding reads every edge in one call.
    const edges = { ...none, 'BRep_Tool.PolygonOnTriangulation': 3, 'gp_Trsf.Value': 36 };
    expect({ coarse: coarseCounts.render, fine: fineCounts.render }).toEqual({
      coarse: { ...edges, 'Poly_PolygonOnTriangulation.Node': 52, 'Poly_Triangulation.Node': 52, 'gp_Pnt.X': 52 },
      fine: { ...edges, 'Poly_PolygonOnTriangulation.Node': 292, 'Poly_Triangulation.Node': 292, 'gp_Pnt.X': 292 },
    });
    expect(coarseCounts.glb).toEqual(coarseCounts.render);
    expect(fineCounts.glb).toEqual(fineCounts.render);
  });

  it('should export STL and STEP without reading any edge', () => {
    expect({ coarse: coarseCounts.stl, fine: fineCounts.stl }).toEqual({ coarse: none, fine: none });
    expect({ coarse: coarseCounts.step, fine: fineCounts.step }).toEqual({ coarse: none, fine: none });
  });
});

describe('OpenCascade ocTracing summary', () => {
  /** Telemetry is posted after each operation's reply; give the batch time to arrive. */
  const settleTelemetry = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

  it('should flush an oc.summary after run-main, after a render and after an export', async () => {
    const telemetry: TelemetryEntry[] = [];
    const client = createClient({ ocTracing: 'summary', telemetry });
    const document = client.open({ source: { path: 'main.ts' }, watch: false });
    const view = document.view('model', { options: { tessellation: coarse }, content: { includeEdges: true } });
    const outcome = await view.rendering();
    view.close();
    if (outcome.superseded) {
      throw new Error('render was superseded');
    }
    assertRenderingSuccess(outcome.rendering);
    await expectExported(
      document.export('glb', { options: { tessellation: coarse }, content: { includeEdges: true } }),
    );
    document.close();
    await settleTelemetry();

    const parents = new Map(telemetry.map((entry) => [entry.detail?.['spanId'], entry.name]));
    const summaries = telemetry.filter((entry) => entry.name === 'oc.summary');
    // Run-main flushes after its span closes; render flushes inside its mesh span; export flushes as it settles.
    expect(summaries.map((entry) => parents.get(entry.detail?.['parentSpanId']))).toEqual([
      'kernel.compute',
      'opencascade.mesh-to-gltf',
      'kernel.export-compute',
    ]);
    // One mesher and one glTF writer per render or export. `TopLoc_Location` is one for the shape's
    // root plus one per edge (A3), so the summary also shows the edge overlay's per-edge cost.
    const meshed: unknown = expect.objectContaining({
      'BRepMesh_IncrementalMesh.calls': 1,
      'RWGltf_CafWriter.calls': 1,
      'TopLoc_Location.calls': 4,
      'total.calls': 17,
    });
    expect(summaries.map((entry) => entry.detail)).toEqual([
      expect.objectContaining({ 'BRepPrimAPI_MakeCylinder.calls': 1, 'total.calls': 1 }),
      meshed,
      meshed,
    ]);
  });
});
