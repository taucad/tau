// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { assign, createActor, setup, waitFor } from 'xstate';
import { RenderTimeoutError } from '@taucad/runtime';
import type { CapabilitiesManifest, KernelIssue, TelemetryEntry } from '@taucad/runtime';
import { createMockRuntimeClient } from '@taucad/runtime-testing';
import type { Geometry } from '@taucad/types';
import { defaultRenderTimeout } from '#constants/editor.constants.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { cadMachine } from '#machines/cad.machine.js';
import type { CadContext } from '#machines/cad.machine.js';
import { logMachine } from '#machines/logs.machine.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { AppRuntimeClient, KernelOptionsFactory, LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

const noop = () => {
  /* No-op */
};

const createMockAppRuntimeClient = () => createMockRuntimeClient<typeof runtime>();

const createKernelOptionsFactory = (): LazyKernelOptionsFactory => async () => () =>
  mock<ReturnType<KernelOptionsFactory>>({
    config: {
      tauApiUrl: 'https://api.test',
      tauWebSocketUrl: 'wss://api.test',
    },
  });

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createTestActor(options?: {
  connectResult?: () => Promise<{
    type: 'kernelConnected';
    client: AppRuntimeClient;
    cleanups: Array<() => void>;
  }>;
  connectError?: Error;
  shouldInitializeKernelOnStart?: boolean;
  parentRef?: CadContext['parentRef'];
  logRef?: CadContext['logActorRef'];
}) {
  const mockClient = createMockAppRuntimeClient();
  const cleanups: Array<() => void> = [];

  const connectWork =
    options?.connectResult ??
    (options?.connectError
      ? async () => {
          // oxlint-disable-next-line @typescript-eslint/only-throw-error -- test stub
          throw options.connectError;
        }
      : async () => {
          await Promise.resolve();
          return { type: 'kernelConnected', client: mockClient, cleanups };
        });

  const machine = cadMachine.provide({
    actors: {
      connectKernelActor: fromSafeAsync(connectWork),
    },
  });

  const kernelOptionsFactory = createKernelOptionsFactory();

  const actor = createActor(machine, {
    input: {
      shouldInitializeKernelOnStart: options?.shouldInitializeKernelOnStart ?? false,
      parentRef: options?.parentRef,
      logRef: options?.logRef,
      kernelOptionsFactory,
      fileSystemRoot: '/projects/test',
    },
  });

  return { actor, mockClient, cleanups };
}

async function startAndConnect(options?: Parameters<typeof createTestActor>[0]) {
  const result = createTestActor(options);
  result.actor.start();
  await waitFor(result.actor, (s) => s.value !== 'connecting');
  return result;
}

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

const stubEntryPath = 'main.ts';

const stubGeometry: Geometry = { format: 'gltf', content: new Uint8Array(0), hash: 'stub' };

const stubIssues: KernelIssue[] = [{ message: 'test issue', code: 'RUNTIME', type: 'runtime', severity: 'warning' }];
const stubFailureIssues: KernelIssue[] = [
  { message: 'radius must be positive', code: 'RUNTIME', type: 'runtime', severity: 'error' },
];

type AppRuntimeExportRoute = NonNullable<ReturnType<AppRuntimeClient['bestRouteFor']>>;

const stubExportRoute = {
  targetFormat: 'glb',
  kernelId: 'replicad',
  sourceFormat: 'gltf',
  fidelity: 'mesh',
  exportOptions: { schema: {}, defaults: {} },
} satisfies AppRuntimeExportRoute;

const stubCapabilities: CapabilitiesManifest = {
  routes: [stubExportRoute],
  renderCapabilities: {},
  registrations: [],
};

type ExportAvailabilityEvent = {
  type: 'geometryUnit.exportAvailabilityChanged';
  actorId: string;
  available: boolean;
};

function createParentActor() {
  const parentMachine = setup({
    types: {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
      context: {} as { events: ExportAvailabilityEvent[] },
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
      events: {} as ExportAvailabilityEvent,
    },
    actions: {
      recordAvailability: assign({
        events: ({ context, event }) => [...context.events, event],
      }),
    },
  }).createMachine({
    context: { events: [] },
    on: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- XState event name
      'geometryUnit.exportAvailabilityChanged': {
        actions: 'recordAvailability',
      },
    },
  });

  return createActor(parentMachine).start();
}

