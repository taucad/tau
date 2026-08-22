// @vitest-environment node
import { createActor, setup, waitFor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import { plugin as jscad } from '@taucad/jscad';
import { plugin as esbuild } from '@taucad/esbuild';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { gltfEdgeDetection } from '@taucad/middleware';
import { defineRuntime } from '@taucad/runtime/worker';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import { cadMachine } from '#machines/cad.machine.js';
import type { CadContext } from '#machines/cad.machine.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.definition.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

const validMain = [
  "import { primitives } from '@jscad/modeling';",
  "import makePart from './lib/part.js';",
  'void primitives;',
  'export default makePart;',
].join('\n');

const validPart = [
  "import { primitives } from '@jscad/modeling';",
  'export default function makePart() {',
  '  return primitives.cylinder({ radius: 1, height: 1 });',
  '}',
].join('\n');

const brokenPart = validPart.replace('radius: 1', 'radius: -1');

const fixtureRuntime = defineRuntime({
  configSchema: uiRuntimeConfigSchema,
  createRuntime: () => ({
    plugins: [jscad(), esbuild()],
    middleware: [gltfEdgeDetection()],
  }),
});

type FileManagerProbeContext = {
  contentService: Record<string, unknown>;
  openFileSystemBridge: (root: string) => FileSystemBridgeConnection;
};

const fileManagerProbe = setup({
  types: {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- XState setup requires type witnesses.
    context: {} as FileManagerProbeContext,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- XState setup requires type witnesses.
    input: {} as FileManagerProbeContext,
  },
}).createMachine({
  initial: 'ready',
  context: ({ input }) => input,
  states: { ready: {} },
});

const kernelOptionsFactory: LazyKernelOptionsFactory =
  async () =>
  ({ fileSystem }) => ({
    transport: inProcessTransport({ runtime: fixtureRuntime, fileSystem }),
    config: { tauApiUrl: 'https://api.test', tauWebSocketUrl: 'wss://api.test' },
  });

const createFixture = async (partSource: string) => {
  const providerRegistry = new ProviderRegistry();
  const provider = await providerRegistry.getProvider({
    backend: 'memory',
    storageRootKey: 'memory:kernel-entry-failure',
  });
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { backend: 'memory', storageRootKey: 'memory:kernel-entry-failure' });
  const eventBus = new ChangeEventBus();
  const fileService = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  await fileService.writeFile('/main.ts', validMain);
  await fileService.writeFile('/lib/part.ts', partSource);

  const { exposeFileSystem, filesystemBridgeConnectMessageType, openFileSystemBridge } =
    await import('@taucad/fs-bridge');
  const workerScope = new EventTarget();
  vi.stubGlobal('self', workerScope);
  const exposedFileSystem = exposeFileSystem(fileService, {
    changeEventBus: eventBus,
    handlerForRoot: (root, context) => fileService.createRootedFileSystem(root, context),
  });
  const bridgeWorker = {
    postMessage(message: unknown): void {
      workerScope.dispatchEvent(new MessageEvent('message', { data: message }));
    },
  } satisfies Pick<Worker, 'postMessage'>;
  const fileManagerRef = createActor(fileManagerProbe, {
    input: {
      contentService: fileService as unknown as Record<string, unknown>,
      openFileSystemBridge: (root) =>
        openFileSystemBridge(bridgeWorker as Worker, { messageType: filesystemBridgeConnectMessageType, root }),
    },
  }).start();

  return {
    fileService,
    createCadActor() {
      const actor = createActor(cadMachine, {
        input: {
          shouldInitializeKernelOnStart: false,
          fileManagerRef: fileManagerRef as unknown as NonNullable<CadContext['fileManagerRef']>,
          kernelOptionsFactory,
          fileSystemRoot: '/',
        },
      }).start();
      actor.send({ type: 'setRenderTimeout', renderTimeout: 0 });
      return actor;
    },
    dispose() {
      fileManagerRef.stop();
      exposedFileSystem.cleanup();
      vi.unstubAllGlobals();
    },
  };
};

