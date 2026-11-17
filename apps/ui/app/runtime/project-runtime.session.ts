/**
 * A project session's runtime, with no React (app state orchestration charter D4, D5, D8, I5; plan § 4 A6d; rows S12,
 * S34, S38).
 *
 * The session's `project` child loads this module by dynamic import, so the entry graph never reaches the project
 * runtime (D5), and calls {@link openSessionProjectRuntime} once the session's `fileManager` child has opened the
 * project's file manager. It builds what `ProjectProvider` leased for the session before A6d: the view records, the
 * entries record session and the project runtime, over the session file manager's working-copy client and a record
 * watch on its bridge. The request's native kernel id and the device's `choices` select the kernel; the request's chat
 * reaches the editor as the provider's effect sent it. The root is started here and stopped by `close`; the session
 * subtree's provider is a view of it ({@link sessionProjectRuntimeOf}) and creates, starts and stops nothing.
 *
 * Every object here is a host object, so it lives in the child's closure and in a map keyed by the root, never in a
 * machine's context (D4). The map is kept in `import.meta.hot.data`, so a Fast Refresh of this module still finds the
 * runtimes the sessions hold.
 *
 * @module
 */
import { waitFor } from 'xstate';
import type { ActorOptions, AnyActorLogic, AnyActorRef } from 'xstate';
import type { QueryClient } from '@tanstack/react-query';
import { FileManagerNotReadyError } from '@taucad/ui-core/filesystem/workspace-errors';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { ProjectSessionOpenRequest } from '#machines/project-session.machine.js';
import { closeProjectRuntime, selectProjectKernelRefusal } from '#machines/project.machine.js';
import { refuseCloseWhileRecording } from '@taucad/editor-ui/lib/editor-document-session';
import { inspect as developmentInspect } from '#machines/inspector.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type {
  SessionRuntime,
  SessionRuntimeChat,
  SessionRuntimeFacts,
  SessionRuntimeFlushKind,
} from '#services/sessions-store.js';
import type { ProjectChoices } from '#runtime/choices.js';
import { selectProjectKernelSelection } from '#runtime/choices-kernel-selection.js';
import { createRecordWatch, selectBridgeOpener, servicesBound, servicesOf } from '#runtime/file-manager-facade.js';
import type { FileManagerSnapshot } from '#runtime/file-manager-host.wait.js';
import { sessionFileManagerOf } from '#runtime/session-file-manager.js';
import { createProjectRuntime, selectEditorRef, selectProjectRef } from '#runtime/project-runtime.js';
import type { ProjectRuntime, ProjectRuntimeLibrary } from '#runtime/project-runtime.js';
import { isKnownChatId } from '#runtime/project-runtime.helpers.js';
import { createProjectViewRecords } from '#runtime/project-runtime.view-records.js';
import type { ProjectViewRecords } from '#runtime/project-runtime.view-records.js';
import { createEntriesRecordSession } from '#workbench-records/entries-record-session.js';
import type { EntriesRecordSession } from '#workbench-records/entries-record-session.js';
import type { ViewRecordHost } from '#workbench-records/view-record-session.js';

/** What a provider is a view of: the runtime, its view records and its entries record session. @public */
export type ProjectRuntimeViewSource = Readonly<{
  runtime: ProjectRuntime;
  viewRecords: ProjectViewRecords;
  /** The entries record session (A9): only the editor loading from disk keeps one. */
  entriesRecord: EntriesRecordSession | undefined;
}>;

/** A session's runtime as its provider reads it: the view source, and this build's identity for the provider's key. @public */
export type SessionProjectRuntimeSource = ProjectRuntimeViewSource & Readonly<{ key: string }>;

/** The kernel choices a session runtime reads: compute placement, reuse and their revisions. @public */
export type SessionRuntimeChoices = Pick<
  ProjectChoices,
  'computePlacement' | 'computeSelectionRevision' | 'computeReuseMode' | 'computeReuseRevision'
>;

/**
 * What the app runtime gives every session's runtime: the library, the chat store and query cache the editor's chat
 * reads, the device's choices now, the services wait on its clock, and its actor options.
 *
 * @public
 */
export type SessionProjectRuntimePorts = Readonly<{
  library: ProjectRuntimeLibrary;
  /** Told of a chat the focused-chat ensure created empty, so it shows empty at once (A12, I21). */
  chatSessions: Pick<ChatSessionStore, 'noteCreatedEmpty'>;
  /** The cache whose chat listings say whether a requested chat is already known. */
  queryClient: QueryClient;
  /** The device's choices now (`choices`, A6b). */
  choices: () => SessionRuntimeChoices;
  /** Wait for a file manager's content and tree services, up to the ready bound; ends when `gone` aborts. */
  awaitServices: (fileManagerRef: FileManagerRef, gone: AbortSignal) => Promise<FileManagerSnapshot>;
}> &
  Pick<ActorOptions<AnyActorLogic>, 'clock' | 'onRejectedEvent'>;

