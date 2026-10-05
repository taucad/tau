import { interactiveViewContent } from '#lib/interactive-view-content.js';
import { markGeometryReceipt } from '#lib/renderer-telemetry.js';
import { createAsyncLogic, setup, types, waitFor } from 'xstate';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import { digestContent } from '@taucad/cache-core';
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
import { asKnownArtifact, isKernelIssueCode } from '@taucad/runtime/types';
import { assertRootedPath, normalizePath } from '@taucad/utils/path';
import type { PublishedPartAsset, PublishedAssembly, AdmittedAssembly } from '@taucad/runtime/types';
import type { PublishedAssemblyDocument } from '@taucad/runtime/client';
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
export type CadAssemblyDisplay = Readonly<{
  root: PublishedPartAsset;
  admitted: AdmittedAssembly;
  document: PublishedAssemblyDocument;
  /** Actual selected entry bytes read for this admission; a root refresh retains that baseline. */
  entryRead?: PublishedPartAsset;
}>;

type CadTag = 'cad-loading' | 'cad-runtime-error';

export type CadContext = {
  entryPath: string | undefined;
  screenshot: string | undefined;
  /** What the next render carries beyond the entry, cleared by any other render trigger. */
  parameterRender: ParameterRender | undefined;
  units: { length: LengthSymbol };
  lastRequestedRenderId: number;
  lastSettledRenderId: number;
  /** Outcome of the latest default-view projection. */
  latestRenderingOutcome: LatestRenderingOutcome;
  /** Last successful default projection retained across later failures. */
  rendering: Rendering | undefined;
  /** Last non-transient successful view retains physical inspection facts during a scrub. */
  committedRendering: Rendering | undefined;
  /** Latest projection verdict, including failures, for operation correlation. */
  lastProjection: Rendering | undefined;
  /** Latest document evaluation, including offered views and exports. */
  evaluation: Evaluation | undefined;
  /** Actual admitted scene retained without allocating a flattened display GLB. */
  committedAssemblyDisplay?: CadAssemblyDisplay;
  /** Immutable subject matching the last committed pinned scene. */
  publishedAssemblyRoot?: PublishedPartAsset;
  /** Admitted records and placement that qualify consumers of the committed root. */
  publishedAssembly?: PublishedAssembly;
  /** Actual host-admitted reader matching the committed publication and display. */
  admittedAssembly?: AdmittedAssembly;
  /** Selected entry associated with the committed immutable root (authored or pinned). */
  publishedAssemblyEntryPath?: string;
  /** Entry whose JSON classification or immutable admission is still pending. */
  pendingAssemblyEntryPath?: string;
  /** Managed root observation used by a root watch refresh, without rerunning its author. */
  assemblyRootReadPath?: string;
  assemblyPublicationWritable?: boolean;
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
  /** Allocated ownership, not connected readiness. */
  connectingClient?: AppRuntimeClient;
  runtimeCloseError?: Error;
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
  assemblyPublicationWritable?: boolean;
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
  | { type: 'refreshPublishedAssembly' }
  | { type: 'setCodeIssues'; errors: CadContext['codeIssues'] }
  | { type: 'defaultRendered'; rendering: Rendering }
  | { type: 'documentEvaluated'; evaluation: Evaluation }
  | {
      type: 'defaultViewChanged';
      document: RuntimeDocument;
      view: ViewSubscription | undefined;
    }
  | { type: 'documentDescribed'; description: Description }
  | {
      type: 'documentOpened';
      document: RuntimeDocument;
      defaultView: ViewSubscription | undefined;
      cleanups: Array<() => void>;
      requestId: number;
    }
  | {
      type: 'documentStatusChanged';
      status: 'evaluating' | 'ready' | 'error' | 'closed';
    }
  | {
      type: 'defaultViewStatusChanged';
      status: 'rendering' | 'ready' | 'error' | 'closed';
    }
  | {
      type: 'assemblyComputed';
      assemblyDisplay: CadAssemblyDisplay;
      entryPath: string;
      issues: KernelIssue[];
    }
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
  | { type: 'sourceRenderingSelected'; entryPath: string; requestId: number }
  | { type: 'closeRuntime' }
  | { type: 'kernelAllocated'; client: AppRuntimeClient; cleanups: Array<() => void> }
  | KernelConnectedEvent
  | FileSystemBindingChangedEvent;

type CadEmitted =
  | { type: 'defaultRendered'; rendering: Rendering }
  | { type: 'assemblyEvaluated'; assemblyDisplay: CadAssemblyDisplay };
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
  context: Pick<
    CadContext,
    'eventCleanups' | 'documentCleanups' | 'document' | 'defaultView' | 'kernelClient' | 'connectingClient'
  >,
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
  if (context.connectingClient !== context.kernelClient) {
    safeDispose(() => context.connectingClient?.terminate());
  }
};

