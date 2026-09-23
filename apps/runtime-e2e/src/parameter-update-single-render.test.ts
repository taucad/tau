// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  exposeFileSystem,
  filesystemBridgeConnectMessageType,
  openFileSystemBridge,
  workspaceBridgeService,
} from '@taucad/fs-bridge';
import { createRuntimeClient, fromFileSystemBridge } from '@taucad/runtime';
import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';
import { geometryCache, parameterFileResolver } from '@taucad/middleware';
import { serializeParameterRecord } from '@taucad/parameters';
import { getBoundingBoxFromInspect, getInspectReport } from '@taucad/runtime-testing';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import { fileParameterEntrySchema, parametersDirectory } from '@taucad/types';
import type { GetParametersResult, HashedGeometryResult, WorkerState } from '@taucad/runtime/types';
import { defineRuntime } from '@taucad/runtime/worker';

const mainSource = `
  import { makeBox } from 'replicad';

  export default function main({ width = 10, height = 8, depth = 5 }) {
    return makeBox([0, 0, 0], [width, height, depth]);
  }
`;
const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';

const nextGeometry = async (
  subscribe: (handler: (result: HashedGeometryResult) => void) => () => void,
  predicate: (result: HashedGeometryResult) => boolean = () => true,
): Promise<HashedGeometryResult> =>
  new Promise((resolve) => {
    let settled = false;
    const unsubscribe = subscribe((result) => {
      if (settled || !predicate(result)) {
        return;
      }
      settled = true;
      unsubscribe();
      resolve(result);
    });
  });

const replicadWidth = async (geometry: HashedGeometryResult): Promise<number | undefined> => {
  if (!geometry.success || geometry.data.format !== 'gltf') {
    throw new Error('Expected Replicad to return GLTF geometry');
  }
  const bounds = getBoundingBoxFromInspect(await getInspectReport(geometry.data.content));
  return bounds?.size[0];
};

const expectReplicadWidth = async (geometry: HashedGeometryResult, width: number): Promise<void> => {
  expect(await replicadWidth(geometry)).toBeCloseTo(width);
};

/** Sidecar bytes exactly as `@taucad/parameters` writes them for one committed value. */
const sidecarBytes = (
  values: Record<string, unknown>,
  claims?: { units: Record<string, string>; sourceUnits: Record<string, string> },
): Uint8Array<ArrayBuffer> =>
  serializeParameterRecord(
    fileParameterEntrySchema.parse({ activeGroup: 'default', groups: { default: { values, ...claims } } }),
  );

const unitBoundaryKernel = (observe: (parameters: Record<string, unknown>) => void, unitBearing = true) => {
  const unit = unitBearing ? 'mm' : undefined;
  return defineKernel({
    id: 'unit-boundary-fixture',
    extensions: ['unit'],
    name: 'UnitBoundaryFixture',
    version: '1.0.0',
    exportFormats: {},
    async initialize() {
      return {};
    },
    async getDependencies({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async getParameters() {
      return createKernelSuccess({
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:taucad:test:unit-boundary',
          $uses: ['JSONSchemaUnits'],
          name: 'UnitBoundary',
          type: 'object',
          properties: { width: { type: 'double', ...(unit ? { ucumUnit: unit } : {}) } },
        },
        defaults: { width: 10 },
        ...(unit
          ? {
              bindings: {
                '/width': {
                  unit,
                  quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
                  space: 'linear',
                  sourceUnitCapability: 'change-source-unit:preserve-size:v1',
                },
              },
            }
          : {}),
      });
    },
    async createGeometry({ parameters }) {
      observe(parameters);
      return {
        geometry: { format: 'gltf', content: new Uint8Array([1]) },
        nativeHandle: {},
        issues: [],
      };
    },
    async exportGeometry() {
      throw new Error('The unit-boundary fixture does not export.');
    },
  });
};

/**
 * A workspace filesystem with `main.ts` staged, exposed over the same bridge the
 * browser uses, so the runtime sees the production watch and coalescing path.
 */
const createProjectWorkspace = async (
  key: string,
): Promise<{
  service: WorkspaceFileService;
  fileSystem: ReturnType<typeof fromFileSystemBridge>;
  dispose(): void;
}> => {
  const providerRegistry = new ProviderRegistry();
  const rootStorageRootKey = `memory:${key}-root`;
  const rootProvider = await providerRegistry.getProvider({
    backend: 'memory',
    storageRootKey: rootStorageRootKey,
  });

  const mountTable = new MountTable();
  mountTable.mount('/', rootProvider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: rootStorageRootKey,
  });
  const eventBus = new ChangeEventBus();
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  await service.configureProjectRoots({
    projects: [
      {
        projectId,
        backend: 'memory',
        storageRootKey: `memory:${key}-project`,
        providerBasePath: projectId,
      },
    ],
    roots: [],
  });
  await service.writeFile(`/projects/${projectId}/main.ts`, mainSource);

  const workerScope = new EventTarget();
  const exposed = exposeFileSystem(workspaceBridgeService(service), {
    policy: tauPathPolicy,
    changeEventBus: eventBus,
    handlerForRoot: (root, context) => service.createRootedFileSystem(root, context),
    messageSource: workerScope,
  });
  const bridgeWorker = {
    postMessage(message: unknown): void {
      workerScope.dispatchEvent(new MessageEvent('message', { data: message }));
    },
  };

  return {
    service,
    fileSystem: fromFileSystemBridge(() =>
      openFileSystemBridge(bridgeWorker, {
        messageType: filesystemBridgeConnectMessageType,
        root: `/projects/${projectId}`,
        /* The kernel runs the checkout itself, never a consumer's view (G6). */
        consumer: 'working-copy',
      }),
    ),
    dispose: () => {
      exposed.cleanup();
      service.dispose();
    },
  };
};

