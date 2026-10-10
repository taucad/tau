// @vitest-environment node
/* oxlint-disable new-cap -- OpenCASCADE exposes PascalCase C++ methods */
/**
 * OpenCASCADE (libcascade) — two runtime clients in one JavaScript realm.
 *
 * `createNodeClient` builds its kernel worker in the caller's realm. Each
 * client must keep evaluating, rendering and exporting through the
 * OpenCASCADE instance that produced its shapes after another client in the
 * realm initialised (kernel-realm-shared-state blueprint, WP-A4).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getBounds } from '@gltf-transform/core';
import { createNodeIo } from '@taucad/geometry-core';
import type * as OcctCore from '@taucad/occt-core';
import type { ExportResult, Rendering } from '@taucad/runtime';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuildBundler } from '@taucad/esbuild';
import type { OpenCascadeInstance } from 'libcascade/init';
import { opencascadeKernel } from '#opencascade.kernel.js';

const occt = vi.hoisted(() => ({
  instances: [] as unknown[],
  /** Creates an uncounted instance from the first kernel's build, for re-importing exported STEP. */
  createProbe: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock('@taucad/occt-core', async (importOriginal) => {
  const actual = await importOriginal<typeof OcctCore>();
  const initOcct: typeof actual.initOcct = async (...arguments_) => {
    const [wasmUrl, bindingsFactory] = arguments_;
    occt.createProbe ??= async () => actual.initOcct(wasmUrl, bindingsFactory);
    const instance = await actual.initOcct(...arguments_);
    occt.instances.push(instance);
    return instance;
  };
  return { ...actual, initOcct };
});

// =============================================================================
// Fixtures and helpers
// =============================================================================

const boxSource = (width: number): string => `import { BRepPrimAPI_MakeBox, gp_Pnt } from 'libcascade';
export default function main() {
  return new BRepPrimAPI_MakeBox(new gp_Pnt(0, 0, 0), ${width}, 20, 30).Shape();
}
`;

const createRuntime = () =>
  defineRuntime({ kernels: [opencascadeKernel({ wasm: 'full', ocTracing: 'off' })], bundlers: [esbuildBundler()] });

type NodeClient = Awaited<ReturnType<typeof createNodeClient<ReturnType<typeof createRuntime>>>>;
type NodeDocument = ReturnType<NodeClient['open']>;

const roots: string[] = [];

const createProject = async (source: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-libcascade-realm-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), source);
  return root;
};

const renderDocument = async (document: NodeDocument, context: string): Promise<Rendering> => {
  const view = document.view();
  try {
    const outcome = await view.rendering();
    if (outcome.superseded) {
      throw new Error(`${context}: expected a current rendering, got a superseded one`);
    }
    if (!outcome.rendering.success) {
      expect.fail(
        `${context}: expected a successful rendering, got issues ${JSON.stringify(outcome.rendering.issues)}`,
      );
    }
    return outcome.rendering;
  } finally {
    view.close();
  }
};

const exportBytes = (result: ExportResult, context: string): Uint8Array<ArrayBuffer> => {
  if (!result.success) {
    expect.fail(`${context}: expected a successful export, got issues ${JSON.stringify(result.issues)}`);
  }
  const [file] = result.files;
  expect(file, `${context}: expected one exported file`).toBeDefined();
  return file.bytes;
};

/** GLB is Y-up metres; compare the sorted extents in millimetres. */
const expectGlbBox = async (result: ExportResult, width: number, context: string): Promise<void> => {
  const io = await createNodeIo();
  const document = await io.readBinary(exportBytes(result, context));
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  expect(scene, `${context}: expected a glTF scene`).toBeDefined();
  const { min, max } = getBounds(scene!);
  const extents = [0, 1, 2].map((axis) => (max[axis]! - min[axis]!) * 1000).sort((left, right) => left - right);
  const expected = [width, 20, 30].sort((left, right) => left - right);
  for (const [axis, value] of extents.entries()) {
    expect(value, `${context}: sorted extent ${axis}`).toBeCloseTo(expected[axis]!, 2);
  }
};