describe('kernel entry failure settlement', { timeout: 30_000 }, () => {
  it('should settle a failed secondary unit after the warm main unit reports the same error', async () => {
    const fixture = await createFixture(validPart);
    const main = fixture.createCadActor();
    let secondary: ReturnType<typeof fixture.createCadActor> | undefined;

    try {
      const connectedMain = await waitFor(main, (snapshot) => snapshot.value === 'idle' || snapshot.value === 'error', {
        timeout: 5000,
      });
      expect(connectedMain.value, JSON.stringify([...connectedMain.context.kernelIssues])).toBe('idle');
      main.send({ type: 'initializeModel', entryPath: 'main.ts' });
      await waitFor(
        main,
        (snapshot) =>
          snapshot.value === 'idle' &&
          snapshot.context.geometry !== undefined &&
          snapshot.context.lastRequestedRenderId === 1 &&
          snapshot.context.lastSettledRenderId === 1,
        { timeout: 5000 },
      );
      const lastViewableMainGeometry = main.getSnapshot().context.geometry;
      expect(lastViewableMainGeometry).toBeDefined();

      await fixture.fileService.writeFile('/lib/part.ts', brokenPart);
      const failedMain = await waitFor(
        main,
        (snapshot) =>
          snapshot.value === 'idle' &&
          (snapshot.context.kernelIssues
            .get('main.ts')
            ?.some((issue) => issue.message.includes('radius must be positive')) ??
            false),
        { timeout: 5000 },
      );
      expect(failedMain.context.geometry).toBe(lastViewableMainGeometry);
      expect(failedMain.context.latestGeometryOutcome).toBe('failure');
      const returnedMain = await awaitFreshRender(main, { awaitTimeout: 5000 });
      expect(returnedMain).toBe(failedMain);
      expect(returnedMain.context.lastRequestedRenderId).toBe(1);
      expect(returnedMain.context.lastSettledRenderId).toBe(1);

      secondary = fixture.createCadActor();
      const connectedSecondary = await waitFor(
        secondary,
        (snapshot) => snapshot.value === 'idle' || snapshot.value === 'error',
        { timeout: 5000 },
      );
      expect(connectedSecondary.value, JSON.stringify([...connectedSecondary.context.kernelIssues])).toBe('idle');
      secondary.send({ type: 'initializeModel', entryPath: 'lib/part.ts' });
      const secondarySettlement = awaitFreshRender(secondary, { awaitTimeout: 5000 });
      const failedSecondary = await waitFor(
        secondary,
        (snapshot) =>
          snapshot.value === 'idle' &&
          (snapshot.context.kernelIssues
            .get('lib/part.ts')
            ?.some((issue) => issue.message.includes('radius must be positive')) ??
            false),
        { timeout: 5000 },
      );

      expect(failedSecondary.context.lastRequestedRenderId).toBe(1);
      expect(failedSecondary.context.lastSettledRenderId).toBe(1);
      expect(failedSecondary.context.latestGeometryOutcome).toBe('failure');
      await expect(secondarySettlement).resolves.toBe(failedSecondary);
    } finally {
      main.stop();
      secondary?.stop();
      fixture.dispose();
    }
  });

  it('should settle a failed fresh primary unit instead of timing out', async () => {
    const fixture = await createFixture(brokenPart);
    const primary = fixture.createCadActor();

    try {
      const connectedPrimary = await waitFor(
        primary,
        (snapshot) => snapshot.value === 'idle' || snapshot.value === 'error',
        { timeout: 5000 },
      );
      expect(connectedPrimary.value, JSON.stringify([...connectedPrimary.context.kernelIssues])).toBe('idle');
      primary.send({ type: 'initializeModel', entryPath: 'main.ts' });
      const primarySettlement = awaitFreshRender(primary, { awaitTimeout: 5000 });
      const failedPrimary = await waitFor(
        primary,
        (snapshot) =>
          snapshot.value === 'idle' &&
          (snapshot.context.kernelIssues
            .get('main.ts')
            ?.some((issue) => issue.message.includes('radius must be positive')) ??
            false),
        { timeout: 5000 },
      );

      expect(failedPrimary.context.lastRequestedRenderId).toBe(1);
      expect(failedPrimary.context.lastSettledRenderId).toBe(1);
      expect(failedPrimary.context.latestGeometryOutcome).toBe('failure');
      await expect(primarySettlement).resolves.toBe(failedPrimary);
    } finally {
      primary.stop();
      fixture.dispose();
    }
  });
});
