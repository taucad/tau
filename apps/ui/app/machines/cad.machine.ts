import { assign, assertEvent, setup, enqueueActions, waitFor } from 'xstate';
import type { ActorRefFrom, AnyActorRef } from 'xstate';
import type { CodeIssue, Geometry, LogLevel, LogOrigin } from '@taucad/types';
import type {
  GetParametersResult,
  HashedGeometryResult,
  KernelIssue,
  RenderPhase,
  TelemetryEntry,
  WorkerState,
} from '@taucad/runtime';
import { safeDispose } from '@taucad/utils/dispose';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { LengthSymbol } from '@taucad/units';
import { defaultRenderTimeout } from '#constants/editor.constants.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { logMachine } from '#machines/logs.machine.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { deriveAvailableFormats } from '#utils/export-formats.utils.js';
import type {
  AppCapabilitiesManifest,
  AppRuntimeClient,
  LazyKernelOptionsFactory,
} from '#types/runtime-client.alias.js';

export type LatestGeometryOutcome = 'success' | 'failure' | undefined;

export type CadContext = {
  entryPath: string | undefined;
  screenshot: string | undefined;
  parameters: Record<string, unknown>;
  units: { length: LengthSymbol };
  defaultParameters: Record<string, unknown>;
  /** Outcome of the latest selected runtime geometry event. */
  latestGeometryOutcome: LatestGeometryOutcome;
  /** Last successful artifact retained for display across later render failures. */
  geometry: Geometry | undefined;
  kernelIssues: Map<string, KernelIssue[]>;
  codeIssues: CodeIssue[];
  shouldInitializeKernelOnStart: boolean;
  parentRef?: AnyActorRef;
  logActorRef?: ActorRefFrom<typeof logMachine>;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileSystemRoot: string;
  jsonSchema?: JSONSchema7;
  renderPhase: RenderPhase | undefined;
  telemetryEntries: TelemetryEntry[];
  renderTimeout: number;
  kernelClient?: AppRuntimeClient;
  capabilities?: AppCapabilitiesManifest;
  activeKernelId?: string;
  eventCleanups: Array<() => void>;
  /**
   * Monotonically increasing render identifier. Bumped whenever the UI
   * issues a render-triggering event (`setEntryPath`, `setParameters`,
   * `initializeModel`). Consumed by `awaitFreshRender` to detect when a
   * settled geometry result corresponds to a request issued at-or-after a
   * given baseline.
   */
  lastRequestedRenderId: number;
  /**
   * Highest render identifier that has been observed as settled via a
   * `geometryComputed` or `geometryFailed` event. Always less-than-or-equal to
   * `lastRequestedRenderId`.
   */
  lastSettledRenderId: number;
};

type KernelConnectedEvent = {
  type: 'kernelConnected';
  client: AppRuntimeClient;
  cleanups: Array<() => void>;
};

type FileSystemBindingChangedEvent = {
  type: 'filesystemBindingChanged';
};

type CadEvent =
  | { type: 'initializeModel'; entryPath: string; parameters?: Record<string, unknown> }
  | { type: 'setEntryPath'; entryPath: string }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'setCodeIssues'; errors: CadContext['codeIssues'] }
  | { type: 'geometryComputed'; geometry: Geometry; issues: KernelIssue[] }
  | { type: 'geometryFailed'; issues: KernelIssue[] }
  | { type: 'parametersParsed'; defaultParameters: Record<string, unknown>; jsonSchema: JSONSchema7 }
  | { type: 'kernelIssue'; errors: KernelIssue[] }
  | { type: 'kernelProgress'; phase: RenderPhase }
  | { type: 'kernelTelemetry'; entries: TelemetryEntry[] }
  | { type: 'kernelLog'; level: LogLevel; message: string; origin?: LogOrigin; data?: unknown }
  | { type: 'stateChanged'; state: WorkerState; detail?: string }
  | { type: 'setRenderTimeout'; renderTimeout: number }
  | { type: 'capabilitiesUpdated'; capabilities: AppCapabilitiesManifest }
  | { type: 'activeKernelChanged'; kernelId: string | undefined }
  | KernelConnectedEvent
  | FileSystemBindingChangedEvent;

