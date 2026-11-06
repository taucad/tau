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
    'Poly_Triangulation.UVNode': members('Poly_Triangulation', 'UVNode'),
    'BRepAdaptor_Surface.EvalD1': members('BRepAdaptor_Surface', 'EvalD1'),
  };
  return () => Object.fromEntries(Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]));
};

type Measured = { render: Counts; glb: Counts; stl: Counts; step: Counts };

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
    return { render, glb, stl, step };
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
  'Poly_Triangulation.UVNode': 0,
  'BRepAdaptor_Surface.EvalD1': 0,
};

/**
 * Blueprint A19 (deferred: needs a `@taulabs/replicad-opencascadejs` rebuild that returns the
 * matrix in one call, charter D6): every shape's identity is inspected once, which is per shape,
 * but its 4 × 4 location matrix is then read with one `MatrixValue` call per entry.
 */
const identities = (copies: number): Counts => ({
  'ReplicadShapeIdentity.Inspect': copies,
  'ReplicadShapeIdentityInfo.MatrixValue': 16 * copies,
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

  it('should mesh faces and edges once per prototype on the render-with-edges and GLB export paths', () => {
    // The copies share one prototype, so faces and edges are one native extraction each whatever
    // the copy count; only the per-shape identity reads (A19) grow with it.
    const meshed = {
      ...none,
      'ReplicadPrototypeMeshExtractor.ExtractFaces': 1,
      'ReplicadPrototypeMeshExtractor.ExtractEdges': 1,
    };
    expect({ small: small.render, large: large.render }).toEqual({
      small: { ...meshed, ...identities(2) },
      large: { ...meshed, ...identities(6) },
    });
    expect({ small: small.glb, large: large.glb }).toEqual({ small: small.render, large: large.render });
  });

  it('should export STL with no per-element binding call and STEP with only the identity reads', () => {
    expect({ small: small.stl, large: large.stl }).toEqual({ small: none, large: none });
    expect({ small: small.step, large: large.step }).toEqual({
      small: { ...none, ...identities(2) },
      large: { ...none, ...identities(6) },
    });
  });

  it('should record per-vertex surface-coordinate calls for a material that needs them', () => {
    // Blueprint A4 (deferred: needs UV and D1U/D1V buffers in the fork's mesh extractor, charter
    // D6): an anisotropic or textured material reads `UVNode` and `EvalD1` once per prototype mesh
    // vertex, so the count grows as the tolerance tightens.
    const meshed = {
      ...none,
      ...identities(2),
      'ReplicadPrototypeMeshExtractor.ExtractFaces': 1,
      'ReplicadPrototypeMeshExtractor.ExtractEdges': 1,
    };
    expect({ coarse: texturedCoarse.render, fine: texturedFine.render }).toEqual({
      coarse: { ...meshed, 'Poly_Triangulation.UVNode': 290, 'BRepAdaptor_Surface.EvalD1': 290 },
      fine: { ...meshed, 'Poly_Triangulation.UVNode': 578, 'BRepAdaptor_Surface.EvalD1': 578 },
    });
    expect(texturedCoarse.glb).toEqual(texturedCoarse.render);
    expect(texturedFine.glb).toEqual(texturedFine.render);
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

  it('should record a face walk per interface', async () => {
    const steps = [await measureStep(0), await measureStep(1), await measureStep(2)];

    // Blueprint A18 (WP9, charter B9): each face interface walks the product's faces with a new
    // `TopExp_Explorer` to find its `faceIndex`, so the walk repeats per interface. B9 walks the
    // faces once per export into a cached list.
    // No interface, the top face (index 5), then the top and the bottom face (index 4): one walk each.
    expect(steps).toEqual([0, 5, 9]);
  });
});
