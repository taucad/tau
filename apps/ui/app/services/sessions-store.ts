/**
 * The app's one sessions registry (S44, A38).
 *
 * Composed here and created by the app runtime as its `sessions` child (D5),
 * never in React, so neither Strict Mode nor a remount below the billing fence
 * builds a second one (B9). `SessionsProvider` hands it down; every reader is
 * a selector over its snapshot.
 *
 * The registry owns *liveness*. Each of a session's four startup regions owns a
 * resource outright here: the project's file manager (A6c), its project runtime,
 * built behind a dynamic import (A6d, D5), compute admission and the agent-host
 * attachment. The session decides when they exist: the project route renders a
 * project's resources iff the registry says it is live, its providers are views
 * of the session's children, and `closing` completes — flush, release — before
 * the registry drops it.
 *
 * A7b: the session's facts are wired here too, with nothing mounted (I5). With a {@link SessionWiring} each file
 * manager gets a `revisions` child (the revision-client lifecycle, its close cut and the revision facts) and a
 * `hostConnector` child (the read connector), each loaded lazily (D5), and each session a `presence` child that reports
 * visibility from `environment` and focus.
 */

import { randomUuid } from '@taucad/utils/id';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, AnyActorRef, EventObject } from 'xstate';
import { FileManagerNotReadyError } from '@taucad/ui-core/filesystem/workspace-errors';
import { isDesktopTarget } from '#filesystem/desktop-bridge.js';
import { liveProjectBudgetFor, sessionsMachine } from '#machines/sessions.machine.js';
import { isMemoryConstrainedDevice } from '@taucad/ui-core/lib/device-memory-class';
import type {
  SessionsMachineContext,
  SessionsMachineInput,
  SessionsProjectStatus,
} from '#machines/sessions.machine.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import type {
  ProjectSessionActorRef,
  ProjectSessionFileManagerInput,
  ProjectSessionMachineEvent,
  ProjectSessionOpenRequest,
} from '#machines/project-session.machine.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';
import type { FlushPhase } from '#runtime/environment.js';
import type { ProjectChoices } from '#runtime/choices.js';
import { createWorkspaceFacade, readied, servicesBound, servicesOf } from '#runtime/file-manager-facade.js';
import type { FacadeFiles } from '#runtime/file-manager-facade.js';
import type {
  SessionRevisionsCallback,
  SessionRevisionsPorts,
  SessionRevisionsWiring,
} from '#runtime/session-revisions.js';
import type { HostConnectorCallback, HostConnectorChatStore, HostConnectorPorts } from '#runtime/host-connector.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type { WorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { openSessionFileManager, trackSessionFileManager } from '#runtime/session-file-manager.js';
import type { SessionFileManager, SessionFileManagerPorts } from '#runtime/session-file-manager.js';
import { registerProjectAgentHost } from '#services/project-agent-host-registration.js';
import type { ProjectAgentHostRegistration } from '#services/project-agent-host-registration.js';

/**
 * One project session's flush and lease work, supplied by the subtree that
 * owns the project's resources.
 *
 * The registry imports no worker and no port: the project route registers
 * these when its session opens and unregisters when it closes, so `closing`
 * calls the live implementation and does nothing when the subtree never came
 * up. `flushSync` is W13's `awaitSyncSettled` seam through the revision
 * client — never a second copy of it.
 */
export type ProjectSessionServices = Readonly<{
  flushProducers: () => Promise<void>;
  flushSync: (boundMilliseconds: number) => Promise<void>;
  cancelRuns: (chatIds: readonly string[]) => Promise<void>;
  closeRuntime: () => Promise<void>;
}>;

const noServices: ProjectSessionServices = {
  flushProducers: async () => undefined,
  flushSync: async () => undefined,
  cancelRuns: async () => undefined,
  closeRuntime: async () => undefined,
};

const services = new Map<string, ProjectSessionServices>();

/**
 * Register the live implementations for one project session.
 *
 * @param projectId - The project whose subtree is registering.
 * @param implementation - What `closing` and `opening.pulling` call.
 * @returns The unregistration, for the subtree's effect cleanup.
 */
export const registerProjectSessionServices = (
  projectId: string,
  implementation: ProjectSessionServices,
): (() => void) => {
  services.set(projectId, implementation);
  return () => {
    if (services.get(projectId) === implementation) {
      services.delete(projectId);
    }
  };
};

const servicesFor = (projectId: string): ProjectSessionServices => services.get(projectId) ?? noServices;

// ---------------------------------------------------------------------------
// The project runtime (A6d)
// ---------------------------------------------------------------------------

/**
 * What a session's runtime child reads off the project runtime it built (A6d): the facts it turns into the runtime
 * region's report, the chat session's readiness and the chat the editor focused.
 *
 * @public
 */
