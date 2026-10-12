// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- OpenCASCADE bindings and file names keep their native spelling */
/* oxlint-disable new-cap -- OpenCASCADE exposes PascalCase C++ methods */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
/**
 * Replicad — several runtime clients in one JavaScript realm.
 *
 * `createNodeClient` and `createTestRuntimeClient` build their kernel worker in
 * the caller's realm, so every client shares replicad's module-level `setOC`
 * binding and the runtime's built-in module registry. Each client must still
 * evaluate, render and export through the OpenCASCADE instance that produced
 * its shapes, and its bundles must resolve its own `replicad` facade
 * (kernel-realm-shared-state blueprint, WP-A3 and WP-A6).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getBounds } from '@gltf-transform/core';
import { createNodeIo } from '@taucad/geometry-core';
import type * as OcctCore from '@taucad/occt-core';
import { createRuntimeClient } from '@taucad/runtime';
import type { ExportResult, Rendering, ViewUpdateOutcome } from '@taucad/runtime';
import type { TelemetryEntry } from '@taucad/runtime/types';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { createNodeClient } from '@taucad/runtime/node';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import { webSocketHost } from '@taucad/runtime/transport/websocket-host';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { createGeometryTestHelpers, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { replicadKernel } from '#replicad.kernel.js';

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

type Size = readonly [number, number, number];
type KernelOptions = Parameters<typeof replicadKernel>[0];

const geometryHelpers = createGeometryTestHelpers();

const boxSource = (width: number): string => `import { makeBaseBox } from 'replicad';
export default function main() {
  return makeBaseBox(${width}, 20, 30);
}
`;

const boxSize = (width: number): Size => [width, 20, 30];
const boxVolume = (width: number): number => width * 20 * 30;

const createRuntime = (options?: KernelOptions) =>
  defineRuntime({ kernels: [replicadKernel({ wasm: 'single', ...options })], bundlers: [esbuildBundler()] });

type NodeClient = Awaited<ReturnType<typeof createNodeClient<ReturnType<typeof createRuntime>>>>;
type NodeDocument = ReturnType<NodeClient['open']>;

const roots: string[] = [];

const createProject = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-replicad-realm-'));
  roots.push(root);
  await Promise.all(Object.entries(files).map(async ([path, source]) => writeFile(join(root, path), source)));
  return root;
};

const removeProjects = async (): Promise<void> => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
};

/** Render a document's default view and return the settled rendering. */
/** The document surface these tests use, shared by every client type. */
type RenderableDocument = {
  view(): { rendering(): Promise<ViewUpdateOutcome>; close(): void };
};

const renderDocument = async (document: RenderableDocument): Promise<Rendering> => {
  const view = document.view();
  try {
    const outcome = await view.rendering();
    if (outcome.superseded) {
      throw new Error('Expected a current rendering, got a superseded one');
    }
    return outcome.rendering;
  } finally {
    view.close();
  }
};

const expectSuccessfulRendering = (rendering: Rendering, context: string): void => {
  if (!rendering.success) {
    expect.fail(`${context}: expected a successful rendering, got issues ${JSON.stringify(rendering.issues)}`);
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

const sortedSize = (min: ArrayLike<number>, max: ArrayLike<number>, scale: number): number[] =>
  [0, 1, 2].map((axis) => (max[axis]! - min[axis]!) * scale).sort((left, right) => left - right);

const expectSize = (actual: number[], expected: Size, context: string): void => {
  const sortedExpected = [...expected].sort((left, right) => left - right);
  for (const [axis, value] of actual.entries()) {
    expect(value, `${context}: sorted extent ${axis}`).toBeCloseTo(sortedExpected[axis]!, 2);
  }
};

/** GLB is Y-up metres; compare the sorted extents in millimetres. */
const expectGlbBox = async (result: ExportResult, size: Size, context: string): Promise<void> => {
  const io = await createNodeIo();
  const document = await io.readBinary(exportBytes(result, context));
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  expect(scene, `${context}: expected a glTF scene`).toBeDefined();
  const { min, max } = getBounds(scene!);
  expectSize(sortedSize(min, max, 1000), size, context);
};

/** Binary or ASCII STL, millimetres. */
const expectStlBox = (result: ExportResult, size: Size, context: string): void => {
  const bytes = exportBytes(result, context);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertices: number[][] = [];
  const triangleCount = bytes.byteLength >= 84 ? view.getUint32(80, true) : 0;
  if (triangleCount > 0 && bytes.byteLength === 84 + triangleCount * 50) {
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = 84 + triangle * 50 + 12 + corner * 12;
        vertices.push([0, 4, 8].map((step) => view.getFloat32(offset + step, true)));
      }
    }
  } else {
    for (const match of new TextDecoder().decode(bytes).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
      vertices.push([Number(match[1]), Number(match[2]), Number(match[3])]);
    }
  }
  expect(vertices.length, `${context}: expected STL triangles`).toBeGreaterThan(0);
  const min = [0, 1, 2].map((axis) => Math.min(...vertices.map((vertex) => vertex[axis]!)));
  const max = [0, 1, 2].map((axis) => Math.max(...vertices.map((vertex) => vertex[axis]!)));
  expectSize(sortedSize(min, max, 1), size, context);
};