let stepProbe: Promise<OpenCascadeInstance> | undefined;
let stepProbeCounter = 0;

/** Re-import an exported STEP into a private OpenCASCADE instance and measure its volume. */
const expectStepVolume = async (result: ExportResult, volume: number, context: string): Promise<void> => {
  const bytes = exportBytes(result, context);
  expect(occt.createProbe, `${context}: expected a kernel to have initialised OpenCASCADE`).toBeDefined();
  stepProbe ??= occt.createProbe!() as Promise<OpenCascadeInstance>;
  const oc = await stepProbe;
  stepProbeCounter += 1;
  const path = `/realm-probe-${stepProbeCounter}.step`;
  oc.FS.writeFile(path, bytes);
  const reader = new oc.STEPControl_Reader();
  const properties = new oc.GProp_GProps();
  try {
    expect(reader.ReadFile(path), `${context}: STEP read status`).toBe(oc.IFSelect_ReturnStatus.IFSelect_RetDone);
    reader.TransferRoots();
    const shape = reader.OneShape();
    try {
      expect(shape.IsNull(), `${context}: re-imported STEP shape is null`).toBe(false);
      oc.BRepGProp.VolumeProperties(shape, properties, false, false, false);
      expect(properties.Mass(), `${context}: re-imported STEP volume`).toBeCloseTo(volume, 1);
    } finally {
      shape.delete();
    }
  } finally {
    properties.delete();
    reader.delete();
    oc.FS.unlink(path);
  }
};

// =============================================================================
// WP-A4
// =============================================================================

describe('OpenCASCADE — two clients in one realm', { timeout: 300_000 }, () => {
  let rootA: string;
  let clientA: NodeClient;
  let clientB: NodeClient;
  let instancesAtStart = 0;

  beforeAll(async () => {
    instancesAtStart = occt.instances.length;
    rootA = await createProject(boxSource(10));
    const rootB = await createProject(boxSource(11));
    clientA = await createNodeClient({ runtime: createRuntime(), projectPath: rootA });
    clientB = await createNodeClient({ runtime: createRuntime(), projectPath: rootB });

    // A initialises and evaluates before B exists; B then initialises in the same realm.
    const documentA = clientA.open({ source: { path: 'main.ts' } });
    await renderDocument(documentA, 'render A before B');
    documentA.close();
    const documentB = clientB.open({ source: { path: 'main.ts' } });
    await renderDocument(documentB, 'render B');
    documentB.close();
  }, 120_000);

  afterAll(async () => {
    await Promise.all([clientA.shutdown(), clientB.shutdown()]);
    await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  }, 120_000);

  it('should initialise one OpenCASCADE instance for both clients', () => {
    expect(occt.instances.length - instancesAtStart).toBe(1);
  });

  it("should export a re-importable STEP from client B, the realm's last initialised client", async () => {
    const documentB = clientB.open({ source: { path: 'main.ts' }, watch: false });
    try {
      await expectStepVolume(await documentB.export('step'), 11 * 20 * 30, 'STEP of B');
    } finally {
      documentB.close();
    }
  });

  describe('a model client A edited after client B initialised', () => {
    let edited: NodeDocument;

    beforeAll(async () => {
      await writeFile(join(rootA, 'main.ts'), boxSource(12));
      edited = clientA.open({ source: { path: 'main.ts' }, watch: false });
    });

    afterAll(() => {
      edited.close();
    });

    it('should render', async () => {
      await renderDocument(edited, 'render A edited after B');
    });

    it('should export a re-importable STEP', async () => {
      await expectStepVolume(await edited.export('step'), 12 * 20 * 30, 'STEP of A edited after B');
    });

    it('should export GLB', async () => {
      await expectGlbBox(await edited.export('glb'), 12, 'GLB of A edited after B');
    });
  });
});