/** Await this unit's owned shutdown before its project drops the actor tree. */
export const closeCadRuntime = async (actor: ActorRefFrom<typeof cadMachine>, signal?: AbortSignal): Promise<void> => {
  actor.send({ type: 'closeRuntime' });
  const snapshot = await waitFor(
    actor,
    (state) => state.matches('runtimeClosed') || state.matches('runtimeCloseFailed'),
    { signal },
  );
  if (snapshot.matches('runtimeCloseFailed')) {
    const error: unknown = snapshot.context.runtimeCloseError;
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('CAD runtime shutdown failed');
  }
};

type ConnectKernelInput = {
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileManagerRef?: ActorRefFrom<typeof fileManagerMachine>;
  machineRef: AnyActorRef;
  fileSystemRoot: string;
};

type RenderModelInput = {
  publishedAssemblyRoot?: PublishedPartAsset;
  assemblyEntryRead?: PublishedPartAsset;
  assemblyRootReadPath?: string;
  assemblyPublicationWritable?: boolean;
  knownAssemblyRoute?: 'authored' | 'published';
  client: AppRuntimeClient | undefined;
  document: RuntimeDocument | undefined;
  machineRef: AnyActorRef;
  requestId: number;
  entryPath: string | undefined;
  parameterRender: ParameterRender | undefined;
  fileManagerRef: CadContext['fileManagerRef'];
  fileSystemRoot: string;
  /** Whether no newer UI render was requested since this one. */
  isLatestRequest: () => boolean;
  selectSourceRendering: () => void;
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
    import('#runtime/assembly-display-admission.js'),
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
  let ownershipTransferred = false;
  const teardown = () => {
    if (tornDown || ownershipTransferred) {
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

  const [
    { createRuntimeClient },
    { fromFileSystemBridge },
    resolveKernelOptions,
    { createAssemblyPublicationAuthority },
  ] = await modules;
  signal.throwIfAborted();

  const computeConnection =
    getComputeReuseMode() === 'durable' && snapshot.context.projectId
      ? snapshot.context.openComputeBinding?.(snapshot.context.projectId)
      : undefined;
  if (computeConnection) {
    cleanups.push(computeConnection.dispose);
  }
  const publicationAuthority = await createAssemblyPublicationAuthority(
    () => snapshot.context.openFileSystemBridge!(fileSystemRoot, 'user'),
    signal,
  );
  cleanups.push(publicationAuthority.dispose);
  const kernelOptions = resolveKernelOptions({
    /* The kernel executes project code the agent wrote, so it reads the agent's
     * own view and never the working copy: the control plane is absent from it and
     * the records Tau keeps are read-only (invariant CI1, W14). */
    fileSystem: fromFileSystemBridge(() => snapshot.context.openFileSystemBridge!(fileSystemRoot, 'agent')),
    publicationFileSystem: publicationAuthority.fileSystem,
    compute: computeConnection?.compute,
  });
  client = createRuntimeClient(kernelOptions);

  let watchedEntry: string | undefined;
  let watchedRoot: string | undefined;
  let assemblyContext: CadContext | undefined;
  let stopWatchingEntry: (() => void) | undefined;
  let stopWatchingRoot: (() => void) | undefined;
  const subscribePath = (
    path: string,
    readBaseline: () => PublishedPartAsset | undefined,
    listener: () => void,
  ): (() => void) => {
    const selectedPath = normalizePath(`${fileSystemRoot}/${assertRootedPath(path)}`);
    const rootDirectory: unknown = snapshot.context.rootDirectory;
    if (typeof rootDirectory !== 'string') {
      throw new TypeError('Assembly watch has no captured workspace root.');
    }
    const scope = normalizePath(rootDirectory);
    const prefix = scope === '/' ? '/' : `${scope}/`;
    if (!selectedPath.startsWith(prefix)) {
      throw new Error('Assembly watch escapes captured content authority.');
    }
    const relativePath = assertRootedPath(selectedPath.slice(prefix.length));
    let closed = false;
    let pending: { baseline: PublishedPartAsset | undefined } | undefined;
    const observe = async (): Promise<void> => {
      const baseline = readBaseline();
      const observation = { baseline };
      pending = observation;
      const isCurrent = (): boolean => {
        const files = fileManagerRef.getSnapshot();
        return (
          !closed &&
          pending === observation &&
          !replacementState.notified &&
          machineRef.getSnapshot().status === 'active' &&
          files.status === 'active' &&
          files.matches('ready') &&
          assemblyContext?.fileManagerRef === fileManagerRef &&
          assemblyContext.fileSystemRoot === fileSystemRoot &&
          files.context.contentService === capturedContentService &&
          files.context.rootDirectory === rootDirectory &&
          readBaseline() === baseline
        );
      };
      if (!isCurrent()) {
        return;
      }
      if (baseline) {
        try {
          const bytes = await capturedContentService.readRawBytes(relativePath);
          if (!isCurrent()) {
            return;
          }
          const digest = await digestContent({ bytes });
          if (!isCurrent()) {
            return;
          }
          if (
            digest === baseline.digest &&
            bytes.byteLength === baseline.byteLength &&
            assemblyContext?.latestRenderingOutcome !== 'failure'
          ) {
            return;
          }
        } catch {
          // A deletion or refused read must still reach the existing admission error path.
          if (!isCurrent()) {
            return;
          }
        }
      }
      listener();
    };
    const unsubscribe = capturedContentService.subscribe(relativePath, () => {
      // async-iife: event handler -- A content outcome may be the first read of already admitted bytes.
      void observe();
    });
    return () => {
      closed = true;
      pending = undefined;
      unsubscribe();
    };
  };
  const entrySubscription = machineRef.subscribe((state: { context: CadContext }) => {
    const { context } = state;
    assemblyContext = context;
    const entry = context.entryPath?.endsWith('.json') ? context.entryPath : undefined;
    const publishedRoot = context.publishedAssemblyEntryPath === entry ? context.publishedAssemblyRoot : undefined;
    const root = publishedRoot?.path;
    if (entry !== watchedEntry) {
      stopWatchingEntry?.();
      watchedEntry = entry;
      stopWatchingEntry = entry
        ? subscribePath(
            entry,
            () =>
              assemblyContext?.publishedAssemblyEntryPath === entry
                ? assemblyContext.committedAssemblyDisplay?.entryRead
                : undefined,
            () => {
              machineRef.send({ type: 'setEntryPath', entryPath: entry });
            },
          )
        : undefined;
    }
    const observedRoot = root === entry ? undefined : root;
    if (observedRoot !== watchedRoot) {
      stopWatchingRoot?.();
      watchedRoot = observedRoot;
      stopWatchingRoot = observedRoot
        ? subscribePath(
            observedRoot,
            () =>
              assemblyContext?.publishedAssemblyRoot?.path === observedRoot
                ? assemblyContext.publishedAssemblyRoot
                : undefined,
            () => {
              machineRef.send({ type: 'refreshPublishedAssembly' });
            },
          )
        : undefined;
    }
  });
  cleanups.push(
    () => {
      entrySubscription.unsubscribe();
    },
    () => stopWatchingEntry?.(),
    () => stopWatchingRoot?.(),
  );

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

  machineRef.send({ type: 'kernelAllocated', client, cleanups });
  ownershipTransferred = true;

  await client.connect();
  signal.throwIfAborted();

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

  return {
    type: 'kernelConnected',
    client,
    cleanups,
    assemblyPublicationWritable: publicationAuthority.fileSystem !== undefined,
  };
});

const renderModelActor = fromSafeAsync<CadEvent | void, RenderModelInput>(async ({ input, signal }) => {
  if (!input.client) {
    throw new Error('Kernel client is not connected');
  }
  if (!input.entryPath) {
    throw new Error('No model file is selected');
  }

  const readEntryPath =
    input.assemblyRootReadPath ??
    (input.assemblyPublicationWritable === false && input.knownAssemblyRoute === 'authored'
      ? (input.publishedAssemblyRoot?.path ?? input.entryPath)
      : input.entryPath);
  const knownRoute = readEntryPath === input.entryPath ? input.knownAssemblyRoute : 'published';
  if (readEntryPath.endsWith('.json')) {
    assertRootedPath(readEntryPath);
    const snapshot = input.fileManagerRef?.getSnapshot();
    const contentService = snapshot?.context.contentService;
    if (!snapshot?.matches('ready') || !contentService) {
      throw new Error('File content authority is not ready for assembly admission.');
    }
    const entryPath = assertRootedPath(readEntryPath);
    const selectedPath = normalizePath(`${input.fileSystemRoot}/${entryPath}`);
    const rootDirectory: unknown = snapshot.context.rootDirectory;
    if (typeof rootDirectory !== 'string') {
      throw new TypeError('File content authority has no captured workspace root.');
    }
    const scope = normalizePath(rootDirectory);
    const prefix = scope === '/' ? '/' : `${scope}/`;
    if (!selectedPath.startsWith(prefix)) {
      throw new Error('Assembly entry escapes its captured file content authority.');
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await contentService.readRawBytes(assertRootedPath(selectedPath.slice(prefix.length)));
    } catch (error) {
      if (
        !(error instanceof FileNotFoundError) ||
        input.knownAssemblyRoute !== 'authored' ||
        readEntryPath !== input.entryPath ||
        !input.publishedAssemblyRoot
      ) {
        throw error;
      }
      signal.throwIfAborted();
      const { publishedAssemblyRoot } = input;
      const document = await input.client.openAssembly({ root: publishedAssemblyRoot, signal });
      const { admitted } = document;
      if (signal.aborted || !input.isLatestRequest()) {
        document.close();
        signal.throwIfAborted();
        return undefined;
      }
      return {
        type: 'assemblyComputed',
        assemblyDisplay: { root: publishedAssemblyRoot, admitted, document, entryRead: input.assemblyEntryRead },
        entryPath: input.entryPath,
        issues: [],
      };
    }
    signal.throwIfAborted();
    let candidate: unknown;
    try {
      candidate = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      // Ordinary malformed JSON still belongs to the selected source render route.
      candidate = undefined;
    }
    const assemblyShape =
      candidate !== null &&
      typeof candidate === 'object' &&
      Object.hasOwn(candidate, 'schemaVersion') &&
      Object.hasOwn(candidate, 'parts') &&
      Object.hasOwn(candidate, 'occurrences');
    const publishedPointerShape =
      candidate !== null &&
      typeof candidate === 'object' &&
      'schemaVersion' in candidate &&
      candidate.schemaVersion === 2 &&
      'generation' in candidate &&
      typeof candidate.generation === 'number' &&
      Number.isSafeInteger(candidate.generation) &&
      'manifest' in candidate &&
      candidate.manifest !== null &&
      typeof candidate.manifest === 'object';
    if (knownRoute !== undefined || assemblyShape || publishedPointerShape) {
      const { sha256String } = await import('@taucad/utils/hash');
      signal.throwIfAborted();
      const digest = await digestContent({ bytes });
      signal.throwIfAborted();
      const entryRead =
        readEntryPath === input.entryPath
          ? { path: readEntryPath, digest, byteLength: bytes.byteLength }
          : input.assemblyEntryRead;
      let root = { path: entryPath, digest, byteLength: bytes.byteLength };
      let admitted;
      let publishedDocument: PublishedAssemblyDocument;
      const publishedRoot = knownRoute
        ? knownRoute === 'published'
        : candidate && typeof candidate === 'object' && Object.hasOwn(candidate, 'generation');
      if (publishedRoot) {
        publishedDocument = await input.client.openAssembly({ root, signal });
        admitted = publishedDocument.admitted;
      } else {
        if (input.assemblyPublicationWritable === false) {
          throw new Error('Authored assembly publication is unavailable for a read-only rooted authority.');
        }
        const parent = `.tau/artifacts/reusable-parts/${await sha256String(entryPath)}`;
        signal.throwIfAborted();
        const outcome = await input.client.publishAssembly({
          authoredPath: entryPath,
          publicationPath: `${parent}/scene.json`,
          signal,
        });
        if (outcome.status !== 'published') {
          throw new Error(`Assembly publication did not commit: ${outcome.status}`);
        }
        root = outcome.root;
        admitted = outcome.admitted;
        publishedDocument = outcome.document;
      }
      if (signal.aborted || !input.isLatestRequest()) {
        publishedDocument.close();
        signal.throwIfAborted();
        return undefined;
      }
      return {
        type: 'assemblyComputed',
        assemblyDisplay: { root, admitted, document: publishedDocument, entryRead },
        entryPath: input.entryPath,
        issues: [],
      };
    }
  }

  signal.throwIfAborted();
  if (!input.isLatestRequest()) {
    return undefined;
  }
  input.selectSourceRendering();
  if (!input.document) {
    const initial = input.parameterRender?.kind === 'initial' ? input.parameterRender : undefined;
    const document = input.client.open({
      source: { path: input.entryPath },
      ...(initial?.parameters === undefined ? {} : { parameters: initial.parameters }),
      ...(initial?.stage === undefined ? {} : { stage: initial.stage }),
      watch: true,
    });
    let defaultView: ViewSubscription | undefined;
    let kernelId: string | undefined;
    let selectedViewKey = '';
    let viewCleanups: Array<() => void> = [];
    const subscribeView = (view: ViewSubscription): void => {
      viewCleanups = [
        view.on('rendered', (rendering) => {
          const artifact = rendering.success ? asKnownArtifact(rendering.artifact) : undefined;
          if (artifact?.mimeType === 'model/gltf-binary') {
            markGeometryReceipt(artifact.content);
          }
          input.machineRef.send({ type: 'defaultRendered', rendering });
        }),
        view.on('status', (status) => {
          input.machineRef.send({ type: 'defaultViewStatusChanged', status });
        }),
      ];
    };
    const followDefaultOffer = (evaluation: Evaluation): void => {
      if (!evaluation.success) {
        return undefined;
      }
      const offer = evaluation.views[0];
      const content = interactiveViewContent(offer?.mimeType, kernelId, input.client?.capabilities);
      const key = `${offer?.id ?? ''}:${Boolean(content)}`;
      if (key === selectedViewKey) {
        return undefined;
      }
      selectedViewKey = key;
      for (const cleanup of viewCleanups) {
        cleanup();
      }
      defaultView?.close();
      defaultView = offer ? document.view(offer.id, content ? { content } : {}) : undefined;
      input.machineRef.send({
        type: 'defaultViewChanged',
        document,
        view: defaultView,
      });
      if (defaultView) {
        subscribeView(defaultView);
      }
    };
    const cleanups = [
      document.on('described', (description) => {
        kernelId = description.kernelId;
        input.machineRef.send({ type: 'documentDescribed', description });
      }),
      document.on('evaluated', (evaluation) => {
        input.machineRef.send({ type: 'documentEvaluated', evaluation });
        followDefaultOffer(evaluation);
      }),
      document.on('progress', ({ phase }) => {
        input.machineRef.send({ type: 'kernelProgress', phase });
      }),
      document.on('status', (status) => {
        input.machineRef.send({ type: 'documentStatusChanged', status });
      }),
      () => {
        const failures: unknown[] = [];
        const failedCleanups: Array<() => void> = [];
        for (const cleanup of viewCleanups) {
          try {
            cleanup();
          } catch (error) {
            failures.push(error);
            failedCleanups.push(cleanup);
          }
        }
        viewCleanups = failedCleanups;
        if (failures.length === 1 && failures[0] instanceof Error) {
          throw failures[0];
        }
        if (failures.length > 0) {
          throw new AggregateError(failures, 'CAD view subscription cleanup failed');
        }
      },
    ];
    signal.throwIfAborted();
    input.machineRef.send({
      type: 'documentOpened',
      document,
      defaultView,
      cleanups,
      requestId: input.requestId,
    });
    const outcome = await document.evaluation({ signal });
    if (!outcome.superseded) {
      followDefaultOffer(outcome.evaluation);
    }
    return undefined;
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
  return undefined;
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
  shutdownKernelActor: createAsyncLogic<
    {
      clientClosed: boolean;
      eventCleanups: Array<() => void>;
      documentCleanups: Array<() => void>;
      attemptedDocumentCleanups: Array<() => void>;
      document: RuntimeDocument | undefined;
      defaultView: ViewSubscription | undefined;
      error?: Error;
    },
    Pick<
      CadContext,
      'kernelClient' | 'connectingClient' | 'eventCleanups' | 'documentCleanups' | 'document' | 'defaultView'
    >
  >({
    run: async ({ input }) => {
      const failures: unknown[] = [];
      const eventCleanups: Array<() => void> = [];
      const documentCleanups: Array<() => void> = [];
      let { document, defaultView } = input;
      let clientClosed = false;
      try {
        await (input.kernelClient ?? input.connectingClient)?.shutdown();
        clientClosed = true;
      } catch (error) {
        failures.push(error);
      }
      for (const cleanup of input.documentCleanups) {
        try {
          cleanup();
        } catch (error) {
          failures.push(error);
          documentCleanups.push(cleanup);
        }
      }
      try {
        defaultView?.close();
        defaultView = undefined;
      } catch (error) {
        failures.push(error);
      }
      try {
        document?.close();
        document = undefined;
      } catch (error) {
        failures.push(error);
      }
      for (const cleanup of input.eventCleanups) {
        try {
          cleanup();
        } catch (error) {
          failures.push(error);
          eventCleanups.push(cleanup);
        }
      }
      const error =
        failures.length === 0
          ? undefined
          : failures.length === 1 && failures[0] instanceof Error
            ? failures[0]
            : new AggregateError(failures, 'CAD runtime cleanup failed');
      return {
        clientClosed,
        eventCleanups,
        documentCleanups,
        attemptedDocumentCleanups: input.documentCleanups,
        document,
        defaultView,
        error,
      };
    },
  }),
};

type CadEnqueue = EnqueueObject<CadEvent, CadEmitted, SystemRegistry, typeof cadActors>;
type CadPatch = Partial<CadContext>;
type ActorIdentity = AnyActorRef;

type CadArgs<EventType extends CadEvent['type']> = Readonly<{
  context: CadContext;
  event: Extract<CadEvent, { type: EventType }>;
}>;

/** Retain late open ownership without adopting a new document during shutdown. */
const retainClosingDocument = ({ context, event }: CadArgs<'documentOpened'>): { context: CadPatch } => ({
  context: {
    documentCleanups: [
      ...context.documentCleanups,
      ...event.cleanups,
      () => event.defaultView?.close(),
      () => {
        event.document.close();
      },
    ],
  },
});
type RenderTrigger = Extract<
  CadEvent,
  {
    type: 'initializeModel' | 'setEntryPath' | 'commitParameters' | 'setPreviewParameters' | 'scrubParameters';
  }
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
  const { eventCleanups, documentCleanups, document, defaultView, kernelClient, connectingClient } = context;
  enq(() => {
    disposeCadRuntime({ eventCleanups, documentCleanups, document, defaultView, kernelClient, connectingClient });
  });
  return {
    eventCleanups: [],
    documentCleanups: [],
    document: undefined,
    defaultView: undefined,
    kernelClient: undefined,
    connectingClient: undefined,
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
  const entryPath = 'entryPath' in event ? event.entryPath : context.entryPath;
  const bumped = {
    openAttempt: context.openAttempt + 1,
    lastRequestedRenderId: context.lastRequestedRenderId + 1,
    pendingAssemblyEntryPath: entryPath?.endsWith('.json') ? entryPath : undefined,
    assemblyRootReadPath: undefined,
  };
  switch (event.type) {
    case 'initializeModel': {
      return {
        ...bumped,
        entryPath: event.entryPath,
        ...(event.entryPath === context.entryPath
          ? {}
          : {
              committedRendering: undefined,
              publishedAssemblyRoot: undefined,
              publishedAssembly: undefined,
              admittedAssembly: undefined,
              committedAssemblyDisplay: undefined,
              publishedAssemblyEntryPath: undefined,
            }),
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
        ...(event.entryPath === context.entryPath
          ? {}
          : {
              committedRendering: undefined,
              publishedAssemblyRoot: undefined,
              publishedAssembly: undefined,
              admittedAssembly: undefined,
              committedAssemblyDisplay: undefined,
              publishedAssemblyEntryPath: undefined,
            }),
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

const hasSelectedAssemblyRoute = (context: CadContext): boolean =>
  context.pendingAssemblyEntryPath !== undefined ||
  (context.publishedAssemblyRoot !== undefined &&
    (context.publishedAssemblyEntryPath ?? context.publishedAssemblyRoot.path) === context.entryPath);

/** Signals every connected unit takes, whatever its render state. */
const runtimeSignals = {
  kernelLog,
  kernelProgress: ({ event }: CadArgs<'kernelProgress'>) => ({ context: { renderPhase: event.phase } }),
  kernelTelemetry,
  capabilitiesUpdated: ({ event }: CadArgs<'capabilitiesUpdated'>) => ({
    context: { capabilities: event.capabilities },
  }),
  activeKernelChanged: ({ context, event }: CadArgs<'activeKernelChanged'>) =>
    hasSelectedAssemblyRoute(context) ? undefined : { context: { activeKernelId: event.kernelId } },
};

/** Results and issues a unit with a kernel records in every state after connecting. */
const resultSignals = {
  ...runtimeSignals,
  setCodeIssues: ({ event }: CadArgs<'setCodeIssues'>) => ({ context: { codeIssues: event.errors } }),
  defaultRendered: ({ context, event }: CadArgs<'defaultRendered'>, enq: CadEnqueue) => {
    if (hasSelectedAssemblyRoute(context)) {
      return {};
    }
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
      ...(event.rendering.transient ? {} : { committedRendering: event.rendering }),
      lastProjection: event.rendering,
      latestRenderingOutcome: 'success',
      lastSettledRenderId: context.lastRequestedRenderId,
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
  assemblyComputed: ({ context, event }: CadArgs<'assemblyComputed'>, enq: CadEnqueue) => {
    if (event.entryPath !== context.entryPath) {
      enq(() => {
        event.assemblyDisplay.document.close();
      });
      return undefined;
    }
    const { root, admitted } = event.assemblyDisplay;
    enq(() => {
      for (const cleanup of context.documentCleanups) {
        safeDispose(cleanup);
      }
      safeDispose(() => context.defaultView?.close());
      safeDispose(() => context.document?.close());
    });
    enq.emit({ type: 'assemblyEvaluated', assemblyDisplay: event.assemblyDisplay });
    const patch: CadPatch = {
      rendering: undefined,
      committedRendering: undefined,
      committedAssemblyDisplay: event.assemblyDisplay,
      document: undefined,
      defaultView: undefined,
      documentCleanups: [
        () => {
          event.assemblyDisplay.document.close();
        },
      ],
      evaluation: undefined,
      lastProjection: undefined,
      publishedAssemblyRoot: root,
      publishedAssembly: admitted.publication,
      admittedAssembly: admitted,
      publishedAssemblyEntryPath: context.entryPath,
      pendingAssemblyEntryPath: undefined,
      parameterManifest: undefined,
      activeKernelId: undefined,
      latestRenderingOutcome: 'success',
      kernelIssues: withEntryIssues(context, (issues, entryPath) => {
        if (event.issues.length > 0) {
          issues.set(entryPath, event.issues);
        } else {
          issues.delete(entryPath);
        }
      }),
      lastSettledRenderId: context.lastRequestedRenderId,
    };
    return { context: patch };
  },
  documentEvaluated: ({ context, event }: CadArgs<'documentEvaluated'>) => {
    if (hasSelectedAssemblyRoute(context)) {
      return {};
    }
    const patch: CadPatch = {
      evaluation: event.evaluation,
      ...(event.evaluation.success && event.evaluation.views.length === 0
        ? { rendering: undefined, committedRendering: undefined, latestRenderingOutcome: 'success' }
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
  documentDescribed: ({ context, event }: CadArgs<'documentDescribed'>) =>
    hasSelectedAssemblyRoute(context)
      ? {}
      : {
          context: {
            activeKernelId: event.description.kernelId,
            ...(event.description.success ? { parameterManifest: event.description.parameters } : {}),
          },
        },
  parametersParsed: ({ context, event }: CadArgs<'parametersParsed'>) =>
    hasSelectedAssemblyRoute(context) ? {} : { context: { parameterManifest: event.manifest } },
  kernelIssue: ({ context, event }: CadArgs<'kernelIssue'>) =>
    hasSelectedAssemblyRoute(context)
      ? {}
      : {
          context: {
            kernelIssues: withEntryIssues(context, (issues, entryPath) => {
              issues.set(entryPath, event.errors);
            }),
          },
        },
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
    lastRequestedRenderId: 0,
    lastSettledRenderId: 0,
    latestRenderingOutcome: undefined,
    rendering: undefined,
    committedRendering: undefined,
    lastProjection: undefined,
    evaluation: undefined,
    publishedAssemblyRoot: undefined,
    publishedAssembly: undefined,
    admittedAssembly: undefined,
    committedAssemblyDisplay: undefined,
    publishedAssemblyEntryPath: undefined,
    pendingAssemblyEntryPath: undefined,
    assemblyRootReadPath: undefined,
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
    closeRuntime: { target: '.runtimeClosing', context: { runtimeCloseError: undefined } },
    kernelAllocated: ({ event }) => ({
      context: { connectingClient: event.client, eventCleanups: event.cleanups },
    }),
    stateChanged: ({ event }) => (event.state === 'error' ? { target: '.error' } : {}),
    documentOpened: ({ context, event }, enq) => {
      if (event.requestId !== context.openAttempt || context.parkWhenIdle) {
        enq(() => {
          for (const cleanup of event.cleanups) {
            safeDispose(cleanup);
          }
          event.defaultView?.close();
          event.document.close();
        });
        return {};
      }
      return {
        context: {
          document: event.document,
          defaultView: event.defaultView,
          documentCleanups: event.cleanups,
        },
      };
    },
    defaultViewChanged: ({ context, event }) =>
      context.document === event.document ? { context: { defaultView: event.view } } : {},
    documentStatusChanged: ({ context, event }) => {
      if (hasSelectedAssemblyRoute(context)) {
        return {};
      }
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
      if (hasSelectedAssemblyRoute(context)) {
        return {};
      }
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
    refreshPublishedAssembly: ({ context }) =>
      context.publishedAssemblyRoot && context.entryPath
        ? {
            target: '.rendering.submitting',
            context: {
              lastRequestedRenderId: context.lastRequestedRenderId + 1,
              pendingAssemblyEntryPath: context.entryPath,
              assemblyRootReadPath: context.publishedAssemblyRoot.path,
              latestRenderingOutcome: undefined,
              parameterRender: undefined,
            },
          }
        : undefined,
    sourceRenderingSelected: ({ context, event }, enq) =>
      event.entryPath === context.entryPath && event.requestId === context.lastRequestedRenderId
        ? {
            context: {
              ...(context.committedAssemblyDisplay ? destroyDocument(context, enq) : {}),
              pendingAssemblyEntryPath: undefined,
              publishedAssemblyRoot: undefined,
              publishedAssembly: undefined,
              admittedAssembly: undefined,
              committedAssemblyDisplay: undefined,
              publishedAssemblyEntryPath: undefined,
            },
          }
        : undefined,
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
    runtimeClosing: {
      on: {
        closeRuntime: {},
        filesystemBindingChanged: {},
        restoreParameters: {},
        stateChanged: {},
        documentStatusChanged: {},
        defaultViewStatusChanged: {},
        defaultViewChanged: {},
        documentOpened: retainClosingDocument,
      },
      invoke: {
        src: 'shutdownKernelActor',
        input: ({ context }) => ({
          kernelClient: context.kernelClient,
          connectingClient: context.connectingClient,
          eventCleanups: context.eventCleanups,
          documentCleanups: context.documentCleanups,
          document: context.document,
          defaultView: context.defaultView,
        }),
        onDone: ({ context, event }) => {
          const pendingCleanups = context.documentCleanups.filter(
            (cleanup) => !event.output.attemptedDocumentCleanups.includes(cleanup),
          );
          return {
            target: event.output.error
              ? 'runtimeCloseFailed'
              : pendingCleanups.length > 0
                ? 'runtimeClosing'
                : 'runtimeClosed',
            reenter: pendingCleanups.length > 0,
            context: {
              ...(event.output.clientClosed ? { kernelClient: undefined, connectingClient: undefined } : {}),
              eventCleanups: event.output.eventCleanups,
              documentCleanups: [...event.output.documentCleanups, ...pendingCleanups],
              document: event.output.document,
              defaultView: event.output.defaultView,
              runtimeCloseError: event.output.error,
            },
          };
        },
        onError: ({ event }) => ({
          target: 'runtimeCloseFailed',
          context: {
            runtimeCloseError:
              event.error instanceof Error
                ? event.error
                : new Error(errorMessageOf(event.error, 'CAD shutdown failed')),
          },
        }),
      },
    },
    runtimeClosed: {
      entry: ({ context, self }, enq) => {
        if (context.parentRef) {
          enq.sendTo(context.parentRef, { type: 'geometryUnit.runtimeClosed', unit: self });
        }
        return {};
      },
      on: {
        closeRuntime: {},
        filesystemBindingChanged: {},
        restoreParameters: {},
        stateChanged: {},
        documentStatusChanged: {},
        defaultViewStatusChanged: {},
        defaultViewChanged: {},
        documentOpened: (args) => ({ ...retainClosingDocument(args), target: 'runtimeClosing' }),
      },
    },
    runtimeCloseFailed: {
      on: {
        filesystemBindingChanged: {},
        restoreParameters: {},
        stateChanged: {},
        documentStatusChanged: {},
        defaultViewStatusChanged: {},
        defaultViewChanged: {},
        documentOpened: retainClosingDocument,
      },
    },
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
            context: {
              kernelClient: event.client,
              connectingClient: undefined,
              eventCleanups: event.cleanups,
              assemblyPublicationWritable: event.assemblyPublicationWritable,
            },
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
              assemblyRootReadPath: context.assemblyRootReadPath,
              assemblyEntryRead: context.committedAssemblyDisplay?.entryRead,
              publishedAssemblyRoot: context.publishedAssemblyRoot,
              assemblyPublicationWritable: context.assemblyPublicationWritable,
              knownAssemblyRoute:
                context.publishedAssemblyRoot && context.publishedAssemblyEntryPath === context.entryPath
                  ? context.publishedAssemblyRoot.path === context.entryPath
                    ? 'published'
                    : 'authored'
                  : undefined,
              client: context.kernelClient,
              entryPath: context.entryPath,
              parameterRender: context.parameterRender,
              document: context.document,
              machineRef: self,
              requestId: context.openAttempt,
              fileManagerRef: context.fileManagerRef,
              fileSystemRoot: context.fileSystemRoot,
              isLatestRequest: () => self.getSnapshot().context.lastRequestedRenderId === context.lastRequestedRenderId,
              selectSourceRendering: () => {
                if (context.entryPath) {
                  self.send({
                    type: 'sourceRenderingSelected',
                    entryPath: context.entryPath,
                    requestId: context.lastRequestedRenderId,
                  });
                }
              },
            }),
            onDone: { target: '#cad.idle', context: { pendingAssemblyEntryPath: undefined } },
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
              return {
                target: '#cad.error',
                context: {
                  kernelIssues,
                  pendingAssemblyEntryPath: undefined,
                  latestRenderingOutcome: 'failure',
                  lastSettledRenderId: context.lastRequestedRenderId,
                },
              };
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
        resumeRuntime: { target: 'connecting', context: { parkWhenIdle: false, assemblyRootReadPath: undefined } },
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
export const selectCadCommittedRendering = (snapshot: CadSnapshot): Rendering | undefined =>
  snapshot.context.committedRendering;
/** Select the committed display arm without materializing assembly projection bytes. */
export const selectCadDisplay = (snapshot: CadSnapshot): Rendering | CadAssemblyDisplay | undefined => {
  const {
    committedAssemblyDisplay,
    publishedAssemblyRoot,
    publishedAssembly,
    admittedAssembly,
    publishedAssemblyEntryPath,
    entryPath,
  } = snapshot.context;
  if (committedAssemblyDisplay) {
    return snapshot.context.rendering === undefined &&
      snapshot.context.committedRendering === undefined &&
      committedAssemblyDisplay.root === publishedAssemblyRoot &&
      committedAssemblyDisplay.admitted === admittedAssembly &&
      admittedAssembly.publication === publishedAssembly &&
      publishedAssemblyEntryPath === entryPath
      ? committedAssemblyDisplay
      : undefined;
  }
  return snapshot.context.rendering;
};
/** Select the actual admitted reader only while its coherent committed display is selected. */
export const selectCadAdmittedAssembly = (snapshot: CadSnapshot): AdmittedAssembly | undefined => {
  const display = selectCadDisplay(snapshot);
  return display && 'admitted' in display ? display.admitted : undefined;
};
/** True only while a transient successful rendering overlays committed inspection facts. */
export const selectCadHasTransientPreview = (snapshot: CadSnapshot): boolean =>
  snapshot.context.committedRendering !== undefined &&
  snapshot.context.rendering?.success === true &&
  snapshot.context.rendering.transient;
export const selectCadEvaluation = (snapshot: CadSnapshot): Evaluation | undefined => snapshot.context.evaluation;
export const selectCadDocument = (snapshot: CadSnapshot): RuntimeDocument | undefined => snapshot.context.document;
export const selectCadUnits = (snapshot: CadSnapshot): CadContext['units'] => snapshot.context.units;
export const selectCadKernelClient = (snapshot: CadSnapshot): AppRuntimeClient | undefined =>
  snapshot.context.kernelClient;
export const selectIsCadLoading = (snapshot: CadSnapshot): boolean => snapshot.hasTag('cad-loading');

/** Capabilities advertised by the connected runtime. */
export const selectCadCapabilities = (snapshot: CadSnapshot): AppCapabilitiesManifest | undefined =>
  snapshot.context.capabilities;
/** Kernel owning the current document description. */
export const selectCadActiveKernelId = (snapshot: CadSnapshot): string | undefined => snapshot.context.activeKernelId;
