// @vitest-environment node
/**
 * Call-count regression tests for the Replicad kernel's render-with-edges and export paths
 * (cad-performance-policy Rule 3; wasm-kernel-call-batching-policy-blueprint P3).
 *
 * Replicad meshes faces and edges with Tau's native extractors (`ReplicadMeshExtractor`,
 * `ReplicadEdgeMeshExtractor`, `ReplicadPrototypeMeshExtractor`), one call per shape that returns
 * typed arrays. The tests spy on the OpenCASCADE bindings Tau's render code calls and assert that
 * those stay per shape while the model grows. Two known per-element paths are pinned at today's
 * counts until a rebuild of the `@taulabs/replicad-opencascadejs` fork batches them.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { TelemetryEntry } from '@taucad/runtime/types';
import { getOC } from 'replicad';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';

vi.setConfig({ testTimeout: 60_000 });

/** `copies` translated copies of one cylinder; `anisotropic` gives them a material that needs surface coordinates. */
const cylindersCode = `
  import { makeCylinder } from 'replicad';

  export const defaultParams = { copies: 2, anisotropic: false };

  export default function main(params: typeof defaultParams) {
    const cylinder = makeCylinder(10, 20);
    const material = params.anisotropic
      ? { extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.8 } } }
      : undefined;
    return Array.from({ length: params.copies }, (_, index) => ({
      name: 'Cylinder ' + index,
      shape: cylinder.clone().translateX(index * 30),
      ...(material ? { material } : {}),
    }));
  }
`;

const testClients = new Set<ReturnType<typeof createClient>>();

const createClient = () => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] }),
    files: { 'main.ts': cylindersCode },
  });
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

/** Spy on the OpenCASCADE bindings Tau's render, instancing and surface-coordinate code calls. */
const spyOnBindings = (): (() => Counts) => {
  const oc = getOC() as unknown as Record<string, Record<string, unknown> & { prototype: Record<string, unknown> }>;
  const statics = (className: string, method: string): MockInstance =>
    vi.spyOn(oc[className] as Record<string, (...arguments_: unknown[]) => unknown>, method);
  const members = (className: string, method: string): MockInstance =>
    vi.spyOn(oc[className]!.prototype as Record<string, (...arguments_: unknown[]) => unknown>, method);
  const spies: Record<string, MockInstance> = {
    'ReplicadMeshExtractor.extract': statics('ReplicadMeshExtractor', 'extract'),
    'ReplicadEdgeMeshExtractor.extract': statics('ReplicadEdgeMeshExtractor', 'extract'),
    'ReplicadPrototypeMeshExtractor.ExtractFaces': statics('ReplicadPrototypeMeshExtractor', 'ExtractFaces'),
    'ReplicadPrototypeMeshExtractor.ExtractEdges': statics('ReplicadPrototypeMeshExtractor', 'ExtractEdges'),
    'ReplicadShapeIdentity.Inspect': statics('ReplicadShapeIdentity', 'Inspect'),
    'ReplicadShapeIdentityInfo.MatrixValue': members('ReplicadShapeIdentityInfo', 'MatrixValue'),
    'ReplicadShapeHasher.HashCode': statics('ReplicadShapeHasher', 'HashCode'),
    'ReplicadShapeIdentity.IsPartner': statics('ReplicadShapeIdentity', 'IsPartner'),
    'gp_Trsf.Value': members('gp_Trsf', 'Value'),
    'Poly_Triangulation.UVNode': members('Poly_Triangulation', 'UVNode'),
    'BRepAdaptor_Surface.EvalD1': members('BRepAdaptor_Surface', 'EvalD1'),
    'ReplicadSurfaceCoordinates.Extract': statics('ReplicadSurfaceCoordinates', 'Extract'),
  };
  return () => Object.fromEntries(Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]));
};

type Measured = { render: Counts; glb: Counts; stl: Counts; step: Counts; coldGlb: Counts };

/** Explicit tolerances, so the mesh of each copy does not change with the model's size. */
const coarse = { linearTolerance: 0.1, angularTolerance: 10 };
const fine = { linearTolerance: 0.02, angularTolerance: 5 };