export type SessionRuntimeFacts = Readonly<{
  /** The project loaded, so the runtime region is up unless its kernel was refused. */
  loaded: boolean;
  /** Why this project has no kernel, from the machine that owns its units (R4). */
  kernelRefusal: string | undefined;
  /** The editor has left `ensuringFocusedChat`: a chat is focused, the focus failed, or the chats are still arriving. */
  chatReady: boolean;
  /** The editor deferred its focused chat until the chats arrive (`ready.operation.focusedChatDeferred`, row S1). */
  chatDeferred: boolean;
  /** The chat the editor focused, and the chat it was asked for, once its operation settled. */
  focusedChat: Readonly<{ requestedChatId: string | undefined; chatId: string }> | undefined;
}>;

/**
 * A project runtime a session's child built and started (A6d). Every member is a host object, so it lives in the
 * child's closure, never in the session's context (D4); the session keeps only the root's ref.
 *
 * @public
 */
export type SessionRuntime = Readonly<{
  /** The runtime's root, started: what the session subtree's provider is a view of. */
  runtimeRef: AnyActorRef;
  /** The facts now. */
  facts: () => SessionRuntimeFacts;
  /** Hear each change of the facts. @returns The unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** Ask the editor for the open request's chat, as the provider's effect asked it before A6d. */
  requestChat: (chat: SessionRuntimeChat) => void;
  /** Whether the device's choices still select the kernel this runtime was built with. */
  kernelIsCurrent: () => boolean;
  /** Park or resume the runtime's kernel processes, as the session decides (R3, row S5). */
  park: (parked: boolean) => void;
  /** Ask the editor to ensure the focused chat it deferred again, now that the chats have arrived (row S1). */
  retryFocusedChat: () => void;
  /** Stop the runtime and release what it holds. Calling it twice closes once. */
  close: () => void;
}>;

/** The chat fields of a session's open request. @public */
export type SessionRuntimeChat = Readonly<{ chatId?: string; createdChatId?: string }>;

/**
 * How a session builds its project runtime (A6d): behind a dynamic import (D5), from its file manager, the library,
 * `choices` and its open request. The app runtime composes it; a registry composed alone has none.
 *
 * @public
 */
export type SessionRuntimeOpener = Readonly<{
  /** Load the runtime module and build and start the project's runtime. Rejects when it cannot be built. */
  open: (
    input: Readonly<{
      projectId: string;
      fileManagerRef: FileManagerRef;
      request: ProjectSessionOpenRequest | undefined;
    }>,
  ) => Promise<SessionRuntime>;
  /** Hear each change of the device's choices, after which a runtime may no longer be current. @returns The unsubscribe. */
  onChoicesChanged: (listener: () => void) => () => void;
}>;

type RegionReport = Readonly<{ loaded: boolean; kernelRefusal: string | undefined }>;

/**
 * The `project` child: it builds the project runtime once the session has a file manager, owns it for the session's
 * life and stops it when the session stops the child (I5, I23). It reports the runtime region from the runtime's facts
 * rather than from a mount: a refused kernel fails it with the refusal, a loaded project readies it, each time either
 * moves (R4). It tells the session the runtime's ref (`runtimeChanged`), that the chat session is ready (`chatReady`,
 * M2), and each chat the editor focused (`chatFocused`).
 *
 * The session forwards it each file manager its `fileManager` child reports and each `chatRequested`. A new file manager
 * (a rebuilt shared worker) builds a new runtime; none closes the runtime, which reads the closed one. A change of the
 * device's choices that selects another kernel builds the next runtime and then stops this one, with no flush, as the
 * React key on the provider did before A6d (A6e makes it `replaceRuntime`). Building the next first lets the entries
 * record session yield, flushing what it owes (I13).
 *
 * A7b: the session sends it parking (`runtimeParking`), which it hands the runtime's cad units (row S5), and whether the
 * project's chats have arrived (`revisionChatsChanged`): while they have and the editor deferred its focused chat, the
 * editor is asked to ensure it again, each time either changes, as the binding's effect re-ran on both (row S1).
 */