/** What one session's runtime is built for. @public */
export type SessionProjectRuntimeInput = Readonly<{
  projectId: string;
  /** The session's file manager, which its `fileManager` child opened. */
  fileManagerRef: FileManagerRef;
  /** What the session was opened with: the native kernel id and the chat. */
  request: ProjectSessionOpenRequest | undefined;
}>;

type HotData = {
  sessionProjectRuntimes?: WeakMap<AnyActorRef, SessionProjectRuntimeSource>;
  sessionProjectRuntimeBuilds?: { count: number };
};

const hotData = import.meta.hot?.data as HotData | undefined;
/* Each runtime a session's child built, by its root: the provider over the session reads it here. */
const sessionProjectRuntimes: WeakMap<AnyActorRef, SessionProjectRuntimeSource> =
  hotData?.sessionProjectRuntimes ?? new WeakMap();
if (hotData !== undefined) {
  hotData.sessionProjectRuntimes = sessionProjectRuntimes;
}
/* Each build's number, for the provider's key: kept beside the map, so a key is never reused after a Fast Refresh. */
const builds: { count: number } = hotData?.sessionProjectRuntimeBuilds ?? { count: 0 };
if (hotData !== undefined) {
  hotData.sessionProjectRuntimeBuilds = builds;
}

/**
 * The runtime a session's child built, behind its root's ref, for the provider over the session.
 *
 * @param runtimeRef - A root a session's child reported (`selectProjectSessionRuntime`).
 * @returns It, or `undefined` for a root no session built or one whose runtime has closed.
 * @public
 */
export const sessionProjectRuntimeOf = (runtimeRef: AnyActorRef): SessionProjectRuntimeSource | undefined =>
  sessionProjectRuntimes.get(runtimeRef);

/*
 * Write what one store (the project or the editor machine) holds now and wait, with no timer, until it is idle again
 * (I15): the session bounds the wait on its clock, and `gone` ends it when the session's child stops. A store that has
 * not loaded owes nothing (A6e).
 *
 * @returns The write's error, if the store recorded one.
 */
const flushStore = async (store: AnyActorRef, gone: AbortSignal): Promise<unknown> => {
  if (!(store.getSnapshot() as { matches: (value: unknown) => boolean }).matches('ready')) {
    return undefined;
  }
  store.send({ type: 'flushNow' });
  const settled: unknown = await waitFor(
    store,
    (state: { matches: (value: unknown) => boolean }) => state.matches({ ready: { storing: 'idle' } }),
    { signal: gone },
  );
  return (settled as { context: { error?: unknown } }).context.error;
};

/*
 * A6e (B4): what a replacement flushes. The producer set (the layout, the entries and view records) and the project and
 * editor stores write what they owe, together. Unlike the close flush it neither closes the parameter service nor
 * refuses on held drafts or a conflict being recorded: the runtime may stay current, and nothing here asks the person.
 * It keeps no timer (I15): the session bounds it on its clock, and `gone` ends it when the child stops.
 */
const flushForReplacement = async (
  producers: SessionRuntimeWorkInput['producers'],
  stores: readonly AnyActorRef[],
  gone: AbortSignal,
): Promise<void> => {
  const owed: Array<Promise<unknown>> = [
    producers.flushAll(),
    ...stores.map(async (store) => {
      const error = await flushStore(store, gone);
      if (error !== undefined) {
        throw error instanceof Error ? error : new Error('The store did not confirm its write.', { cause: error });
      }
    }),
  ];
  /* A producer has no signal of its own: once `gone` aborts the flush stops waiting on it, and rejects with the
   * abort, which confirms no write. */
  let leave: () => void = () => undefined;
  const abandoned = new Promise<never>((_resolve, reject) => {
    leave = () => {
      reject(
        gone.reason instanceof Error ? gone.reason : new Error('The flush was abandoned.', { cause: gone.reason }),
      );
    };
  });
  if (gone.aborted) {
    leave();
  }
  gone.addEventListener('abort', leave, { once: true });
  let outcomes: Array<PromiseSettledResult<unknown>>;
  try {
    outcomes = await Promise.race([Promise.allSettled(owed), abandoned]);
  } finally {
    gone.removeEventListener('abort', leave);
  }
  const refusals = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
  if (refusals.length > 0) {
    throw new AggregateError(
      refusals.map((refusal) => refusal.reason as unknown),
      'The superseded runtime did not confirm every write.',
    );
  }
};