/** Evaluate, then count the binding calls of a render with edges and of GLB, STL and STEP exports. */
const measureCylinders = async (
  parameters: { copies: number; anisotropic: boolean },
  tessellation = coarse,
): Promise<Measured> => {
  const client = createClient();
  const document = client.open({ source: { path: 'main.ts' }, parameters, watch: false });
  try {
    const evaluated = await document.evaluation();
    expect(evaluated.superseded).toBe(false);

    const counted = async (operation: () => Promise<void>): Promise<Counts> => {
      const read = spyOnBindings();
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
    // A GLB at tolerances no render used: nothing is kept, so it meshes as the render did (N14).
    const coldGlb = await counted(async () => {
      const cold = { ...tessellation, linearTolerance: tessellation.linearTolerance * 3 };
      await expectExported(
        document.export('glb', { options: { tessellation: cold }, content: { includeEdges: true } }),
      );
    });
    return { render, glb, stl, step, coldGlb };
  } finally {
    document.close();
  }
};

const none: Counts = {
  'ReplicadMeshExtractor.extract': 0,
  'ReplicadEdgeMeshExtractor.extract': 0,
  'ReplicadPrototypeMeshExtractor.ExtractFaces': 0,
  'ReplicadPrototypeMeshExtractor.ExtractEdges': 0,
  'ReplicadShapeIdentity.Inspect': 0,
  'ReplicadShapeIdentityInfo.MatrixValue': 0,
  'ReplicadShapeHasher.HashCode': 0,
  'ReplicadShapeIdentity.IsPartner': 0,
  'gp_Trsf.Value': 0,
  'Poly_Triangulation.UVNode': 0,
  'BRepAdaptor_Surface.EvalD1': 0,
  'ReplicadSurfaceCoordinates.Extract': 0,
};

/**
 * Blueprint A19 (deferred: needs a `@taulabs/replicad-opencascadejs` rebuild that returns the
 * matrix in one call, charter D6): STEP product reuse inspects every shape's identity once, which
 * serializes and hashes its BRep, and then reads its 4 × 4 location matrix with one `MatrixValue`
 * call per entry.
 */
const identities = (copies: number): Counts => ({
  'ReplicadShapeIdentity.Inspect': copies,
  'ReplicadShapeIdentityInfo.MatrixValue': 16 * copies,
});

/**
 * Tessellation instancing reads no BRep content: one partner hash per shape, one `IsPartner`
 * check per shape after the first of its hash, and the 3 × 4 placement with one `gp_Trsf.Value`
 * call per entry (the same A19 deferral as `identities`).
 */
const occurrences = (copies: number): Counts => ({
  'ReplicadShapeHasher.HashCode': copies,
  'ReplicadShapeIdentity.IsPartner': copies - 1,
  'gp_Trsf.Value': 12 * copies,
});

/**
 * A GLB export after a render at the same tolerances (compute reuse on) composes the meshes the memo kept (N14): no
 * extraction and no surface-coordinate read, only the occurrence reads, with one more `IsPartner` check against the
 * memo's kept representative.
 */
const keptOccurrences = (copies: number): Counts => ({
  ...none,
  ...occurrences(copies),
  'ReplicadShapeIdentity.IsPartner': copies,
});

describe('Replicad kernel call counts', () => {
  let small: Measured;
  let large: Measured;
  let texturedCoarse: Measured;
  let texturedFine: Measured;

  beforeAll(async () => {
    small = await measureCylinders({ copies: 2, anisotropic: false });
    large = await measureCylinders({ copies: 6, anisotropic: false });
    texturedCoarse = await measureCylinders({ copies: 2, anisotropic: true }, coarse);
    texturedFine = await measureCylinders({ copies: 2, anisotropic: true }, fine);
  });

  it('should mesh faces and edges once per prototype on render with edges, and compose them on the GLB export', () => {
    // The copies share one prototype, so faces and edges are one native extraction each whatever
    // the copy count; only the per-shape occurrence reads (A19) grow with it.
    const meshed = {
      ...none,
      'ReplicadPrototypeMeshExtractor.ExtractFaces': 1,
      'ReplicadPrototypeMeshExtractor.ExtractEdges': 1,
    };
    expect({ small: small.render, large: large.render }).toEqual({
      small: { ...meshed, ...occurrences(2) },
      large: { ...meshed, ...occurrences(6) },
    });
    expect({ small: small.glb, large: large.glb }).toEqual({ small: keptOccurrences(2), large: keptOccurrences(6) });
    // A GLB at tolerances no render used meshes once per prototype, as the render did; its only extra call is the
    // partner check against the representative the memo already keeps.
    expect({ small: small.coldGlb, large: large.coldGlb }).toEqual({
      small: { ...small.render, 'ReplicadShapeIdentity.IsPartner': 2 },
      large: { ...large.render, 'ReplicadShapeIdentity.IsPartner': 6 },
    });
  });

  it('should export STL with no per-element binding call and STEP with only the identity reads', () => {
    expect({ small: small.stl, large: large.stl }).toEqual({ small: none, large: none });
    expect({ small: small.step, large: large.step }).toEqual({
      small: { ...none, ...identities(2) },
      large: { ...none, ...identities(6) },
    });
  });

  it('should read surface coordinates in one native call per prototype mesh, at any tolerance', () => {
    // Blueprint A4 (N13): an anisotropic or textured material used to read `UVNode` and `EvalD1`
    // once per prototype mesh vertex (290 coarse, 578 fine). `ReplicadSurfaceCoordinates.Extract`
    // (replicad-opencascadejs 0.23.0-beta.3) returns them in one call, whatever the vertex count.
    const meshed = {
      ...none,
      ...occurrences(2),
      'ReplicadPrototypeMeshExtractor.ExtractFaces': 1,
      'ReplicadPrototypeMeshExtractor.ExtractEdges': 1,
      'ReplicadSurfaceCoordinates.Extract': 1,
    };
    expect({ coarse: texturedCoarse.render, fine: texturedFine.render }).toEqual({ coarse: meshed, fine: meshed });
    expect(texturedCoarse.glb).toEqual(keptOccurrences(2));
    expect(texturedFine.glb).toEqual(keptOccurrences(2));
  });
});

/** A plate with its top face, and then its bottom face, as GeoSpec interfaces. */
const interfaceCode = `
  import { drawRoundedRectangle } from 'replicad';
  import { face } from '@taucad/replicad/annotations';

  export const defaultParams = { interfaces: 1 };

  export default function main(params: typeof defaultParams) {
    const candidates = {
      top: face((f) => f.inPlane('XY', 10)),
      bottom: face((f) => f.inPlane('XY', 0)),
    };
    const interfaces = Object.fromEntries(Object.entries(candidates).slice(0, params.interfaces));
    return { shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10), name: 'base', interfaces };
  }
`;

describe('Replicad STEP interface export call counts', () => {
  /**
   * Count `TopExp_Explorer.Next` across one STEP export.
   * @param interfaces - How many of the plate's faces are interfaces.
   * @returns The number of explorer steps.
   */
  const measureStep = async (interfaces: number): Promise<number> => {
    const client = createTestRuntimeClient({
      runtime: defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] }),
      files: { 'main.ts': interfaceCode },
    });
    testClients.add(client);
    const document = client.open({ source: { path: 'main.ts' }, parameters: { interfaces }, watch: false });
    try {
      const evaluated = await document.evaluation();
      expect(evaluated.superseded).toBe(false);
      const next = vi.spyOn(getOC().TopExp_Explorer.prototype, 'Next');
      await expectExported(document.export('step'));
      return next.mock.calls.length;
    } finally {
      vi.restoreAllMocks();
      document.close();
    }
  };

  it('should walk the product faces once per export, however many interfaces it has', async () => {
    const steps = [await measureStep(0), await measureStep(1), await measureStep(2)];

    // Blueprint A18 (WP9, charter B9): one `TopExp_Explorer` walk per product collects every
    // interface face, stopping at the highest `faceIndex`. No interface makes no walk; the top
    // face (index 5) and then the top and the bottom face (index 4) both stop at index 5.
    expect(steps).toEqual([0, 5, 5]);
  });
});

