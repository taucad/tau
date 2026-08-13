// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { exposeFileSystem, filesystemBridgeConnectMessageType, openFileSystemBridge } from '@taucad/fs-bridge';
import { createRuntimeClient } from '#client/runtime-client.js';
import { fromFileSystemBridge } from '#filesystem/runtime-filesystem.js';
import { esbuild } from '#bundler/esbuild.bundler.js';
import { replicad } from '#kernels/replicad/replicad.kernel.js';
import { parameterFileResolver } from '#middleware/parameter-file-resolver.middleware.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { GetParametersResult, HashedGeometryResult } from '#types/runtime.types.js';

const placeholderSource = `
  import { makeShape } from '../shape';
  export default function main({ size = 2 }) {
    return makeShape(size);
  }
`;

const mainSource = `
  import { makeShape } from '../shape';
  export default function main({ width = 10 }) {
    return makeShape(width);
  }
`;

const shapeSource = (depth: number): string => `
  import { makeBox } from 'replicad';
  export function makeShape(width) {
    return makeBox([0, 0, 0], [width, ${depth}, 5]);
  }
`;

const requestSource = (depth: number): string => `
  import { makeBox } from 'replicad';
  export default function request() {
    return makeBox([0, 0, 0], [4, ${depth}, 2]);
  }
`;

const parameterSource = (width: number): string =>
  JSON.stringify({ activeGroup: 'default', groups: { default: { values: { width } } } });

const alphaProjectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const betaProjectId = 'proj_bbbbbbbbbbbbbbbbbbbbb';

type ExternalObserverRecord = {
  readonly type: 'modified';
  readonly changedHandle: FileSystemHandle;
  readonly relativePathComponents: readonly string[];
};

const directoryHandle = (name: string): FileSystemDirectoryHandle => {
  const handle = { kind: 'directory', name };
  return handle as unknown as FileSystemDirectoryHandle;
};

