/**
 * Focus's five ports and the bindings React fills (app state orchestration charter D7, D15, D26; plan § 4 A5b).
 *
 * The runtime root spawns `focus` beside the registry with five port actors as its input (MC-R11). Each port is a
 * callback actor that takes focus's commands and answers with focus's public events, matched by id (I18):
 *
 * - `library`: asks the project library's route access and answers `accessAnswered` at the library epoch the question
 *   was asked at. It reports every library epoch to the registry (`libraryEpochChanged`), the first included, before
 *   focus hears of it, so the registry has heard every epoch an open's request can name (A5c).
 * - `registry`: forwards `open`, `touch`, `chatRequested` and `cancelPendingOpen` to the registry and answers each open
 *   with `openSettled`, read off the registry's snapshot after the send, and again when the open waiting in
 *   `pendingOpen` is resumed, dropped (`pendingOpenDropped`) or refused. It reports each project's session facts on
 *   every change and again after every live answer. One actor forwards synchronously, so the registry's answers and
 *   facts reach focus in the order the registry produced them (the ordered-channel contract A5a's wiring rests on).
 * - `flush`: runs the leave flush of the session being left. Until A7c that is the registration React provides today
 *   (`ProjectSessionFlushRegistration`), kept per project while the project is live.
 * - `module`: loads the session module (`loadProjectWorkspace`) and answers `moduleLoaded`.
 * - `route`: hands focus's `chatShown` and `cloudOpenTaken` to the route boundary (`project-route-intent.tsx`), the
 *   only sink of `navigate` (D15 named boundary 1).
 *
 * The ports take the registry and a late reader of focus as input (`FocusPortInput`). Host objects
 * (the library, the module import, React's callbacks) live in the ports' closures, never in a machine's context (D4).
 */
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, AnyActorRef, CallbackActorLogic, EventObject } from 'xstate';
import type { Project } from '@taucad/types';
import type {
  FocusAccessAnswer,
  FocusEvent,
  FocusFlushCommand,
  FocusLibraryCommand,
  FocusMachine,
  FocusModuleCommand,
  FocusNativeKernel,
  FocusOpenResult,
  FocusPolicy,
  FocusRegistryCommand,
  FocusRouteCommand,
  FocusSessionStatus,
} from '#machines/focus.machine.js';
import type { sessionsMachine, SessionsMachineContext } from '#machines/sessions.machine.js';
import { isKernelAvailable, nativeKernelRequirementForEntryPath } from '#constants/available-kernel-configurations.js';
import { recordMemoryBreadcrumb } from '#lib/memory-kill-signal.js';

type SessionsRef = ActorRefFrom<typeof sessionsMachine>;

/**
 * A port's input: the registry, and focus read late. Focus takes the ports as its input, so it is spawned after them;
 * the root fills the getter once focus exists, before any port can have a reply to deliver (MC-R13: peers through
 * input, never the actor system).
 *
 * @public
 */
export type FocusPortInput = Readonly<{ sessions: SessionsRef; focus: () => AnyActorRef | undefined }>;

/** What the library port reads of the project library. @public */
export type FocusLibrarySource = Readonly<{
  /** The library's route access for one project; rejects when its port fails. */
  routeAccess: (projectId: string) => Promise<FocusAccessAnswer>;
  /** The library's current epoch (`ProjectLibrary`'s revision). */
  epoch: () => number;
  /** Follow each epoch change. @returns The unsubscribe. */
  onEpochChanged: (listener: (epoch: number) => void) => () => void;
}>;

/** The leave flush React registers for one live project until A7c (`ProjectSessionFlushRegistration`). @public */
export type FocusLeaveFlushRegistration = {
  projectId: string;
  flush: () => Promise<void>;
  inFlight?: Promise<void>;
};

/** Where focus's route commands go: the route boundary's `navigate` and the `cloudOpen` latch. @public */
export type FocusRouteSink = (command: FocusRouteCommand) => void;

/**
 * What React fills: the leave flush each live project's guard registers, and the route boundary's sink. Plain
 * callbacks a port reads when focus asks, never machine context (D4).
 *
 * @public
 */
export type FocusBindings = Readonly<{
  /** Keep the registration a project's guard provides; `undefined` is ignored, because the guard's cleanup cannot
   * name its project, and a registration is dropped only when its project leaves the live set. */
  registerLeaveFlush: (registration: FocusLeaveFlushRegistration | undefined) => void;
  /** Bind the route boundary. @returns The unbind. */
  bindRoute: (sink: FocusRouteSink) => () => void;
}>;

/** Focus, its bindings and its registry, as React reads them. @public */
export type FocusHandle = Readonly<{
  focus: ActorRefFrom<FocusMachine>;
  bindings: FocusBindings;
}>;