const runtimeRegionOn = (opener: SessionRuntimeOpener) =>
  createCallbackLogic<EventObject, { projectId: string; request?: ProjectSessionOpenRequest }>(
    ({ input, sendBack, receive }) => {
      const { projectId } = input;
      let fileManagerRef: FileManagerRef | undefined;
      let chat: SessionRuntimeChat = { chatId: input.request?.chatId, createdChatId: input.request?.createdChatId };
      let current: Readonly<{ runtime: SessionRuntime; unsubscribe: () => void }> | undefined;
      let reported: RegionReport = { loaded: false, kernelRefusal: undefined };
      let chatReady = false;
      let focused: SessionRuntimeFacts['focusedChat'];
      /* S1: the chats have arrived, and the last pair the retry was decided on. */
      let chatsReady = false;
      let retryDecidedOn: Readonly<{ deferred: boolean; chatsReady: boolean }> | undefined;
      /* S5: the session's last parking, which a runtime built while it holds comes up under. */
      let parked = false;
      const retryDeferredChat = (runtime: SessionRuntime): void => {
        const { chatDeferred } = runtime.facts();
        if (retryDecidedOn?.deferred === chatDeferred && retryDecidedOn.chatsReady === chatsReady) {
          return;
        }
        retryDecidedOn = { deferred: chatDeferred, chatsReady };
        if (chatDeferred && chatsReady) {
          runtime.retryFocusedChat();
        }
      };
      /* Each build's identity: a build a newer one or the stop overtook closes what it made. */
      let generation = 0;
      let stopped = false;

      const observe = (runtime: SessionRuntime): void => {
        const facts = runtime.facts();
        if (facts.kernelRefusal !== reported.kernelRefusal || facts.loaded !== reported.loaded) {
          reported = { loaded: facts.loaded, kernelRefusal: facts.kernelRefusal };
          if (facts.kernelRefusal !== undefined) {
            sendBack({ type: 'childFailed', region: 'runtime', reason: facts.kernelRefusal });
          } else if (facts.loaded) {
            sendBack({ type: 'childReady', region: 'runtime' });
          }
        }
        if (facts.chatReady && !chatReady) {
          chatReady = true;
          sendBack({ type: 'chatReady' });
        }
        retryDeferredChat(runtime);
        const next = facts.focusedChat;
        if (next?.chatId !== focused?.chatId || next?.requestedChatId !== focused?.requestedChatId) {
          focused = next;
          /* Only a resolution of the chat this session was asked for, as the provider guarded it before A6d. */
          if (next !== undefined && next.requestedChatId === chat.chatId) {
            sendBack({
              type: 'chatFocused',
              chatId: next.chatId,
              ...(next.requestedChatId === undefined ? {} : { requestedChatId: next.requestedChatId }),
            });
            /* Focus now holds this chat as the one the session was given, and the route names it: the editor is asked
             * for it too, as the provider's effect asked it for the route's chat before A6d, so its next focus change
             * is a resolution of the chat the session was given. It already shows it, so nothing is ensured. */
            chat = { ...chat, chatId: next.chatId };
            if (next.requestedChatId !== next.chatId) {
              focused = { requestedChatId: next.chatId, chatId: next.chatId };
              runtime.requestChat(chat);
            }
          }
        }
      };

      const closeCurrent = (): void => {
        if (current === undefined) {
          return;
        }
        const { runtime, unsubscribe } = current;
        current = undefined;
        unsubscribe();
        runtime.close();
      };

      const build = (): void => {
        generation += 1;
        const attempt = generation;
        const builtOn = fileManagerRef;
        if (builtOn === undefined) {
          return;
        }
        const settle = async (): Promise<void> => {
          let runtime: SessionRuntime;
          try {
            runtime = await opener.open({
              projectId,
              fileManagerRef: builtOn,
              request: input.request === undefined ? undefined : { ...input.request, ...chat },
            });
          } catch (error) {
            if (!stopped && attempt === generation) {
              sendBack({
                type: 'childFailed',
                region: 'runtime',
                reason: error instanceof Error ? error.message : String(error),
              });
            }
            return;
          }
          if (stopped || attempt !== generation) {
            runtime.close();
            return;
          }
          /* The next runtime is up before the one it replaces stops (I13); the session's readers move to it at once. */
          const previous = current;
          current = {
            runtime,
            unsubscribe: runtime.subscribe(() => {
              observe(runtime);
            }),
          };
          reported = { loaded: false, kernelRefusal: undefined };
          focused = undefined;
          retryDecidedOn = undefined;
          sendBack({ type: 'runtimeChanged', runtimeRef: runtime.runtimeRef });
          if (parked) {
            runtime.park(true);
          }
          runtime.requestChat(chat);
          if (previous !== undefined) {
            previous.unsubscribe();
            previous.runtime.close();
          }
          observe(runtime);
          /* The choices may have moved on again while this one was built. */
          if (!runtime.kernelIsCurrent()) {
            build();
          }
        };
        // async-iife: bootstrap -- `createCallbackLogic` is synchronous; the build settles through `sendBack`.
        void settle();
      };

      const unsubscribeChoices = opener.onChoicesChanged(() => {
        if (current !== undefined && !current.runtime.kernelIsCurrent()) {
          build();
        }
      });

      receive((event) => {
        if (event.type === 'fileManagerChanged') {
          const next = (event as Extract<ProjectSessionMachineEvent, { type: 'fileManagerChanged' }>).fileManagerRef;
          if (next === fileManagerRef) {
            return;
          }
          fileManagerRef = next;
          /* S1: the chats were the old revision client's; the one started on the new file manager reports its own. */
          chatsReady = false;
          /* The runtime reads the file manager it was built on, which its child has closed. */
          if (current !== undefined) {
            closeCurrent();
            sendBack({ type: 'runtimeChanged', runtimeRef: undefined });
          }
          build();
          return;
        }
        if (event.type === 'runtimeParking') {
          ({ parked } = event as Readonly<{ type: 'runtimeParking'; parked: boolean }>);
          current?.runtime.park(parked);
          return;
        }
        if (event.type === 'revisionChatsChanged') {
          chatsReady = (event as Extract<ProjectSessionMachineEvent, { type: 'revisionChatsChanged' }>).ready;
          if (current !== undefined) {
            retryDeferredChat(current.runtime);
          }
          return;
        }
        if (event.type === 'chatRequested') {
          const requested = event as Extract<ProjectSessionMachineEvent, { type: 'chatRequested' }>;
          if (requested.chatId === chat.chatId && requested.createdChatId === chat.createdChatId) {
            return;
          }
          chat = { chatId: requested.chatId, createdChatId: requested.createdChatId };
          if (current !== undefined) {
            current.runtime.requestChat(chat);
            /* Each new request is answered with the chat the editor then shows, even one it already showed, as the
             * provider's effect re-ran on its request before A6d: a route that names no chat gets one back (I2). */
            focused = undefined;
            observe(current.runtime);
          }
        }
      });

      return () => {
        stopped = true;
        unsubscribeChoices();
        closeCurrent();
      };
    },
  );

