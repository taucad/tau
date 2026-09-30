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
import { asKnownArtifact, createRuntimeClient, fromFileSystemBridge } from '@taucad/runtime';
import type { Description, Rendering } from '@taucad/runtime';
import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';
import { geometryCache, parameterFileResolver } from '@taucad/middleware';
import { serializeParameterRecord } from '@taucad/parameters';
import { getBoundingBoxFromInspect, getInspectReport } from '@taucad/runtime-testing';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import { fileParameterEntrySchema, parametersDirectory } from '@taucad/types';
import { defineRuntime } from '@taucad/runtime/worker';

const mainSource = `
  import { makeBox } from 'replicad';

  export default function main({ width = 10, height = 8, depth = 5 }) {
    return makeBox([0, 0, 0], [width, height, depth]);
  }
`;
const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';

const nextRendering = async (
  subscribe: (handler: (result: Rendering) => void) => () => void,
  predicate: (result: Rendering) => boolean = () => true,
): Promise<Rendering> =>
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

const replicadWidth = async (rendering: Rendering): Promise<number | undefined> => {
  if (!rendering.success) {
    throw new Error('Expected Replicad to return GLTF geometry');
  }
  const artifact = asKnownArtifact(rendering.artifact);
  if (artifact?.mimeType !== 'model/gltf-binary') {
    throw new Error('Expected Replicad to return GLTF geometry');
  }
  const bounds = getBoundingBoxFromInspect(await getInspectReport(artifact.content));
  return bounds?.size[0];
};