/** The ports' logics and the bindings they read. @public */
export type FocusComposition = Readonly<{
  bindings: FocusBindings;
  logics: Readonly<{
    library: CallbackActorLogic<EventObject, FocusPortInput>;
    registry: CallbackActorLogic<EventObject, FocusPortInput>;
    flush: CallbackActorLogic<EventObject, FocusPortInput>;
    module: CallbackActorLogic<EventObject, FocusPortInput>;
    route: CallbackActorLogic<EventObject, FocusPortInput>;
  }>;
  /** The library epoch focus starts at. */
  epoch: () => number;
}>;

/** What the focus composition takes. @public */
export type FocusCompositionOptions = Readonly<{
  library: FocusLibrarySource;
  /** The session module's import (`loadProjectWorkspace`). */
  loadModule: () => Promise<unknown>;
}>;

/**
 * The app's focus policy: the native kernel a ready project's entry needs, and whether this host can run it (S34).
 *
 * @public
 */
export const appFocusPolicy: FocusPolicy = {
  nativeKernelOf: (project: Project): FocusNativeKernel | undefined => {
    const requirement = nativeKernelRequirementForEntryPath(project.assets.main?.entryPath);
    return requirement === undefined
      ? undefined
      : {
          kernelName: requirement.configuration.name,
          runtimeKernelId: requirement.runtimeKernelId,
          available: isKernelAvailable(requirement.configuration.id),
        };
  },
};

const tell = (input: FocusPortInput, event: FocusEvent): void => {
  input.focus()?.send(event);
};

type Facts = Readonly<{ status: FocusSessionStatus; chatReady: boolean; availability: 'pending' | 'settled' }>;

/** A project's session facts as the registry's snapshot shows them. */
const factsOf = (context: SessionsMachineContext, projectId: string): Facts => {
  const status = context.status[projectId];
  if (status === undefined) {
    return {
      status: context.refs[projectId] === undefined ? 'absent' : 'starting',
      chatReady: false,
      availability: 'pending',
    };
  }
  const byState: Record<typeof status.state, FocusSessionStatus> = {
    opening: 'starting',
    live: 'live',
    closing: 'closing',
    closed: 'closing',
    failed: 'failed',
  };
  return {
    status: byState[status.state],
    chatReady: status.chatReady,
    availability: status.availability === 'settled' ? 'settled' : 'pending',
  };
};

const sameFacts = (left: Facts | undefined, right: Facts): boolean =>
  left?.status === right.status && left.chatReady === right.chatReady && left.availability === right.availability;

/**
 * How the registry answered an open, read off its snapshot right after the send.
 *
 * @param context - The registry's context after the open.
 * @param projectId - The project the open named.
 * @returns The answer.
 */
const answerOf = (context: SessionsMachineContext, projectId: string): FocusOpenResult => {
  if (context.pendingOpen?.projectId === projectId) {
    return 'waiting';
  }
  if (context.refs[projectId] === undefined) {
    return 'start-failed';
  }
  return context.status[projectId]?.state === 'failed' ? 'on-failed' : 'live';
};

/**
 * Build focus's port logics and the bindings React fills.
 *
 * @param options - The library focus asks and the session module's import.
 * @returns The bindings, the five logics and the starting epoch.
 * @public
 */