/**
 * The runtime region of a registry composed with no runtime opener (rows that run the registry alone): no runtime is
 * built, and the region and the chat session are up at once, as the subtree's report made them before A6d.
 */
const withoutRuntime = createCallbackLogic<EventObject, { projectId: string }>(({ sendBack }) => {
  sendBack({ type: 'childReady', region: 'runtime' });
  sendBack({ type: 'chatReady' });
  return undefined;
});

// ---------------------------------------------------------------------------
// The project's file manager (A6c)
// ---------------------------------------------------------------------------

/**
 * Open one project's file manager for its session. The app runtime gives the registry the file-manager host's builder
 * and the wait on its clock (S17 to S19); a composition that runs the registry alone gives none.
 *
 * @public
 */
export type SessionFileManagerOpener = (projectId: string) => SessionFileManager;

/**
 * The file-manager host's shared worker, which a session's file manager is built on (A6c): the worker `rootFiles` holds
 * now, and a listener called after each change. @public
 */
export type SessionFileManagerWorker = Readonly<{
  current: () => Worker | undefined;
  subscribe: (listener: (worker: Worker | undefined) => void) => () => void;
}>;

/**
 * The `fileManager` child: it builds the project's file manager through the host for `/projects/<id>`, owns it for
 * the session's life and closes it when the session stops the child (I23). It tells the session the file manager's
 * ref, then reports the views region each time the file manager comes up, from its snapshot rather than from a mount
 * (I5). A build that throws fails the region with its reason.
 *
 * With the host's shared worker it follows `rootFiles`, as the shared-worker gate made the mounted subtree follow it
 * before A6c: it builds only once `rootFiles` holds a worker, so a session opened while the root connects or restarts
 * never starts a second worker on the same store, and when the worker is lost or replaced it closes the file manager
 * built on the old one and builds a fresh one on the new one. A nested file manager never restarts its parent's
 * worker, so the one built on a dead worker would otherwise stay down for the session's life.
 */
