import { assign, assertEvent, setup, enqueueActions, waitFor } from 'xstate';
import type { ActorRefFrom, AnyActorRef, SnapshotFrom } from 'xstate';
import type { CodeIssue, Geometry, LogLevel, LogOrigin } from '@taucad/types';
import type {
  GetParametersResult,
  HashedGeometryResult,
  KernelIssue,
  RenderPhase,
  TelemetryEntry,
  WorkerState,
} from '@taucad/runtime';
import type { ParameterManifest } from '@taucad/parameters';
import { isRenderTimeoutError } from '@taucad/runtime/client';
import { isKernelIssueCode } from '@taucad/runtime/types';
import { safeDispose } from '@taucad/utils/dispose';
import type { LengthSymbol } from '#constants/length-units.js';
import { defaultRenderTimeout } from '#constants/editor.constants.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { getComputeReuseMode } from '#lib/compute-reuse-preference.js';
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

type CadTag = 'cad-loading' | 'cad-runtime-error';

export type CadContext = {
  entryPath: string | undefined;
  screenshot: string | undefined;
  parameters: Record<string, unknown>;
  /** Committed parameter-sidecar bytes staged with every render of this entry. */
  parameterStage: Record<string, Uint8Array<ArrayBuffer>> | undefined;
  units: { length: LengthSymbol };
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
  parameterManifest?: ParameterManifest;
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
  /** Last availability sent to the parent; the send is suppressed while it is unchanged. */
  notifiedExportAvailability?: boolean;
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
  | {
      type: 'initializeModel';
      entryPath: string;
      parameters?: Record<string, unknown>;
    }
  | { type: 'setEntryPath'; entryPath: string }
  | {
      type: 'setParameters';
      parameters: Record<string, unknown>;
      /** The parameter sidecar's committed bytes, carried so the runtime sees them without a watch. */
      stage?: Record<string, Uint8Array<ArrayBuffer>>;
    }
  | { type: 'setCodeIssues'; errors: CadContext['codeIssues'] }
  | { type: 'geometryComputed'; geometry: Geometry; issues: KernelIssue[] }
  | { type: 'geometryFailed'; issues: KernelIssue[] }
  | { type: 'parametersParsed'; manifest: ParameterManifest }
  | { type: 'kernelIssue'; errors: KernelIssue[] }
  | { type: 'kernelProgress'; phase: RenderPhase }
  | { type: 'kernelTelemetry'; entries: TelemetryEntry[] }
  | {
      type: 'kernelLog';
      level: LogLevel;
      message: string;
      origin?: LogOrigin;
      data?: unknown;
    }
  | { type: 'stateChanged'; state: WorkerState; detail?: string }
  | { type: 'setRenderTimeout'; renderTimeout: number }
  | { type: 'capabilitiesUpdated'; capabilities: AppCapabilitiesManifest }
  | { type: 'activeKernelChanged'; kernelId: string | undefined }
  | KernelConnectedEvent
  | FileSystemBindingChangedEvent;

type CadEmitted = { type: 'geometryEvaluated'; geometry: Geometry };

const consoleLogData = (data: unknown): string => {
  if (data === undefined) {
    return '';
  }
  try {
    return ` ${JSON.stringify(data)}`;
  } catch {
    return ' [data is not serialisable]';
  }
};

type CadInput = {
  shouldInitializeKernelOnStart: boolean;
  parentRef?: AnyActorRef;
  logRef?: ActorRefFrom<typeof logMachine>;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileSystemRoot: string;
};

/** Release the runtime resources held by one CAD unit. */
export const disposeCadRuntime = (context: Pick<CadContext, 'eventCleanups' | 'kernelClient'>): void => {
  for (const cleanup of context.eventCleanups) {
    safeDispose(cleanup);
  }
  safeDispose(() => context.kernelClient?.terminate());
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
  stage: Record<string, Uint8Array<ArrayBuffer>> | undefined;
  /** Whether no newer UI render was requested since this one. */
  isLatestRequest: () => boolean;
};

const fallbackCadFailureIssues: readonly KernelIssue[] = Object.freeze([
  Object.freeze({
    message: 'The selected CAD render failed',
    code: 'RUNTIME',
    type: 'runtime',
    severity: 'error',
  }),
]);

const selectIssuesByPrecedence = (
  context: CadContext,
  keys: ReadonlyArray<string | undefined>,
): readonly KernelIssue[] => {
  for (const key of keys) {
    if (!key) {
      continue;
    }
    const issues = context.kernelIssues.get(key);
    if (issues && issues.length > 0) {
      return issues;
    }
  }
  return fallbackCadFailureIssues;
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
  const computeConnection =
    getComputeReuseMode() === 'durable' && snapshot.context.projectId
      ? snapshot.context.openComputeBinding?.(snapshot.context.projectId)
      : undefined;
  if (computeConnection) {
    cleanups.push(computeConnection.dispose);
  }
  const kernelOptions = resolveKernelOptions({
    fileSystem: fromFileSystemBridge(() => snapshot.context.openFileSystemBridge!(fileSystemRoot)),
    compute: computeConnection?.compute,
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
          manifest: parametersResult.data,
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

  const request = {
    source: { path: input.entryPath },
    parameters: input.parameters,
    content: { includeEdges: true },
    ...(input.stage === undefined ? {} : { stage: input.stage }),
  } as const;
  const outcome = await input.client.render(request);
  // Runtime state events usually stop this actor before the render settles, so ask the machine
  // whether this is still the latest request. If so, the runtime's watched rerender won, and it
  // drops a concurrent open of another file (a rename races the watcher reporting the old path
  // gone). Re-assert this unit's file once.
  // ponytail: one retry; loop only if a render can keep losing to repeated external edits.
  if (outcome.superseded && input.isLatestRequest()) {
    await input.client.render(request);
  }
});

/** Traces retained for the telemetry pane. A root span closes its trace, so the cut is trace-aligned. */
const maxTelemetryTraces = 20;
/** Entry ceiling so one pathological trace cannot grow the retained window without bound. */
const maxTelemetryEntries = 2000;

/**
 * Bound retained telemetry to the most recent traces. `RuntimeTracer` omits
 * `parentSpanId` on a root span and ends a parent after its children, so
 * counting roots backwards finds the boundary between whole traces.
 */
const boundTelemetryEntries = (entries: TelemetryEntry[]): TelemetryEntry[] => {
  const windowed = entries.length > maxTelemetryEntries ? entries.slice(-maxTelemetryEntries) : entries;
  let traces = 0;
  for (let index = windowed.length - 1; index >= 0; index--) {
    if (windowed[index]?.detail?.['parentSpanId'] !== undefined) {
      continue;
    }
    traces++;
    if (traces > maxTelemetryTraces) {
      return windowed.slice(index + 1);
    }
  }
  return windowed;
};

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
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    tags: {} as CadTag,
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
      logMethod(`[Kernel:${origin}] ${event.message}${consoleLogData(event.data)}`);
      if (context.logActorRef) {
        const storedOrigin = context.entryPath ? { ...event.origin, file: context.entryPath } : event.origin;
        enqueue.sendTo(context.logActorRef, {
          type: 'addLog',
          message: event.message,
          options: {
            level: event.level,
            origin: storedOrigin,
            data: event.data,
          },
        });
      }
    }),
    notifyExportAvailability: enqueueActions(({ enqueue, context, self }) => {
      if (!context.parentRef) {
        return;
      }

      // The parent's handler is a no-op when nothing changed, but a handled
      // event still mints a new snapshot for all of its subscribers.
      const available = hasExportAvailability(context);
      if (available === context.notifiedExportAvailability) {
        return;
      }

      enqueue.assign({ notifiedExportAvailability: available });
      enqueue.sendTo(context.parentRef, {
        type: 'geometryUnit.exportAvailabilityChanged',
        actorId: self.id,
        available,
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
        return boundTelemetryEntries([...context.telemetryEntries, ...event.entries]);
      },
    }),
    setEntryPath: assign({
      entryPath({ event }) {
        assertEvent(event, 'setEntryPath');
        return event.entryPath;
      },
      // The staged bytes belong to the entry that was open; the new entry re-supplies its own.
      parameterStage: () => undefined,
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
      /* Persistence has already landed these bytes; carrying them makes the runtime observe the
       * revision it is about to be told about, so the sidecar's watch event renders nothing. */
      parameterStage({ event, context }) {
        assertEvent(event, 'setParameters');
        return event.stage ?? context.parameterStage;
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
    setParameterManifest: assign({
      parameterManifest({ event }) {
        assertEvent(event, 'parametersParsed');
        return event.manifest;
      },
    }),
    initializeModel: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'initializeModel');
      enqueue.assign({
        entryPath: event.entryPath,
        parameters: event.parameters ?? {},
        codeIssues: [],
        latestGeometryOutcome: undefined,
        parameterManifest: undefined,
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
      disposeCadRuntime(context);
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
    parameterStage: undefined,
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
    parameterManifest: undefined,
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
      tags: 'cad-loading',
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
                  {
                    message: errorMessage,
                    code: 'RUNTIME',
                    type: 'runtime',
                    severity: 'error',
                  },
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
        initializeModel: {
          actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability'],
        },
        setEntryPath: {
          actions: ['bumpRequestedRenderId', 'setEntryPath', 'notifyExportAvailability'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'],
        },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: {
          actions: ['setCapabilities', 'notifyExportAvailability'],
        },
        activeKernelChanged: {
          actions: ['setActiveKernelId', 'notifyExportAvailability'],
        },
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
          target: '#cad.rendering.submitting',
          actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        geometryComputed: {
          actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'],
        },
        geometryFailed: {
          actions: ['setGeometryFailure', 'setSettledRenderId', 'notifyExportAvailability'],
        },
        parametersParsed: { actions: 'setParameterManifest' },
        kernelIssue: { actions: 'setKernelIssue' },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: {
          actions: ['setCapabilities', 'notifyExportAvailability'],
        },
        activeKernelChanged: {
          actions: ['setActiveKernelId', 'notifyExportAvailability'],
        },
        stateChanged: [
          {
            guard: ({ event }) => event.state === 'buffering',
            target: 'buffering',
          },
          {
            guard: ({ event }) => event.state === 'rendering',
            target: 'rendering',
          },
          { guard: ({ event }) => event.state === 'error', target: 'error' },
        ],
      },
    },

    buffering: {
      tags: 'cad-loading',
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
          target: '#cad.rendering.submitting',
          actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        geometryComputed: {
          actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'],
        },
        geometryFailed: {
          actions: ['setGeometryFailure', 'setSettledRenderId', 'notifyExportAvailability'],
        },
        parametersParsed: { actions: 'setParameterManifest' },
        kernelIssue: { actions: 'setKernelIssue' },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: {
          actions: ['setCapabilities', 'notifyExportAvailability'],
        },
        activeKernelChanged: {
          actions: ['setActiveKernelId', 'notifyExportAvailability'],
        },
        stateChanged: [
          {
            guard: ({ event }) => event.state === 'rendering',
            target: 'rendering',
          },
          { guard: ({ event }) => event.state === 'idle', target: 'idle' },
          { guard: ({ event }) => event.state === 'error', target: 'error' },
        ],
      },
    },

    rendering: {
      tags: 'cad-loading',
      initial: 'active',
      exit: assign({ renderPhase: () => undefined }),
      states: {
        submitting: {
          invoke: {
            src: 'renderModelActor',
            input: ({ context, self }) => ({
              client: context.kernelClient,
              entryPath: context.entryPath,
              parameters: context.parameters,
              stage: context.parameterStage,
              isLatestRequest: () => self.getSnapshot().context.lastRequestedRenderId === context.lastRequestedRenderId,
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
                  const errorCode = isRenderTimeoutError(event.error)
                    ? 'RENDER_TIMEOUT'
                    : event.error &&
                        typeof event.error === 'object' &&
                        'code' in event.error &&
                        isKernelIssueCode(event.error.code)
                      ? event.error.code
                      : 'RUNTIME';
                  const newMap = new Map(context.kernelIssues);
                  newMap.set(entryPath, [
                    {
                      message: errorMessage,
                      code: errorCode,
                      type: 'runtime',
                      severity: 'error',
                    },
                  ]);
                  return newMap;
                },
              }),
            },
          },
          on: {
            stateChanged: [
              {
                guard: ({ event }) => event.state === 'buffering',
                target: '#cad.buffering',
              },
              {
                guard: ({ event }) => event.state === 'rendering',
                target: '#cad.rendering.active',
              },
              {
                guard: ({ event }) => event.state === 'idle',
                target: '#cad.idle',
              },
              {
                guard: ({ event }) => event.state === 'error',
                target: '#cad.error',
              },
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
          target: '#cad.rendering.submitting',
          reenter: true,
          actions: ['bumpRequestedRenderId', 'setParameters', 'notifyExportAvailability'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        geometryComputed: {
          actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'],
        },
        geometryFailed: {
          actions: ['setGeometryFailure', 'setSettledRenderId', 'notifyExportAvailability'],
        },
        parametersParsed: { actions: 'setParameterManifest' },
        kernelIssue: { actions: 'setKernelIssue' },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: {
          actions: ['setCapabilities', 'notifyExportAvailability'],
        },
        activeKernelChanged: {
          actions: ['setActiveKernelId', 'notifyExportAvailability'],
        },
        stateChanged: [
          {
            guard: ({ event }) => event.state === 'buffering',
            target: 'buffering',
          },
          { guard: ({ event }) => event.state === 'idle', target: 'idle' },
          { guard: ({ event }) => event.state === 'error', target: 'error' },
        ],
      },
    },

    error: {
      tags: 'cad-runtime-error',
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
        geometryComputed: {
          actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'],
        },
        geometryFailed: {
          actions: ['setGeometryFailure', 'setSettledRenderId', 'notifyExportAvailability'],
        },
        parametersParsed: { actions: 'setParameterManifest' },
        kernelIssue: { actions: 'setKernelIssue' },
        kernelLog: { actions: 'sendKernelLogs' },
        kernelProgress: { actions: 'trackProgress' },
        kernelTelemetry: { actions: 'storeTelemetry' },
        capabilitiesUpdated: {
          actions: ['setCapabilities', 'notifyExportAvailability'],
        },
        activeKernelChanged: {
          actions: ['setActiveKernelId', 'notifyExportAvailability'],
        },
        stateChanged: [
          {
            guard: ({ event }) => event.state === 'buffering',
            target: 'buffering',
          },
          { guard: ({ event }) => event.state === 'idle', target: 'idle' },
          {
            guard: ({ event }) => event.state === 'rendering',
            target: 'rendering',
          },
        ],
      },
    },
  },
});

type CadSnapshot = SnapshotFrom<typeof cadMachine>;

/** Select the canonical issues for the latest failed CAD result without allocating a derived view model. */
export const selectCadFailureIssues = (snapshot: CadSnapshot): readonly KernelIssue[] | undefined => {
  if (snapshot.context.latestGeometryOutcome === 'failure') {
    return selectIssuesByPrecedence(snapshot.context, [snapshot.context.entryPath, '__render__', '__connection__']);
  }
  if (!snapshot.hasTag('cad-runtime-error')) {
    return undefined;
  }
  return selectIssuesByPrecedence(snapshot.context, ['__connection__', snapshot.context.entryPath, '__render__']);
};

export const selectCadGeometry = (snapshot: CadSnapshot): Geometry | undefined => snapshot.context.geometry;
export const selectCadUnits = (snapshot: CadSnapshot): CadContext['units'] => snapshot.context.units;
export const selectCadKernelClient = (snapshot: CadSnapshot): AppRuntimeClient | undefined =>
  snapshot.context.kernelClient;
export const selectIsCadLoading = (snapshot: CadSnapshot): boolean => snapshot.hasTag('cad-loading');