type StepProbeShape = { IsNull(): boolean; delete(): void };
type StepProbeInstance = {
  FS: { writeFile(path: string, data: Uint8Array<ArrayBuffer>): void; unlink(path: string): void };
  STEPControl_Reader: new () => {
    ReadFile(path: string): unknown;
    TransferRoots(): unknown;
    OneShape(): StepProbeShape;
    delete(): void;
  };
  GProp_GProps: new () => { Mass(): number; delete(): void };
  BRepGProp: {
    VolumeProperties(shape: StepProbeShape, properties: unknown, a: boolean, b: boolean, c: boolean): void;
  };
};

let stepProbeCounter = 0;
let stepProbe: Promise<StepProbeInstance> | undefined;

/**
 * Re-import an exported STEP into a private OpenCASCADE instance, outside every
 * kernel, registry and realm hold, and measure its volume.
 */
const expectStepVolume = async (result: ExportResult, volume: number, context: string): Promise<void> => {
  const bytes = exportBytes(result, context);
  expect(occt.createProbe, `${context}: expected a kernel to have initialised OpenCASCADE`).toBeDefined();
  stepProbe ??= occt.createProbe!() as Promise<StepProbeInstance>;
  const oc = await stepProbe;
  stepProbeCounter += 1;
  const path = `/realm-probe-${stepProbeCounter}.step`;
  oc.FS.writeFile(path, bytes);
  const reader = new oc.STEPControl_Reader();
  const properties = new oc.GProp_GProps();
  try {
    expect(reader.ReadFile(path), `${context}: STEP read status`).toBeTruthy();
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
// WP-A3 — handles, re-opened and edited documents across two clients
// =============================================================================

describe('Replicad — two clients in one realm', { timeout: 300_000 }, () => {
  let rootA: string;
  let rootB: string;
  let clientA: NodeClient;
  let clientB: NodeClient;
  let documentA: NodeDocument;
  let documentB: NodeDocument;
  let instancesAtStart = 0;

  beforeAll(async () => {
    instancesAtStart = occt.instances.length;
    rootA = await createProject({ 'main.ts': boxSource(10) });
    rootB = await createProject({ 'main.ts': boxSource(11) });
    clientA = await createNodeClient({ runtime: createRuntime(), projectPath: rootA });
    clientB = await createNodeClient({ runtime: createRuntime(), projectPath: rootB });

    // A initialises and evaluates before B exists; B then initialises in the same realm.
    documentA = clientA.open({ source: { path: 'main.ts' } });
    expectSuccessfulRendering(await renderDocument(documentA), 'render A before B');
    documentB = clientB.open({ source: { path: 'main.ts' } });
    expectSuccessfulRendering(await renderDocument(documentB), 'render B');
  }, 120_000);

  afterAll(async () => {
    documentA.close();
    documentB.close();
    await Promise.all([clientA.shutdown(), clientB.shutdown()]);
    await removeProjects();
  }, 120_000);

  it('should initialise one OpenCASCADE instance for both clients', () => {
    expect(occt.instances.length - instancesAtStart).toBe(1);
  });

  it('should export GLB of a shape client A evaluated before client B initialised', async () => {
    await expectGlbBox(await documentA.export('glb'), boxSize(10), 'GLB of A existing handle after B');
  });

  it('should export STL of a shape client A evaluated before client B initialised', async () => {
    expectStlBox(await documentA.export('stl'), boxSize(10), 'STL of A existing handle after B');
  });

  it('should export STEP of a shape client A evaluated before client B initialised', async () => {
    await expectStepVolume(await documentA.export('step'), boxVolume(10), 'STEP of A existing handle after B');
  });

  it('should export a re-importable STEP from a document client A re-opened after client B initialised', async () => {
    const reopened = clientA.open({ source: { path: 'main.ts' } });
    try {
      expectSuccessfulRendering(await renderDocument(reopened), 'render A re-opened after B');
      await expectStepVolume(await reopened.export('step'), boxVolume(10), 'STEP of A re-opened after B');
    } finally {
      reopened.close();
    }
  });

  it('should render and export a model client A edited after client B initialised', async () => {
    await writeFile(join(rootA, 'main.ts'), boxSource(12));
    const edited = clientA.open({ source: { path: 'main.ts' }, watch: false });
    try {
      const rendering = await renderDocument(edited);
      expectSuccessfulRendering(rendering, 'render A edited after B');
      await geometryHelpers.expectBoundingBoxSize(rendering, [0.012, 0.03, 0.02], 0.0005);
      await expectStepVolume(await edited.export('step'), boxVolume(12), 'STEP of A edited after B');
      await expectGlbBox(await edited.export('glb'), boxSize(12), 'GLB of A edited after B');
      expectStlBox(await edited.export('stl'), boxSize(12), 'STL of A edited after B');
    } finally {
      edited.close();
    }
  });

  it('should keep client B exporting its own shapes after client A re-evaluated', async () => {
    await expectStepVolume(await documentB.export('step'), boxVolume(11), 'STEP of B after A re-evaluated');
    await expectGlbBox(await documentB.export('glb'), boxSize(11), 'GLB of B after A re-evaluated');
  });

  it('should create a new OpenCASCADE instance once every holder has shut down', async () => {
    documentA.close();
    documentB.close();
    await Promise.all([clientA.shutdown(), clientB.shutdown()]);

    const rootC = await createProject({ 'main.ts': boxSource(13) });
    const clientC = await createNodeClient({ runtime: createRuntime(), projectPath: rootC });
    const documentC = clientC.open({ source: { path: 'main.ts' } });
    try {
      expectSuccessfulRendering(await renderDocument(documentC), 'render C after A and B shut down');
      expect(occt.instances.length - instancesAtStart).toBe(2);
    } finally {
      documentC.close();
      await clientC.shutdown();
    }
  });
});

// =============================================================================
// WP-A3 — one build per realm
// =============================================================================

// Node always exposes SharedArrayBuffer; a host without it cannot load the multi-threaded build at all.
const sharedMemoryAvailable = typeof SharedArrayBuffer === 'function';

describe('Replicad — one OpenCASCADE build per realm', { timeout: 300_000 }, () => {
  afterAll(removeProjects);

  it.skipIf(!sharedMemoryAvailable)(
    'should refuse a multi-threaded client with KERNEL_REALM_CONFLICT while a single-threaded instance is held',
    async () => {
      const holder = await createNodeClient({
        runtime: createRuntime(),
        projectPath: await createProject({ 'main.ts': boxSource(10) }),
      });
      const contender = await createNodeClient({
        runtime: createRuntime({ wasm: 'multi' }),
        projectPath: await createProject({ 'main.ts': boxSource(11) }),
      });
      const holderDocument = holder.open({ source: { path: 'main.ts' } });
      let contenderDocument: ReturnType<typeof contender.open> | undefined;
      try {
        expectSuccessfulRendering(await renderDocument(holderDocument), 'render single-threaded holder');

        // Opening auto-connects; the contender initialises only once the holder holds the instance.
        contenderDocument = contender.open({ source: { path: 'main.ts' } });
        const refused = await renderDocument(contenderDocument);

        expect(refused.success).toBe(false);
        expect(refused.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'KERNEL_REALM_CONFLICT', message: expect.stringContaining('single') }),
          ]),
        );
        await expectStepVolume(await holderDocument.export('step'), boxVolume(10), 'STEP of holder after refusal');
      } finally {
        holderDocument.close();
        contenderDocument?.close();
        await Promise.all([holder.shutdown(), contender.shutdown()]);
      }
    },
  );
});