const fileManagerRegionOn = (
  open: SessionFileManagerOpener,
  worker: SessionFileManagerWorker | undefined,
  rootSync: SessionWiring['rootSync'] | undefined,
) =>
  createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
    let current: Readonly<{ opened: SessionFileManager; release: () => void }> | undefined;

    const closeCurrent = (): void => {
      if (current === undefined) {
        return;
      }
      const { release } = current;
      current = undefined;
      sendBack({ type: 'fileManagerChanged', fileManagerRef: undefined });
      release();
    };

    const openCurrent = (): void => {
      let opened: SessionFileManager;
      try {
        opened = open(input.projectId);
      } catch (error) {
        sendBack({
          type: 'childFailed',
          region: 'views',
          reason: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const fileManager: FileManagerRef = opened.fileManagerRef;
      const untrack = trackSessionFileManager(opened);
      /* A7b: the file manager's own root synchronisation, for the children the session starts on it. */
      const sync = rootSync?.(fileManager, opened.owner.dropped);
      sendBack({
        type: 'fileManagerChanged',
        fileManagerRef: fileManager,
        ...(sync === undefined ? {} : { syncProjectRoots: sync.syncProjectRoots }),
      });
      /* Edge-triggered, as the binding's effect was: one report each time the file manager enters `ready`. An `error`
       * reports nothing, as the binding reported nothing: a nested file manager errs when the shared worker dies, often
       * before `rootFiles` sees it, and the rebuild on the root's new worker is what recovers it. The start bound
       * decides an opening session that never comes up. */
      let ready = false;
      const observe = (snapshot: ReturnType<FileManagerRef['getSnapshot']>): void => {
        const now = snapshot.matches('ready');
        if (now && !ready) {
          sendBack({ type: 'childReady', region: 'views' });
        }
        ready = now;
      };
      const subscription = fileManager.subscribe(observe);
      current = {
        opened,
        release: () => {
          subscription.unsubscribe();
          untrack();
          sync?.close();
          opened.close();
        },
      };
      observe(fileManager.getSnapshot());
    };

    if (worker === undefined) {
      openCurrent();
      return closeCurrent;
    }
    let builtOn = worker.current();
    if (builtOn !== undefined) {
      openCurrent();
    }
    const unsubscribe = worker.subscribe((next) => {
      if (next === builtOn) {
        return;
      }
      builtOn = next;
      closeCurrent();
      if (next !== undefined) {
        openCurrent();
      }
    });
    return () => {
      unsubscribe();
      closeCurrent();
    };
  });

/**
 * The views region of a registry composed with no file-manager host (rows that run the registry alone): no file
 * manager is built, and the region is up at once, as the subtree's report made it up before A6c.
 */
const withoutFileManager = createCallbackLogic<EventObject, { projectId: string }>(({ sendBack }) => {
  sendBack({ type: 'childReady', region: 'views' });
  return undefined;
});

/**
 * Open session file managers through a host builder and a services wait: what the app runtime composes.
 *
 * @param ports - The file-manager host's builder and the wait on the runtime's clock.
 * @returns The opener the registry gives each session's `fileManager` child.
 * @public
 */
export const sessionFileManagerOpener =
  (ports: SessionFileManagerPorts): SessionFileManagerOpener =>
  (projectId) =>
    openSessionFileManager(projectId, ports);

// ---------------------------------------------------------------------------
// The session's facts (A7b)
// ---------------------------------------------------------------------------

/** A value that can change: the value now, and a listener called after each change. @public */
export type SessionsObservable<T> = Readonly<{ get: () => T; subscribe: (listener: () => void) => () => void }>;

/** One session file manager's root synchronisation, open for the file manager's life. @public */
export type SessionRootSync = Readonly<{ syncProjectRoots: () => Promise<void>; close: () => void }>;

/** The `revisions` module as the session loads it (D5). @public */
export type SessionRevisionsModule = Readonly<{
  sessionRevisionsCallback: (ports: SessionRevisionsPorts) => SessionRevisionsCallback;
  createSessionRevisionsPorts: (
    wiring: SessionRevisionsWiring & Pick<SessionRevisionsPorts, 'reportFault'>,
  ) => SessionRevisionsPorts;
}>;

/** The `hostConnector` module as the session loads it (D5). @public */
export type HostConnectorModule = Readonly<{
  hostConnectorCallback: (ports: HostConnectorPorts) => HostConnectorCallback;
}>;

/**
 * What the session's facts are wired to (A7b): the app runtime composes it from its unload sequencer, focus,
 * `environment`, the chat store and `choices`; a registry composed alone has none, and its sessions wire nothing.
 *
 * @public
 */
export type SessionWiring = Readonly<{
  /** Load the `revisions` module (a dynamic import: the entry graph never reaches it, D5). */
  loadRevisions: () => Promise<SessionRevisionsModule>;
  /** Load the `hostConnector` module, likewise. */
  loadHostConnector: () => Promise<HostConnectorModule>;
  /** Register a close cut at the session stage of `environment`'s sequencer (D26). @returns Its removal. */
  registerCloseCut: (cut: (phase: FlushPhase) => Promise<void>) => () => void;
  /** The project focus has the person on: the route's focused session (`selectFocusTarget`). */
  focusedProject: SessionsObservable<string | undefined>;
  /** The page is on screen, as `environment` reports it; its listener runs on every report. */
  documentVisible: SessionsObservable<boolean>;
  /** The chat store: the connector's calls and the chats' revision facts. */
  chatSessions: HostConnectorChatStore & Pick<ChatSessionStore, 'setRevisionFacts'>;
  /** The device's choices now, read when a chat attaches. */
  choices: () => ProjectChoices;
  /** Open a session file manager's root synchronisation; `gone` aborts when its owner ends. */
  rootSync: (fileManagerRef: FileManagerRef, gone: AbortSignal) => SessionRootSync;
}>;

/**
 * A child whose callback is in a module loaded on its first start (D5). A failure to load or to start, and a teardown
 * that throws, is reported through the app runtime's one fault hook rather than faulting the session (D23).
 */
const lazyChildOn = <Input>(
  load: () => Promise<(params: Readonly<{ input: Input; sendBack: (event: EventObject) => void }>) => () => void>,
) =>
  createCallbackLogic<EventObject, Input>(({ input, sendBack }) => {
    const stopped = new AbortController();
    let cleanup: (() => void) | undefined;
    // async-iife: bootstrap -- `createCallbackLogic` is synchronous; the module loads behind it.
    void (async (): Promise<void> => {
      try {
        const start = await load();
        if (!stopped.signal.aborted) {
          cleanup = start({ input, sendBack });
        }
      } catch (error) {
        if (!stopped.signal.aborted) {
          reportAppRuntimeFault(error);
        }
      }
    })();
    return () => {
      stopped.abort();
      const pending = cleanup;
      cleanup = undefined;
      try {
        pending?.();
      } catch (error) {
        reportAppRuntimeFault(error);
      }
    };
  });

/** Load a module once; a failed load is asked again by the next child that starts. */
const loadOnce = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let loading: Promise<T> | undefined;
  return async () => {
    loading ??= (async (): Promise<T> => {
      try {
        return await load();
      } catch (error) {
        loading = undefined;
        throw error;
      }
    })();
    return loading;
  };
};