/** What {@link sessionRuntimeWork} works over: the parts of a built project runtime a flush and a close reach. @public */
export type SessionRuntimeWorkInput = Readonly<{
  projectId: string;
  producers: Pick<ProjectRuntime['producers'], 'flushAll'>;
  /** The runtime's current parameter service, read when the close reaches it. */
  parameterService: () => Pick<ReturnType<ProjectRuntime['parameterService']['get']>, 'close'>;
  projectRef: AnyActorRef;
  editorRef: AnyActorRef;
}>;

/**
 * What a session asks of a built project runtime (A7c, row S6): its flushes and its close, over the runtime's producer
 * set, parameter service and project and editor stores. No React and no timer: the session's states bound each one.
 *
 * - `close` (the close step `flushingProducers`): refused while an editor's conflict is being recorded; then the
 *   producers and both stores, whose write errors refuse it. It closes nothing, so a session whose close ran past its
 *   bound is live with every resource intact; the parameter service closes in the next step (`closeParameters`).
 * - `leave` (focus's leave flush, I3): the producers, then the editor store.
 * - `unload` (the producer stage of `environment`'s sequencer, I6, D26): the producers, then both stores, even after a
 *   producer's refusal; only a producer's refusal refuses it.
 * - `replace` (a replacement, A6e, B4): the producers and both stores together; any write it could not confirm refuses it.
 *
 * @param input - The project, and the runtime's producer set, parameter service and project and editor stores.
 * @returns The runtime's flush and its close.
 * @public
 */
export const sessionRuntimeWork = ({
  projectId,
  producers,
  parameterService,
  projectRef,
  editorRef,
}: SessionRuntimeWorkInput): Pick<SessionRuntime, 'flush' | 'closeParameters' | 'closeRuntime'> => {
  return {
    flush: async (kind: SessionRuntimeFlushKind, gone: AbortSignal) => {
      if (kind === 'replace') {
        await flushForReplacement(producers, [projectRef, editorRef], gone);
        return;
      }
      if (kind === 'close') {
        refuseCloseWhileRecording(projectId);
      }
      if (kind === 'unload') {
        /* The unload asks the stores once every producer settles (A0.2 item 10, S40), as the close does, and a
         * producer's refusal skips none of them (A7c review round 4). A store write on `beforeunload` so waits on the
         * producers' head start; the editor's own save covers it. It refuses only on a producer's refusal, as the
         * persistence guard did, so a store that fails before it settles refuses nothing (review round 6). */
        const [records] = await Promise.allSettled([producers.flushAll()]);
        await Promise.allSettled([flushStore(projectRef, gone), flushStore(editorRef, gone)]);
        if (records.status === 'rejected') {
          throw records.reason instanceof Error
            ? records.reason
            : new Error('Workbench records are not confirmed saved.', { cause: records.reason });
        }
        return;
      }
      /* A record refusal keeps the session live, including its parameter editing authority. */
      await producers.flushAll();
      if (kind === 'leave') {
        await flushStore(editorRef, gone);
        return;
      }
      const errors = await Promise.all([flushStore(projectRef, gone), flushStore(editorRef, gone)]);
      /* The close refuses on a write it could not confirm. */
      const error = errors.find((candidate) => candidate !== undefined);
      if (error !== undefined) {
        throw error instanceof Error ? error : new Error('Project changes are not confirmed saved.');
      }
    },
    closeParameters: async () => parameterService().close(),
    closeRuntime: async () => closeProjectRuntime(projectRef),
  };
};

/**
 * Build and start one session's project runtime.
 *
 * @param input - The project, the session's file manager and its open request.
 * @param ports - The library, chat store, query cache, choices, services wait and actor options.
 * @returns The started runtime, its facts and its close.
 * @public
 */