describe('autonomous preview invalidation', () => {
  it('should render once for a record write followed by unrelated project writes', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('parameter-update');
    const runtime = defineRuntime({
      plugins: [replicad(), esbuild()],
      middleware: [geometryCache(), parameterFileResolver()],
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem }),
    });
    const states: WorkerState[] = [];
    const parameterFrames: GetParametersResult[] = [];
    const stopStates = client.on('state', (state) => states.push(state));
    const stopParameters = client.on('parametersResolved', (result) => parameterFrames.push(result));

    try {
      const initial = await client.render({ source: { path: 'main.ts' } });
      expect(initial.superseded).toBe(false);
      if (initial.superseded || !initial.geometry.success) {
        throw new Error('Expected the initial Replicad preview to render successfully');
      }

      states.length = 0;
      /* The record is a watched dependency of the render, so the checked write alone brings the
       * geometry up to date. Nothing else forwards the value to the kernel. */
      const firstUpdate = nextGeometry((handler) => client.on('geometry', handler));
      await service.writeFile(
        `/projects/${projectId}/.tau/parameters/main.ts.json`,
        JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 20 } } } }),
      );
      await expectReplicadWidth(await firstUpdate, 0.02);
      expect(states.filter((state) => state === 'rendering')).toEqual(['rendering']);

      // Automatic thumbnail generation writes through a separate filesystem
      // client after the primary render settles. This derived artifact is not a
      // runtime dependency and must not schedule another preview.
      await service.writeFile(`/projects/${projectId}/thumbnail.webp`, new Uint8Array([0x52, 0x49, 0x46, 0x46]));

      // GeoSpec source is another ordinary peer write that is unrelated to the
      // active runtime dependency graph. Keeping this separate from the image
      // assertion prevents an artifact-name special case from passing.
      await service.writeFile(`/projects/${projectId}/main.geospec.ts`, 'export {};');

      // A second relevant edit is the event barrier for both unrelated writes: once it renders,
      // every earlier filesystem event has crossed the runtime's watch/debounce queue.
      const secondUpdate = nextGeometry((handler) => client.on('geometry', handler));
      await service.writeFile(
        `/projects/${projectId}/.tau/parameters/main.ts.json`,
        JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 30 } } } }),
      );
      await expectReplicadWidth(await secondUpdate, 0.03);

      expect(states.filter((state) => state === 'rendering')).toEqual(['rendering', 'rendering']);
      expect(parameterFrames).toHaveLength(3);
      expect(parameterFrames[1]).toStrictEqual(parameterFrames[0]);
      expect(parameterFrames[2]).toStrictEqual(parameterFrames[0]);
    } finally {
      stopParameters();
      stopStates();
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  }, 60_000);
});