// =============================================================================
// WP-A3 / WP-A6 — the facade each client's bundles and `main` receive
// =============================================================================

type TracedClient = {
  readonly client: ReturnType<typeof createTestRuntimeClient<ReturnType<typeof createRuntime>>>;
  readonly entries: TelemetryEntry[];
};

const createTracedClient = (files: Record<string, string>): TracedClient => {
  const client = createTestRuntimeClient({
    runtime: createRuntime({ ocTracing: 'off', libraryTracing: 'per-call' }),
    files,
  });
  const entries: TelemetryEntry[] = [];
  client.on('telemetry', (batch) => {
    entries.push(...batch.entries);
  });
  return { client, entries };
};

/** Render `path` and return the telemetry the client received for that render. */
const renderTraced = async ({ client, entries }: TracedClient, path: string): Promise<TelemetryEntry[]> => {
  const start = entries.length;
  const document = client.open({ source: { path } });
  try {
    expectSuccessfulRendering(await renderDocument(document), `render ${path}`);
  } finally {
    document.close();
  }
  // Telemetry batches are flushed asynchronously after a render settles.
  await vi.waitFor(() => {
    expect(entries.slice(start).some((entry) => entry.name === 'replicad.run-main')).toBe(true);
  }, 10_000);
  return entries.slice(start);
};