// oxlint-disable-next-line max-lines-per-function -- One composition: the five ports share the bindings.
export const createFocusComposition = ({ library, loadModule }: FocusCompositionOptions): FocusComposition => {
  const leaveFlushes = new Map<string, FocusLeaveFlushRegistration>();
  let routeSink: FocusRouteSink | undefined;
  const bindings: FocusBindings = {
    registerLeaveFlush: (registration) => {
      if (registration !== undefined) {
        leaveFlushes.set(registration.projectId, registration);
      }
    },
    bindRoute: (sink) => {
      routeSink = sink;
      return () => {
        if (routeSink === sink) {
          routeSink = undefined;
        }
      };
    },
  };

  const libraryLogic = createCallbackLogic<EventObject, FocusPortInput>(({ input, receive }) => {
    const { sessions } = input;
    let epoch = library.epoch();
    /* Every epoch reaches the registry before focus hears it, so no open can name an epoch the registry has not heard
     * (A5c's fail-safe drops a resumed open whose epoch it does not know). */
    sessions.send({ type: 'libraryEpochChanged', epoch });
    const stopFollowing = library.onEpochChanged((next) => {
      if (next <= epoch) {
        return;
      }
      epoch = next;
      sessions.send({ type: 'libraryEpochChanged', epoch: next });
      tell(input, { type: 'libraryChanged', revision: next });
    });
    const cancelled = new Set<string>();
    receive((event) => {
      const command = event as FocusLibraryCommand;
      if (command.type === 'accessCancelled') {
        cancelled.add(command.requestId);
        return;
      }
      const { requestId, projectId } = command;
      /* The answer is given at the epoch the question was asked at: a read an epoch change overtook is stale, and
       * focus asks again on the change (I7, `AccessAnswerFenced`). */
      const askedAt = epoch;
      const answer = (value: FocusAccessAnswer): void => {
        if (cancelled.delete(requestId)) {
          return;
        }
        tell(input, { type: 'accessAnswered', requestId, epoch: askedAt, answer: value });
      };
      const ask = async (): Promise<void> => {
        try {
          answer(await library.routeAccess(projectId));
        } catch (error) {
          answer({ status: 'error', message: error instanceof Error ? error.message : 'route access failed' });
        }
      };
      // async-iife: bootstrap -- a callback actor cannot await; the answer goes to focus, which owns the wait.
      void ask();
    });
    return stopFollowing;
  });

  // oxlint-disable-next-line max-lines-per-function -- The registry's one forwarder: answers and facts share its order.
  const registryLogic = createCallbackLogic<EventObject, FocusPortInput>(({ input, receive }) => {
    const { sessions } = input;
    const reported = new Map<string, Facts>();
    /** Focus's open waiting in the registry's single `pendingOpen` slot. */
    let waiting: Readonly<{ requestId: string; projectId: string }> | undefined;
    /** Set while the port itself sends to the registry, whose snapshot it then reads in order. */
    let sending = false;
    /**
     * Focus's open the registry has queued, not processed: sent while the registry was still notifying its observers
     * of an earlier event (focus answers facts in the same call stack), so the snapshot after the send predates it.
     * It is answered from the first snapshot that shows it, after that snapshot's facts.
     */
    let queued: Readonly<{ requestId: string; projectId: string }> | undefined;

    const reportFacts = (context: SessionsMachineContext, projectId: string, always: boolean): void => {
      const facts = factsOf(context, projectId);
      if (!always && sameFacts(reported.get(projectId), facts)) {
        return;
      }
      if (facts.status === 'absent') {
        reported.delete(projectId);
      } else {
        reported.set(projectId, facts);
      }
      tell(input, { type: 'sessionFacts', projectId, ...facts });
    };
    const reportChanges = (context: SessionsMachineContext): void => {
      const projectIds = new Set([...reported.keys(), ...Object.keys(context.refs), ...Object.keys(context.status)]);
      for (const projectId of projectIds) {
        reportFacts(context, projectId, false);
      }
    };
    /* An answer, and after a live one the facts of the session it reached (rule 11: only facts after the answer
     * describe that session). */
    const answer = (requestId: string, projectId: string, result: FocusOpenResult): void => {
      tell(input, { type: 'openSettled', requestId, result });
      if (result === 'live' || result === 'on-failed') {
        reportFacts(sessions.getSnapshot().context, projectId, true);
      }
    };
    /* The registry moved focus's waiting open: resumed into a session, or its slot emptied by someone else. */
    const settleWaiting = (context: SessionsMachineContext): void => {
      if (waiting === undefined || context.pendingOpen?.projectId === waiting.projectId) {
        return;
      }
      const { requestId, projectId } = waiting;
      waiting = undefined;
      const state = context.status[projectId]?.state;
      if (context.refs[projectId] !== undefined && state !== 'closing' && state !== 'closed') {
        answer(requestId, projectId, state === 'failed' ? 'on-failed' : 'live');
        return;
      }
      /* The person declined the budget's choice (`cancelPendingOpen` from its dialog): nothing will open it. */
      answer(requestId, projectId, 'start-failed');
    };

    /* The queued open, once a snapshot shows it: waiting in the slot, or a session (new, touched or failed). */
    const settleQueued = (context: SessionsMachineContext): void => {
      if (queued === undefined) {
        return;
      }
      const result = answerOf(context, queued.projectId);
      if (result === 'start-failed') {
        return;
      }
      const { requestId, projectId } = queued;
      queued = undefined;
      waiting = result === 'waiting' ? { requestId, projectId } : undefined;
      answer(requestId, projectId, result);
    };

    const snapshots = sessions.subscribe((snapshot) => {
      if (sending) {
        return;
      }
      reportChanges(snapshot.context);
      settleQueued(snapshot.context);
      settleWaiting(snapshot.context);
    });
    const dropped = sessions.on('pendingOpenDropped', (event) => {
      if (waiting?.projectId === event.projectId) {
        const { requestId, projectId } = waiting;
        waiting = undefined;
        answer(requestId, projectId, 'dropped');
      }
    });
    const refused = sessions.on('budgetRefused', (event) => {
      if (
        !sending &&
        waiting?.projectId === event.projectId &&
        sessions.getSnapshot().context.refs[event.projectId] !== undefined
      ) {
        const { requestId, projectId } = waiting;
        waiting = undefined;
        answer(requestId, projectId, 'refused');
      }
    });

    const forward = (event: Parameters<SessionsRef['send']>[0]): void => {
      sending = true;
      try {
        sessions.send(event);
      } finally {
        sending = false;
      }
    };

    receive((event) => {
      const command = event as FocusRegistryCommand;
      switch (command.type) {
        case 'open': {
          const { projectId, request, requestId } = command;
          recordMemoryBreadcrumb('open');
          if (queued !== undefined) {
            /* This open displaces the queued one's wait in the single slot before either is processed. */
            answer(queued.requestId, queued.projectId, 'waiting');
            queued = undefined;
          }
          const before = sessions.getSnapshot();
          forward({ type: 'open', projectId, request });
          const after = sessions.getSnapshot();
          if (after === before) {
            /* The registry queued it behind the event it is still processing: answer it when it lands. */
            waiting = undefined;
            queued = { requestId, projectId };
            return;
          }
          const { context } = after;
          /* Facts the open itself produced come first, then the answer and the facts after it: the order the
           * registry produced them in. */
          reportChanges(context);
          const result = answerOf(context, projectId);
          /* One slot: any open displaces the wait before it, which focus derives from the replies' order. */
          waiting = result === 'waiting' ? { requestId, projectId } : undefined;
          answer(requestId, projectId, result);
          return;
        }
        case 'cancelPendingOpen': {
          waiting = undefined;
          queued = undefined;
          forward({ type: 'cancelPendingOpen' });
          reportChanges(sessions.getSnapshot().context);
          return;
        }
        case 'touch':
        case 'chatRequested': {
          forward(command);
          reportChanges(sessions.getSnapshot().context);
        }
      }
    });
    /* Facts for sessions that were live before focus started (none in the app; a test may compose some). */
    reportChanges(sessions.getSnapshot().context);
    return () => {
      snapshots.unsubscribe();
      dropped.unsubscribe();
      refused.unsubscribe();
    };
  });

  const flushLogic = createCallbackLogic<EventObject, FocusPortInput>(({ input, receive }) => {
    /* A registration outlives its focus, never its session: a project that leaves the live set is forgotten. */
    const snapshots = input.sessions.subscribe((snapshot) => {
      for (const projectId of leaveFlushes.keys()) {
        if (snapshot.context.refs[projectId] === undefined) {
          leaveFlushes.delete(projectId);
        }
      }
    });
    receive((event) => {
      const { requestId, projectId } = event as FocusFlushCommand;
      const registration = leaveFlushes.get(projectId);
      const settle = (ok: boolean): void => {
        tell(input, { type: 'leaveFlushSettled', requestId, ok });
      };
      if (registration === undefined) {
        settle(true);
        return;
      }
      const pending = registration.inFlight ?? registration.flush();
      registration.inFlight = pending;
      const run = async (): Promise<void> => {
        let ok = true;
        try {
          await pending;
        } catch {
          ok = false;
        }
        if (registration.inFlight === pending) {
          registration.inFlight = undefined;
        }
        settle(ok);
      };
      // async-iife: bootstrap -- a callback actor cannot await; the settlement goes to focus, which owns the wait.
      void run();
    });
    return () => {
      snapshots.unsubscribe();
    };
  });

  const moduleLogic = createCallbackLogic<EventObject, FocusPortInput>(({ input, receive }) => {
    receive((event) => {
      if (event.type !== ('moduleLoadAsked' satisfies FocusModuleCommand['type'])) {
        return;
      }
      /* A failed import is not answered: the live session's `use` of the same import reports it, and a later ask
       * imports again. */
      const load = async (): Promise<void> => {
        try {
          await loadModule();
        } catch {
          return;
        }
        tell(input, { type: 'moduleLoaded' });
      };
      // async-iife: bootstrap -- a callback actor cannot await; focus waits for `moduleLoaded`.
      void load();
    });
  });

  const routeLogic = createCallbackLogic<EventObject, FocusPortInput>(({ receive }) => {
    receive((event) => {
      routeSink?.(event as FocusRouteCommand);
    });
  });

  return {
    bindings,
    logics: {
      library: libraryLogic,
      registry: registryLogic,
      flush: flushLogic,
      module: moduleLogic,
      route: routeLogic,
    },
    epoch: library.epoch,
  };
};