describe('Replicad ocTracing summary', () => {
  /** Telemetry is posted after each operation's reply; give the batch time to arrive. */
  const settleTelemetry = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

  it('should flush an oc.summary after run-main, after a render and after an export', async () => {
    const telemetry: TelemetryEntry[] = [];
    const client = createTestRuntimeClient({
      runtime: defineRuntime({
        kernels: [replicadKernel({ wasm: 'single', ocTracing: 'summary' })],
        bundlers: [esbuildBundler()],
      }),
      files: { 'main.ts': cylindersCode },
    });
    testClients.add(client);
    client.on('telemetry', (batch) => {
      telemetry.push(...batch.entries);
    });
    const document = client.open({ source: { path: 'main.ts' }, parameters: { anisotropic: true }, watch: false });
    const view = document.view('model', {
      options: { tessellation: coarse },
      content: { includeEdges: true },
    });
    const outcome = await view.rendering();
    view.close();
    if (outcome.superseded) {
      throw new Error('render was superseded');
    }
    assertRenderingSuccess(outcome.rendering);
    await expectExported(document.export('step'));
    document.close();
    await settleTelemetry();

    const parents = new Map(telemetry.map((entry) => [entry.detail?.['spanId'], entry.name]));
    const summaries = telemetry.filter((entry) => entry.name === 'oc.summary');
    // Run-main flushes inside its span; render flushes inside its render-output span; export flushes as it
    // settles. Before, render and export calls were held over to the next evaluation's summary.
    expect(summaries.map((entry) => parents.get(entry.detail?.['parentSpanId']))).toEqual([
      'replicad.run-main',
      'replicad.render-output',
      'kernel.export-compute',
    ]);
    // The anisotropic material makes render read surface coordinates through OpenCASCADE (one native call since
    // replicad-opencascadejs 0.23.0-beta.3; the per-vertex loop's summary counted 9), so each phase has calls.
    // Render's count includes one identity `TopLoc_Location` per shape for its partner hash. Run-main makes 10 calls
    // since `@taulabs/replicad` 1.2.0-beta.1 builds each operation once (taucad/replicad#9), and the live tier's cost
    // estimate of the entry it stores walks its faces (a `TopExp_Explorer`, `More` and `Next`: 3 more).
    expect(summaries.map((entry) => entry.detail?.['total.calls'])).toEqual([13, 2, 13]);
  });
});