const spansNamed = (entries: readonly TelemetryEntry[], name: string): TelemetryEntry[] =>
  entries.filter((entry) => entry.name === name);

/** Library spans of `operation` that are children of this render's `replicad.run-main` span. */
const libraryCallsUnderRunMain = (entries: readonly TelemetryEntry[], operation: string): TelemetryEntry[] => {
  const [runMain] = spansNamed(entries, 'replicad.run-main');
  expect(runMain, 'expected a replicad.run-main span').toBeDefined();
  return spansNamed(entries, `replicad.library.${operation}`).filter(
    (span) => span.detail?.['parentSpanId'] === runMain!.detail?.['spanId'],
  );
};

describe('Replicad — per-client library facade in one realm', { timeout: 300_000 }, () => {
  const files = {
    'first.ts': boxSource(10),
    'imported.ts': `import { makeBaseBox } from 'replicad';
export default function main() {
  return makeBaseBox(14, 20, 30);
}
`,
    // The type-only import selects the replicad kernel and is erased, so `main`'s first argument is the only route to the library.
    'injected.ts': `import type * as Replicad from 'replicad';
export default function main(replicad: typeof Replicad, _params: unknown) {
  return replicad.makeCylinder(5, 10);
}
`,
  };
  let clientA: TracedClient;
  let clientB: TracedClient;

  beforeAll(async () => {
    clientA = createTracedClient(files);
    clientB = createTracedClient(files);
    // Both clients initialise; B is the realm's last writer.
    const firstA = await renderTraced(clientA, 'first.ts');
    await renderTraced(clientB, 'first.ts');
    // Control: before B existed, A's library calls were traced to A.
    expect(libraryCallsUnderRunMain(firstA, 'makeBaseBox')).toHaveLength(1);
  }, 120_000);

  afterAll(async () => {
    await Promise.all([clientA.client.shutdown(), clientB.client.shutdown()]);
  }, 120_000);

  it('should trace calls from a bundle client A evaluated after client B initialised to client A only', async () => {
    const callsSeenByB = spansNamed(clientB.entries, 'replicad.library.makeBaseBox').length;

    const telemetryA = await renderTraced(clientA, 'imported.ts');

    expect(libraryCallsUnderRunMain(telemetryA, 'makeBaseBox')).toHaveLength(1);
    expect(spansNamed(clientB.entries, 'replicad.library.makeBaseBox')).toHaveLength(callsSeenByB);
  });

  it("should pass client A's own replicad facade as main's first argument after client B initialised", async () => {
    const callsSeenByB = spansNamed(clientB.entries, 'replicad.library.makeCylinder').length;

    const telemetryA = await renderTraced(clientA, 'injected.ts');

    expect(libraryCallsUnderRunMain(telemetryA, 'makeCylinder')).toHaveLength(1);
    expect(spansNamed(clientB.entries, 'replicad.library.makeCylinder')).toHaveLength(callsSeenByB);
  });
});

// =============================================================================
// WP-A3 / WP-A7 — interleaved and concurrent clients
// =============================================================================

const shellSource = `import { drawRoundedRectangle } from 'replicad';
export default function main() {
  return drawRoundedRectangle(100, 150, 5).sketchOnPlane().extrude(50).shell(2, (face) => face.inPlane('XY', 50));
}
`;