describe('transient drag lane', () => {
  it('should render the scrubbed sample when the sidecar already stores that field', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('transient-stored-field');
    const runtime = defineRuntime({
      plugins: [replicad(), esbuild()],
      middleware: [parameterFileResolver()],
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem }),
    });
    const source = { path: 'main.ts' } as const;

    try {
      await service.writeFile(
        `/projects/${projectId}/${parametersDirectory}/main.ts.json`,
        sidecarBytes({ width: 20 }),
      );
      const stored = await client.render({ source });
      const scrubbed = await client.render({ source, parameters: { width: 40 }, transient: true });
      if (stored.superseded || scrubbed.superseded || !stored.geometry.success || !scrubbed.geometry.success) {
        throw new Error('Expected both Replicad renders to succeed');
      }
      if (scrubbed.geometry.data.format !== 'gltf') {
        throw new Error('Expected Replicad to return GLTF geometry');
      }

      const bounds = getBoundingBoxFromInspect(await getInspectReport(scrubbed.geometry.data.content));
      expect(bounds?.size[0]).toBeCloseTo(0.04);
    } finally {
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  }, 60_000);

  it('should report SEMANTICS_UNRESOLVED for unit-bearing text on a field with no unit', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('unitless-text');
    const runtime = defineRuntime({ kernels: [unitBoundaryKernel(() => undefined, false)()] });
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });

    try {
      await service.writeFile(`/projects/${projectId}/main.unit`, 'fixture');
      const rendered = await client.render({ source: { path: 'main.unit' }, parameters: { width: '20 in' } });
      if (rendered.superseded) {
        throw new Error('Expected the request-scoped render to settle');
      }
      expect(rendered.geometry.success).toBe(false);
      if (rendered.geometry.success) {
        throw new Error('Expected unit-bearing text for unitless width to be refused');
      }
      expect(rendered.geometry.issues[0]?.code).toBe('SEMANTICS_UNRESOLVED');
      expect(rendered.geometry.issues[0]?.message).toMatch(/\/width.*20 in.*number|unit declaration/iu);
    } finally {
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  }, 60_000);

  /* D2: a transient render shows the drag value but never becomes the published artifact, so an
   * export mid-drag still answers with the last committed geometry and nothing is persisted. */
  it('should render a transient parameter change without publishing it as the artifact', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('transient-drag');
    const runtime = defineRuntime({
      plugins: [replicad(), esbuild()],
      middleware: [parameterFileResolver(), geometryCache()],
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem }),
    });
    const geometries: HashedGeometryResult[] = [];
    const stopGeometry = client.on('geometry', (result) => geometries.push(result));
    const source = { path: 'main.ts' } as const;

    try {
      const committed = await client.render({ source, parameters: { width: 10 } });
      if (committed.superseded || !committed.geometry.success) {
        throw new Error('Expected the committed render to succeed');
      }
      // D2 gates the lane on a kernel declaring it; Replicad aborts cooperatively, so it qualifies.
      expect(client.capabilities?.renderCapabilities['replicad']?.cancellation).toBe('cooperative');
      const committedExport = await client.export('glb');
      if (!committedExport.success) {
        throw new Error('Expected the committed export to succeed');
      }

      geometries.length = 0;
      const transient = await client.render({ source, parameters: { width: 40 }, transient: true });
      if (transient.superseded || !transient.geometry.success) {
        throw new Error('Expected the transient render to succeed');
      }
      // The drag frame reaches the viewer.
      expect(geometries).toHaveLength(1);
      expect(transient.geometry.data.hash).not.toBe(committed.geometry.data.hash);

      // ...but it never became the artifact, so the export still answers the committed width.
      const afterTransient = await client.export('glb');
      if (!afterTransient.success) {
        throw new Error('Expected the export after the transient render to succeed');
      }
      // A box's GLB has the same byte length at every size, so the bytes themselves are the check.
      expect(afterTransient.data[0]?.bytes).toStrictEqual(committedExport.data[0]?.bytes);

      // Nothing was persisted for the transient value.
      await expect(service.exists(`/projects/${projectId}/${parametersDirectory}/main.ts.json`)).resolves.toBe(false);
    } finally {
      stopGeometry();
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  }, 60_000);
});

