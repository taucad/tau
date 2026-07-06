import { assign, assertEvent, setup, enqueueActions, waitFor } from 'xstate';
import type { ActorRefFrom, AnyActorRef } from 'xstate';
import type { CodeIssue, FileExtension, Geometry, GeometryFile, LogLevel, LogOrigin } from '@taucad/types';
import type {
  CapabilitiesManifest,
  ExportResult,
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
import { deriveAvailableFormats } from '#utils/export-formats.utils.js';
import type {
  AppRuntimeClient,
  AppRuntimeExportFormat,
  LazyKernelOptionsFactory,
} from '#types/runtime-client.alias.js';

export type CadContext = {
  file: GeometryFile | undefined;
  screenshot: string | undefined;
  parameters: Record<string, unknown>;
  units: { length: LengthSymbol };
  defaultParameters: Record<string, unknown>;
  geometry: Geometry | undefined;
  kernelIssues: Map<string, KernelIssue[]>;
  codeIssues: CodeIssue[];
  exportedBlob: Blob | undefined;
  shouldInitializeKernelOnStart: boolean;
  parentRef?: AnyActorRef;
  logActorRef?: ActorRefFrom<typeof logMachine>;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  jsonSchema?: JSONSchema7;
  renderPhase: RenderPhase | undefined;
  telemetryEntries: TelemetryEntry[];
  renderTimeout: number;
  kernelClient?: AppRuntimeClient;
  capabilities?: CapabilitiesManifest;
  activeKernelId?: string;
  eventCleanups: Array<() => void>;
  /**
   * Monotonically increasing render identifier. Bumped whenever the UI
   * issues a render-triggering event (`setFile`, `setParameters`,
   * `initializeModel`). Consumed by `awaitFreshRender` to detect when a
   * settled geometry result corresponds to a request issued at-or-after a
   * given baseline.
   */
  lastRequestedRenderId: number;
  /**
   * Highest render identifier that has been observed as settled via a
   * `geometryComputed` event. Always less-than-or-equal to
   * `lastRequestedRenderId`.
   */
  lastSettledRenderId: number;
};

type KernelConnectedEvent = {
  type: 'kernelConnected';
  client: AppRuntimeClient;
  cleanups: Array<() => void>;
};

type CadEvent =
  | { type: 'initializeModel'; file: GeometryFile; parameters?: Record<string, unknown> }
  | { type: 'setFile'; file: GeometryFile }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'setCodeIssues'; errors: CadContext['codeIssues'] }
  | { type: 'exportGeometry'; format: FileExtension; exportOptions?: Record<string, unknown> }
  | { type: 'geometryComputed'; geometry: Geometry; issues: KernelIssue[] }
  | { type: 'parametersParsed'; defaultParameters: Record<string, unknown>; jsonSchema: JSONSchema7 }
  | { type: 'kernelIssue'; errors: KernelIssue[] }
  | { type: 'kernelProgress'; phase: RenderPhase }
  | { type: 'kernelTelemetry'; entries: TelemetryEntry[] }
  | { type: 'kernelLog'; level: LogLevel; message: string; origin?: LogOrigin; data?: unknown }
  | { type: 'stateChanged'; state: WorkerState; detail?: string }
  | { type: 'setRenderTimeout'; renderTimeout: number }
  | { type: 'geometryExported'; blob: Blob; format: string }
  | { type: 'geometryExportFailed'; errors: KernelIssue[] }
  | { type: 'capabilitiesUpdated'; capabilities: CapabilitiesManifest }
  | { type: 'activeKernelChanged'; kernelId: string | undefined }
  | KernelConnectedEvent;

type CadEmitted =
  | { type: 'geometryEvaluated'; geometry: Geometry }
  | { type: 'geometryExported'; blob: Blob; format: string }
  | { type: 'exportFailed'; errors: KernelIssue[] };

type CadInput = {
  shouldInitializeKernelOnStart: boolean;
  parentRef?: AnyActorRef;
  logRef?: ActorRefFrom<typeof logMachine>;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  kernelOptionsFactory: LazyKernelOptionsFactory;
};

type ConnectKernelInput = {
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  machineRef: AnyActorRef;
};