type CadEmitted = { type: 'geometryEvaluated'; geometry: Geometry };

type CadInput = {
  shouldInitializeKernelOnStart: boolean;
  parentRef?: AnyActorRef;
  logRef?: ActorRefFrom<typeof logMachine>;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileSystemRoot: string;
};

type ConnectKernelInput = {
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  machineRef: AnyActorRef;
  fileSystemRoot: string;
};

type RenderModelInput = {
  client: AppRuntimeClient | undefined;
  entryPath: string | undefined;
  parameters: Record<string, unknown>;
};

const connectKernelActor = fromSafeAsync<KernelConnectedEvent, ConnectKernelInput>(async ({ input, signal }) => {
  const { kernelOptionsFactory: lazyKernelOptionsFactory, fileManagerRef, machineRef, fileSystemRoot } = input;

  if (!fileManagerRef) {
    throw new Error('File manager not initialized');
  }

  const snapshot = await waitFor(fileManagerRef, (state) => state.matches('ready'), { signal });

  if (!snapshot.context.openFileSystemBridge) {
    throw new Error('File manager filesystem bridge is not available');
  }

  const capturedContentService: FileContentService | undefined = snapshot.context.contentService;
  if (!capturedContentService) {
    throw new Error('File manager content service is not available');
  }

  // oxlint-disable-next-line prefer-const -- assigned after lazy imports while the abort teardown must already close over it.
  let client: AppRuntimeClient | undefined;
  const replacementState = { notified: false };
  const cleanups: Array<() => void> = [];
  const fileManagerSubscription = fileManagerRef.subscribe((nextSnapshot) => {
    if (
      replacementState.notified ||
      !nextSnapshot.matches('ready') ||
      !nextSnapshot.context.contentService ||
      nextSnapshot.context.contentService === capturedContentService
    ) {
      return;
    }
    replacementState.notified = true;
    machineRef.send({ type: 'filesystemBindingChanged' });
  });
  cleanups.push(() => {
    fileManagerSubscription.unsubscribe();
  });

  let tornDown = false;
  const teardown = () => {
    if (tornDown) {
      return;
    }
    tornDown = true;
    for (const cleanup of cleanups) {
      cleanup();
    }
    client?.terminate();
  };

  signal.addEventListener('abort', teardown, { once: true });

  signal.throwIfAborted();

  const [{ createRuntimeClient }, { fromFileSystemBridge }] = await Promise.all([
    import('@taucad/runtime/client'),
    import('@taucad/runtime/filesystem'),
  ]);

  const resolveKernelOptions = await lazyKernelOptionsFactory();
  const kernelOptions = resolveKernelOptions({
    fileSystem: fromFileSystemBridge(() => snapshot.context.openFileSystemBridge!(fileSystemRoot)),
  });
  client = createRuntimeClient(kernelOptions);

  cleanups.push(
    client.on('geometry', (result: HashedGeometryResult) => {
      if (result.success) {
        machineRef.send({
          type: 'geometryComputed',
          geometry: result.data,
          issues: result.issues,
        });
      } else {
        machineRef.send({ type: 'geometryFailed', issues: result.issues });
      }
    }),
    client.on('state', (state: WorkerState) => {
      machineRef.send({ type: 'stateChanged', state });
    }),
    client.on('progress', (phase: RenderPhase) => {
      machineRef.send({ type: 'kernelProgress', phase });
    }),
    client.on('parametersResolved', (parametersResult: GetParametersResult) => {
      if (parametersResult.success) {
        machineRef.send({
          type: 'parametersParsed',
          defaultParameters: parametersResult.data.defaultParameters,
          jsonSchema: parametersResult.data.jsonSchema,
        });
      }
    }),
    client.on('log', (entry: { level: string; message: string; origin?: LogOrigin; data?: unknown }) => {
      machineRef.send({
        type: 'kernelLog',
        level: entry.level as LogLevel,
        message: entry.message,
        origin: entry.origin,
        data: entry.data,
      });
    }),
    client.on('telemetry', (entries: TelemetryEntry[]) => {
      machineRef.send({ type: 'kernelTelemetry', entries });
    }),
    client.on('error', (issues: KernelIssue[]) => {
      machineRef.send({ type: 'kernelIssue', errors: issues });
    }),
    client.on('capabilities', (capabilities) => {
      machineRef.send({ type: 'capabilitiesUpdated', capabilities });
    }),
    client.on('activeKernelChanged', (kernelId: string | undefined) => {
      machineRef.send({ type: 'activeKernelChanged', kernelId });
    }),
  );

  signal.throwIfAborted();

  await client.connect();

  const currentSnapshot = fileManagerRef.getSnapshot();
  if (!currentSnapshot.matches('ready') || currentSnapshot.context.contentService !== capturedContentService) {
    if (!replacementState.notified) {
      replacementState.notified = true;
      machineRef.send({ type: 'filesystemBindingChanged' });
    }
    if (!signal.aborted) {
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
    }
    signal.throwIfAborted();
  }

  signal.removeEventListener('abort', teardown);

  return { type: 'kernelConnected', client, cleanups };
});