const expectReplicadWidth = async (rendering: Rendering, width: number): Promise<void> => {
  expect(await replicadWidth(rendering)).toBeCloseTo(width);
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
    views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return createKernelSuccess({
        parameters: {
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
        },
      });
    },
    async evaluate({ parameters }) {
      observe(parameters);
      return { handle: {}, views: ['model'] as const, exports: [] as const };
    },
    async render() {
      return { content: new Uint8Array([1]) };
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
    const document = client.open({ source: { path: 'main.ts' }, watch: true });
    const view = document.view('model');
    const renderings: Rendering[] = [];
    const descriptions: Description[] = [];
    const stopRendering = view.on('rendered', (rendering) => renderings.push(rendering));
    const stopDescription = document.on('described', (description) => descriptions.push(description));

    try {
      const initial = await view.rendering();
      expect(initial.superseded).toBe(false);
      if (initial.superseded || !initial.rendering.success) {
        throw new Error('Expected the initial Replicad preview to render successfully');
      }

      renderings.length = 0;
      /* The record is a watched dependency of the render, so the checked write alone brings the
       * geometry up to date. Nothing else forwards the value to the kernel. */
      const firstUpdate = nextRendering(
        (handler) => view.on('rendered', handler),
        (rendering) => rendering.evaluationId !== initial.rendering.evaluationId,
      );
      await service.writeFile(
        `/projects/${projectId}/.tau/parameters/main.ts.json`,
        JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 20 } } } }),
      );
      const firstRendering = await firstUpdate;
      await expectReplicadWidth(firstRendering, 0.02);
      expect(renderings).toHaveLength(1);

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
      const secondUpdate = nextRendering(
        (handler) => view.on('rendered', handler),
        (rendering) => rendering.evaluationId !== firstRendering.evaluationId,
      );
      await service.writeFile(
        `/projects/${projectId}/.tau/parameters/main.ts.json`,
        JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width: 30 } } } }),
      );
      await expectReplicadWidth(await secondUpdate, 0.03);

      expect(renderings).toHaveLength(2);
      expect(descriptions).toHaveLength(3);
      const [firstDescription, secondDescription, thirdDescription] = descriptions;
      if (!firstDescription?.success || !secondDescription?.success || !thirdDescription?.success) {
        throw new Error('Expected successful parameter descriptions for each watched evaluation');
      }
      expect(secondDescription.parameters).toStrictEqual(firstDescription.parameters);
      expect(thirdDescription.parameters).toStrictEqual(firstDescription.parameters);
    } finally {
      stopDescription();
      stopRendering();
      view.close();
      document.close();
      await client.shutdown();
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
      const document = client.open({ source });
      const view = document.view('model');
      const stored = await view.rendering();
      const next = nextRendering(
        (handler) => view.on('rendered', handler),
        (rendering) => rendering.evaluationId !== (stored.superseded ? '' : stored.rendering.evaluationId),
      );
      const updated = await document.update({ parameters: { width: 40 }, transient: true });
      const scrubbed = await next;
      if (stored.superseded || updated.superseded || !stored.rendering.success || !scrubbed.success) {
        throw new Error('Expected both Replicad renders to succeed');
      }
      const artifact = asKnownArtifact(scrubbed.artifact);
      if (artifact?.mimeType !== 'model/gltf-binary') {
        throw new Error('Expected Replicad to return GLTF geometry');
      }

      const bounds = getBoundingBoxFromInspect(await getInspectReport(artifact.content));
      expect(bounds?.size[0]).toBeCloseTo(0.04);
      view.close();
      document.close();
    } finally {
      await client.shutdown();
      dispose();
    }
  }, 60_000);

  it('should report SEMANTICS_UNRESOLVED for unit-bearing text on a field with no unit', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('unitless-text');
    const runtime = defineRuntime({ kernels: [unitBoundaryKernel(() => undefined, false)()] });
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });

    try {
      await service.writeFile(`/projects/${projectId}/main.unit`, 'fixture');
      const document = client.open({ source: { path: 'main.unit' }, parameters: { width: '20 in' } });
      const rendered = await document.view('model').rendering();
      if (rendered.superseded) {
        throw new Error('Expected the request-scoped render to settle');
      }
      expect(rendered.rendering.success).toBe(false);
      if (rendered.rendering.success) {
        throw new Error('Expected unit-bearing text for unitless width to be refused');
      }
      expect(rendered.rendering.issues[0]?.code).toBe('SEMANTICS_UNRESOLVED');
      expect(rendered.rendering.issues[0]?.message).toMatch(/\/width.*20 in.*number|unit declaration/iu);
      document.close();
    } finally {
      await client.shutdown();
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
    const source = { path: 'main.ts' } as const;
    const document = client.open({ source, parameters: { width: 10 } });
    const view = document.view('model');
    const renderings: Rendering[] = [];
    const stopRendering = view.on('rendered', (rendering) => renderings.push(rendering));

    try {
      const committed = await view.rendering();
      if (committed.superseded || !committed.rendering.success) {
        throw new Error('Expected the committed render to succeed');
      }
      // D2 gates the lane on a kernel declaring it; Replicad aborts cooperatively, so it qualifies.
      expect(client.capabilities?.renderCapabilities['replicad']?.cancellation).toBe('cooperative');
      const committedExport = await document.export('glb');
      if (!committedExport.success) {
        throw new Error('Expected the committed export to succeed');
      }

      renderings.length = 0;
      const next = nextRendering(
        (handler) => view.on('rendered', handler),
        (rendering) => rendering.evaluationId !== committed.rendering.evaluationId,
      );
      const transient = await document.update({ parameters: { width: 40 }, transient: true });
      if (transient.superseded) {
        throw new Error('Expected the transient render to succeed');
      }
      const transientRendering = await next;
      if (!transientRendering.success) {
        throw new Error('Expected the transient rendering to succeed');
      }
      // The drag frame reaches the viewer.
      expect(renderings).toHaveLength(1);
      expect(transientRendering.hash).not.toBe(committed.rendering.hash);

      // ...but it never became the artifact, so the export still answers the committed width.
      const afterTransient = await document.export('glb');
      if (!afterTransient.success) {
        throw new Error('Expected the export after the transient render to succeed');
      }
      // A box's GLB has the same byte length at every size, so the bytes themselves are the check.
      expect(afterTransient.files[0].bytes).toStrictEqual(committedExport.files[0].bytes);

      // Nothing was persisted for the transient value.
      await expect(service.exists(`/projects/${projectId}/${parametersDirectory}/main.ts.json`)).resolves.toBe(false);
    } finally {
      stopRendering();
      view.close();
      document.close();
      await client.shutdown();
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
      const document = client.open({ source: { path: 'main.unit' }, parameters });
      const rendered = await document.view('model').rendering();
      if (rendered.superseded || !rendered.rendering.success) {
        throw new Error('Expected the unit-boundary fixture to render');
      }
      expect(observed.at(-1)?.['width']).toBeCloseTo(508);
      document.close();
    } finally {
      await client.shutdown();
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
      const document = client.open({ source, parameters: { width: 40 } });
      const referenceDocument = referenceClient.open({ source, parameters: { width: 40, height: 16 } });
      const actual = await document.export('glb');
      const expected = await referenceDocument.export('glb');
      if (!actual.success || !expected.success) {
        throw new Error('Expected both Replicad exports to succeed');
      }

      const actualFile = actual.files[0];
      const expectedFile = expected.files[0];
      const actualBounds = getBoundingBoxFromInspect(await getInspectReport(actualFile.bytes));
      const expectedBounds = getBoundingBoxFromInspect(await getInspectReport(expectedFile.bytes));
      expect(actualBounds).toEqual(expectedBounds);
      document.close();
      referenceDocument.close();
    } finally {
      await referenceClient.shutdown();
      await client.shutdown();
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
      const document = client.open({ source, parameters: { width: 40 } });
      const view = document.view('model');
      const first = await view.rendering();
      const repeated = await view.rendering();
      if (first.superseded || repeated.superseded || !first.rendering.success || !repeated.rendering.success) {
        throw new Error('Expected both identical overrides to render');
      }
      expect(repeated.rendering.hash).toBe(first.rendering.hash);

      const published = await document.export('glb');
      if (!published.success) {
        throw new Error(`Expected the repeated render to remain published: ${JSON.stringify(published)}`);
      }
      const bounds = getBoundingBoxFromInspect(await getInspectReport(published.files[0].bytes));
      expect(bounds?.size[0]).toBeCloseTo(0.04);
      view.close();
      document.close();
    } finally {
      await client.shutdown();
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
    const sidecarPath = `/projects/${projectId}/${parametersDirectory}/main.ts.json`;
    await service.writeFile(sidecarPath, sidecarBytes({ width: 11 }));
    const document = client.open({ source: { path: 'main.ts' }, parameters: {}, watch: true });
    const view = document.view('model');
    const renderings: Rendering[] = [];
    const stopRendering = view.on('rendered', (rendering) => renderings.push(rendering));

    try {
      const initial = await view.rendering();
      // The workbench re-issues the render command on every committed edit, so the steady state
      // this assertion protects is the second and later open of the same entry.
      await view.rendering();

      renderings.length = 0;
      const updated = nextRendering(
        (handler) => view.on('rendered', handler),
        (rendering) => rendering.evaluationId !== (initial.superseded ? '' : initial.rendering.evaluationId),
      );
      await service.writeFile(sidecarPath, sidecarBytes({ width: 30 }));
      await expectReplicadWidth(await updated, 0.03);

      expect(renderings).toHaveLength(1);
    } finally {
      stopRendering();
      view.close();
      document.close();
      await client.shutdown();
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
      const document = client.open({ source: { path: 'main.ts' }, parameters: {}, watch: true });
      const view = document.view('model');
      const renderings: Rendering[] = [];
      const descriptions: Description[] = [];
      const stopRendering = view.on('rendered', (rendering) => renderings.push(rendering));
      const stopDescription = document.on('described', (description) => descriptions.push(description));
      const sidecarPath = `${parametersDirectory}/main.ts.json`;

      try {
        const initial = await view.rendering();
        if (initial.superseded || !initial.rendering.success) {
          throw new Error('Expected the initial Replicad preview to render successfully');
        }

        renderings.length = 0;
        descriptions.length = 0;
        const bytes = sidecarBytes({ width: 20 });
        const persist = async (): Promise<void> => service.writeFile(`/projects/${projectId}/${sidecarPath}`, bytes);
        // The shipped UI shape: one synchronous turn dispatches the value and persists it.
        const next = nextRendering(
          (handler) => view.on('rendered', handler),
          (rendering) => rendering.evaluationId !== initial.rendering.evaluationId,
        );
        const dispatched = document.update({
          parameters: { width: 20 },
          stage: { [sidecarPath]: bytes },
        });
        const persisted = persistence === 'during the render' ? persist() : undefined;
        const committed = await dispatched;
        await (persisted ?? persist());
        if (committed.superseded || !committed.evaluation.success) {
          throw new Error('Expected the committed edit to render successfully');
        }
        const committedRendering = await next;
        await expectReplicadWidth(committedRendering, 0.02);

        // Repeating the same committed update is an evaluation barrier for the persisted echo.
        const barrierRendering = nextRendering(
          (handler) => view.on('rendered', handler),
          (rendering) => rendering.evaluationId !== committedRendering.evaluationId,
        );
        const barrier = await document.update({ parameters: { width: 20 } });
        if (barrier.superseded || !barrier.evaluation.success) {
          throw new Error('Expected the repeated committed render to succeed');
        }
        await expectReplicadWidth(await barrierRendering, 0.02);

        expect(renderings).toHaveLength(2);
        expect(descriptions).toHaveLength(2);
      } finally {
        stopDescription();
        stopRendering();
        view.close();
        document.close();
        await client.shutdown();
        dispose();
      }
    },
    60_000,
  );
});