const connectKernelActor = fromSafeAsync<KernelConnectedEvent, ConnectKernelInput>(async ({ input, signal }) => {
  const { kernelOptionsFactory: lazyKernelOptionsFactory, fileManagerRef, machineRef } = input;

  if (!fileManagerRef) {
    throw new Error('File manager not initialized');
  }

  const snapshot = await waitFor(fileManagerRef, (state) => state.matches('ready'), { signal });

  if (!snapshot.context.openFileSystemBridge) {
    throw new Error('File manager filesystem bridge is not available');
  }

  signal.throwIfAborted();

  const [{ createRuntimeClient }, { fromFileSystemBridge }] = await Promise.all([
    import('@taucad/runtime'),
    import('@taucad/runtime/filesystem'),
  ]);

  const resolveKernelOptions = await lazyKernelOptionsFactory();
  const fileSystemBridge = snapshot.context.openFileSystemBridge();
  const kernelOptions = resolveKernelOptions({
    fileSystem: fromFileSystemBridge(fileSystemBridge),
    filePoolBuffer: snapshot.context.filePoolBuffer,
  });
  const client = createRuntimeClient(kernelOptions);
  const cleanups: Array<() => void> = [fileSystemBridge.dispose];

  const teardown = () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    client.terminate();
  };

  signal.addEventListener('abort', teardown, { once: true });

  cleanups.push(
    client.on('geometry', (result: HashedGeometryResult) => {
      if (result.success) {
        machineRef.send({
          type: 'geometryComputed',
          geometry: result.data,
          issues: result.issues,
        });
      } else {
        machineRef.send({ type: 'kernelIssue', errors: result.issues });
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

  signal.removeEventListener('abort', teardown);

  return { type: 'kernelConnected', client, cleanups };
});

const hasExportAvailability = (context: CadContext): boolean =>
  Boolean(context.geometry) && deriveAvailableFormats(context.kernelClient, context.activeKernelId).length > 0;

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
    setFile: assign({
      file({ event }) {
        assertEvent(event, 'setFile');
        return event.file;
      },
      codeIssues: () => [],
      kernelIssues({ context, event }) {
        assertEvent(event, 'setFile');
        const newErrorsMap = new Map(context.kernelIssues);
        newErrorsMap.delete(event.file.filename);
        return newErrorsMap;
      },
    }),
    setParameters: assign({
      parameters({ event }) {
        assertEvent(event, 'setParameters');
        return event.parameters;
      },
    }),
    setGeometry: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'geometryComputed');
      const currentFileName = context.file?.filename;
      enqueue.assign({
        geometry: event.geometry,
        kernelIssues({ context }) {
          if (!currentFileName) {
            return context.kernelIssues;
          }
          const newIssues = new Map(context.kernelIssues);
          if (event.issues.length > 0) {
            newIssues.set(currentFileName, event.issues);
          } else {
            newIssues.delete(currentFileName);
          }
          return newIssues;
        },
      });
      enqueue.emit({ type: 'geometryEvaluated', geometry: event.geometry });
    }),
    setKernelIssue: assign({
      kernelIssues({ context, event }) {
        assertEvent(event, 'kernelIssue');
        const currentFilePath = context.file?.filename;
        if (!currentFilePath) {
          return context.kernelIssues;
        }
        const newErrorsMap = new Map(context.kernelIssues);
        newErrorsMap.set(currentFilePath, event.errors);
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
    setExportedBlob: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'geometryExported');
      const currentFileName = context.file?.filename;
      enqueue.assign({
        exportedBlob: event.blob,
        kernelIssues({ context }) {
          if (currentFileName && context.kernelIssues.has(currentFileName)) {
            const newErrors = new Map(context.kernelIssues);
            newErrors.delete(currentFileName);
            return newErrors;
          }
          return context.kernelIssues;
        },
      });
      enqueue.emit({ type: 'geometryExported', blob: event.blob, format: event.format });
    }),
    setExportError: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'geometryExportFailed');
      enqueue.assign({ exportedBlob: undefined });
      enqueue.emit({ type: 'exportFailed', errors: event.errors });
    }),
    initializeModel: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'initializeModel');
      if (context.logActorRef) {
        enqueue.sendTo(context.logActorRef, { type: 'clearLogs' });
      }
      enqueue.assign({
        file: event.file,
        parameters: event.parameters ?? {},
        codeIssues: [],
        geometry: undefined,
        exportedBlob: undefined,
        jsonSchema: undefined,
      });
    }),
    forwardSetFile: ({ context, event }) => {
      assertEvent(event, 'setFile');
      void context.kernelClient?.render({ source: { path: event.file }, parameters: context.parameters });
    },
    forwardInitializeModel: ({ context, event }) => {
      assertEvent(event, 'initializeModel');
      void context.kernelClient?.render({ source: { path: event.file }, parameters: event.parameters ?? {} });
    },
    setRenderTimeout: assign({
      renderTimeout({ event }) {
        assertEvent(event, 'setRenderTimeout');
        return event.renderTimeout;
      },
    }),
    forwardRenderTimeout: ({ context, event }) => {
      assertEvent(event, 'setRenderTimeout');
      void context.kernelClient?.setOptions({ renderTimeout: event.renderTimeout });
    },
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
    dispatchExport: ({ context, event, self }) => {
      assertEvent(event, 'exportGeometry');
      if (!context.kernelClient) {
        return;
      }

      const handleExport = async () => {
        try {
          const route = context.kernelClient!.bestRouteFor(event.format, context.activeKernelId);
          if (!route || (context.activeKernelId && route.kernelId !== context.activeKernelId)) {
            self.send({
              type: 'geometryExportFailed',
              errors: [
                {
                  message: `Export format ${event.format} is not available for the active model.`,
                  code: 'RUNTIME',
                  type: 'runtime',
                  severity: 'error',
                },
              ],
            });
            return;
          }

          const exportFormat = route.targetFormat as AppRuntimeExportFormat;
          const result: ExportResult = await context.kernelClient!.export(exportFormat, {
            exportOptions: event.exportOptions,
          });
          if (result.success) {
            const { data } = result;
            const blob = new Blob([data.bytes], { type: data.mimeType });
            self.send({ type: 'geometryExported', blob, format: event.format });
          } else {
            self.send({ type: 'geometryExportFailed', errors: result.issues });
          }
        } catch (error) {
          self.send({
            type: 'geometryExportFailed',
            errors: [
              {
                message: error instanceof Error ? error.message : 'Export failed',
                code: 'RUNTIME',
                type: 'runtime',
                severity: 'error',
              },
            ],
          });
        }
      };

      void handleExport();
    },
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
    hasRuntimeClient: ({ context }) => Boolean(context.kernelClient),
  },
}).createMachine({
  id: 'cad',
  context: ({ input }) => ({
    file: undefined,
    screenshot: undefined,
    units: { length: 'mm' },
    parameters: {},
    defaultParameters: {},
    geometry: undefined,
    kernelIssues: new Map(),
    codeIssues: [],
    exportedBlob: undefined,
    shouldInitializeKernelOnStart: input.shouldInitializeKernelOnStart,
    parentRef: input.parentRef,
    logActorRef: input.logRef,
    fileManagerRef: input.fileManagerRef,
    kernelOptionsFactory: input.kernelOptionsFactory,
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
  initial: 'connecting',
  states: {
    connecting: {
      invoke: {
        id: 'connectKernelActor',
        src: 'connectKernelActor',
        input({ context, self }) {
          return {
            kernelOptionsFactory: context.kernelOptionsFactory,
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
        kernelConnected: {
          actions: [
            enqueueActions(({ enqueue, context, event }) => {
              enqueue.assign({
                kernelClient: event.client,
                eventCleanups: event.cleanups,
              });
              void event.client.setOptions({ renderTimeout: context.renderTimeout });
              if (context.file) {
                void event.client.render({ source: { path: context.file }, parameters: context.parameters });
              }
            }),
            'notifyExportAvailability',
          ],
        },
        initializeModel: { actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability'] },
        setFile: { actions: ['bumpRequestedRenderId', 'setFile', 'notifyExportAvailability'] },
        setParameters: { actions: ['bumpRequestedRenderId', 'setParameters'] },
        setRenderTimeout: { actions: ['setRenderTimeout'] },
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
          actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability', 'forwardInitializeModel'],
        },
        setFile: {
          actions: ['bumpRequestedRenderId', 'setFile', 'notifyExportAvailability', 'forwardSetFile'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters'],
        },
        setRenderTimeout: {
          actions: ['setRenderTimeout', 'forwardRenderTimeout'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        exportGeometry: { actions: 'dispatchExport' },
        geometryExported: { actions: 'setExportedBlob' },
        geometryExportFailed: { actions: 'setExportError' },
        geometryComputed: { actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'] },
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
          actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability', 'forwardInitializeModel'],
        },
        setFile: {
          actions: ['bumpRequestedRenderId', 'setFile', 'notifyExportAvailability', 'forwardSetFile'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters'],
        },
        setRenderTimeout: {
          actions: ['setRenderTimeout', 'forwardRenderTimeout'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        exportGeometry: { actions: 'dispatchExport' },
        geometryExported: { actions: 'setExportedBlob' },
        geometryExportFailed: { actions: 'setExportError' },
        geometryComputed: { actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'] },
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
      exit: assign({ renderPhase: () => undefined }),
      on: {
        initializeModel: {
          actions: ['bumpRequestedRenderId', 'initializeModel', 'notifyExportAvailability', 'forwardInitializeModel'],
        },
        setFile: {
          actions: ['bumpRequestedRenderId', 'setFile', 'notifyExportAvailability', 'forwardSetFile'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters'],
        },
        setRenderTimeout: {
          actions: ['setRenderTimeout', 'forwardRenderTimeout'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        exportGeometry: { actions: 'dispatchExport' },
        geometryExported: { actions: 'setExportedBlob' },
        geometryExportFailed: { actions: 'setExportError' },
        geometryComputed: { actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'] },
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
        setFile: {
          target: 'connecting',
          actions: ['destroyKernel', 'bumpRequestedRenderId', 'setFile', 'notifyExportAvailability'],
        },
        setParameters: {
          actions: ['bumpRequestedRenderId', 'setParameters'],
        },
        setRenderTimeout: {
          actions: ['setRenderTimeout', 'forwardRenderTimeout'],
        },
        setCodeIssues: { actions: 'setCodeIssues' },
        exportGeometry: { actions: 'dispatchExport' },
        geometryExported: { actions: 'setExportedBlob' },
        geometryExportFailed: { actions: 'setExportError' },
        geometryComputed: { actions: ['setGeometry', 'setSettledRenderId', 'notifyExportAvailability'] },
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