// oxlint-disable-next-line max-lines-per-function -- One construction: the runtime, its records and its facts share the closure.
export function openSessionProjectRuntime(
  input: SessionProjectRuntimeInput,
  ports: SessionProjectRuntimePorts,
): SessionRuntime {
  const { projectId, fileManagerRef, request } = input;
  const opened = sessionFileManagerOf(fileManagerRef);
  if (opened === undefined) {
    throw new Error(`Project ${projectId}'s runtime was asked for on a file manager its session did not open`);
  }
  const parameterFiles = opened.owner.workingCopyFiles;

  /* As the session scope's `whenServicesReady`: bound services serve at once; otherwise the wait on the clock. */
  const whenServicesReady = async (): Promise<unknown> =>
    servicesBound(fileManagerRef) ?? servicesOf(await ports.awaitServices(fileManagerRef, opened.owner.dropped));
  /* The bridge the watch opens, read when it opens: a record read may wait for services first. */
  const openBridge: Parameters<typeof createRecordWatch>[0] = (root, consumer) => {
    const opener = selectBridgeOpener(fileManagerRef);
    if (!opener) {
      throw new FileManagerNotReadyError('proxy-timeout', {
        cause: new Error('File Manager filesystem bridge is not ready.'),
      });
    }
    return opener(root, consumer);
  };
  /* A new bridge opener (a reconnect or re-root) replaces the working-copy client; each record session then reopens its
   * store and its watch on the new connections, as the provider's scope replaced both before A6d. */
  const hostNow = (): ViewRecordHost => ({
    files: parameterFiles.get(),
    watch: createRecordWatch(openBridge, whenServicesReady),
  });

  const viewRecords = createProjectViewRecords({ projectId, host: hostNow() });
  const entriesRecord = createEntriesRecordSession({
    projectId,
    host: hostNow(),
    ...(ports.clock === undefined ? {} : { clock: ports.clock }),
  });
  const selectionFor = (): ReturnType<typeof selectProjectKernelSelection> =>
    selectProjectKernelSelection(ports.choices(), {
      projectId,
      ...(request?.nativeKernelId === undefined ? {} : { nativeKernelId: request.nativeKernelId }),
    });
  const selection = selectionFor();
  const runtime = createProjectRuntime({
    projectId,
    fileManager: { fileManagerRef, parameterFiles },
    library: ports.library,
    chatSessions: ports.chatSessions,
    profile: 'editor',
    viewRecordPorts: viewRecords.ports,
    entriesRecord,
    kernelSelection: { kernelOptionsFactory: selection.kernelOptionsFactory },
    ...(request?.chatId === undefined ? {} : { requestedChatId: request.chatId }),
    ...(ports.clock === undefined ? {} : { clock: ports.clock }),
    ...(developmentInspect === undefined ? {} : { inspect: developmentInspect }),
    ...(ports.onRejectedEvent === undefined ? {} : { onRejectedEvent: ports.onRejectedEvent }),
  });
  const unsubscribeFiles = parameterFiles.subscribe(() => {
    const next = hostNow();
    viewRecords.ports.replaceHost(next);
    entriesRecord.replaceHost(next);
  });
  runtime.actor.start();
  builds.count += 1;
  sessionProjectRuntimes.set(runtime.actor, {
    runtime,
    viewRecords,
    entriesRecord,
    key: `${projectId}:${String(builds.count)}`,
  });

  /* The root spawned both with itself and never replaces them. */
  const projectRef = selectProjectRef(runtime.actor.getSnapshot());
  const editorRef = selectEditorRef(runtime.actor.getSnapshot());

  const facts = (): SessionRuntimeFacts => {
    const project = projectRef.getSnapshot();
    const editor = editorRef.getSnapshot();
    const { focusedChatId, requestedChatId } = editor.context;
    return {
      loaded: project.context.project !== undefined,
      kernelRefusal: selectProjectKernelRefusal(project),
      chatReady: editor.matches('ready') && !editor.matches({ ready: { operation: 'ensuringFocusedChat' } }),
      chatDeferred: editor.matches({ ready: { operation: 'focusedChatDeferred' } }),
      focusedChat:
        editor.matches({ ready: { operation: 'idle' } }) && focusedChatId !== undefined
          ? { requestedChatId, chatId: focusedChatId }
          : undefined,
    };
  };

  let closed = false;
  return {
    runtimeRef: runtime.actor,
    facts,
    subscribe: (listener) => {
      const subscriptions = [projectRef.subscribe(listener), editorRef.subscribe(listener)];
      return () => {
        for (const subscription of subscriptions) {
          subscription.unsubscribe();
        }
      };
    },
    /* A chat the client already holds is focused at once; `setRequestedChatId` re-enters the ensure for any other. */
    requestChat: ({ chatId, createdChatId }: SessionRuntimeChat) => {
      editorRef.send(
        chatId !== undefined && isKnownChatId({ chatId, createdChatId, projectId, queryClient: ports.queryClient })
          ? { type: 'focusKnownChat', chatId }
          : { type: 'setRequestedChatId', chatId },
      );
    },
    kernelIsCurrent: () => selectionFor().key === selection.key,
    /* R3: the session decides; the project machine owns the cad units (A7b, row S5). */
    park: (parked) => {
      projectRef.send({ type: parked ? 'parkRuntime' : 'resumeRuntime' });
    },
    retryFocusedChat: () => {
      editorRef.send({ type: 'retryEnsureFocusedChat' });
    },
    ...sessionRuntimeWork({
      projectId,
      producers: runtime.producers,
      parameterService: () => runtime.parameterService.get(),
      projectRef: selectProjectRef(runtime.actor.getSnapshot()),
      editorRef: selectEditorRef(runtime.actor.getSnapshot()),
    }),
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      unsubscribeFiles();
      sessionProjectRuntimes.delete(runtime.actor);
      runtime.actor.stop();
    },
  };
}