const fileHandle = (name: string): FileSystemFileHandle => {
  const handle = { kind: 'file', name };
  return handle as FileSystemFileHandle;
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

describe('rooted filesystem production topology', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps authority selection in WFS while runtime renders, observes, exports, and drains in one local namespace', async () => {
    const providerRegistry = new ProviderRegistry();
    const rootProvider = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: 'memory:vertical-root',
    });
    const mountTable = new MountTable();
    mountTable.mount('/', rootProvider, { backend: 'memory', storageRootKey: 'memory:vertical-root' });
    const eventBus = new ChangeEventBus();
    const service = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus,
      mountTable,
    });
    const webAccessProvider = new MemoryProvider();
    const workspaceHandle = directoryHandle('runtime-workspace');
    let externalObserverCallback: ((records: readonly ExternalObserverRecord[]) => void) | undefined;
    class RuntimeFileSystemObserver {
      public constructor(callback: (records: readonly ExternalObserverRecord[]) => void) {
        externalObserverCallback = callback;
      }

      public observe(): void {
        return undefined;
      }

      public disconnect(): void {
        return undefined;
      }
    }
    vi.stubGlobal('FileSystemObserver', RuntimeFileSystemObserver);
    const getProvider = providerRegistry.getProvider.bind(providerRegistry);
    vi.spyOn(providerRegistry, 'getProvider').mockImplementation(async (scope) =>
      scope.backend === 'webaccess' ? webAccessProvider : getProvider(scope),
    );
    await service.configureProjectRoots({
      projects: [
        {
          projectId: alphaProjectId,
          backend: 'webaccess',
          directoryHandle: workspaceHandle,
          workspaceId: 'wsp_runtime_external',
          providerBasePath: `/${alphaProjectId}`,
        },
        {
          projectId: betaProjectId,
          backend: 'memory',
          storageRootKey: 'memory:vertical-beta',
          providerBasePath: `/${betaProjectId}`,
        },
      ],
      roots: [{ backend: 'webaccess', directoryHandle: workspaceHandle, workspaceId: 'wsp_runtime_external' }],
    });
    await service.writeFile(`/projects/${alphaProjectId}/src/main.ts`, placeholderSource);
    await service.writeFile(`/projects/${alphaProjectId}/shape.ts`, shapeSource(8));
    await service.writeFile(`/projects/${alphaProjectId}/request.ts`, requestSource(3));
    await service.writeFile(`/projects/${alphaProjectId}/.tau/parameters/src/main.ts.json`, parameterSource(12));
    await service.writeFile(`/projects/${betaProjectId}/shape.ts`, shapeSource(99));

    const workerScope = new EventTarget();
    vi.stubGlobal('self', workerScope);
    const exposed = exposeFileSystem(service, {
      changeEventBus: eventBus,
      handlerForRoot: (root, context) => service.createRootedFileSystem(root, context),
    });
    const bridgeWorker = {
      postMessage(message: unknown): void {
        workerScope.dispatchEvent(new MessageEvent('message', { data: message }));
      },
    } satisfies Pick<Worker, 'postMessage'>;

    const fileSystem = fromFileSystemBridge(() =>
      openFileSystemBridge(bridgeWorker as Worker, {
        messageType: filesystemBridgeConnectMessageType,
        root: `/projects/${alphaProjectId}`,
      }),
    );
    const firstRenderEntered = Promise.withResolvers<void>();
    const firstRenderAborted = Promise.withResolvers<void>();
    const releaseFirstRender = Promise.withResolvers<void>();
    let createGeometryCount = 0;
    const renderGate = defineMiddleware({
      id: 'rooted-runtime-first-render-gate',
      name: 'Rooted runtime first render gate',
      async wrapCreateGeometry(input, handler, { signal }) {
        createGeometryCount++;
        if (createGeometryCount === 1) {
          signal.addEventListener(
            'abort',
            () => {
              firstRenderAborted.resolve();
            },
            { once: true },
          );
          firstRenderEntered.resolve();
          await releaseFirstRender.promise;
        }
        return handler(input);
      },
    });
    const runtime = defineRuntime({
      kernels: [replicad()],
      middleware: [renderGate(), parameterFileResolver()],
      bundlers: [esbuild()],
    });
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });
    const geometries: HashedGeometryResult[] = [];
    const parameterFrames: GetParametersResult[] = [];
    const stopGeometry = client.on('geometry', (geometry) => geometries.push(geometry));
    const stopParameters = client.on('parametersResolved', (parameters) => parameterFrames.push(parameters));

    try {
      await client.connect();
      const initialPromise = client.render({ source: { path: 'src/main.ts' }, parameters: {} });
      await firstRenderEntered.promise;
      parameterFrames.length = 0;
      await service.writeFile(`/projects/${alphaProjectId}/src/main.ts`, mainSource);
      await firstRenderAborted.promise;
      releaseFirstRender.resolve();

      await expect(initialPromise).resolves.toEqual({ superseded: true });
      await vi.waitFor(
        () => {
          expect(geometries).toHaveLength(1);
          expect(parameterFrames).toHaveLength(1);
          const parameters = parameterFrames[0];
          expect(parameters?.success).toBe(true);
          if (parameters?.success) {
            expect(parameters.data.defaultParameters).toEqual({});
          }
          expect(client.renderStatus).toBe('ready');
        },
        { timeout: 15_000 },
      );
      const initialGeometry = geometries[0];
      if (!initialGeometry?.success) {
        throw new Error('Expected the watched Replicad successor to render successfully');
      }
      const initialHash = initialGeometry.data.hash;
      expect(geometries).toHaveLength(1);

      await service.writeFile(`/projects/${betaProjectId}/shape.ts`, shapeSource(100));
      await delay(75);
      expect(geometries).toHaveLength(1);

      const exact = await client.export('gltf', { source: { path: 'request.ts' }, parameters: {} });
      expect(exact.success).toBe(true);
      await service.writeFile(`/projects/${alphaProjectId}/request.ts`, requestSource(4));
      await delay(650);
      expect(geometries).toHaveLength(1);
      const changedExact = await client.export('gltf', { source: { path: 'request.ts' }, parameters: {} });
      expect(changedExact.success).toBe(true);
      if (exact.success && changedExact.success) {
        expect(changedExact.data[0]?.bytes).not.toEqual(exact.data[0]?.bytes);
      }

      await service.writeFile(`/projects/${alphaProjectId}/.tau/cache/geometry/peer-entry`, 'peer cache bytes');
      await delay(75);
      expect(geometries).toHaveLength(1);

      await webAccessProvider.writeFile(`/${alphaProjectId}/shape.ts`, shapeSource(9));
      if (externalObserverCallback === undefined) {
        throw new Error('Expected native filesystem observation to be active');
      }
      externalObserverCallback([
        {
          type: 'modified',
          changedHandle: fileHandle('shape.ts'),
          relativePathComponents: [alphaProjectId, 'shape.ts'],
        },
      ]);
      await vi.waitFor(
        () => {
          expect(geometries).toHaveLength(2);
        },
        { timeout: 15_000 },
      );
      const dependencyGeometry = geometries[1];
      expect(dependencyGeometry?.success).toBe(true);
      if (!dependencyGeometry?.success) {
        throw new Error('Expected a dependency edit to produce a successful rerender');
      }
      expect(dependencyGeometry.data.hash).not.toBe(initialHash);

      externalObserverCallback([
        {
          type: 'modified',
          changedHandle: fileHandle('shape.ts'),
          relativePathComponents: [alphaProjectId, 'shape.ts'],
        },
      ]);
      await delay(125);
      expect(geometries).toHaveLength(2);

      await service.writeFile(`/projects/${alphaProjectId}/.tau/parameters/src/main.ts.json`, parameterSource(16));
      await vi.waitFor(
        () => {
          expect(geometries).toHaveLength(3);
        },
        { timeout: 15_000 },
      );
      const parameterGeometry = geometries[2];
      expect(parameterGeometry?.success).toBe(true);
      if (!parameterGeometry?.success) {
        throw new Error('Expected a parameter-file edit to produce a successful rerender');
      }
      expect(parameterGeometry.data.hash).not.toBe(dependencyGeometry.data.hash);

      await client.shutdown({ drain: true });
      await vi.waitFor(() => {
        expect(exposed.activePorts.size).toBe(0);
      });
    } finally {
      stopGeometry();
      stopParameters();
      client.terminate();
      exposed.cleanup();
      service.dispose();
      webAccessProvider.dispose();
    }
  }, 60_000);
});