describe('committed parameter edit', () => {
  const expectSourceUnitRender = async (key: string, parameters: Record<string, unknown>): Promise<void> => {
    const { service, fileSystem, dispose } = await createProjectWorkspace(key);
    const observed: Array<Record<string, unknown>> = [];
    const runtime = defineRuntime({
      kernels: [unitBoundaryKernel((value) => observed.push(value))()],
      middleware: [parameterFileResolver()],
    });
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });

    try {
      await service.writeFile(`/projects/${projectId}/main.unit`, 'fixture');
      await service.writeFile(
        `/projects/${projectId}/${parametersDirectory}/main.unit.json`,
        sidecarBytes(
          { width: 20 },
          {
            units: { '/width': 'in' },
            sourceUnits: { '/width': 'in' },
          },
        ),
      );
      const rendered = await client.render({ source: { path: 'main.unit' }, parameters });
      if (rendered.superseded || !rendered.geometry.success) {
        throw new Error('Expected the unit-boundary fixture to render');
      }
      expect(observed.at(-1)?.['width']).toBeCloseTo(508);
    } finally {
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  };

  it(
    'should convert a stored 20 in to 508 for a kernel that declares mm',
    async () => expectSourceUnitRender('stored-source-unit', {}),
    60_000,
  );

  it(
    "should leave a caller's 508 unscaled when the record marks the field in inches",
    async () => expectSourceUnitRender('caller-native-unit', { width: 508 }),
    60_000,
  );

  it('should let a caller override beat the stored value and the stored value beat the default', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('parameter-precedence');
    const runtime = defineRuntime({
      plugins: [replicad(), esbuild()],
      middleware: [parameterFileResolver()],
    });
    const referenceRuntime = defineRuntime({ plugins: [replicad(), esbuild()] });
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });
    const referenceClient = createRuntimeClient({
      transport: inProcessTransport({ runtime: referenceRuntime, fileSystem }),
    });
    const source = { path: 'main.ts' } as const;

    try {
      await service.writeFile(
        `/projects/${projectId}/${parametersDirectory}/main.ts.json`,
        sidecarBytes({ width: 20, height: 16 }),
      );
      const actual = await client.export('glb', { source, parameters: { width: 40 } });
      const expected = await referenceClient.export('glb', { source, parameters: { width: 40, height: 16 } });
      if (!actual.success || !expected.success) {
        throw new Error('Expected both Replicad exports to succeed');
      }

      const actualFile = actual.data[0];
      const expectedFile = expected.data[0];
      if (!actualFile || !expectedFile) {
        throw new Error('Expected both exports to contain a GLB');
      }
      const actualBounds = getBoundingBoxFromInspect(await getInspectReport(actualFile.bytes));
      const expectedBounds = getBoundingBoxFromInspect(await getInspectReport(expectedFile.bytes));
      expect(actualBounds).toEqual(expectedBounds);
    } finally {
      await referenceClient.shutdown({ drain: true });
      referenceClient.terminate();
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  }, 60_000);

  it('should serve the published render for a repeated identical override', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('repeat-override');
    const runtime = defineRuntime({
      plugins: [replicad(), esbuild()],
      middleware: [parameterFileResolver(), geometryCache()],
    });
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });
    const source = { path: 'main.ts' } as const;

    try {
      await service.writeFile(
        `/projects/${projectId}/${parametersDirectory}/main.ts.json`,
        sidecarBytes({ width: 20 }),
      );
      const first = await client.render({ source, parameters: { width: 40 } });
      const repeated = await client.render({ source, parameters: { width: 40 } });
      if (first.superseded || repeated.superseded || !first.geometry.success || !repeated.geometry.success) {
        throw new Error('Expected both identical overrides to render');
      }
      expect(repeated.geometry.data.hash).toBe(first.geometry.data.hash);

      const published = await client.export('glb');
      if (!published.success || !published.data[0]) {
        throw new Error('Expected the repeated render to remain published');
      }
      const bounds = getBoundingBoxFromInspect(await getInspectReport(published.data[0].bytes));
      expect(bounds?.size[0]).toBeCloseTo(0.04);
    } finally {
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  }, 60_000);

  /* D1: the sidecar watch stays for genuine external edits (an agent, a second tab, a checkout).
   * A repeat render command re-opens the same entry, and the middleware dependency cache then
   * answers from cache — the entry's middleware watch paths must survive both. */
  it('should re-render when an external edit changes the sidecar after a repeat render command', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('external-sidecar-edit');
    const runtime = defineRuntime({
      plugins: [replicad(), esbuild()],
      middleware: [parameterFileResolver(), geometryCache()],
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem }),
    });
    const states: WorkerState[] = [];
    const stopStates = client.on('state', (state) => states.push(state));
    const sidecarPath = `/projects/${projectId}/${parametersDirectory}/main.ts.json`;

    try {
      await service.writeFile(sidecarPath, sidecarBytes({ width: 11 }));
      const source = { path: 'main.ts' } as const;
      await client.render({ source, parameters: {} });
      // The workbench re-issues the render command on every committed edit, so the steady state
      // this assertion protects is the second and later open of the same entry.
      await client.render({ source, parameters: {} });

      states.length = 0;
      const updated = nextGeometry((handler) => client.on('geometry', handler));
      await service.writeFile(sidecarPath, sidecarBytes({ width: 30 }));
      await expectReplicadWidth(await updated, 0.03);

      expect(states.filter((state) => state === 'rendering')).toEqual(['rendering']);
    } finally {
      stopStates();
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  }, 60_000);

  /* D1/I2: the committed edit carries the sidecar bytes through the staged-write path, and the
   * parallel sidecar write is suppressed by hash equality when its watch event lands. One render,
   * whichever order the two halves complete in — the count must not depend on a timer race. */
  it.each(['during the render', 'after the render settles'] as const)(
    'should render once when the sidecar write lands %s',
    async (persistence) => {
      const { service, fileSystem, dispose } = await createProjectWorkspace(`committed-edit-${persistence}`);
      const runtime = defineRuntime({
        plugins: [replicad(), esbuild()],
        middleware: [parameterFileResolver(), geometryCache()],
      });
      const client = createRuntimeClient({
        transport: inProcessTransport({ runtime, fileSystem }),
      });
      const states: WorkerState[] = [];
      const parameterFrames: GetParametersResult[] = [];
      const stopStates = client.on('state', (state) => states.push(state));
      const stopParameters = client.on('parametersResolved', (result) => parameterFrames.push(result));
      const sidecarPath = `${parametersDirectory}/main.ts.json`;

      try {
        const initial = await client.render({ source: { path: 'main.ts' }, parameters: {} });
        if (initial.superseded || !initial.geometry.success) {
          throw new Error('Expected the initial Replicad preview to render successfully');
        }

        states.length = 0;
        parameterFrames.length = 0;
        const bytes = sidecarBytes({ width: 20 });
        const persist = async (): Promise<void> => service.writeFile(`/projects/${projectId}/${sidecarPath}`, bytes);
        // The shipped UI shape: one synchronous turn dispatches the value and persists it.
        const dispatched = client.render({
          source: { path: 'main.ts' },
          parameters: { width: 20 },
          stage: { [sidecarPath]: bytes },
        });
        const persisted = persistence === 'during the render' ? persist() : undefined;
        const committed = await dispatched;
        await (persisted ?? persist());
        if (committed.superseded || !committed.geometry.success) {
          throw new Error('Expected the committed edit to render successfully');
        }
        await expectReplicadWidth(committed.geometry, 0.02);

        // A repeated command is the event barrier for the persisted echo: it is issued after the
        // filesystem delivered that write, so any watch-driven duplicate would precede this one.
        const barrier = await client.render({ source: { path: 'main.ts' }, parameters: { width: 20 } });
        if (barrier.superseded || !barrier.geometry.success) {
          throw new Error('Expected the repeated committed render to succeed');
        }
        await expectReplicadWidth(barrier.geometry, 0.02);

        expect(states.filter((state) => state === 'rendering')).toEqual(['rendering', 'rendering']);
        expect(parameterFrames).toHaveLength(2);
      } finally {
        stopParameters();
        stopStates();
        await client.shutdown({ drain: true });
        client.terminate();
        dispose();
      }
    },
    60_000,
  );
});