/**
 * The `revisions` child (rows S3, S27, B7): the project's revision-client lifecycle for one file manager, over the real
 * module stores and the wiring's close cut, focus and chat store.
 */
const revisionsOn = (wiring: SessionWiring) =>
  lazyChildOn<ProjectSessionFileManagerInput>(
    loadOnce(async () => {
      const module = await wiring.loadRevisions();
      const callback = module.sessionRevisionsCallback(
        module.createSessionRevisionsPorts({
          closeCut: { register: wiring.registerCloseCut },
          focusedProject: wiring.focusedProject,
          chatFacts: (projectId, facts) => {
            wiring.chatSessions.setRevisionFacts(projectId, facts);
          },
          reportFault: reportAppRuntimeFault,
        }),
      );
      return ({ input, sendBack }) => callback({ input, sendBack });
    }),
  );

/** The `hostConnector` child (rows S2, S32): one file manager's read connector, published to the chat store. */
const hostConnectorOn = (wiring: SessionWiring) =>
  lazyChildOn<ProjectSessionFileManagerInput>(
    loadOnce(async () => {
      const module = await wiring.loadHostConnector();
      const callback = module.hostConnectorCallback({
        chatSessions: wiring.chatSessions,
        choices: wiring.choices,
        reportFault: reportAppRuntimeFault,
      });
      return ({ input }) => callback({ input });
    }),
  );

/**
 * The `presence` child (row S4): the session's visibility from `environment` and focus, with nothing mounted (I5).
 * Each report of the page reaches the session, as each `visibilitychange` reached it from the binding's listener, and
 * so does each change of whether this is the focused project.
 */
const presenceOn = (wiring: SessionWiring) =>
  createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
    let focused = wiring.focusedProject.get() === input.projectId;
    const report = (): void => {
      /* R3/V1-7: the two facts differ while the window is minimised; only a project nobody is on parks. */
      sendBack({ type: 'visibilityChanged', visible: focused && wiring.documentVisible.get(), focused });
    };
    report();
    const unsubscribeFocus = wiring.focusedProject.subscribe(() => {
      const next = wiring.focusedProject.get() === input.projectId;
      if (next !== focused) {
        focused = next;
        report();
      }
    });
    const unsubscribeVisibility = wiring.documentVisible.subscribe(report);
    return () => {
      unsubscribeFocus();
      unsubscribeVisibility();
    };
  });

/* A registry composed without wiring (rows that run the registry alone) starts none of the three. */
const unwiredFileManagerChild = createCallbackLogic<EventObject, ProjectSessionFileManagerInput>(() => undefined);
/* A14: with no revision client there is no file check to wait for, so it is settled at once. */
const unwiredRevisions = createCallbackLogic<EventObject, ProjectSessionFileManagerInput>(({ sendBack }) => {
  sendBack({ type: 'fileCheckChanged', settled: true, judged: false });
  return undefined;
});
const unwiredPresence = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);

/**
 * Open one session file manager's root synchronisation, as the provider's scope opens its own (`ownWorkspace`): one
 * pass at a time, over the file manager's waits on the runtime's clock, until it is closed.
 *
 * @param input - The file manager, the signal its owner ends with, the runtime's wait and the workspace telemetry.
 * @returns The synchronisation and its close.
 * @public
 */
export const createSessionRootSync = ({
  fileManagerRef,
  gone,
  files,
  telemetry,
}: Readonly<{
  fileManagerRef: FileManagerRef;
  gone: AbortSignal;
  files: FacadeFiles;
  telemetry: Pick<WorkspaceTelemetry, 'workspaceUnmountFailed'>;
}>): SessionRootSync => {
  const proxyAt = async (readiness: 'ready' | 'proxy') => {
    const snapshot = await readied(files, fileManagerRef, { readiness, gone });
    const { proxy } = snapshot.context;
    if (!proxy) {
      throw new FileManagerNotReadyError('proxy-timeout');
    }
    return proxy;
  };
  const { workspace, activateRootSync } = createWorkspaceFacade({
    fileManagerRef,
    getReadiedProxy: async () => proxyAt('ready'),
    getConnectedProxy: async () => proxyAt('proxy'),
    whenServicesReady: async () =>
      servicesBound(fileManagerRef) ??
      servicesOf(await files.awaitFileManager(fileManagerRef, 'services', { reason: 'services-timeout', gone })),
    telemetry,
  });
  return { syncProjectRoots: workspace.syncProjectRoots, close: activateRootSync() };
};

// ---------------------------------------------------------------------------
// Cross-process identity
// ---------------------------------------------------------------------------

/**
 * This document's session epoch (W3c-R4): one id per client session, which
 * names this document's registration with the resident agent host.
 *
 * @public
 */
export const sessionEpoch: string = randomUuid();

// ---------------------------------------------------------------------------
// Compute admission
// ---------------------------------------------------------------------------