/** GLB extents of the shell in metres (Y-up). */
const shellExtents: [number, number, number] = [0.1, 0.05, 0.15];
const boxExtents = (width: number): [number, number, number] => [width / 1000, 0.03, 0.02];

type StepDocument = RenderableDocument & {
  close(): void;
  export(format: 'step'): Promise<ExportResult>;
};

/** Open a document, render it and export STEP, then close it. */
const renderAndExportStep = async (open: () => StepDocument): Promise<{ rendering: Rendering; step: ExportResult }> => {
  const document = open();
  try {
    const rendering = await renderDocument(document);
    expectSuccessfulRendering(rendering, 'render before STEP export');
    return { rendering, step: await document.export('step') };
  } finally {
    document.close();
  }
};

describe('Replicad — interleaved and concurrent test clients in one realm', { timeout: 300_000 }, () => {
  it('should render and export STEP from two interleaved clients, then from four concurrent renders', async () => {
    const files = { 'box.ts': boxSource(10), 'shell.ts': shellSource };
    const first = createTestRuntimeClient({ runtime: createRuntime(), files });
    const second = createTestRuntimeClient({ runtime: createRuntime(), files });
    const open = (client: typeof first, path: string) => () => client.open({ source: { path } });
    try {
      // Two fresh clients initialise concurrently (the UI integration flake).
      const initial = await Promise.all([
        renderAndExportStep(open(first, 'shell.ts')),
        renderAndExportStep(open(second, 'box.ts')),
      ]);
      // Interleaved: each client renders the other's model.
      const interleaved = await Promise.all([
        renderAndExportStep(open(first, 'box.ts')),
        renderAndExportStep(open(second, 'shell.ts')),
      ]);
      // Four concurrent renders across both clients.
      const concurrent = await Promise.all([
        renderAndExportStep(open(first, 'shell.ts')),
        renderAndExportStep(open(second, 'box.ts')),
        renderAndExportStep(open(first, 'box.ts')),
        renderAndExportStep(open(second, 'shell.ts')),
      ]);

      const results = [...initial, ...interleaved, ...concurrent];
      const isBox = [false, true, true, false, false, true, true, false];
      await Promise.all(
        results.map(async ({ rendering, step }, index) => {
          const box = isBox[index]!;
          await geometryHelpers.expectBoundingBoxSize(rendering, box ? boxExtents(10) : shellExtents, 0.0005);
          if (box) {
            await expectStepVolume(step, boxVolume(10), `STEP of box ${index}`);
          } else {
            exportBytes(step, `STEP of shell ${index}`);
          }
        }),
      );
    } finally {
      await Promise.all([first.shutdown(), second.shutdown()]);
    }
  });
});

// =============================================================================
// WP-A7 — in-realm webSocketHost serving two connections
// =============================================================================

describe('Replicad — in-realm webSocketHost with two connections', { timeout: 300_000 }, () => {
  afterAll(removeProjects);

  it('should export a re-importable STEP from each connection concurrently', async () => {
    const root = await createProject({ 'a.ts': boxSource(10), 'b.ts': boxSource(11) });
    const host = webSocketHost({
      worker: () => createRuntimeWorker({ runtime: createRuntime() }),
      fileSystem: fromNodeFs(root),
    });
    await host.ready;
    const url = `ws://127.0.0.1:${host.address().port}`;
    const first = createRuntimeClient({ transport: webSocketTransport({ url }) });
    const second = createRuntimeClient({ transport: webSocketTransport({ url }) });
    try {
      // Each connection's kernel initialises in turn; the second connection's is the realm's last.
      await renderAndExportStep(() => first.open({ source: { path: 'a.ts' } }));
      await renderAndExportStep(() => second.open({ source: { path: 'b.ts' } }));

      const [stepA, stepB] = await Promise.all([
        renderAndExportStep(() => first.open({ source: { path: 'a.ts' } })),
        renderAndExportStep(() => second.open({ source: { path: 'b.ts' } })),
      ]);

      await expectStepVolume(stepA.step, boxVolume(10), 'STEP of the first connection');
      await expectStepVolume(stepB.step, boxVolume(11), 'STEP of the second connection');
    } finally {
      await Promise.all([first.shutdown(), second.shutdown()]);
      await host.close();
    }
  });
});