function createExportableRuntimeClient(): AppRuntimeClient {
  const client = createMockAppRuntimeClient();
  Object.defineProperty(client, 'capabilities', {
    value: stubCapabilities,
    configurable: true,
  });
  vi.mocked(client.bestRouteFor).mockImplementation((format) =>
    format === stubExportRoute.targetFormat ? stubExportRoute : undefined,
  );
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cadMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // State: connecting
  // =========================================================================
  describe('connecting', () => {
    it('should start in connecting state', () => {
      const { actor } = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('connecting');
      actor.stop();
    });

    it('should transition to idle on successful connection', async () => {
      const { actor } = await startAndConnect();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should set kernelClient in context after connection', async () => {
      const { actor } = await startAndConnect();
      expect(actor.getSnapshot().context.kernelClient).toBeDefined();
      actor.stop();
    });

    it('should transition to error on connection failure', async () => {
      const { actor } = await startAndConnect({
        connectError: new Error('Connection refused'),
      });
      expect(actor.getSnapshot().value).toBe('error');
      const issues = actor.getSnapshot().context.kernelIssues;
      expect(issues.get('__connection__')?.[0]?.message).toBe('Connection refused');
      actor.stop();
    });

    it('should buffer initializeModel during connecting and forward on connect', async () => {
      let resolveConnect!: () => void;
      const mockClient = createMockAppRuntimeClient();

      const { actor } = createTestActor({
        connectResult: async () =>
          new Promise((resolve) => {
            resolveConnect = () => {
              resolve({ type: 'kernelConnected', client: mockClient, cleanups: [] as Array<() => void> });
            };
          }),
      });
      actor.start();
      expect(actor.getSnapshot().value).toBe('connecting');

      actor.send({
        type: 'initializeModel',
        entryPath: stubEntryPath,
        parameters: { width: 10 },
      });

      expect(actor.getSnapshot().context.entryPath).toEqual(stubEntryPath);
      expect(actor.getSnapshot().context.parameters).toEqual({ width: 10 });

      resolveConnect();
      await waitFor(actor, (s) => s.value === 'idle');

      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: { width: 10 },
        content: { includeEdges: true },
      });
      actor.stop();
    });

    it('should buffer setEntryPath during connecting', () => {
      const { actor } = createTestActor({
        connectResult: async () => new Promise<never>(noop),
      });
      actor.start();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(actor.getSnapshot().context.entryPath).toEqual(stubEntryPath);
      actor.stop();
    });

    it('should buffer setParameters during connecting', () => {
      const { actor } = createTestActor({
        connectResult: async () => new Promise<never>(noop),
      });
      actor.start();

      actor.send({ type: 'setParameters', parameters: { depth: 5 } });
      expect(actor.getSnapshot().context.parameters).toEqual({ depth: 5 });
      actor.stop();
    });

    it('should stay in connecting when actor never settles (simulates abort)', async () => {
      const { actor } = createTestActor({
        connectResult: async () =>
          new Promise<never>(
            // oxlint-disable-next-line no-empty-function -- mock stub for never-settling promise
            () => {},
          ),
      });
      actor.start();
      expect(actor.getSnapshot().value).toBe('connecting');

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      expect(actor.getSnapshot().value).toBe('connecting');
      expect(actor.getSnapshot().context.kernelIssues.has('__connection__')).toBe(false);
      actor.stop();
    });

    it('should transition to error on DOMException AbortError reaching onError', async () => {
      const { actor } = await startAndConnect({
        connectError: new DOMException('The operation was aborted', 'AbortError'),
      });
      expect(actor.getSnapshot().value).toBe('error');
      const issues = actor.getSnapshot().context.kernelIssues;
      expect(issues.get('__connection__')?.[0]?.message).toBe('The operation was aborted');
      actor.stop();
    });

    it('should transition to error on non-abort DOMException', async () => {
      const { actor } = await startAndConnect({
        connectError: new DOMException('Network error', 'NetworkError'),
      });
      expect(actor.getSnapshot().value).toBe('error');
      const issues = actor.getSnapshot().context.kernelIssues;
      expect(issues.get('__connection__')?.[0]?.message).toBe('Network error');
      actor.stop();
    });
  });

  // =========================================================================
  // State: idle
  // =========================================================================
  describe('idle', () => {
    it('should forward setEntryPath to runtime client as render', async () => {
      const { actor, mockClient } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: {},
        content: { includeEdges: true },
      });
      expect(actor.getSnapshot().context.entryPath).toEqual(stubEntryPath);
      actor.stop();
    });

    it('should update context on setParameters without forwarding to kernel from cad.machine', async () => {
      const { actor, mockClient } = await startAndConnect();

      actor.send({ type: 'setParameters', parameters: { height: 20 } });
      expect(mockClient.updateParameters).not.toHaveBeenCalled();
      expect(actor.getSnapshot().context.parameters).toEqual({ height: 20 });
      actor.stop();
    });

    it('should forward initializeModel as render with parameters', async () => {
      const { actor, mockClient } = await startAndConnect();

      actor.send({
        type: 'initializeModel',
        entryPath: stubEntryPath,
        parameters: { width: 10 },
      });
      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: { width: 10 },
        content: { includeEdges: true },
      });
      expect(actor.getSnapshot().context.entryPath).toEqual(stubEntryPath);
      actor.stop();
    });

    it('should preserve a nested entry path across concurrent CAD actors', async () => {
      const [main, nested] = await Promise.all([startAndConnect(), startAndConnect()]);

      main.actor.send({
        type: 'initializeModel',
        entryPath: 'main.scad',
      });
      nested.actor.send({
        type: 'initializeModel',
        entryPath: 'lib/cube.scad',
      });

      expect(main.mockClient.render).toHaveBeenCalledOnce();
      expect(main.mockClient.render).toHaveBeenCalledWith({
        source: { path: 'main.scad' },
        parameters: {},
        content: { includeEdges: true },
      });
      expect(nested.mockClient.render).toHaveBeenCalledOnce();
      expect(nested.mockClient.render).toHaveBeenCalledWith({
        source: { path: 'lib/cube.scad' },
        parameters: {},
        content: { includeEdges: true },
      });
      expect(main.actor.getSnapshot().context.entryPath).toBe('main.scad');
      expect(nested.actor.getSnapshot().context.entryPath).toBe('lib/cube.scad');

      main.actor.stop();
      nested.actor.stop();
    });

    it('should surface a rejected nested render request as a CAD error', async () => {
      const renderError = new TypeError('Nested render failed');

      const mockClient = createMockAppRuntimeClient();
      vi.mocked(mockClient.render).mockRejectedValueOnce(renderError);
      const { actor } = await startAndConnect({
        connectResult: async () => ({ type: 'kernelConnected', client: mockClient, cleanups: [] }),
      });

      actor.send({
        type: 'initializeModel',
        entryPath: 'lib/cube.scad',
      });
      await waitFor(actor, (state) => state.matches('error'));

      const snapshot = actor.getSnapshot();
      actor.stop();

      expect(snapshot.value).toBe('error');
      expect(snapshot.context.kernelIssues.get('lib/cube.scad')).toEqual([
        {
          message: renderError.message,
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    });

    it('should preserve a rejected render timeout as the canonical issue code', async () => {
      const renderError = new RenderTimeoutError(30_000);
      const mockClient = createMockAppRuntimeClient();
      vi.mocked(mockClient.render).mockRejectedValueOnce(renderError);
      const { actor } = await startAndConnect({
        connectResult: async () => ({ type: 'kernelConnected', client: mockClient, cleanups: [] }),
      });

      actor.send({ type: 'initializeModel', entryPath: stubEntryPath });
      await waitFor(actor, (state) => state.matches('error'));

      expect(actor.getSnapshot().context.kernelIssues.get(stubEntryPath)).toEqual([
        {
          message: renderError.message,
          code: 'RENDER_TIMEOUT',
          type: 'runtime',
          severity: 'error',
        },
      ]);
      actor.stop();
    });

    it('should transition to rendering on stateChanged(rendering)', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);
      actor.stop();
    });

    it('should transition to error on stateChanged(error)', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'stateChanged', state: 'error' });
      expect(actor.getSnapshot().value).toBe('error');
      actor.stop();
    });

    it('should stay in idle on stateChanged(idle)', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'stateChanged', state: 'idle' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should update geometry on geometryComputed', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });
      expect(actor.getSnapshot().context.geometry).toEqual(stubGeometry);
      expect(actor.getSnapshot().context.latestGeometryOutcome).toBe('success');
      actor.stop();
    });

    it('should settle failed geometry while retaining the last viewable artifact', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({ type: 'geometryComputed', geometry: stubGeometry, issues: [] });
      actor.send({ type: 'setParameters', parameters: { radius: -1 } });
      const requestedRenderId = actor.getSnapshot().context.lastRequestedRenderId;
      expect(actor.getSnapshot().context.geometry).toBe(stubGeometry);
      expect(actor.getSnapshot().context.latestGeometryOutcome).toBeUndefined();

      actor.send({ type: 'geometryFailed', issues: stubFailureIssues });

      const { context } = actor.getSnapshot();
      expect(context.geometry).toBe(stubGeometry);
      expect(context.latestGeometryOutcome).toBe('failure');
      expect(context.kernelIssues.get(stubEntryPath)).toBe(stubFailureIssues);
      expect(context.lastSettledRenderId).toBe(requestedRenderId);
      actor.stop();
    });

    it('should store kernel issues with geometryComputed', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: stubIssues,
      });

      const issues = actor.getSnapshot().context.kernelIssues;
      expect(issues.get('main.ts')).toEqual(stubIssues);
      actor.stop();
    });

    it('should clear kernel issues on geometryComputed with no issues', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: stubIssues,
      });
      expect(actor.getSnapshot().context.kernelIssues.has('main.ts')).toBe(true);

      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });
      expect(actor.getSnapshot().context.kernelIssues.has('main.ts')).toBe(false);
      actor.stop();
    });

    it('should set default parameters on parametersParsed', async () => {
      const { actor } = await startAndConnect();
      const schema = { type: 'object', properties: { width: { type: 'number' } } } as const;

      actor.send({
        type: 'parametersParsed',
        defaultParameters: { width: 42 },
        jsonSchema: schema,
      });

      expect(actor.getSnapshot().context.defaultParameters).toEqual({ width: 42 });
      expect(actor.getSnapshot().context.jsonSchema).toEqual(schema);
      actor.stop();
    });

    it('should set code issues on setCodeIssues', async () => {
      const { actor } = await startAndConnect();

      const codeIssues = mock<CadContext['codeIssues']>([
        { message: 'syntax error', startLineNumber: 0, endLineNumber: 0, startColumn: 0, endColumn: 0 },
      ]);
      actor.send({ type: 'setCodeIssues', errors: codeIssues });
      expect(actor.getSnapshot().context.codeIssues).toEqual(codeIssues);
      actor.stop();
    });

    it('should emit geometryEvaluated on geometryComputed', async () => {
      const { actor } = await startAndConnect();
      const emitted: unknown[] = [];
      actor.on('geometryEvaluated', (event) => emitted.push(event));

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ type: 'geometryEvaluated', geometry: stubGeometry });
      actor.stop();
    });

    it('should keep running availability-affecting transitions without a parentRef', async () => {
      const mockClient = createExportableRuntimeClient();
      const { actor } = await startAndConnect({
        connectResult: async () => ({ type: 'kernelConnected', client: mockClient, cleanups: [] }),
      });

      actor.send({ type: 'activeKernelChanged', kernelId: 'replicad' });
      actor.send({ type: 'geometryComputed', geometry: stubGeometry, issues: [] });

      expect(actor.getSnapshot().context.geometry).toBe(stubGeometry);
      expect(actor.getSnapshot().context.activeKernelId).toBe('replicad');
      actor.stop();
    });

    it('should notify the parentRef when export availability becomes true', async () => {
      const parentRef = createParentActor();
      const mockClient = createExportableRuntimeClient();
      const { actor } = await startAndConnect({
        parentRef,
        connectResult: async () => ({ type: 'kernelConnected', client: mockClient, cleanups: [] }),
      });

      actor.send({ type: 'activeKernelChanged', kernelId: 'replicad' });
      actor.send({ type: 'geometryComputed', geometry: stubGeometry, issues: [] });

      await waitFor(parentRef, (state) => state.context.events.some((event) => event.available));
      const availableEvent = parentRef.getSnapshot().context.events.find((event) => event.available);
      expect(availableEvent).toEqual({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actor.id,
        available: true,
      });

      actor.stop();
      parentRef.stop();
    });

    it('should retain viewable geometry but disable export while initializeModel is pending', async () => {
      const parentRef = createParentActor();
      const mockClient = createExportableRuntimeClient();
      const { actor } = await startAndConnect({
        parentRef,
        connectResult: async () => ({ type: 'kernelConnected', client: mockClient, cleanups: [] }),
      });

      actor.send({ type: 'activeKernelChanged', kernelId: 'replicad' });
      actor.send({ type: 'geometryComputed', geometry: stubGeometry, issues: [] });
      await waitFor(parentRef, (state) => state.context.events.some((event) => event.available));

      actor.send({ type: 'initializeModel', entryPath: stubEntryPath });

      await waitFor(parentRef, (state) => state.context.events.at(-1)?.available === false);
      expect(parentRef.getSnapshot().context.events.at(-1)).toEqual({
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: actor.id,
        available: false,
      });
      expect(actor.getSnapshot().context.geometry).toBe(stubGeometry);
      expect(actor.getSnapshot().context.latestGeometryOutcome).toBeUndefined();

      actor.stop();
      parentRef.stop();
    });

    it('should disable export after failure without clearing viewable geometry', async () => {
      const parentRef = createParentActor();
      const mockClient = createExportableRuntimeClient();
      const { actor } = await startAndConnect({
        parentRef,
        connectResult: async () => ({ type: 'kernelConnected', client: mockClient, cleanups: [] }),
      });

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({ type: 'activeKernelChanged', kernelId: 'replicad' });
      actor.send({ type: 'geometryComputed', geometry: stubGeometry, issues: [] });
      await waitFor(parentRef, (state) => state.context.events.at(-1)?.available === true);

      actor.send({ type: 'geometryFailed', issues: stubFailureIssues });

      await waitFor(parentRef, (state) => state.context.events.at(-1)?.available === false);
      expect(actor.getSnapshot().context.geometry).toBe(stubGeometry);
      expect(parentRef.getSnapshot().context.events.at(-1)?.available).toBe(false);
      actor.stop();
      parentRef.stop();
    });
  });

  describe('kernel logs', () => {
    it.each([undefined, { component: 'Replicad', operation: 'render' }, { component: 'Replicad', file: '/main.ts' }])(
      'should attribute %j origin to the current compilation unit',
      async (origin) => {
        vi.spyOn(console, 'debug').mockImplementation(noop);
        const logRef = createActor(logMachine).start();
        const { actor } = await startAndConnect({ logRef });
        actor.send({ type: 'initializeModel', entryPath: stubEntryPath });
        await waitFor(actor, (snapshot) => snapshot.matches('idle'));

        actor.send({
          type: 'kernelLog',
          level: 'info',
          message: 'kernel ready',
          origin,
          data: { threads: 4 },
        });
        await waitFor(logRef, (snapshot) => snapshot.context.logBuffer.size === 1);

        expect(logRef.getSnapshot().context.logBuffer.get(0)).toMatchObject({
          level: 'info',
          message: 'kernel ready',
          origin: {
            ...origin,
            file: stubEntryPath,
          },
          data: { threads: 4 },
        });

        actor.stop();
        logRef.stop();
      },
    );

    it('should retain project logs when a compilation unit initializes', async () => {
      const logRef = createActor(logMachine).start();
      logRef.send({ type: 'addLog', message: 'existing project log' });
      const { actor } = await startAndConnect({ logRef });

      actor.send({ type: 'initializeModel', entryPath: stubEntryPath });

      expect(
        logRef
          .getSnapshot()
          .context.logBuffer.toArray()
          .map(({ message }) => message),
      ).toEqual(['existing project log']);

      actor.stop();
      logRef.stop();
    });
  });

  // =========================================================================
  // State: rendering
  // =========================================================================
  describe('rendering', () => {
    async function enterRendering() {
      const result = await startAndConnect();
      result.actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(result.actor.getSnapshot().matches('rendering')).toBe(true);
      return result;
    }

    it('should stay in rendering on geometryComputed and store geometry', async () => {
      const { actor } = await enterRendering();

      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);
      expect(actor.getSnapshot().context.geometry).toBe(stubGeometry);
      actor.stop();
    });

    it('should transition to idle on stateChanged(idle)', async () => {
      const { actor } = await enterRendering();

      actor.send({ type: 'stateChanged', state: 'idle' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should stay in rendering on kernelIssue and store issues', async () => {
      const { actor } = await enterRendering();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({ type: 'kernelIssue', errors: stubIssues });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);
      expect(actor.getSnapshot().context.kernelIssues.get(stubEntryPath)).toBe(stubIssues);
      actor.stop();
    });

    it('should transition to error on stateChanged(error)', async () => {
      const { actor } = await enterRendering();

      actor.send({ type: 'stateChanged', state: 'error' });
      expect(actor.getSnapshot().value).toBe('error');
      actor.stop();
    });

    it('should transition to buffering on stateChanged(buffering)', async () => {
      const { actor } = await enterRendering();

      actor.send({ type: 'stateChanged', state: 'buffering' });
      expect(actor.getSnapshot().value).toBe('buffering');
      actor.stop();
    });

    it('should clear renderPhase when exiting rendering state', async () => {
      const { actor } = await enterRendering();

      actor.send({ type: 'kernelProgress', phase: 'Meshing' });
      expect(actor.getSnapshot().context.renderPhase).toBe('Meshing');

      actor.send({ type: 'stateChanged', state: 'idle' });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.renderPhase).toBeUndefined();
      actor.stop();
    });

    it('should accept setEntryPath during rendering (forwards to client as render)', async () => {
      const { actor, mockClient } = await enterRendering();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: {},
        content: { includeEdges: true },
      });
      actor.stop();
    });

    it('should update context on setParameters during rendering without forwarding', async () => {
      const { actor, mockClient } = await enterRendering();

      actor.send({ type: 'setParameters', parameters: { depth: 5 } });
      expect(mockClient.updateParameters).not.toHaveBeenCalled();
      expect(actor.getSnapshot().context.parameters).toEqual({ depth: 5 });
      actor.stop();
    });

    it('should track progress during rendering', async () => {
      const { actor } = await enterRendering();

      actor.send({ type: 'kernelProgress', phase: 'bundling' });
      expect(actor.getSnapshot().context.renderPhase).toBe('bundling');
      actor.stop();
    });

    it('should store telemetry during rendering', async () => {
      const { actor } = await enterRendering();

      const entries = mock<TelemetryEntry[]>([{ name: 'test', startTime: 0, duration: 100, workerTimeOrigin: 0 }]);
      actor.send({ type: 'kernelTelemetry', entries });
      expect(actor.getSnapshot().context.telemetryEntries).toHaveLength(1);
      actor.stop();
    });
  });

  // =========================================================================
  // State: buffering
  // =========================================================================
  describe('buffering', () => {
    async function enterBuffering() {
      const result = await startAndConnect();
      result.actor.send({ type: 'stateChanged', state: 'buffering' });
      expect(result.actor.getSnapshot().value).toBe('buffering');
      return result;
    }

    it('should transition to buffering on stateChanged(buffering) from idle', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'stateChanged', state: 'buffering' });
      expect(actor.getSnapshot().value).toBe('buffering');
      actor.stop();
    });

    it('should transition to rendering on stateChanged(rendering) from buffering', async () => {
      const { actor } = await enterBuffering();

      actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);
      actor.stop();
    });

    it('should transition to idle on stateChanged(idle) from buffering', async () => {
      const { actor } = await enterBuffering();

      actor.send({ type: 'stateChanged', state: 'idle' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should transition to error on stateChanged(error) from buffering', async () => {
      const { actor } = await enterBuffering();

      actor.send({ type: 'stateChanged', state: 'error' });
      expect(actor.getSnapshot().value).toBe('error');
      actor.stop();
    });

    it('should accept setEntryPath during buffering and forward to client', async () => {
      const { actor, mockClient } = await enterBuffering();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: {},
        content: { includeEdges: true },
      });
      actor.stop();
    });

    it('should accept setParameters during buffering', async () => {
      const { actor } = await enterBuffering();

      actor.send({ type: 'setParameters', parameters: { width: 10 } });
      expect(actor.getSnapshot().context.parameters).toEqual({ width: 10 });
      actor.stop();
    });

    it('should accept geometryComputed during buffering and store geometry', async () => {
      const { actor } = await enterBuffering();

      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });
      expect(actor.getSnapshot().value).toBe('buffering');
      expect(actor.getSnapshot().context.geometry).toBe(stubGeometry);
      actor.stop();
    });

    it('should transition to buffering on stateChanged(buffering) from error', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'stateChanged', state: 'error' });
      expect(actor.getSnapshot().value).toBe('error');

      actor.send({ type: 'stateChanged', state: 'buffering' });
      expect(actor.getSnapshot().value).toBe('buffering');
      actor.stop();
    });
  });

  // =========================================================================
  // State: error
  // =========================================================================
  describe('error', () => {
    async function enterError() {
      const result = await startAndConnect();
      result.actor.send({ type: 'stateChanged', state: 'error' });
      expect(result.actor.getSnapshot().value).toBe('error');
      return result;
    }

    it('should reconnect on setEntryPath from error state', async () => {
      const mockClient = createMockAppRuntimeClient();
      let connectAttempt = 0;

      const { actor } = createTestActor({
        connectResult: async () => {
          connectAttempt++;
          if (connectAttempt === 1) {
            throw new Error('Connection refused');
          }
          return { type: 'kernelConnected', client: mockClient, cleanups: [] as Array<() => void> };
        },
      });
      actor.start();
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.kernelClient).toBeUndefined();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(actor.getSnapshot().value).toBe('connecting');

      await waitFor(actor, (s) => s.value === 'idle');
      expect(actor.getSnapshot().context.kernelClient).toBeDefined();
      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: {},
        content: { includeEdges: true },
      });
      actor.stop();
    });

    it('should reconnect on initializeModel from error state', async () => {
      const mockClient = createMockAppRuntimeClient();
      let connectAttempt = 0;

      const { actor } = createTestActor({
        connectResult: async () => {
          connectAttempt++;
          if (connectAttempt === 1) {
            throw new Error('Connection refused');
          }
          return { type: 'kernelConnected', client: mockClient, cleanups: [] as Array<() => void> };
        },
      });
      actor.start();
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.kernelClient).toBeUndefined();

      actor.send({
        type: 'initializeModel',
        entryPath: stubEntryPath,
        parameters: { width: 10 },
      });
      expect(actor.getSnapshot().value).toBe('connecting');
      expect(actor.getSnapshot().context.entryPath).toEqual(stubEntryPath);

      await waitFor(actor, (s) => s.value === 'idle');
      expect(actor.getSnapshot().context.kernelClient).toBeDefined();
      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: { width: 10 },
        content: { includeEdges: true },
      });
      actor.stop();
    });

    it('should stay in error on setParameters and only update context', async () => {
      const mockClient = createMockAppRuntimeClient();
      let connectAttempt = 0;

      const { actor } = createTestActor({
        connectResult: async () => {
          connectAttempt++;
          if (connectAttempt === 1) {
            throw new Error('Connection refused');
          }
          return { type: 'kernelConnected', client: mockClient, cleanups: [] as Array<() => void> };
        },
      });
      actor.start();
      await waitFor(actor, (s) => s.value === 'error');

      actor.send({ type: 'setParameters', parameters: { depth: 5 } });
      expect(actor.getSnapshot().value).toBe('error');
      expect(actor.getSnapshot().context.parameters).toEqual({ depth: 5 });
      actor.stop();
    });

    it('should reconnect on initializeModel even when kernelClient existed', async () => {
      const { actor } = await enterError();
      expect(actor.getSnapshot().context.kernelClient).toBeDefined();

      actor.send({
        type: 'initializeModel',
        entryPath: stubEntryPath,
        parameters: { width: 10 },
      });
      expect(actor.getSnapshot().value).toBe('connecting');
      actor.stop();
    });

    it('should reconnect on setEntryPath even when kernelClient existed', async () => {
      const { actor } = await enterError();
      expect(actor.getSnapshot().context.kernelClient).toBeDefined();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(actor.getSnapshot().value).toBe('connecting');
      actor.stop();
    });

    it('should stay in error on setParameters even when kernelClient existed', async () => {
      const { actor } = await enterError();
      expect(actor.getSnapshot().context.kernelClient).toBeDefined();

      actor.send({ type: 'setParameters', parameters: { depth: 5 } });
      expect(actor.getSnapshot().value).toBe('error');
      expect(actor.getSnapshot().context.parameters).toEqual({ depth: 5 });
      actor.stop();
    });

    it('should transition to idle on stateChanged(idle)', async () => {
      const { actor } = await enterError();

      actor.send({ type: 'stateChanged', state: 'idle' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should transition to rendering on stateChanged(rendering)', async () => {
      const { actor } = await enterError();

      actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);
      actor.stop();
    });

    it('should store kernel issues in error state on kernelIssue', async () => {
      const result = await startAndConnect();
      result.actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      result.actor.send({ type: 'stateChanged', state: 'error' });
      expect(result.actor.getSnapshot().value).toBe('error');

      result.actor.send({ type: 'kernelIssue', errors: stubIssues });
      expect(result.actor.getSnapshot().value).toBe('error');
      expect(result.actor.getSnapshot().context.kernelIssues.get(stubEntryPath)).toBe(stubIssues);
      result.actor.stop();
    });

    it('should preserve kernel issues set in rendering after transition to error', async () => {
      const result = await startAndConnect();
      result.actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      result.actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(result.actor.getSnapshot().matches('rendering')).toBe(true);

      result.actor.send({ type: 'kernelIssue', errors: stubIssues });
      expect(result.actor.getSnapshot().context.kernelIssues.get(stubEntryPath)).toBe(stubIssues);

      result.actor.send({ type: 'stateChanged', state: 'error' });
      expect(result.actor.getSnapshot().value).toBe('error');
      expect(result.actor.getSnapshot().context.kernelIssues.get(stubEntryPath)).toBe(stubIssues);
      result.actor.stop();
    });
  });

  // =========================================================================
  // Cleanup (destroyKernel exit action)
  // =========================================================================
  describe('cleanup', () => {
    it('should wire destroyKernel as a root exit action', () => {
      expect(cadMachine.config.exit).toContainEqual('destroyKernel');
    });

    it('should store event cleanups from connect result', async () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      const mockClient = createMockAppRuntimeClient();

      const { actor } = await startAndConnect({
        connectResult: async () => {
          return { type: 'kernelConnected', client: mockClient, cleanups: [cleanup1, cleanup2] };
        },
      });

      expect(actor.getSnapshot().context.eventCleanups).toHaveLength(2);
      actor.stop();
    });

    it('should store runtime client in context after connection', async () => {
      const { actor } = await startAndConnect();

      expect(actor.getSnapshot().context.kernelClient).toBeDefined();
      actor.stop();
    });
  });

  // =========================================================================
  // Context initialization
  // =========================================================================
  describe('context initialization', () => {
    it('should initialize with correct defaults', () => {
      const { actor } = createTestActor();
      actor.start();
      const { context } = actor.getSnapshot();

      expect(context.entryPath).toBeUndefined();
      expect(context.screenshot).toBeUndefined();
      expect(context.parameters).toEqual({});
      expect(context.defaultParameters).toEqual({});
      expect(context.latestGeometryOutcome).toBeUndefined();
      expect(context.geometry).toBeUndefined();
      expect(context.kernelIssues.size).toBe(0);
      expect(context.codeIssues).toEqual([]);
      expect(context.kernelClient).toBeUndefined();
      expect(context.eventCleanups).toEqual([]);
      expect(context.renderPhase).toBeUndefined();
      expect(context.telemetryEntries).toEqual([]);
      expect(context.units).toEqual({ length: 'mm' });

      actor.stop();
    });
  });

  // =========================================================================
  // Multi-event flows
  // =========================================================================
  describe('multi-event flows', () => {
    it('should handle full render cycle: idle -> rendering -> geometryComputed + stateChanged -> idle', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);

      actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);

      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);
      expect(actor.getSnapshot().context.geometry).toEqual(stubGeometry);

      actor.send({ type: 'stateChanged', state: 'idle' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should handle setEntryPath during rendering (abort + new render)', async () => {
      const { actor, mockClient } = await startAndConnect();

      actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);

      const newEntryPath = 'other.ts';
      actor.send({ type: 'setEntryPath', entryPath: newEntryPath });
      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: newEntryPath },
        parameters: {},
        content: { includeEdges: true },
      });
      expect(actor.getSnapshot().context.entryPath).toEqual(newEntryPath);

      actor.send({ type: 'stateChanged', state: 'idle' });
      actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);

      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);

      actor.send({ type: 'stateChanged', state: 'idle' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should handle error recovery: error -> setEntryPath -> reconnect -> idle -> rendering -> idle', async () => {
      const mockClient = createMockAppRuntimeClient();

      const { actor } = createTestActor({
        connectResult: async () => {
          return { type: 'kernelConnected', client: mockClient, cleanups: [] as Array<() => void> };
        },
      });
      actor.start();
      await waitFor(actor, (s) => s.value === 'idle');

      actor.send({ type: 'stateChanged', state: 'error' });
      expect(actor.getSnapshot().value).toBe('error');

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(actor.getSnapshot().value).toBe('connecting');

      await waitFor(actor, (s) => s.value === 'idle');
      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: {},
        content: { includeEdges: true },
      });

      actor.send({ type: 'stateChanged', state: 'rendering' });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);

      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });
      expect(actor.getSnapshot().matches('rendering')).toBe(true);

      actor.send({ type: 'stateChanged', state: 'idle' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should clear file-specific issues on setEntryPath', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: stubIssues,
      });
      expect(actor.getSnapshot().context.kernelIssues.has('main.ts')).toBe(true);

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      expect(actor.getSnapshot().context.kernelIssues.has('main.ts')).toBe(false);
      actor.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Render timeout forwarding
  // ---------------------------------------------------------------------------

  describe('render timeout', () => {
    it('should apply a connected timeout synchronously without changing state', async () => {
      const { actor, mockClient } = await startAndConnect();
      vi.mocked(mockClient.setRenderTimeout).mockClear();
      vi.mocked(mockClient.setOptions).mockClear();
      const priorState = actor.getSnapshot().value;

      actor.send({ type: 'setRenderTimeout', renderTimeout: 60_000 });

      expect(actor.getSnapshot().context.renderTimeout).toBe(60_000);
      expect(actor.getSnapshot().value).toEqual(priorState);
      expect(mockClient.setRenderTimeout).toHaveBeenCalledExactlyOnceWith(60_000);
      expect(mockClient.setOptions).not.toHaveBeenCalled();
      actor.stop();
    });

    it('should apply the latest stored timeout when connection settles', async () => {
      const mockClient = createMockAppRuntimeClient();
      let resolveConnect!: () => void;
      const connectGate = new Promise<void>((resolve) => {
        resolveConnect = resolve;
      });

      const { actor } = createTestActor({
        connectResult: async () => {
          await connectGate;
          return { type: 'kernelConnected', client: mockClient, cleanups: [] };
        },
      });

      actor.start();

      actor.send({ type: 'setRenderTimeout', renderTimeout: 120_000 });
      expect(actor.getSnapshot().context.renderTimeout).toBe(120_000);
      expect(mockClient.setRenderTimeout).not.toHaveBeenCalled();

      resolveConnect();
      await waitFor(actor, (s) => s.value !== 'connecting');

      expect(mockClient.setRenderTimeout).toHaveBeenCalledExactlyOnceWith(120_000);
      expect(mockClient.setOptions).not.toHaveBeenCalled();
      actor.stop();
    });

    it('should apply the default timeout on connection', async () => {
      const { actor, mockClient } = await startAndConnect();
      expect(actor.getSnapshot().context.renderTimeout).toBe(defaultRenderTimeout);
      expect(mockClient.setRenderTimeout).toHaveBeenCalledExactlyOnceWith(defaultRenderTimeout);
      expect(mockClient.setOptions).not.toHaveBeenCalled();
      actor.stop();
    });

    it.each(['idle', 'buffering', 'rendering', 'error'] as const)(
      'should preserve the %s state when the timeout changes',
      async (targetState) => {
        const { actor, mockClient } = await startAndConnect();
        if (targetState !== 'idle') {
          actor.send({ type: 'stateChanged', state: targetState });
        }
        vi.mocked(mockClient.setRenderTimeout).mockClear();
        const priorState = actor.getSnapshot().value;

        actor.send({ type: 'setRenderTimeout', renderTimeout: 45_000 });

        expect(actor.getSnapshot().value).toEqual(priorState);
        expect(mockClient.setRenderTimeout).toHaveBeenCalledExactlyOnceWith(45_000);
        actor.stop();
      },
    );

    it('should configure the timeout before submitting the first render', async () => {
      const mockClient = createMockAppRuntimeClient();
      let resolveConnect!: () => void;
      const connectGate = new Promise<void>((resolve) => {
        resolveConnect = resolve;
      });
      const { actor } = createTestActor({
        connectResult: async () => {
          await connectGate;
          return { type: 'kernelConnected', client: mockClient, cleanups: [] };
        },
      });
      actor.start();
      actor.send({ type: 'initializeModel', entryPath: stubEntryPath });

      resolveConnect();
      await waitFor(actor, (snapshot) => snapshot.context.kernelClient === mockClient);
      await waitFor(actor, (snapshot) => snapshot.matches('idle'));

      expect(mockClient.setRenderTimeout).toHaveBeenCalledExactlyOnceWith(defaultRenderTimeout);
      expect(mockClient.render).toHaveBeenCalledOnce();
      const timeoutInvocation = vi.mocked(mockClient.setRenderTimeout).mock.invocationCallOrder.at(0);
      const renderInvocation = vi.mocked(mockClient.render).mock.invocationCallOrder.at(0);
      if (timeoutInvocation === undefined || renderInvocation === undefined) {
        throw new Error('Expected timeout configuration and render invocations');
      }
      expect(timeoutInvocation).toBeLessThan(renderInvocation);
      actor.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Render ID tracking
  // ---------------------------------------------------------------------------

  describe('render ID tracking', () => {
    it('should initialize lastRequestedRenderId and lastSettledRenderId to 0', () => {
      const { actor } = createTestActor();
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.lastRequestedRenderId).toBe(0);
      expect(context.lastSettledRenderId).toBe(0);
      actor.stop();
    });

    it('should bump lastRequestedRenderId on setEntryPath event', async () => {
      const { actor } = await startAndConnect();
      const before = actor.getSnapshot().context.lastRequestedRenderId;

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });

      expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(before + 1);
      actor.stop();
    });

    it('should bump lastRequestedRenderId on setParameters event', async () => {
      const { actor } = await startAndConnect();
      const before = actor.getSnapshot().context.lastRequestedRenderId;

      actor.send({ type: 'setParameters', parameters: { width: 10 } });

      expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(before + 1);
      actor.stop();
    });

    it('should bump lastRequestedRenderId on initializeModel event', async () => {
      const { actor } = await startAndConnect();
      const before = actor.getSnapshot().context.lastRequestedRenderId;

      actor.send({ type: 'initializeModel', entryPath: stubEntryPath, parameters: { width: 5 } });

      expect(actor.getSnapshot().context.lastRequestedRenderId).toBe(before + 1);
      actor.stop();
    });

    it('should advance lastSettledRenderId to lastRequestedRenderId on geometryComputed', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({ type: 'setParameters', parameters: { width: 7 } });
      const requestedAfterTwoBumps = actor.getSnapshot().context.lastRequestedRenderId;
      expect(requestedAfterTwoBumps).toBeGreaterThan(0);

      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });

      expect(actor.getSnapshot().context.lastSettledRenderId).toBe(requestedAfterTwoBumps);
      actor.stop();
    });

    it('should not regress lastSettledRenderId when subsequent geometryComputed arrives without new request', async () => {
      const { actor } = await startAndConnect();

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });
      const settledFirst = actor.getSnapshot().context.lastSettledRenderId;

      actor.send({
        type: 'geometryComputed',
        geometry: stubGeometry,
        issues: [],
      });

      expect(actor.getSnapshot().context.lastSettledRenderId).toBe(settledFirst);
      actor.stop();
    });

    it('should buffer setEntryPath during connecting and forward as render on connect', async () => {
      let resolveConnect!: () => void;
      const mockClient = createMockAppRuntimeClient();

      const { actor } = createTestActor({
        connectResult: async () =>
          new Promise((resolve) => {
            resolveConnect = () => {
              resolve({ type: 'kernelConnected', client: mockClient, cleanups: [] as Array<() => void> });
            };
          }),
      });
      actor.start();
      expect(actor.getSnapshot().value).toBe('connecting');

      actor.send({ type: 'setEntryPath', entryPath: stubEntryPath });
      const requestedDuringConnecting = actor.getSnapshot().context.lastRequestedRenderId;
      expect(requestedDuringConnecting).toBeGreaterThan(0);

      resolveConnect();
      await waitFor(actor, (s) => s.value === 'idle');

      expect(mockClient.render).toHaveBeenCalledWith({
        source: { path: stubEntryPath },
        parameters: {},
        content: { includeEdges: true },
      });
      actor.stop();
    });
  });
});