const renderModelActor = fromSafeAsync<void, RenderModelInput>(async ({ input }) => {
  if (!input.client) {
    throw new Error('Kernel client is not connected');
  }
  if (!input.entryPath) {
    throw new Error('No model file is selected');
  }

  await input.client.render({
    source: { path: input.entryPath },
    parameters: input.parameters,
    content: { includeEdges: true },
  });
});

const hasExportAvailability = (context: CadContext): boolean =>
  context.latestGeometryOutcome === 'success' &&
  Boolean(context.geometry) &&
  deriveAvailableFormats(context.kernelClient, context.activeKernelId).length > 0;

/**
 * CAD Machine -- Autonomous Kernel Topology
 *
 * 4-state display machine: connecting | idle | rendering | error
 *
 * The worker self-schedules rendering internally. The main thread is a
 * display-only consumer of geometry results and worker state changes.
 * Debouncing is handled in the worker (500ms for files, 50ms for params).
 * Render timeout is enforced by the RuntimeClient via SharedArrayBuffer.
 */
export const cadMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as CadContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as CadEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as CadInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as CadEmitted,
  },
  actors: {
    connectKernelActor,
    renderModelActor,
  },
  actions: {
    sendKernelLogs: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'kernelLog');
      const logMethod = event.level === 'error' ? console.error : event.level === 'warn' ? console.warn : console.debug;
      const origin = typeof event.origin === 'string' ? event.origin : 'worker';
      logMethod(`[Kernel:${origin}]`, event.message, event.data ?? '');
      if (context.logActorRef) {
        enqueue.sendTo(context.logActorRef, {
          type: 'addLog',
          message: event.message,
          options: { level: event.level, origin: event.origin, data: event.data },
        });
      }
    }),
    notifyExportAvailability: enqueueActions(({ enqueue, context, self }) => {
      if (!context.parentRef) {
        return;
      }

      enqueue.sendTo(context.parentRef, {
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: self.id,
        available: hasExportAvailability(context),
      });
    }),
    trackProgress: assign({
      renderPhase({ event }) {
        assertEvent(event, 'kernelProgress');
        return event.phase;
      },
    }),
    storeTelemetry: assign({
      telemetryEntries({ context, event }) {
        assertEvent(event, 'kernelTelemetry');
        return [...context.telemetryEntries, ...event.entries];
      },
    }),
    setEntryPath: assign({
      entryPath({ event }) {
        assertEvent(event, 'setEntryPath');
        return event.entryPath;
      },
      latestGeometryOutcome: () => undefined,
      codeIssues: () => [],
      kernelIssues({ context, event }) {
        assertEvent(event, 'setEntryPath');
        const newErrorsMap = new Map(context.kernelIssues);
        newErrorsMap.delete(event.entryPath);
        return newErrorsMap;
      },
    }),
    setParameters: assign({
      parameters({ event }) {
        assertEvent(event, 'setParameters');
        return event.parameters;
      },
      latestGeometryOutcome: () => undefined,
    }),
    setGeometry: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'geometryComputed');
      const currentEntryPath = context.entryPath;
      enqueue.assign({
        geometry: event.geometry,
        latestGeometryOutcome: 'success',
        kernelIssues({ context }) {
          if (!currentEntryPath) {
            return context.kernelIssues;
          }
          const newIssues = new Map(context.kernelIssues);
          if (event.issues.length > 0) {
            newIssues.set(currentEntryPath, event.issues);
          } else {
            newIssues.delete(currentEntryPath);
          }
          return newIssues;
        },
      });
      enqueue.emit({ type: 'geometryEvaluated', geometry: event.geometry });
    }),
    setGeometryFailure: assign({
      latestGeometryOutcome: () => 'failure',
      kernelIssues({ context, event }) {
        assertEvent(event, 'geometryFailed');
        const currentEntryPath = context.entryPath;
        if (!currentEntryPath) {
          return context.kernelIssues;
        }
        const newIssues = new Map(context.kernelIssues);
        newIssues.set(currentEntryPath, event.issues);
        return newIssues;
      },
    }),
    setKernelIssue: assign({
      kernelIssues({ context, event }) {
        assertEvent(event, 'kernelIssue');
        const currentEntryPath = context.entryPath;
        if (!currentEntryPath) {
          return context.kernelIssues;
        }
        const newErrorsMap = new Map(context.kernelIssues);
        newErrorsMap.set(currentEntryPath, event.errors);
        return newErrorsMap;
      },
    }),
    setCodeIssues: assign({
      codeIssues({ event }) {
        assertEvent(event, 'setCodeIssues');
        return event.errors;
      },
    }),
    setDefaultParameters: assign({
      defaultParameters({ event }) {
        assertEvent(event, 'parametersParsed');
        return event.defaultParameters;
      },
      jsonSchema({ event }) {
        assertEvent(event, 'parametersParsed');
        return event.jsonSchema;
      },
    }),
    initializeModel: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'initializeModel');
      if (context.logActorRef) {
        enqueue.sendTo(context.logActorRef, { type: 'clearLogs' });
      }
      enqueue.assign({
        entryPath: event.entryPath,
        parameters: event.parameters ?? {},
        codeIssues: [],
        latestGeometryOutcome: undefined,
        jsonSchema: undefined,
      });
    }),
    storeKernelConnection: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'kernelConnected');
      event.client.setRenderTimeout(context.renderTimeout);
      enqueue.assign({
        kernelClient: event.client,
        eventCleanups: event.cleanups,
      });
    }),
    applyRenderTimeout: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'setRenderTimeout');
      context.kernelClient?.setRenderTimeout(event.renderTimeout);
      enqueue.assign({ renderTimeout: event.renderTimeout });
    }),
    bumpRequestedRenderId: assign({
      lastRequestedRenderId({ context }) {
        return context.lastRequestedRenderId + 1;
      },
    }),
    setSettledRenderId: assign({
      lastSettledRenderId({ context }) {
        // Geometry result corresponds to the most recently requested render;
        // settled watermark advances to whatever the UI has asked for.
        return context.lastRequestedRenderId;
      },
    }),
    setCapabilities: assign({
      capabilities({ event }) {
        assertEvent(event, 'capabilitiesUpdated');
        return event.capabilities;
      },
    }),
    setActiveKernelId: assign({
      activeKernelId({ event }) {
        assertEvent(event, 'activeKernelChanged');
        return event.kernelId;
      },
    }),
    destroyKernel: assign(({ context }) => {
      for (const cleanup of context.eventCleanups) {
        safeDispose(cleanup);
      }
      safeDispose(() => context.kernelClient?.terminate());
      return {
        eventCleanups: [],
        kernelClient: undefined,
      };
    }),
  },
  guards: {
    hasEntryPath: ({ context }) => Boolean(context.entryPath),
    hasRuntimeClient: ({ context }) => Boolean(context.kernelClient),
  },
}).createMachine({
  id: 'cad',
  context: ({ input }) => ({
    entryPath: undefined,
    screenshot: undefined,
    units: { length: 'mm' },
    parameters: {},
    defaultParameters: {},
    latestGeometryOutcome: undefined,
    geometry: undefined,
    kernelIssues: new Map(),
    codeIssues: [],
    shouldInitializeKernelOnStart: input.shouldInitializeKernelOnStart,
    parentRef: input.parentRef,
    logActorRef: input.logRef,
    fileManagerRef: input.fileManagerRef,
    kernelOptionsFactory: input.kernelOptionsFactory,
    fileSystemRoot: input.fileSystemRoot,
    jsonSchema: undefined,
    renderPhase: undefined,
    telemetryEntries: [],
    renderTimeout: defaultRenderTimeout,
    kernelClient: undefined,
    capabilities: undefined,
    activeKernelId: undefined,
    eventCleanups: [],
    lastRequestedRenderId: 0,
    lastSettledRenderId: 0,
  }),
  exit: ['destroyKernel'],
  on: {
    filesystemBindingChanged: {
      target: '.connecting',
      reenter: true,
      actions: ['destroyKernel'],
    },
    setRenderTimeout: {
      actions: ['applyRenderTimeout'],
    },
  },
  initial: 'connecting',
  states: {
    connecting: {
      invoke: {
        id: 'connectKernelActor',
        src: 'connectKernelActor',
        input({ context, self }) {
          return {
            kernelOptionsFactory: context.kernelOptionsFactory,
            fileSystemRoot: context.fileSystemRoot,
            fileManagerRef: context.fileManagerRef,
            machineRef: self,
          };
        },
        onDone: 'idle',
        onError: {
          target: 'error',
          actions: enqueueActions(({ enqueue, event }) => {
            const errorMessage =
              event.error instanceof Error || event.error instanceof DOMException
                ? event.error.message
                : 'Failed to connect kernel';
            enqueue.assign({
              kernelIssues({ context }) {
                const newMap = new Map(context.kernelIssues);
                newMap.set('__connection__', [
                  { message: errorMessage, code: 'RUNTIME', type: 'runtime', severity: 'error' },
                ]);
                return newMap;
              },
            });
          }),
        },
      },
      on: {
        kernelConnected: [
          {
            guard: 'hasEntryPath',
            target: '#cad.rendering.submitting',
            actions: ['storeKernelConnection', 'notifyExportAvailability'],
          },
          {
            target: 'idle',
            actions: ['storeKernelConnection', 'notifyExportAvailability'],
          },
        ],
        initializeModel: { actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability'] },
        setEntryPath: { actions: ['bumpRequestedRenderId', 'setEntryPath', 'notifyExportAvailability'] },
        setParameters: { actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'] },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: { actions: ['setCapabilities', 'notifyExportAvailability'] },
        activeKernelChanged: { actions: ['setActiveKernelId', 'notifyExportAvailability'] },
      },
    },

    idle: {
      on: {
        initializeModel: {
          target: '#cad.rendering.submitting',
          actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability'],
        },
        setEntryPath: {
          target: '#cad.rendering.submitting',
          actions: ['bumpRequestedRenderId', 'setEntryPath', 'notifyExportAvailability'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        geometryComputed: { actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'] },
        geometryFailed: { actions: ['setGeometryFailure', 'setSettledRenderId', 'notifyExportAvailability'] },
        parametersParsed: { actions: 'setDefaultParameters' },
        kernelIssue: { actions: 'setKernelIssue' },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: { actions: ['setCapabilities', 'notifyExportAvailability'] },
        activeKernelChanged: { actions: ['setActiveKernelId', 'notifyExportAvailability'] },
        stateChanged: [
          { guard: ({ event }) => event.state === 'buffering', target: 'buffering' },
          { guard: ({ event }) => event.state === 'rendering', target: 'rendering' },
          { guard: ({ event }) => event.state === 'error', target: 'error' },
        ],
      },
    },

    buffering: {
      on: {
        initializeModel: {
          target: '#cad.rendering.submitting',
          actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability'],
        },
        setEntryPath: {
          target: '#cad.rendering.submitting',
          actions: ['bumpRequestedRenderId', 'setEntryPath', 'notifyExportAvailability'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        geometryComputed: { actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'] },
        geometryFailed: { actions: ['setGeometryFailure', 'setSettledRenderId', 'notifyExportAvailability'] },
        parametersParsed: { actions: 'setDefaultParameters' },
        kernelIssue: { actions: 'setKernelIssue' },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: { actions: ['setCapabilities', 'notifyExportAvailability'] },
        activeKernelChanged: { actions: ['setActiveKernelId', 'notifyExportAvailability'] },
        stateChanged: [
          { guard: ({ event }) => event.state === 'rendering', target: 'rendering' },
          { guard: ({ event }) => event.state === 'idle', target: 'idle' },
          { guard: ({ event }) => event.state === 'error', target: 'error' },
        ],
      },
    },

    rendering: {
      initial: 'active',
      exit: assign({ renderPhase: () => undefined }),
      states: {
        submitting: {
          invoke: {
            src: 'renderModelActor',
            input: ({ context }) => ({
              client: context.kernelClient,
              entryPath: context.entryPath,
              parameters: context.parameters,
            }),
            onDone: {
              target: '#cad.idle',
            },
            onError: {
              target: '#cad.error',
              actions: assign({
                kernelIssues({ context, event }) {
                  const errorMessage =
                    event.error instanceof Error || event.error instanceof DOMException
                      ? event.error.message
                      : 'Failed to render model';
                  const entryPath = context.entryPath ?? '__render__';
                  const newMap = new Map(context.kernelIssues);
                  newMap.set(entryPath, [
                    { message: errorMessage, code: 'RUNTIME', type: 'runtime', severity: 'error' },
                  ]);
                  return newMap;
                },
              }),
            },
          },
          on: {
            stateChanged: [
              { guard: ({ event }) => event.state === 'buffering', target: '#cad.buffering' },
              { guard: ({ event }) => event.state === 'rendering', target: '#cad.rendering.active' },
              { guard: ({ event }) => event.state === 'idle', target: '#cad.idle' },
              { guard: ({ event }) => event.state === 'error', target: '#cad.error' },
            ],
          },
        },
        active: {},
      },
      on: {
        initializeModel: {
          target: '#cad.rendering.submitting',
          reenter: true,
          actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability'],
        },
        setEntryPath: {
          target: '#cad.rendering.submitting',
          reenter: true,
          actions: ['bumpRequestedRenderId', 'setEntryPath', 'notifyExportAvailability'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        geometryComputed: { actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'] },
        geometryFailed: { actions: ['setGeometryFailure', 'setSettledRenderId', 'notifyExportAvailability'] },
        parametersParsed: { actions: 'setDefaultParameters' },
        kernelIssue: { actions: 'setKernelIssue' },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: { actions: ['setCapabilities', 'notifyExportAvailability'] },
        activeKernelChanged: { actions: ['setActiveKernelId', 'notifyExportAvailability'] },
        stateChanged: [
          { guard: ({ event }) => event.state === 'buffering', target: 'buffering' },
          { guard: ({ event }) => event.state === 'idle', target: 'idle' },
          { guard: ({ event }) => event.state === 'error', target: 'error' },
        ],
      },
    },

    error: {
      on: {
        initializeModel: {
          target: 'connecting',
          actions: ['destroyKernel', 'bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability'],
        },
        setEntryPath: {
          target: 'connecting',
          actions: ['destroyKernel', 'bumpRequestedRenderId', 'setEntryPath', 'notifyExportAvailability'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        geometryComputed: { actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'] },
        geometryFailed: { actions: ['setGeometryFailure', 'setSettledRenderId', 'notifyExportAvailability'] },
        parametersParsed: { actions: 'setDefaultParameters' },
        kernelIssue: { actions: 'setKernelIssue' },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: { actions: ['setCapabilities', 'notifyExportAvailability'] },
        activeKernelChanged: { actions: ['setActiveKernelId', 'notifyExportAvailability'] },
        stateChanged: [
          { guard: ({ event }) => event.state === 'buffering', target: 'buffering' },
          { guard: ({ event }) => event.state === 'idle', target: 'idle' },
          { guard: ({ event }) => event.state === 'rendering', target: 'rendering' },
        ],
      },
    },
  },
});
