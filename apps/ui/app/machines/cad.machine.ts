import { setup, types, waitFor } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';
import type { CodeIssue, LogLevel, LogOrigin } from '@taucad/types';
import type {
  Description,
  Evaluation,
  KernelIssue,
  Rendering,
  RuntimeDocument,
  TelemetryBatch,
  TelemetrySpanRecord,
  ViewSubscription,
} from '@taucad/runtime';
import type { ParameterManifest } from '@taucad/parameters';
import { isKernelIssueCode } from '@taucad/runtime/types';
import { safeDispose } from '@taucad/utils/dispose';
import type { LengthSymbol } from '#constants/length-units.js';
import { defaultOperationTimeout } from '#constants/editor.constants.js';
import { actorIdOf, eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import { getComputeReuseMode } from '#lib/compute-reuse-preference.js';
import type { logMachine } from '#machines/logs.machine.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type {
  AppCapabilitiesManifest,
  AppRuntimeClient,
  LazyKernelOptionsFactory,
} from '#types/runtime-client.alias.js';
export type LatestRenderingOutcome = 'success' | 'failure' | undefined;

type CadTag = 'cad-loading' | 'cad-runtime-error';

export type CadContext = {
  entryPath: string | undefined;
  screenshot: string | undefined;
  /** What the next render carries beyond the entry, cleared by any other render trigger. */
  parameterRender: ParameterRender | undefined;
  units: { length: LengthSymbol };
  /** Outcome of the latest default-view projection. */
  latestRenderingOutcome: LatestRenderingOutcome;
  /** Last successful default projection retained across later failures. */
  rendering: Rendering | undefined;
  /** Latest projection verdict, including failures, for operation correlation. */
  lastProjection: Rendering | undefined;
  /** Latest document evaluation, including offered views and exports. */
  evaluation: Evaluation | undefined;
  kernelIssues: Map<string, KernelIssue[]>;
  codeIssues: CodeIssue[];
  shouldInitializeKernelOnStart: boolean;
  parentRef?: AnyActorRef;
  logActorRef?: ActorRefFrom<typeof logMachine>;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileSystemRoot: string;
  parameterManifest?: ParameterManifest;
  renderPhase: string | undefined;
  telemetryEntries: TelemetrySpanRecord[];
  operationTimeout: number;
  kernelClient?: AppRuntimeClient;
  document?: RuntimeDocument;
  defaultView?: ViewSubscription;
  capabilities?: AppCapabilitiesManifest;
  activeKernelId?: string;
  eventCleanups: Array<() => void>;
  documentCleanups: Array<() => void>;
  /** A park requested during connection or rendering runs after the unit settles. */
  parkWhenIdle: boolean;
  /** Invalidates an asynchronous document opening superseded by newer actor intent. */
  openAttempt: number;
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
      /** Bytes the first render stages for a kernel that cannot see the files (a desktop ephemeral utility). */
      stage?: Record<string, Uint8Array<ArrayBuffer>>;
    }
  | { type: 'setEntryPath'; entryPath: string }
  | { type: 'commitParameters'; stage: Record<string, Uint8Array<ArrayBuffer>> }
  | { type: 'setPreviewParameters'; parameters: Record<string, unknown> }
  | { type: 'scrubParameters'; parameters: Record<string, unknown> }
  | { type: 'restoreParameters' }
  | { type: 'setCodeIssues'; errors: CadContext['codeIssues'] }
  | { type: 'defaultRendered'; rendering: Rendering }
  | { type: 'documentEvaluated'; evaluation: Evaluation }
  | { type: 'documentDescribed'; description: Description }
  | {
      type: 'documentOpened';
      document: RuntimeDocument;
      defaultView: ViewSubscription;
      cleanups: Array<() => void>;
      requestId: number;
    }
  | { type: 'documentStatusChanged'; status: 'evaluating' | 'ready' | 'error' | 'closed' }
  | { type: 'defaultViewStatusChanged'; status: 'rendering' | 'ready' | 'error' | 'closed' }
  | { type: 'parametersParsed'; manifest: ParameterManifest }
  | { type: 'kernelIssue'; errors: KernelIssue[] }
  | { type: 'kernelProgress'; phase: string }
  | { type: 'kernelTelemetry'; batch: TelemetryBatch }
  | {
      type: 'kernelLog';
      level: LogLevel;
      message: string;
      origin?: LogOrigin;
      data?: unknown;
    }
  | { type: 'stateChanged'; state: 'idle' | 'busy' | 'error'; detail?: string }
  | { type: 'setOperationTimeout'; operationTimeout: number }
  | { type: 'capabilitiesUpdated'; capabilities: AppCapabilitiesManifest }
  | { type: 'activeKernelChanged'; kernelId: string | undefined }
  | { type: 'parkRuntime' }
  | { type: 'resumeRuntime' }
  | KernelConnectedEvent
  | FileSystemBindingChangedEvent;

