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
import { selectProjectKernelRefusal } from '#machines/project.machine.js';
import { inspect as developmentInspect } from '#machines/inspector.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type { SessionRuntime, SessionRuntimeChat, SessionRuntimeFacts } from '#services/sessions-store.js';
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
    /* A6e (B4): what a replacement flushes. The producer set (the layout, the entries and view records) and the project
     * and editor stores write what they owe. Unlike the close flush it neither closes the parameter service nor refuses
     * on held drafts or a conflict being recorded: the runtime may stay current, and nothing here asks the person. It
     * keeps no timer (I15): a store's wait ends when it settles, when it stops, or when `gone` aborts. */
    flush: async (gone) => {
      const owed = [runtime.producers.flushAll()];
      for (const ref of [projectRef, editorRef] as const) {
        /* A store that has not loaded owes nothing; one that has writes now and settles in `storing.idle`. */
        if (ref.getSnapshot().matches('ready')) {
          ref.send({ type: 'flushNow' });
          owed.push(
            (async () => {
              const settled = await waitFor(ref, (state) => state.matches({ ready: { storing: 'idle' } }), {
                signal: gone,
              });
              if (settled.context.error !== undefined) {
                throw settled.context.error;
              }
            })(),
          );
        }
      }
      const outcomes = await Promise.allSettled(owed);
      const refusals = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      if (refusals.length > 0) {
        throw new AggregateError(
          refusals.map((refusal) => refusal.reason as unknown),
          'The superseded runtime did not confirm every write.',
        );
      }
    },
    /* R3: the session decides; the project machine owns the cad units (A7b, row S5). */
    park: (parked) => {
      projectRef.send({ type: parked ? 'parkRuntime' : 'resumeRuntime' });
    },
    retryFocusedChat: () => {
      editorRef.send({ type: 'retryEnsureFocusedChat' });
    },
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
