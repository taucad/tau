// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { exposeFileSystem, filesystemBridgeConnectMessageType, openFileSystemBridge } from '@taucad/fs-bridge';
import { createRuntimeClient, fromFileSystemBridge } from '@taucad/runtime';
import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';
import { geometryCache, parameterFileResolver } from '@taucad/middleware';
import { serializeParameterRecord } from '@taucad/parameters';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fileParameterEntrySchema, parametersDirectory } from '@taucad/runtime/types';
import type { GetParametersResult, WorkerState } from '@taucad/runtime/types';
import { defineRuntime } from '@taucad/runtime/worker';

const mainSource = `
  import { makeBox } from 'replicad';

  export default function main({ width = 10 }) {
    return makeBox([0, 0, 0], [width, 8, 5]);
  }
`;
const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/** Sidecar bytes exactly as `@taucad/parameters` writes them for one committed value. */
const sidecarBytes = (values: Record<string, unknown>): Uint8Array<ArrayBuffer> =>
  serializeParameterRecord(
    fileParameterEntrySchema.parse({
      recordVersion: 1,
      profile: 'tau-json-structure-units-03-v1',
      activeGroup: 'default',
      order: ['default'],
      groups: { default: { values } },
    }),
  );

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
  const exposed = exposeFileSystem(service, {
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
      }),
    ),
    dispose: () => {
      exposed.cleanup();
      service.dispose();
    },
  };
};

describe('autonomous preview invalidation', () => {
  it('should render once when a parameter update is followed by unrelated project writes', async () => {
    const { service, fileSystem, dispose } = await createProjectWorkspace('parameter-update');
    const runtime = defineRuntime({
      plugins: [replicad(), esbuild()],
      middleware: [geometryCache()],
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem }),
    });
    const states: WorkerState[] = [];
    const parameterFrames: GetParametersResult[] = [];
    const stopStates = client.on('state', (state) => states.push(state));
    const stopParameters = client.on('parametersResolved', (result) => parameterFrames.push(result));

    try {
      const initial = await client.render({
        source: { path: 'main.ts' },
        parameters: { width: 10 },
      });
      expect(initial.superseded).toBe(false);
      if (initial.superseded || !initial.geometry.success) {
        throw new Error('Expected the initial Replicad preview to render successfully');
      }

      states.length = 0;
      const update = await client.updateParameters({ width: 20 });
      expect(update.superseded).toBe(false);
      if (update.superseded || !update.geometry.success) {
        throw new Error('Expected the parameter update to render successfully');
      }

      // Automatic thumbnail generation writes through a separate filesystem
      // client after the primary render settles. This derived artifact is not a
      // runtime dependency and must not schedule another preview.
      await service.writeFile(`/projects/${projectId}/thumbnail.webp`, new Uint8Array([0x52, 0x49, 0x46, 0x46]));

      // The autonomous file-change debounce is 200 ms. Waiting beyond that
      // boundary proves whether an additional preview was scheduled.
      await delay(750);

      expect(states.filter((state) => state === 'rendering')).toEqual(['rendering']);

      // GeoSpec source is another ordinary peer write that is unrelated to the
      // active runtime dependency graph. Keeping this separate from the image
      // assertion prevents an artifact-name special case from passing.
      await service.writeFile(`/projects/${projectId}/main.geospec.ts`, 'export {};');
      await delay(750);

      expect(states.filter((state) => state === 'rendering')).toEqual(['rendering']);
      expect(parameterFrames).toHaveLength(2);
      expect(parameterFrames[1]).toStrictEqual(parameterFrames[0]);
    } finally {
      stopParameters();
      stopStates();
      await client.shutdown({ drain: true });
      client.terminate();
      dispose();
    }
  }, 60_000);
});

describe('committed parameter edit', () => {
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
      await service.writeFile(sidecarPath, sidecarBytes({ width: 30 }));
      await delay(750);

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

        // Past the 75 ms coalescing window and the 200 ms file-change debounce: any watch-driven
        // second render for the sidecar the dispatch already staged would have landed by now.
        await delay(750);

        expect(states.filter((state) => state === 'rendering')).toEqual(['rendering']);
        expect(parameterFrames).toHaveLength(1);
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