/**
 * Compute admission, per live project (brief item 4).
 *
 * The worker holds a *set* of admitted ids; a project's channels are disposed
 * on its own close, never on another project's open. The session is what says
 * "this project is live", so it is what admits and releases.
 */
const computeRegionOn = (sharedWorker: () => Worker | undefined) =>
  createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
    /* Read when the region starts and when it ends: the file-manager host's worker, once `rootFiles` has one (S28). */
    sharedWorker()?.postMessage({
      type: 'computeStoreAdmission',
      projectId: input.projectId,
    });
    sendBack({ type: 'childReady', region: 'compute' });
    return () => {
      sharedWorker()?.postMessage({
        type: 'computeStoreRelease',
        projectId: input.projectId,
      });
    };
  });

const agentHostRegistrations = new Map<string, Promise<ProjectAgentHostRegistration>>();

/** The real browser probe or desktop launcher attachment owned by one session. */
const agentHostRegion = createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
  const registration = registerProjectAgentHost(input.projectId, `${sessionEpoch}:${input.projectId}`);
  agentHostRegistrations.set(input.projectId, registration);
  // async-iife: bootstrap -- `createCallbackLogic` is synchronous; the registration settles through `sendBack`.
  void (async () => {
    try {
      await registration;
      sendBack({ type: 'childReady', region: 'agentHost' });
    } catch (error) {
      sendBack({
        type: 'childFailed',
        region: 'agentHost',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  return () => {
    if (agentHostRegistrations.get(input.projectId) !== registration) {
      return;
    }
    agentHostRegistrations.delete(input.projectId);
    // async-iife: bootstrap -- teardown is synchronous and a failed release has nobody to report to.
    void (async () => {
      try {
        const registered = await registration;
        await registered.release();
      } catch {
        // The registration never came up; there is nothing left to release.
      }
    })();
  };
});

// ---------------------------------------------------------------------------
// The registry actor
// ---------------------------------------------------------------------------

const projectSessionOn = ({
  sharedWorker,
  openFileManager,
  fileManagerWorker,
  openRuntime,
  wiring,
}: SessionsRegistryFiles) =>
  projectSessionMachine.provide({
    actors: {
      cancelRuns: createAsyncLogic<void, { projectId: string; runs: readonly string[] }>({
        run: async ({ input }) => {
          await servicesFor(input.projectId).cancelRuns(input.runs);
        },
      }),
      flushProducers: createAsyncLogic<void, { projectId: string }>({
        run: async ({ input }) => {
          await servicesFor(input.projectId).flushProducers();
        },
      }),
      flushSync: createAsyncLogic<void, { projectId: string; boundMilliseconds: number }>({
        run: async ({ input }) => {
          await servicesFor(input.projectId).flushSync(input.boundMilliseconds);
        },
      }),
      releaseAgentHost: createAsyncLogic<void, { projectId: string }>({
        run: async ({ input }) => {
          await servicesFor(input.projectId).closeRuntime();
          const registration = agentHostRegistrations.get(input.projectId);
          if (registration !== undefined) {
            const registered = await registration;
            await registered.release();
            agentHostRegistrations.delete(input.projectId);
          }
        },
      }),
      fileManager:
        openFileManager === undefined
          ? withoutFileManager
          : fileManagerRegionOn(openFileManager, fileManagerWorker, wiring?.rootSync),
      project: openRuntime === undefined ? withoutRuntime : runtimeRegionOn(openRuntime),
      agentHost: agentHostRegion,
      compute: computeRegionOn(sharedWorker),
      /* A7b: without wiring no revision client, connector or presence is started. */
      revisions: wiring === undefined ? unwiredRevisions : revisionsOn(wiring),
      hostConnector: wiring === undefined ? unwiredFileManagerChild : hostConnectorOn(wiring),
      presence: wiring === undefined ? unwiredPresence : presenceOn(wiring),
    },
  });

/** What a registry root takes from its composition (MC-R4); production passes none. @public */
export type SessionsActorOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>;

/**
 * What the registry's sessions take from the file-manager host. @public
 */
export type SessionsRegistryFiles = Readonly<{
  /** The shared file-manager worker, read when a session's compute region starts and ends (S28). */
  sharedWorker: () => Worker | undefined;
  /** Opens each session's file manager (A6c). Without it the views region is up with no file manager. */
  openFileManager?: SessionFileManagerOpener;
  /**
   * The shared worker each session's file manager is built on (A6c). With it a file manager is built once `rootFiles`
   * holds a worker and rebuilt when the worker is replaced; without it, at once.
   */
  fileManagerWorker?: SessionFileManagerWorker;
  /** Builds each session's project runtime (A6d). Without it the runtime region and the chat session are up at once. */
  openRuntime?: SessionRuntimeOpener;
  /** What each session's facts are wired to (A7b). Without it no session starts a revision client or a connector. */
  wiring?: SessionWiring;
}>;

/**
 * The registry's logic with its session children provided: the app runtime's `sessions` child (D5). The runtime gives
 * it the file-manager host's shared worker, which admits and releases each live project's compute (S28), and the
 * opener each session's file manager is built through (A6c).
 *
 * @param files - The shared worker and the session file-manager opener.
 * @returns The registry's logic.
 * @public
 */
export const createSessionsRegistryLogic = (files: SessionsRegistryFiles): typeof sessionsMachine =>
  sessionsMachine.provide({ actors: { projectSession: projectSessionOn(files) } });

/**
 * The registry's logic with no file-manager host: for compositions that run the registry alone.
 *
 * @public
 */
export const sessionsRegistryLogic = createSessionsRegistryLogic({ sharedWorker: () => undefined });

/**
 * The registry's input for this host (PV-S5).
 *
 * Desktop is bounded by memory rather than a count (A35): its budget is the
 * absence of one, and the idle window still applies. A phone or low-memory
 * browser holds one live project (B-08).
 *
 * @returns The input the composition reads once, when it creates the registry.
 * @public
 */
export const sessionsRegistryInput = (): SessionsMachineInput => ({
  budget: liveProjectBudgetFor({ desktop: isDesktopTarget, constrained: isMemoryConstrainedDevice() }),
});

/**
 * Create a registry of its own, unstarted (MC-R4). The app's registry is the runtime's `sessions` child; this root
 * is for compositions that run the registry alone.
 *
 * @param options - The clock, inspector and rejected-event hook for this root, the shared worker its compute
 *   regions admit on (none by default), the session file-manager opener (none by default) and the shared worker its
 *   file managers are built on (none: each is built at once).
 * @returns The registry actor; the caller starts it once.
 * @public
 */
export const createSessionsActor = ({
  sharedWorker,
  openFileManager,
  fileManagerWorker,
  openRuntime,
  wiring,
  ...options
}: SessionsActorOptions & Partial<SessionsRegistryFiles> = {}): Actor<typeof sessionsMachine> =>
  createActor(
    createSessionsRegistryLogic({
      sharedWorker: sharedWorker ?? (() => undefined),
      ...(openFileManager === undefined ? {} : { openFileManager }),
      ...(fileManagerWorker === undefined ? {} : { fileManagerWorker }),
      ...(openRuntime === undefined ? {} : { openRuntime }),
      ...(wiring === undefined ? {} : { wiring }),
    }),
    { ...options, input: sessionsRegistryInput() },
  );

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Which projects are live right now, in open order. @public */
export const selectLiveProjectIds = (context: SessionsMachineContext): readonly string[] => Object.keys(context.refs);

/**
 * A session's file manager, as its `fileManager` child reported it (A6c): what the session subtree's provider is a view
 * of.
 *
 * @param snapshot - The session's snapshot.
 * @returns The file manager, or `undefined` before the child reports it, after it stops, or with no host.
 * @public
 */
export const selectProjectSessionFileManager = (
  snapshot: ReturnType<ProjectSessionActorRef['getSnapshot']>,
): FileManagerRef | undefined => snapshot.context.fileManagerRef;

/**
 * A session's project runtime, as its `project` child reported it (A6d): what the session subtree's `ProjectProvider` is
 * a view of.
 *
 * @param snapshot - The session's snapshot.
 * @returns The runtime's root, or `undefined` before the child built it, while it rebuilds it, or with no opener.
 * @public
 */
export const selectProjectSessionRuntime = (
  snapshot: ReturnType<ProjectSessionActorRef['getSnapshot']>,
): AnyActorRef | undefined => snapshot.context.runtimeRef;

/** One project's session actor, or `undefined` when it is closed. @public */
export const selectProjectSession = (
  context: SessionsMachineContext,
  projectId: string,
): ProjectSessionActorRef | undefined => context.refs[projectId];

/**
 * The coalesced per-project status object W20's `use-sidebar-status.ts` reads.
 *
 * One object per project (S46) — never four machine snapshots per row. W20
 * joins the worker's `RevisionStatus` projection and the chat sessions'
 * `statusChanged` onto this shape; it is named here so the sidebar has one
 * seam rather than a second derivation of the same facts.
 *
 * @public
 */
export type ProjectLivenessStatus = Readonly<{
  projectId: string;
  live: boolean;
  status: SessionsProjectStatus | undefined;
  /** Why it closed, when it is closed: `Closed to save memory`, and so on. */
  closedReason: string | undefined;
  /** What stopped a policy from closing it, when one tried (I24, I25). */
  policyRefusal: string | undefined;
}>;

/**
 * The registry's half of one project's sidebar row.
 *
 * @param context - The registry snapshot's context.
 * @param projectId - The project the row is about.
 * @returns The coalesced liveness facts for that project.
 * @public
 */
export const selectProjectLiveness = (context: SessionsMachineContext, projectId: string): ProjectLivenessStatus => ({
  projectId,
  live: context.refs[projectId] !== undefined,
  status: context.status[projectId],
  closedReason: context.closed[projectId]?.reason,
  policyRefusal: context.refusals[projectId],
});
