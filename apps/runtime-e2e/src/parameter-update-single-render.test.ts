// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { exposeFileSystem, filesystemBridgeConnectMessageType, openFileSystemBridge } from '@taucad/fs-bridge';
import { createRuntimeClient, fromFileSystemBridge } from '@taucad/runtime';
import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';
import { geometryCache } from '@taucad/middleware';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
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

describe('autonomous preview invalidation', () => {
  it('should render once when a parameter update is followed by unrelated project writes', async () => {
    const providerRegistry = new ProviderRegistry();
    const rootStorageRootKey = 'memory:parameter-update-root';
    const rootProvider = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: rootStorageRootKey,
    });

    const mountTable = new MountTable();
    mountTable.mount('/', rootProvider, { backend: 'memory', storageRootKey: rootStorageRootKey });
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
          storageRootKey: 'memory:parameter-update-project',
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

    const fileSystem = fromFileSystemBridge(() =>
      openFileSystemBridge(bridgeWorker, {
        messageType: filesystemBridgeConnectMessageType,
        root: `/projects/${projectId}`,
      }),
    );
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
      exposed.cleanup();
      service.dispose();
    }
  }, 60_000);
});