type CadEmitted = { type: 'defaultRendered'; rendering: Rendering };

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
  /** Milliseconds. Create-only seed from the entry's durable record; the actor owns it afterwards. */
  operationTimeout?: number;
};

/** Release the runtime resources held by one CAD unit. */
export const disposeCadRuntime = (
  context: Pick<CadContext, 'eventCleanups' | 'documentCleanups' | 'document' | 'defaultView' | 'kernelClient'>,
): void => {
  for (const cleanup of context.documentCleanups) {
    safeDispose(cleanup);
  }
  safeDispose(() => context.defaultView?.close());
  safeDispose(() => context.document?.close());
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
  document: RuntimeDocument | undefined;
  machineRef: AnyActorRef;
  requestId: number;
  entryPath: string | undefined;
  parameterRender: ParameterRender | undefined;
};

/**
 * What one render carries beyond the entry: initial preview values and staged files, committed
 * sidecar bytes, or a drag sample.
 */
type ParameterRender =
  | Readonly<{ kind: 'commit'; stage: Record<string, Uint8Array<ArrayBuffer>> }>
  | Readonly<{ kind: 'preview'; parameters: Record<string, unknown> }>
  | Readonly<{ kind: 'scrub'; parameters: Record<string, unknown> }>
  | Readonly<{
      kind: 'initial';
      parameters?: Record<string, unknown>;
      stage?: Record<string, Uint8Array<ArrayBuffer>>;
    }>;

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

  // None of the kernel module graph depends on the filesystem, so load it while we wait for it.
  const modules = Promise.all([
    import('@taucad/runtime/client'),
    import('@taucad/runtime/filesystem'),
    lazyKernelOptionsFactory(),
  ]);
  // oxlint-disable-next-line promise/prefer-await-to-then -- an abort can skip the await below, and an unhandled rejection would take the page with it
  modules.catch(() => undefined);

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

  const [{ createRuntimeClient }, { fromFileSystemBridge }, resolveKernelOptions] = await modules;

  const computeConnection =
    getComputeReuseMode() === 'durable' && snapshot.context.projectId
      ? snapshot.context.openComputeBinding?.(snapshot.context.projectId)
      : undefined;
  if (computeConnection) {
    cleanups.push(computeConnection.dispose);
  }
  const kernelOptions = resolveKernelOptions({
    /* The kernel executes project code the agent wrote, so it reads the agent's
     * own view and never the working copy: the control plane is absent from it and
     * the records Tau keeps are read-only (invariant CI1, W14). */
    fileSystem: fromFileSystemBridge(() => snapshot.context.openFileSystemBridge!(fileSystemRoot, 'agent')),
    compute: computeConnection?.compute,
  });
  client = createRuntimeClient(kernelOptions);

  cleanups.push(
    client.on('state', (state) => {
      machineRef.send({ type: 'stateChanged', state });
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
    client.on('telemetry', (batch: TelemetryBatch) => {
      machineRef.send({ type: 'kernelTelemetry', batch });
    }),
    client.on('error', (issues) => {
      machineRef.send({ type: 'kernelIssue', errors: [...issues] });
    }),
    client.on('capabilities', (capabilities) => {
      machineRef.send({ type: 'capabilitiesUpdated', capabilities });
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

const renderModelActor = fromSafeAsync<void, RenderModelInput>(async ({ input, signal }) => {
  if (!input.client) {
    throw new Error('Kernel client is not connected');
  }
  if (!input.entryPath) {
    throw new Error('No model file is selected');
  }

  if (!input.document) {
    const initial = input.parameterRender?.kind === 'initial' ? input.parameterRender : undefined;
    const document = input.client.open({
      source: { path: input.entryPath },
      ...(initial?.parameters === undefined ? {} : { parameters: initial.parameters }),
      ...(initial?.stage === undefined ? {} : { stage: initial.stage }),
      watch: true,
    });
    const defaultView = document.view();
    const cleanups = [
      document.on('described', (description) => {
        input.machineRef.send({ type: 'documentDescribed', description });
      }),
      document.on('evaluated', (evaluation) => {
        input.machineRef.send({ type: 'documentEvaluated', evaluation });
      }),
      document.on('progress', ({ phase }) => {
        input.machineRef.send({ type: 'kernelProgress', phase });
      }),
      document.on('status', (status) => {
        input.machineRef.send({ type: 'documentStatusChanged', status });
      }),
      defaultView.on('rendered', (rendering) => {
        input.machineRef.send({ type: 'defaultRendered', rendering });
      }),
      defaultView.on('status', (status) => {
        input.machineRef.send({ type: 'defaultViewStatusChanged', status });
      }),
    ];
    signal.throwIfAborted();
    input.machineRef.send({ type: 'documentOpened', document, defaultView, cleanups, requestId: input.requestId });
    await document.evaluation({ signal });
    return;
  }

  /* Committed sidecar bytes reach the watched document once; transient drag parameters never
   * become the export baseline. An empty update cancels a drag and restores committed values. */
  const change = input.parameterRender;
  const update =
    change?.kind === 'commit'
      ? { stage: change.stage }
      : change?.kind === 'preview'
        ? { parameters: change.parameters }
        : change?.kind === 'scrub'
          ? { parameters: change.parameters, transient: true }
          : change?.kind === 'initial'
            ? {
                ...(change.parameters === undefined ? {} : { parameters: change.parameters }),
                ...(change.stage === undefined ? {} : { stage: change.stage }),
              }
            : {};
  await input.document.update(update);
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
const boundTelemetryEntries = (entries: TelemetrySpanRecord[]): TelemetrySpanRecord[] => {
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

const cadActors = {
  connectKernelActor,
  renderModelActor,
};

type CadEnqueue = EnqueueObject<CadEvent, CadEmitted, SystemRegistry, typeof cadActors>;
type CadPatch = Partial<CadContext>;
type ActorIdentity = AnyActorRef;

type CadArgs<EventType extends CadEvent['type']> = Readonly<{
  context: CadContext;
  event: Extract<CadEvent, { type: EventType }>;
}>;
type RenderTrigger = Extract<
  CadEvent,
  { type: 'initializeModel' | 'setEntryPath' | 'commitParameters' | 'setPreviewParameters' | 'scrubParameters' }
>;

/*
 * R4: why this unit has no kernel, told to the project that owns it.
 *
 * A refusal — the desktop's fork guard, a resolver saying no — rejects the
 * connect and leaves nothing on screen to explain it. The project machine
 * keeps the last word so the sidebar row can say it without reaching into
 * the units; `undefined` on every fresh attempt, because a unit that is
 * trying again is not refused.
 */
const notifyKernelRefusal = (
  context: CadContext,
  enq: CadEnqueue,
  refusal: Readonly<{ self: ActorIdentity; reason: string | undefined }>,
): void => {
  const { self, reason } = refusal;
  if (context.parentRef) {
    enq.sendTo(context.parentRef, { type: 'geometryUnit.kernelRefused', actorId: actorIdOf(self), reason });
  }
};

/** Release the kernel. The disposal runs as an effect; the refs clear with the transition. */
const destroyKernel = (context: CadContext, enq: CadEnqueue): CadPatch => {
  const { eventCleanups, documentCleanups, document, defaultView, kernelClient } = context;
  enq(() => {
    disposeCadRuntime({ eventCleanups, documentCleanups, document, defaultView, kernelClient });
  });
  return {
    eventCleanups: [],
    documentCleanups: [],
    document: undefined,
    defaultView: undefined,
    kernelClient: undefined,
  };
};

/** Close a source's document and every default-view listener before opening another source. */
const destroyDocument = (context: CadContext, enq: CadEnqueue): CadPatch => {
  const { documentCleanups, document, defaultView } = context;
  enq(() => {
    for (const cleanup of documentCleanups) {
      safeDispose(cleanup);
    }
    safeDispose(() => defaultView?.close());
    safeDispose(() => document?.close());
  });
  return {
    documentCleanups: [],
    document: undefined,
    defaultView: undefined,
    evaluation: undefined,
    lastProjection: undefined,
  };
};

/** Record new actor intent so a superseded asynchronous document open can be closed. */
const renderRequestPatch = (context: CadContext, event: RenderTrigger): CadPatch => {
  const bumped = { openAttempt: context.openAttempt + 1 };
  switch (event.type) {
    case 'initializeModel': {
      return {
        ...bumped,
        entryPath: event.entryPath,
        codeIssues: [],
        latestRenderingOutcome: undefined,
        parameterManifest: undefined,
        /* The initial stage rides only this render; a later commit or scrub replaces it. */
        parameterRender:
          event.parameters === undefined && event.stage === undefined
            ? undefined
            : {
                kind: 'initial',
                ...(event.parameters ? { parameters: event.parameters } : {}),
                ...(event.stage ? { stage: event.stage } : {}),
              },
      };
    }
    case 'setEntryPath': {
      const kernelIssues = new Map(context.kernelIssues);
      kernelIssues.delete(event.entryPath);
      return {
        ...bumped,
        entryPath: event.entryPath,
        // The staged bytes belong to the entry that was open; the new entry re-supplies its own.
        parameterRender: undefined,
        latestRenderingOutcome: undefined,
        codeIssues: [],
        kernelIssues,
      };
    }
    /* Persistence has already landed these bytes; carrying them makes the runtime observe the
     * revision it is about to be told about, so the sidecar's watch event renders nothing. */
    case 'commitParameters': {
      return { ...bumped, parameterRender: { kind: 'commit', stage: event.stage }, latestRenderingOutcome: undefined };
    }
    case 'setPreviewParameters': {
      return {
        ...bumped,
        parameterRender: { kind: 'preview', parameters: event.parameters },
        latestRenderingOutcome: undefined,
      };
    }
    case 'scrubParameters': {
      return {
        ...bumped,
        parameterRender: { kind: 'scrub', parameters: event.parameters },
        latestRenderingOutcome: undefined,
      };
    }
  }
};

/** A render-triggering event: record it and go where the state sends it. */
const renderRequest =
  (target?: string, options: Readonly<{ reenter?: boolean; destroy?: boolean }> = {}) =>
  ({ context, event }: Readonly<{ context: CadContext; event: RenderTrigger }>, enq: CadEnqueue) => {
    /* A hidden unit keeps the latest intent for reconnect, but may not restart
     * an in-flight render just because a parameter sidecar settled. */
    const parkPending = context.parkWhenIdle;
    const destroyed = options.destroy === true && !parkPending ? destroyKernel(context, enq) : {};
    const replaced =
      event.type === 'initializeModel' || event.type === 'setEntryPath'
        ? destroyDocument({ ...context, ...destroyed }, enq)
        : {};
    return {
      ...(target === undefined || parkPending ? {} : { target }),
      ...(options.reenter === true && !parkPending ? { reenter: true } : {}),
      context: { ...destroyed, ...replaced, ...renderRequestPatch({ ...context, ...destroyed, ...replaced }, event) },
    };
  };

/** Record issues against the entry this unit renders; nothing to key them by without one. */
const withEntryIssues = (
  context: CadContext,
  update: (issues: Map<string, KernelIssue[]>, entryPath: string) => void,
): Map<string, KernelIssue[]> => {
  if (!context.entryPath) {
    return context.kernelIssues;
  }
  const next = new Map(context.kernelIssues);
  update(next, context.entryPath);
  return next;
};

const kernelLog = ({ context, event }: CadArgs<'kernelLog'>, enq: CadEnqueue) => {
  const logMethod = event.level === 'error' ? console.error : event.level === 'warn' ? console.warn : console.debug;
  const origin = typeof event.origin === 'string' ? event.origin : 'worker';
  enq(() => {
    logMethod(`[Kernel:${origin}] ${event.message}${consoleLogData(event.data)}`);
  });
  if (context.logActorRef) {
    const storedOrigin = context.entryPath ? { ...event.origin, file: context.entryPath } : event.origin;
    enq.sendTo(context.logActorRef, {
      type: 'addLog',
      message: event.message,
      options: { level: event.level, origin: storedOrigin, data: event.data },
    });
  }
  return {};
};

const kernelTelemetry = ({ context, event }: CadArgs<'kernelTelemetry'>) => {
  /* The producer and its clock anchor are batch fields on the wire, and this store outlives the
   * batch: fold them into each span so a recycled client's `spanId` 0 cannot parent under the
   * previous client's (I5). This is the same record the JSONL sink writes. */
  const { origin, epoch } = event.batch;
  const arrived = event.batch.entries.map((entry) => ({ ...entry, origin, epoch }));
  return { context: { telemetryEntries: boundTelemetryEntries([...context.telemetryEntries, ...arrived]) } };
};

/** Signals every connected unit takes, whatever its render state. */
const runtimeSignals = {
  kernelLog,
  kernelProgress: ({ event }: CadArgs<'kernelProgress'>) => ({ context: { renderPhase: event.phase } }),
  kernelTelemetry,
  capabilitiesUpdated: ({ event }: CadArgs<'capabilitiesUpdated'>) => ({
    context: { capabilities: event.capabilities },
  }),
  activeKernelChanged: ({ event }: CadArgs<'activeKernelChanged'>) => ({ context: { activeKernelId: event.kernelId } }),
};

/** Results and issues a unit with a kernel records in every state after connecting. */
const resultSignals = {
  ...runtimeSignals,
  setCodeIssues: ({ event }: CadArgs<'setCodeIssues'>) => ({ context: { codeIssues: event.errors } }),
  defaultRendered: ({ context, event }: CadArgs<'defaultRendered'>, enq: CadEnqueue) => {
    // A successful export-only build offers no default projection. Its automatic
    // VIEW_UNAVAILABLE reply must not turn the document's success into failure.
    if (context.evaluation?.success && context.evaluation.views.length === 0) {
      return {};
    }
    if (!event.rendering.transient) {
      enq.emit({ type: 'defaultRendered', rendering: event.rendering });
    }
    const combinedIssues = [...(context.evaluation?.issues ?? [])];
    for (const issue of event.rendering.issues) {
      if (
        !combinedIssues.some(
          (existing) =>
            existing.code === issue.code &&
            existing.message === issue.message &&
            existing.type === issue.type &&
            existing.severity === issue.severity,
        )
      ) {
        combinedIssues.push(issue);
      }
    }
    if (!event.rendering.success) {
      const patch: CadPatch = {
        lastProjection: event.rendering,
        latestRenderingOutcome: 'failure',
        kernelIssues: withEntryIssues(context, (issues, entryPath) => {
          issues.set(entryPath, combinedIssues);
        }),
      };
      return {
        context: patch,
      };
    }
    const patch: CadPatch = {
      rendering: event.rendering,
      lastProjection: event.rendering,
      latestRenderingOutcome: 'success',
      kernelIssues: withEntryIssues(context, (issues, entryPath) => {
        if (combinedIssues.length > 0) {
          issues.set(entryPath, combinedIssues);
        } else {
          issues.delete(entryPath);
        }
      }),
    };
    return { context: patch };
  },
  documentEvaluated: ({ context, event }: CadArgs<'documentEvaluated'>) => {
    const patch: CadPatch = {
      evaluation: event.evaluation,
      ...(event.evaluation.success && event.evaluation.views.length === 0
        ? { rendering: undefined, latestRenderingOutcome: 'success' }
        : {}),
      ...(event.evaluation.success ? {} : { latestRenderingOutcome: 'failure' }),
      kernelIssues: withEntryIssues(context, (issues, entryPath) => {
        if (event.evaluation.issues.length > 0) {
          issues.set(entryPath, [...event.evaluation.issues]);
        } else {
          issues.delete(entryPath);
        }
      }),
    };
    return { context: patch };
  },
  documentDescribed: ({ event }: CadArgs<'documentDescribed'>) => ({
    context: {
      activeKernelId: event.description.kernelId,
      ...(event.description.success ? { parameterManifest: event.description.parameters } : {}),
    },
  }),
  parametersParsed: ({ event }: CadArgs<'parametersParsed'>) => ({ context: { parameterManifest: event.manifest } }),
  kernelIssue: ({ context, event }: CadArgs<'kernelIssue'>) => ({
    context: {
      kernelIssues: withEntryIssues(context, (issues, entryPath) => {
        issues.set(entryPath, event.errors);
      }),
    },
  }),
};

/** Follow the runtime's own state report, from wherever it is not already. */
const errorMessageOf = (error: unknown, fallback: string): string =>
  error instanceof Error || error instanceof DOMException ? error.message : fallback;

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
  schemas: {
    context: types<CadContext>(),
    events: eventSchemas<CadEvent>(),
    input: types<CadInput>(),
    emitted: eventSchemas<CadEmitted>(),
    tags: types<CadTag>(),
  },
  actors: cadActors,
}).createMachine({
  id: 'cad',
  context: ({ input }) => ({
    entryPath: undefined,
    screenshot: undefined,
    units: { length: 'mm' },
    parameterRender: undefined,
    latestRenderingOutcome: undefined,
    rendering: undefined,
    lastProjection: undefined,
    evaluation: undefined,
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
    operationTimeout: input.operationTimeout ?? defaultOperationTimeout,
    kernelClient: undefined,
    document: undefined,
    defaultView: undefined,
    capabilities: undefined,
    activeKernelId: undefined,
    eventCleanups: [],
    documentCleanups: [],
    parkWhenIdle: false,
    openAttempt: 0,
  }),
  exit: ({ context }, enq) => ({ context: destroyKernel(context, enq) }),
  on: {
    stateChanged: ({ event }) => (event.state === 'error' ? { target: '.error' } : {}),
    documentOpened: ({ context, event }, enq) => {
      if (event.requestId !== context.openAttempt || context.parkWhenIdle) {
        enq(() => {
          for (const cleanup of event.cleanups) {
            safeDispose(cleanup);
          }
          event.defaultView.close();
          event.document.close();
        });
        return {};
      }
      return {
        context: { document: event.document, defaultView: event.defaultView, documentCleanups: event.cleanups },
      };
    },
    documentStatusChanged: ({ event }) => {
      if (event.status === 'evaluating') {
        return { target: '.rendering.active' };
      }
      if (event.status === 'error') {
        return { target: '.error' };
      }
      if (event.status === 'ready') {
        return { target: '.idle' };
      }
      return {};
    },
    defaultViewStatusChanged: ({ context, event }) => {
      if (context.evaluation?.success && context.evaluation.views.length === 0) {
        return {};
      }
      if (event.status === 'rendering') {
        return { target: '.rendering.active' };
      }
      if (event.status === 'error') {
        return { target: '.error' };
      }
      if (event.status === 'ready') {
        return { target: '.idle' };
      }
      return {};
    },
    parkRuntime: { context: { parkWhenIdle: true } },
    resumeRuntime: { context: { parkWhenIdle: false } },
    restoreParameters: ({ context }) => ({
      ...(context.parkWhenIdle ? {} : { target: '.rendering.submitting' }),
      context: {
        openAttempt: context.openAttempt + 1,
        parameterRender: undefined,
        latestRenderingOutcome: undefined,
      },
    }),
    /* Re-entering from the root runs the root's `exit`, which releases the
     * kernel; releasing it here as well would dispose the same client twice,
     * because this transition reads the context from before that exit (S12). */
    filesystemBindingChanged: { target: '.connecting', reenter: true },
    setOperationTimeout: ({ context, event }, enq) => {
      const client = context.kernelClient;
      enq(() => {
        client?.setOperationTimeout(event.operationTimeout);
      });
      return { context: { operationTimeout: event.operationTimeout } };
    },
  },
  initial: 'connecting',
  states: {
    connecting: {
      tags: ['cad-loading'],
      /* R4: a unit that is trying again is not refused. */
      entry: ({ context, self }, enq) => {
        notifyKernelRefusal(context, enq, { self, reason: undefined });
      },
      invoke: {
        id: 'connectKernelActor',
        src: 'connectKernelActor',
        input: ({ context, self }) => ({
          kernelOptionsFactory: context.kernelOptionsFactory,
          fileSystemRoot: context.fileSystemRoot,
          fileManagerRef: context.fileManagerRef,
          machineRef: self,
        }),
        onDone: { target: 'idle' },
        onError: ({ context, event, self }, enq) => {
          const errorMessage = errorMessageOf(event.error, 'Failed to connect kernel');
          const kernelIssues = new Map(context.kernelIssues);
          kernelIssues.set('__connection__', [
            { message: errorMessage, code: 'RUNTIME', type: 'runtime', severity: 'error' },
          ]);
          notifyKernelRefusal(context, enq, { self, reason: errorMessage });
          return { target: 'error', context: { kernelIssues } };
        },
      },
      on: {
        kernelConnected: ({ context, event }, enq) => {
          const { client } = event;
          const { operationTimeout } = context;
          enq(() => {
            client.setOperationTimeout(operationTimeout);
          });
          if (context.parkWhenIdle) {
            return {
              target: 'parked',
              context: {
                ...destroyKernel({ ...context, kernelClient: client, eventCleanups: event.cleanups }, enq),
                parkWhenIdle: false,
              },
            };
          }
          return {
            target: context.entryPath ? '#cad.rendering.submitting' : 'idle',
            context: { kernelClient: event.client, eventCleanups: event.cleanups },
          };
        },
        initializeModel: renderRequest(),
        setEntryPath: renderRequest(),
        ...runtimeSignals,
      },
    },

    idle: {
      always: ({ context }, enq) =>
        context.parkWhenIdle
          ? { target: 'parked', context: { ...destroyKernel(context, enq), parkWhenIdle: false } }
          : undefined,
      on: {
        /* R3: release the kernel process while retaining geometry, editor state and
         * session. An in-flight render finishes before a pending park takes effect. */
        parkRuntime: ({ context }, enq) => ({
          target: 'parked',
          context: { ...destroyKernel(context, enq), parkWhenIdle: false },
        }),
        initializeModel: renderRequest('#cad.rendering.submitting'),
        setEntryPath: renderRequest('#cad.rendering.submitting'),
        commitParameters: renderRequest('#cad.rendering.submitting'),
        setPreviewParameters: renderRequest('#cad.rendering.submitting'),
        scrubParameters: renderRequest('#cad.rendering.submitting'),
        ...resultSignals,
      },
    },

    buffering: {
      tags: ['cad-loading'],
      on: {
        initializeModel: renderRequest('#cad.rendering.submitting'),
        setEntryPath: renderRequest('#cad.rendering.submitting'),
        commitParameters: renderRequest('#cad.rendering.submitting'),
        setPreviewParameters: renderRequest('#cad.rendering.submitting'),
        scrubParameters: renderRequest('#cad.rendering.submitting'),
        ...resultSignals,
      },
    },

    rendering: {
      tags: ['cad-loading'],
      initial: 'active',
      exit: () => ({ context: { renderPhase: undefined } }),
      states: {
        submitting: {
          invoke: {
            src: 'renderModelActor',
            input: ({ context, self }) => ({
              client: context.kernelClient,
              entryPath: context.entryPath,
              parameterRender: context.parameterRender,
              document: context.document,
              machineRef: self,
              requestId: context.openAttempt,
            }),
            onDone: { target: '#cad.idle' },
            onError: ({ context, event }) => {
              const entryPath = context.entryPath ?? '__render__';
              const errorCode =
                event.error &&
                typeof event.error === 'object' &&
                'code' in event.error &&
                isKernelIssueCode(event.error.code)
                  ? event.error.code
                  : 'RUNTIME';
              const kernelIssues = new Map(context.kernelIssues);
              kernelIssues.set(entryPath, [
                {
                  message: errorMessageOf(event.error, 'Failed to render model'),
                  code: errorCode,
                  type: 'runtime',
                  severity: 'error',
                },
              ]);
              return { target: '#cad.error', context: { kernelIssues } };
            },
          },
          on: {},
        },
        active: {},
      },
      on: {
        initializeModel: renderRequest('#cad.rendering.submitting', { reenter: true }),
        setEntryPath: renderRequest('#cad.rendering.submitting', { reenter: true }),
        commitParameters: renderRequest('#cad.rendering.submitting', { reenter: true }),
        setPreviewParameters: renderRequest('#cad.rendering.submitting', { reenter: true }),
        scrubParameters: renderRequest('#cad.rendering.submitting', { reenter: true }),
        ...resultSignals,
      },
    },

    /**
     * No kernel client, everything else intact (R3).
     *
     * The kernel process is gone; the entry path, geometry, issues and telemetry
     * this unit already has stay, so returning is a reconnect and not a reload.
     * `connecting` adopts the desktop's warm spare, and compute reuse (`durable`)
     * renders the first frame from cache.
     */
    parked: {
      on: {
        resumeRuntime: { target: 'connecting', context: { parkWhenIdle: false } },
        /* Changes while parked retarget the unit; rendering happens on resume. */
        setEntryPath: renderRequest(),
        commitParameters: renderRequest(),
        setPreviewParameters: renderRequest(),
        scrubParameters: renderRequest(),
        /* The root's `restoreParameters` renders, and there is no client to render
         * with: take the intent (drop the staged values) and leave the render to
         * the reconnect, instead of failing into `error` (V1-4). */
        restoreParameters: ({ context }) => ({
          context: {
            openAttempt: context.openAttempt + 1,
            parameterRender: undefined,
            latestRenderingOutcome: undefined,
          },
        }),
        setCodeIssues: resultSignals.setCodeIssues,
      },
    },

    error: {
      tags: ['cad-runtime-error'],
      always: ({ context }, enq) =>
        context.parkWhenIdle
          ? { target: 'parked', context: { ...destroyKernel(context, enq), parkWhenIdle: false } }
          : undefined,
      on: {
        parkRuntime: ({ context }, enq) => ({
          target: 'parked',
          context: { ...destroyKernel(context, enq), parkWhenIdle: false },
        }),
        /* Every way a parked unit can fall into `error` ends here, so the session's
         * next resume has to be heard from `error` too, or the unit dead-ends
         * until an unrelated entry change arrives (V1-4). */
        resumeRuntime: ({ context }, enq) => ({
          target: 'connecting',
          context: { ...destroyKernel(context, enq), parkWhenIdle: false },
        }),
        initializeModel: renderRequest('connecting', { destroy: true }),
        setEntryPath: renderRequest('connecting', { destroy: true }),
        setPreviewParameters: renderRequest('connecting', { destroy: true }),
        ...resultSignals,
      },
    },
  },
});

type CadSnapshot = SnapshotFrom<typeof cadMachine>;

/** Select the canonical issues for the latest failed CAD result without allocating a derived view model. */
export const selectCadFailureIssues = (snapshot: CadSnapshot): readonly KernelIssue[] | undefined => {
  if (snapshot.context.latestRenderingOutcome === 'failure') {
    return selectIssuesByPrecedence(snapshot.context, [snapshot.context.entryPath, '__render__', '__connection__']);
  }
  if (!snapshot.hasTag('cad-runtime-error')) {
    return undefined;
  }
  return selectIssuesByPrecedence(snapshot.context, ['__connection__', snapshot.context.entryPath, '__render__']);
};

/**
 * The phase a viewer shows while the CAD actor is busy, or `undefined` when it is not.
 *
 * A drag sample renders under the same tag but is a live preview, not a load, so it shows no phase.
 */
export const selectCadLoadingPhase = (snapshot: CadSnapshot): 'buffering' | 'connecting' | 'rendering' | undefined => {
  if (!snapshot.hasTag('cad-loading')) {
    return undefined;
  }
  if (snapshot.matches('connecting')) {
    return 'connecting';
  }
  if (snapshot.context.parameterRender?.kind === 'scrub') {
    return undefined;
  }
  return snapshot.matches('buffering') ? 'buffering' : 'rendering';
};

/** Select one entry's kernel issues. A factory because the entry path is the caller's, not the machine's. */
export const selectCadEntryIssues =
  (entryPath: string) =>
  (snapshot: CadSnapshot): readonly KernelIssue[] | undefined =>
    snapshot.context.kernelIssues.get(entryPath);

export const selectCadOperationTimeout = (snapshot: CadSnapshot): number => snapshot.context.operationTimeout;

export const selectCadRendering = (snapshot: CadSnapshot): Rendering | undefined => snapshot.context.rendering;
export const selectCadEvaluation = (snapshot: CadSnapshot): Evaluation | undefined => snapshot.context.evaluation;
export const selectCadDocument = (snapshot: CadSnapshot): RuntimeDocument | undefined => snapshot.context.document;
export const selectCadUnits = (snapshot: CadSnapshot): CadContext['units'] => snapshot.context.units;
export const selectCadKernelClient = (snapshot: CadSnapshot): AppRuntimeClient | undefined =>
  snapshot.context.kernelClient;
export const selectIsCadLoading = (snapshot: CadSnapshot): boolean => snapshot.hasTag('cad-loading');
