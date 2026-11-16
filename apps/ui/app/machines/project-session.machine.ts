import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EnqueueObject, EventObject, SystemRegistry } from 'xstate';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { faultMessage, reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';
import { sessionFileCheckMachine } from '#machines/session-file-check.machine.js';

/**
 * One live project (S44, A35).
 *
 * A project is live iff this actor runs. It owns every project-scoped
 * resource — the nested file-manager actor, the project and editor actors and
 * their geometry units, the agent-host attachment and compute admission — so
 * navigation opens but never closes, and host registration outlives a route
 * (I22, I23). Its chats' `chat-session` actors are roots the chat store creates
 * (PV-S5, L3 D10), so a chat's fault never reaches its project or the registry.
 *
 * The children are **injected**: the store module provides the real logics and
 * a test provides fakes, so this file imports no worker, no DOM and no React
 * (I27 — browser and desktop share the machine with different actors).
 *
 * A6c: the `fileManager` child is real. It builds the project's file manager through the file-manager host for
 * `/projects/<id>` once `rootFiles` holds the shared worker, owns it for the session's life and reports the views
 * region from its snapshot, with nothing mounted (I5). It tells the session the file manager's ref
 * (`fileManagerChanged`), which the session keeps so the subtree's provider and later children read it, and tells it
 * again when the shared worker is lost or replaced and it rebuilds the file manager; the child, never the session,
 * stops it. A root fault is recorded
 * once, the first kept, and reported through the app runtime's one hook (D23, B2).
 *
 * A6d: the `project` child is real too. Once the session has a file manager it builds the project runtime behind a
 * dynamic import (D5, D8), from the file manager, the library, `choices` and the open request (rows S12, S34, S38): the
 * request's native kernel id selects the kernel, and its chat reaches the editor, as does every later `chatRequested`,
 * which the session forwards to it beside each `fileManagerChanged`. The child reports the runtime region from the
 * runtime's facts, tells the session the runtime's root (`runtimeChanged`), which the session keeps for the subtree's
 * provider, and reports that the chat session is ready (`chatReady`, M2) and each chat the editor focused
 * (`chatFocused`), which the session passes to the registry for focus.
 *
 * A6e: a change of the device's choices that selects another kernel is the session event `replaceRuntime` (D8, B4). The
 * `project` child reports it and the session hands it back while it opens, is live, has failed or asks to close: the
 * child flushes the runtime's producers, then builds the next runtime and stops the old one.
 *
 * A7b: the session wires its own facts, with nothing mounted (I5). Each file manager the `fileManager` child reports
 * gets a `revisions` child, which owns the project's revision-client lifecycle for the workspace of the session's own
 * open request (B7) and registers the close cut at the session stage of `environment`'s sequencer (D26), and a
 * `hostConnector` child, which publishes the project's read connector to the chat store. Both are loaded lazily where
 * the session is composed (D5), take the file manager and its root synchronisation in their invoke input, never in this
 * context (D4), and stop when the file manager goes. `revisions` reports the revision facts a policy close reads
 * (`revisionState`) and whether the chats arrived (`revisionChatsChanged`, which the `project` child turns into a retry
 * of a deferred focused chat). The `presence` child reports visibility from `environment` and focus
 * (`visibilityChanged`), and the session sends parking to its own `project` child (`runtimeParking`) instead of
 * emitting it for a React binding to relay.
 *
 * A7c: closing and the unload are steps over the session's own children, with nothing mounted (I5, I6; row S6). The
 * `project` child flushes what its runtime owes and closes its runtime, the `revisions` child quiesces the project's
 * sync, and each waits as a state with an `after` on the session's clock (I15) rather than a `waitFor` timeout. A leave
 * flush (focus's port) and the unload's producer stage (the `unload` child, registered once at the producer stage of
 * `environment`'s sequencer, D26) are asked of the session with `flushAsked` and answered with `flushSettled`.
 *
 * A14: the session owns its first file check (`availability`, U13 and the race part of U20). It is `pending` from the
 * moment it starts a `revisions` child, whose revision client has published nothing yet, until that child reports the
 * check settled (`fileCheckChanged`): a status is published and the model is not checking its files. The `fileCheck`
 * child counts each check's patience on the clock and reports `fileCheckSlow`, which makes it `slow`, for the
 * "Preparing model" view's "Try again". Focus's `opening` waits for `settled` up to its open bound, and that wait is
 * for the first check of a revision client only (I20, B6): a later check leaves the session `settled` until it turns
 * `slow`, so a return to a live project mid-check shows its editor at once. A session with no `revisions` child has no
 * file check, and its availability stays `settled`.
 */

/**
 * What a flush asked of the session settles (A7c): the leave flush focus runs before it moves (I3), or the producer
 * stage of the unload (I6, D26). The close flush is a step of `closing`, never asked.
 *
 * @public
 */
export type ProjectSessionFlushKind = 'leave' | 'unload';

/** Why a session is closing. `user` is the verb; the rest are visible policy. @public */
export type ProjectSessionCloseReason = 'user' | 'idle' | 'budget' | 'memory' | 'quit';

/** The four things a project needs before it is usable. @public */
export type ProjectSessionRegion = 'views' | 'runtime' | 'agentHost' | 'compute';

/** What the registry and the sidebar read off a session. @public */
export type ProjectSessionState = 'opening' | 'live' | 'closing' | 'closed' | 'failed';

/**
 * What focus asks the session to open with (R3-F2, D7).
 *
 * Focus builds it from a ready access answer: the workspace from the project's own slugs, the native kernel id from
 * the answer (row S34), the chat ids from the route. `epoch` is the library epoch of that answer, so the registry can
 * drop a resumed open whose answer a library change has made stale (spec-pf `RegistryChecksEpoch`).
 *
 * @public
 */
export type ProjectSessionOpenRequest = Readonly<{
  workspace: string;
  nativeKernelId?: string;
  chatId?: string;
  createdChatId?: string;
  /** The library epoch of the ready answer the request was built from. */
  epoch?: number;
}>;

/**
 * How far the session's file check has come (A14).
 *
 * `pending` through a revision client's first check, until it has published a status and the model is not checking
 * files; `slow` once a check, first or later, has run for `modelCheckPatienceMilliseconds`; `settled` otherwise. A
 * later check leaves it `settled` until it turns slow, because the open waits only for a client's first check (I20).
 *
 * @public
 */
export type ProjectSessionAvailability = 'pending' | 'slow' | 'settled';

/** Input accepted when creating a projectSessionMachine actor. @public */
export type ProjectSessionMachineInput = Readonly<{
  projectId: string;
  /** What this session was opened with. Optional until A10: the sidebar and the notice send bare opens until A5b. */
  request?: ProjectSessionOpenRequest;
  /** The sessions registry; this session reports its liveness to it. */
  parentRef?: AnyActorRef;
  /** EQ15: the liveness idle-close window, handed down by the registry. */
  idleWindowMilliseconds?: number;
  /** R3: how long hidden and idle before this project's kernels park. */
  parkWindowMilliseconds?: number;
  /** How long a region may take to come up before it counts as failed. */
  startBoundMilliseconds?: number;
  /** The bound on the close flush, the rule W13's `awaitSyncSettled` uses. */
  closeFlushMilliseconds?: number;
  /** How long the runtime's producers and stores may take to write what they owe, for every flush (A7c). */
  producerFlushMilliseconds?: number;
}>;

/** State owned by projectSessionMachine, plus its child refs. @public */
export type ProjectSessionMachineContext = Readonly<{
  projectId: string;
  /** The request this session was opened with; `chatRequested` moves its chat fields. */
  request: ProjectSessionOpenRequest | undefined;
  /**
   * The chat session is ready, for focus's `opening` join (D25, I20; M2): the editor has left `ensuringFocusedChat`, as
   * the `project` child reports it. It stays ready once it is.
   */
  chatReady: boolean;
  /** The file check, for the same join and for the "Preparing model" view's "Try again" (A14). */
  availability: ProjectSessionAvailability;
  /** The id of the last check the `fileCheck` child was told started, which its report echoes (MC-R18). */
  fileCheckId: number;
  /** A check runs: told started and not yet settled. */
  fileCheckRunning: boolean;
  parentRef: AnyActorRef | undefined;
  idleWindowMilliseconds: number;
  parkWindowMilliseconds: number;
  startBoundMilliseconds: number;
  closeFlushMilliseconds: number;
  producerFlushMilliseconds: number;
  /** Flushes asked of the session and not yet settled, by request id (A7c). */
  flushes: Readonly<Record<string, ProjectSessionFlushKind>>;
  /** The request id of the close step waiting on a child's answer (I18), or `undefined` (A7c). */
  closeStep: string | undefined;
  /** How many close steps have asked a child, for the next one's id. */
  closeSteps: number;
  /** Chats with a run in flight. `busy` is `runs.length > 0`. */
  runs: readonly string[];
  /** Subset this window can stop, from the same projected close plan the dialog reads. */
  stoppableRuns: readonly string[];
  /** The live checkout has unsaved changes (A25 — a policy never closes it). */
  dirty: boolean;
  /** Everything this device recorded has been acknowledged by the remote. */
  pushed: boolean;
  /** Only hidden idle sessions are eligible for the idle-close window. */
  visible: boolean;
  /** The project the person is on, even while the window itself is hidden (V1-7). */
  focused: boolean;
  /** Refs this device has not had acknowledged — quit's `Backing up n`. */
  pending: number;
  /** What needs the person: approvals and failed runs, for the sidebar count. */
  attention: number;
  /** Regions that did not come up, with the reason the row shows. */
  failures: Readonly<Record<string, string>>;
  /** A region ended its start bound failed, which is what refuses the open (R4). */
  openFailed: boolean;
  closeReason: ProjectSessionCloseReason | undefined;
  /** The last state this session told the registry it was in. */
  reportedState: ProjectSessionState;
  /** The `fileManager` child, which owns the project's file manager. */
  fileManagerChildRef: AnyActorRef | undefined;
  /**
   * The project's file manager, as the `fileManager` child reported it (A6c). The child built it and stops it; the
   * session only hands it to its readers. `undefined` until the child reports it.
   */
  fileManagerRef: FileManagerRef | undefined;
  /** The `project` child, which owns the project runtime (A6d). */
  projectRef: AnyActorRef | undefined;
  /** The `revisions` child for the current file manager, which owns the revision-client lifecycle (A7b). */
  revisionsRef: AnyActorRef | undefined;
  /** The `hostConnector` child for the current file manager, which publishes the read connector (A7b). */
  hostConnectorRef: AnyActorRef | undefined;
  /** The `presence` child, which reports visibility from `environment` and focus (A7b). */
  presenceRef: AnyActorRef | undefined;
  /** The `fileCheck` child, which counts a file check's patience on the clock (A14). */
  fileCheckRef: AnyActorRef | undefined;
  /** The `unload` child, registered at the producer stage of `environment`'s sequencer (A7c, D26). */
  unloadRef: AnyActorRef | undefined;
  /**
   * The project runtime's root, as the `project` child reported it (A6d). The child built it and stops it; the session
   * only hands it to its readers. `undefined` until the child reports it and while it rebuilds it.
   */
  runtimeRef: AnyActorRef | undefined;
  agentHostRef: AnyActorRef | undefined;
  computeRef: AnyActorRef | undefined;
  /** The first effect or child failure no transition modelled; the session keeps answering (MC-R12, D23). */
  fault: string | undefined;
}>;

/** Events accepted by projectSessionMachine. @public */
export type ProjectSessionMachineEvent =
  | { readonly type: 'close'; readonly reason: ProjectSessionCloseReason }
  | { readonly type: 'confirmClose' }
  | { readonly type: 'cancelClose' }
  | { readonly type: 'childReady'; readonly region: ProjectSessionRegion }
  /**
   * The `fileManager` child built and started the project's file manager, or closed it because the shared worker was
   * lost or replaced or the child is stopping (A6c).
   */
  | {
      readonly type: 'fileManagerChanged';
      readonly fileManagerRef: FileManagerRef | undefined;
      /**
       * The file manager's own root synchronisation, which the `revisions` and `hostConnector` children are invoked
       * with (A7b). It travels in the event and their input, never in this context (D4).
       */
      readonly syncProjectRoots?: () => Promise<void>;
    }
  | { readonly type: 'childFailed'; readonly region: ProjectSessionRegion; readonly reason: string }
  /** The `project` child built and started the project runtime, or stopped it to build another (A6d). */
  | { readonly type: 'runtimeChanged'; readonly runtimeRef: AnyActorRef | undefined }
  /** The editor left `ensuringFocusedChat`: the chat session is ready (M2). */
  | { readonly type: 'chatReady' }
  /** The editor focused `chatId` for the chat this session was asked for (`requestedChatId`). */
  | { readonly type: 'chatFocused'; readonly requestedChatId?: string; readonly chatId: string }
  | {
      readonly type: 'projectedRunsChanged';
      readonly runs: readonly string[];
      readonly stoppableRuns: readonly string[];
    }
  | { readonly type: 'activity' }
  | {
      readonly type: 'visibilityChanged';
      readonly visible: boolean;
      /* R3/V1-7: whether this is the project the person navigated to. `visible`
       * is `focused && the window is on screen`, so a minimised window makes
       * every project hidden; only a project nobody navigated to parks. */
      readonly focused?: boolean;
    }
  | { readonly type: 'attention'; readonly count: number }
  | {
      readonly type: 'revisionState';
      readonly dirty: boolean;
      readonly pushed: boolean;
      /** An editor's conflict is being recorded, so only its memory has the text (RV-W5b2 R2-1): no policy closes it. */
      readonly recording?: boolean;
      /** `sync.pendingCount`, for the quit overlay's `Backing up n`. */
      readonly pendingCount?: number;
    }
  /** The `revisions` child: whether the project's chats have arrived, which a deferred focused chat waits for (S1). */
  | { readonly type: 'revisionChatsChanged'; readonly ready: boolean }
  /** The `revisions` child (A14): whether its client has published a status and the model is not checking files. */
  | { readonly type: 'fileCheckChanged'; readonly settled: boolean; readonly judged: boolean }
  /** The `fileCheck` child (A14): check `check` has run for its patience. */
  | { readonly type: 'fileCheckSlow'; readonly check: number }
  /**
   * Focus's request moved to another chat of this project (R3-F1). It sets both chat fields, so an `undefined`
   * clears one. A session opened without a request has no request to update, and keeps none.
   */
  | { readonly type: 'chatRequested'; readonly chatId?: string; readonly createdChatId?: string }
  /**
   * Flush what the runtime owes (A7c): focus's leave flush, or the unload's producer stage from the `unload` child. The
   * session answers with `flushSettled` under the same id, in every state (I18).
   */
  | { readonly type: 'flushAsked'; readonly requestId: string; readonly kind: ProjectSessionFlushKind }
  /** The `project` child's answer to a flush the session asked of it, with the refusal's message if it refused. */
  | { readonly type: 'runtimeFlushSettled'; readonly requestId: string; readonly error?: string }
  /** The `revisions` child's answer to `quiesce`: the project's sync settled through W13's seam, or refused. */
  | { readonly type: 'syncQuiesced'; readonly requestId: string; readonly error?: string }
  /** The `project` child's answer to `closeRuntime`: the runtime's kernels are shut down, or refused. */
  | { readonly type: 'runtimeClosed'; readonly requestId: string; readonly error?: string }
  /**
   * The `project` child's answer to `closeParameters`: the parameter service closed, or refused (unsaved drafts, an
   * incomplete sidecar cleanup) and stayed open.
   */
  | { readonly type: 'parametersClosed'; readonly requestId: string; readonly error?: string }
  /**
   * The session's own timer: an asked flush ran past its bound (A7c, I15). It is raised with a delay and cancelled by
   * the flush's answer; any other delivery finds no flush under its id and is answered with nothing (MC-R18). It is in
   * the public alphabet under D14 because `schemas.internalEvents` loses the emitted types of a spawned session in the
   * registry's `refs` under the pinned XState alpha; A10 moves it back to internal once the pin allows.
   */
  | { readonly type: 'flushExpired'; readonly requestId: string }
  /**
   * The device's choices select another kernel than the runtime's (A6e; D8, B4). The `project` child reports it; the
   * session hands it back to that child while it opens, is live, has failed or asks to close, and the child flushes what
   * the runtime owes, then builds the next runtime and stops this one. Once the close is under way it stops the child instead.
   */
  | { readonly type: 'replaceRuntime' };

/**
 * The project session machine's public alphabet: every {@link ProjectSessionMachineEvent} type, in the union's order.
 * The totality test samples each one and fails when this list and the union differ.
 *
 * @public
 */
export const projectSessionEventTypes = [
  'close',
  'confirmClose',
  'cancelClose',
  'childReady',
  'fileManagerChanged',
  'childFailed',
  'runtimeChanged',
  'chatReady',
  'chatFocused',
  'projectedRunsChanged',
  'activity',
  'visibilityChanged',
  'attention',
  'revisionState',
  'revisionChatsChanged',
  'fileCheckChanged',
  'fileCheckSlow',
  'chatRequested',
  'flushAsked',
  'runtimeFlushSettled',
  'syncQuiesced',
  'runtimeClosed',
  'parametersClosed',
  'flushExpired',
  'replaceRuntime',
] as const satisfies ReadonlyArray<ProjectSessionMachineEvent['type']>;

/** What a session tells its watchers. @public */
export type ProjectSessionMachineEmitted =
  | { readonly type: 'sessionState'; readonly projectId: string; readonly state: ProjectSessionState }
  | { readonly type: 'attention'; readonly projectId: string; readonly count: number }
  /* R3: whether this project's runtime should hold its kernel processes. The session owns the fact (hidden and idle)
   * and sends it to its own `project` child, which reaches the cad units (A7b); the emit stays for watchers. */
  | { readonly type: 'runtimeParking'; readonly projectId: string; readonly parked: boolean }
  /** A flush asked with `flushAsked` settled, or ran past its bound (A7c). */
  | {
      readonly type: 'flushSettled';
      readonly projectId: string;
      readonly requestId: string;
      readonly ok: boolean;
      readonly error?: string;
    };

/** A live project session actor. @public */
export type ProjectSessionActorRef = ActorRefFrom<typeof projectSessionMachine>;

/** The liveness idle-close window (EQ15, P23 — not D8's 5 min checkpoint cut). */
export const projectSessionIdleWindowMilliseconds = 30 * 60 * 1000;

/**
 * R3: hidden and idle for this long and the project parks its kernels.
 *
 * Short on purpose: it is about process memory, not session state, so it is two
 * minutes rather than the 30 above. Shorter re-forks on every alt-tab between
 * two projects; longer bounds nothing.
 */
export const projectSessionParkWindowMilliseconds = 2 * 60 * 1000;

/** How long a region may take to come up before the session calls it failed. */
export const projectSessionStartBoundMilliseconds = 30_000;

/** The close-flush bound, matching `packages/host`'s `closeFlushMilliseconds`. */
export const projectSessionCloseFlushMilliseconds = 5000;

/**
 * How long the runtime's producers and stores may take to write what they owe (A7c), as one state on the session's
 * clock: the producers' own confirmation bound (`slowWriteMilliseconds`, 10 s) followed by the 10 s each store wait
 * had in the persistence guard and the binding, so a producer's own, more specific refusal lands first.
 */
export const projectSessionProducerFlushMilliseconds = 20_000;

/** What a flush refusal says when the runtime's writes ran past their bound. */
const producerFlushExpired = 'Project changes are not confirmed saved.';

/*
 * P48: `opening` has no `pulling` state.
 *
 * The open pull's gate lives in `sync.machine` and the Files tree's empty
 * state (P34, amended). A second copy here waited on nothing — the subtree
 * that could answer it only mounts once the registry says the project is
 * live — so `opening` goes straight to `starting`.
 */

/* An unprovided close effect fails the close rather than pretending it ran (MC-R8, PV-S5). */
const unprovided = (name: string) => async (): Promise<never> => {
  throw new Error(`projectSessionMachine: the ${name} effect was not provided.`);
};

/** Cancel every run this session holds, so `closing` flushes what they wrote. */
const cancelRuns = createAsyncLogic<void, { projectId: string; runs: readonly string[] }>({
  run: unprovided('cancelRuns'),
});

/** Release the project-scoped agent-host registration after its work drains, once the runtime is closed. */
const releaseAgentHost = createAsyncLogic<void, { projectId: string }>({ run: unprovided('releaseAgentHost') });

/**
 * The project's children, replaceable per host (I27, A37).
 *
 * The browser gets a file-manager actor over the shared worker and a worker
 * agent-host registration; the desktop gets the same session with a Node-served
 * file manager and the always-on launcher. Same machine, different actors. Each
 * reports `childReady` or `childFailed` to this parent, and the `fileManager` child
 * also `fileManagerChanged`; the defaults here do neither, so an unprovided child
 * fails its region at the start bound rather than pretending to be up.
 */
const fileManager = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);
/* R14: no separate `editor` child. The editor actor lives inside the project
 * runtime and comes up with it; a second child relaying the same
 * region key made one report mark two children ready and told nobody anything.
 * Add it back when the editor can fail on its own. */
const project = createCallbackLogic<EventObject, { projectId: string; request?: ProjectSessionOpenRequest }>(
  () => undefined,
);
const agentHost = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);
const compute = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);

/** What the session invokes each file manager's `revisions` and `hostConnector` children with (A7b). @public */
export type ProjectSessionFileManagerInput = Readonly<{
  projectId: string;
  /** The slug of the session's own open request (B7). */
  workspace: string;
  fileManagerRef: FileManagerRef;
  syncProjectRoots: () => Promise<void>;
}>;

/* A7b: the defaults do nothing; the store module provides the lazy logic. */
const revisions = createCallbackLogic<EventObject, ProjectSessionFileManagerInput>(() => undefined);
const hostConnector = createCallbackLogic<EventObject, ProjectSessionFileManagerInput>(() => undefined);
const presence = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);
/* A7c: the default registers nothing; the store module registers it at the producer stage of `environment`. */
const unload = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);

const projectSessionActors = {
  cancelRuns,
  releaseAgentHost,
  fileManager,
  project,
  agentHost,
  compute,
  revisions,
  hostConnector,
  presence,
  fileCheck: sessionFileCheckMachine,
  unload,
};

type ProjectSessionEnqueue = EnqueueObject<
  ProjectSessionMachineEvent,
  ProjectSessionMachineEmitted,
  SystemRegistry,
  typeof projectSessionActors
>;
type ProjectSessionPatch = Partial<ProjectSessionMachineContext>;

/* One place a session says where it is: an emit for local watchers and a
 * send to the registry, which owns the live set. */
const reportState = (
  context: ProjectSessionMachineContext,
  enq: ProjectSessionEnqueue,
  state: ProjectSessionState,
): ProjectSessionPatch => {
  const frame = { type: 'sessionState', projectId: context.projectId, state } as const;
  enq.emit(frame);
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, {
      ...frame,
      runs: context.runs.length,
      dirty: context.dirty,
      pushed: context.pushed,
      pending: context.pending,
      chatReady: context.chatReady,
      availability: context.availability,
    });
  }
  return { reportedState: state };
};

/* The facts moved, not the state. The registry's policy refusal (I24, I25)
 * reads runs/dirty/pushed, so it has to hear this between state changes. */
const reportFacts = (context: ProjectSessionMachineContext, enq: ProjectSessionEnqueue): void => {
  if (context.parentRef === undefined) {
    return;
  }
  enq.sendTo(context.parentRef, {
    type: 'sessionState',
    projectId: context.projectId,
    state: context.reportedState,
    runs: context.runs.length,
    dirty: context.dirty,
    pushed: context.pushed,
    pending: context.pending,
    chatReady: context.chatReady,
    availability: context.availability,
  });
};

/* R3. Resuming a runtime that never parked is a no-op at the cad machine, so
 * the reverse side never has to know whether the grace elapsed. */
const signalRuntime = (context: ProjectSessionMachineContext, enq: ProjectSessionEnqueue, parked: boolean): void => {
  enq.emit({ type: 'runtimeParking', projectId: context.projectId, parked });
  /* S5: the session's own `project` child holds the runtime whose cad units park (A7b). */
  if (context.projectRef !== undefined) {
    enq.sendTo(context.projectRef, { type: 'runtimeParking', parked });
  }
};

/* The event names its own region (the startup regions check it), so this
 * records a failure whenever one is reported — at the start bound, or long
 * after (R4: the desktop refuses a kernel utility while the project is
 * live). The session stays where it is; only `failures` moves. */
const recordFailure = (
  context: ProjectSessionMachineContext,
  event: Extract<ProjectSessionMachineEvent, { type: 'childFailed' }>,
): ProjectSessionPatch => ({ failures: { ...context.failures, [event.region]: event.reason } });

const recordCloseFailure = (context: ProjectSessionMachineContext, error: unknown): ProjectSessionPatch => ({
  failures: {
    ...context.failures,
    close: error instanceof Error ? error.message : typeof error === 'string' ? error : 'failed',
  },
});

/** One timer per asked flush, so its answer cancels only its own (A7c). */
const flushTimerId = (requestId: string): string => `flush:${requestId}`;

/*
 * Answer one asked flush (A7c): emitted for focus's port, and sent to the `unload` child when it asked. `undefined`
 * when the session did not ask it or it already settled (MC-R18): the caller answers `{}`.
 */
const settleAskedFlush = (
  context: ProjectSessionMachineContext,
  enq: ProjectSessionEnqueue,
  { requestId, error }: Readonly<{ requestId: string; error: string | undefined }>,
): ProjectSessionPatch | undefined => {
  const kind = context.flushes[requestId];
  if (kind === undefined) {
    return undefined;
  }
  enq.cancel(flushTimerId(requestId));
  const answer = { requestId, ok: error === undefined, ...(error === undefined ? {} : { error }) };
  enq.emit({ type: 'flushSettled', projectId: context.projectId, ...answer });
  if (kind === 'unload' && context.unloadRef !== undefined) {
    enq.sendTo(context.unloadRef, { type: 'flushSettled', ...answer });
  }
  const { [requestId]: _settled, ...flushes } = context.flushes;
  return { flushes };
};

/* The next close step's request id, matched against its child's answer (I18). */
const nextCloseStep = (context: ProjectSessionMachineContext): ProjectSessionPatch & { closeStep: string } => ({
  closeStep: `close:${String(context.closeSteps + 1)}`,
  closeSteps: context.closeSteps + 1,
});

/* I23: every project-scoped resource dies with the session. Stopping the `fileManager` child stops its file manager. */
const stopChildren = (context: ProjectSessionMachineContext, enq: ProjectSessionEnqueue) => {
  /* A7c: a flush still asked is answered before its children go. The runtime that owed it is stopping: a close ran its
   * own producer flush first, and a session the registry lets go has nothing left to write through. */
  let pending: ProjectSessionMachineContext = context;
  for (const requestId of Object.keys(context.flushes)) {
    pending = { ...pending, ...settleAskedFlush(pending, enq, { requestId, error: undefined }) };
  }
  /* The runtime, the revision client and the connector read the file manager, so they stop first. */
  for (const ref of [
    context.projectRef,
    context.revisionsRef,
    context.hostConnectorRef,
    context.fileManagerChildRef,
    context.agentHostRef,
    context.computeRef,
    context.presenceRef,
    context.fileCheckRef,
    context.unloadRef,
  ]) {
    if (ref !== undefined) {
      enq.stop(ref);
    }
  }
  return {
    context: {
      flushes: {},
      closeStep: undefined,
      unloadRef: undefined,
      fileManagerChildRef: undefined,
      fileManagerRef: undefined,
      projectRef: undefined,
      runtimeRef: undefined,
      revisionsRef: undefined,
      hostConnectorRef: undefined,
      presenceRef: undefined,
      fileCheckRef: undefined,
      agentHostRef: undefined,
      computeRef: undefined,
    },
  };
};

/*
 * A14: a check starts, and the `fileCheck` child counts its patience under a new id, so a report about an earlier check
 * is dropped. A new revision client's first check makes the session `pending` at once, in the same step, so focus never
 * reads a `settled` from before it. A later check of the same client leaves availability as it is until it turns slow.
 */
const startFileCheck = (
  context: ProjectSessionMachineContext,
  enq: ProjectSessionEnqueue,
  isFirst: boolean,
): ProjectSessionPatch => {
  const fileCheckId = context.fileCheckId + 1;
  if (context.fileCheckRef !== undefined) {
    enq.sendTo(context.fileCheckRef, { type: 'checkStarted', check: fileCheckId });
  }
  const availability = isFirst ? 'pending' : 'settled';
  if (context.availability !== availability) {
    reportFacts({ ...context, availability }, enq);
  }
  return { availability, fileCheckId, fileCheckRunning: true };
};

/* A6e: the `project` child flushes what its runtime owes, then builds the next one and stops it (D8, B4). */
const handRuntimeReplacement = (
  { context }: Readonly<{ context: ProjectSessionMachineContext }>,
  enq: ProjectSessionEnqueue,
) => {
  if (context.projectRef !== undefined) {
    enq.sendTo(context.projectRef, { type: 'replaceRuntime' });
  }
  return {};
};

/* A close step that failed leaves the session failed with the reason recorded. Its children still run, so a kernel change
 * the close ignored while it ran is handed back to the `project` child (A6e). */
const closeFailed = (
  { context, event }: Readonly<{ context: ProjectSessionMachineContext; event: Readonly<{ error: unknown }> }>,
  enq: ProjectSessionEnqueue,
) => {
  handRuntimeReplacement({ context }, enq);
  return {
    target: '#project-session.failed',
    context: { ...recordCloseFailure(context, event.error), closeStep: undefined },
  } as const;
};

/*
 * The child reports each file manager it builds, and `undefined` when it closes one because the shared worker was lost
 * or replaced or the child is stopping (A6c). A stopped child tells nothing more, and `stopChildren` clears the ref
 * itself, so a report reaches only a session whose child runs.
 */
const followFileManager = (
  {
    context,
    event,
    actors,
  }: Readonly<{
    context: ProjectSessionMachineContext;
    event: Extract<ProjectSessionMachineEvent, { type: 'fileManagerChanged' }>;
    actors: typeof projectSessionActors;
  }>,
  enq: ProjectSessionEnqueue,
) => {
  /* The `project` child builds the runtime on the session's file manager (A6d). */
  if (context.projectRef !== undefined) {
    enq.sendTo(context.projectRef, { type: 'fileManagerChanged', fileManagerRef: event.fileManagerRef });
  }
  /* A7b: the revision client and the connector follow the file manager: the old one's go, the new one's start. */
  for (const ref of [context.revisionsRef, context.hostConnectorRef]) {
    if (ref !== undefined) {
      enq.stop(ref);
    }
  }
  if (event.fileManagerRef === undefined) {
    return { context: { fileManagerRef: undefined, revisionsRef: undefined, hostConnectorRef: undefined } };
  }
  const input: ProjectSessionFileManagerInput = {
    projectId: context.projectId,
    workspace: context.request?.workspace ?? '',
    fileManagerRef: event.fileManagerRef,
    syncProjectRoots: event.syncProjectRoots ?? (async () => undefined),
  };
  return {
    context: {
      /* A14: the new revision client has published nothing, so its file check is pending from here. */
      ...startFileCheck(context, enq, true),
      fileManagerRef: event.fileManagerRef,
      /* No fixed id: the next file manager's children start while the previous ones are being stopped. */
      revisionsRef: enq.spawn(actors.revisions, { input }),
      hostConnectorRef: enq.spawn(actors.hostConnector, { input }),
    },
  };
};

/** One startup region: up, failed at the bound, or failed by its child. */
const startupRegion = (region: ProjectSessionRegion) =>
  ({
    initial: 'starting',
    states: {
      starting: {
        on: {
          childReady: ({ event }: Readonly<{ event: Extract<ProjectSessionMachineEvent, { type: 'childReady' }> }>) =>
            event.region === region ? { target: 'ready' } : undefined,
          childFailed: ({
            context,
            event,
          }: Readonly<{
            context: ProjectSessionMachineContext;
            event: Extract<ProjectSessionMachineEvent, { type: 'childFailed' }>;
          }>) => (event.region === region ? { target: 'failed', context: recordFailure(context, event) } : undefined),
        },
        after: {
          startBound: {
            target: 'failed',
            context: ({ context }: Readonly<{ context: ProjectSessionMachineContext }>) => ({
              failures: { ...context.failures, [region]: 'timeout' },
            }),
          },
        },
      },
      ready: { type: 'final' },
      /* R4: the admission verdict is a region ending its start bound here, not
       * the `failures` map — a kernel refused while the session is still
       * opening is recorded at the root and is not a reason to refuse the
       * project, whose views, agent host and compute all came up. */
      failed: { type: 'final', entry: () => ({ context: { openFailed: true } }) },
    },
  }) as const;

/**
 * A close asked again once the close is committed, from the parameter service's close on: the close under way answers
 * it. Started over (quit closes every session), it would flush anew and could expire back to live while this close
 * still lands, leaving a live session whose parameter service is closed (A7c review).
 */
const ignoreCommittedClose = (): Record<string, never> => ({});

/* The close steps after `closing.asking` (which answers the dialog's `confirmClose` and `cancelClose`), where those
 * answers go unanswered. `closing.stopping` is transient (its `always` leaves at once), so no pair
 * names it: the totality test fails on a pair that names a state no event reaches. */
const closingSteps = [
  'closing.cancellingRuns',
  'closing.flushingProducers',
  'closing.closingParameters',
  'closing.flushing',
  'closing.closingRuntime',
  'closing.releasingAgentHost',
] as const;

/**
 * The (state, event) pairs this machine ignores (MC-R17).
 *
 * - `confirmClose` and `cancelClose` outside `closing.asking`: the dialog answered a question no longer asked.
 * - `activity` outside `live.idle`: it only re-arms the idle window, which runs there alone (and has no production
 *   sender, V1-6).
 * - `replaceRuntime` once the close has started cancelling runs, and when closed: a close that goes on stops the
 *   `project` child, and a close step that fails hands the replacement back as the session goes live or failed (A6e).
 *
 * @public
 */
export const projectSessionIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ...['opening', 'live', ...closingSteps, 'closed', 'failed'].flatMap((state) => [
    [state, 'confirmClose'] as const,
    [state, 'cancelClose'] as const,
  ]),
  ...['opening', 'live.busy', 'closing', 'closed', 'failed'].map((state) => [state, 'activity'] as const),
  ...[...closingSteps, 'closed'].map((state) => [state, 'replaceRuntime'] as const),
];

/**
 * One project's liveness, from the open pull to the close flush.
 *
 * @public
 */
export const projectSessionMachine = setup({
  schemas: {
    context: types<ProjectSessionMachineContext>(),
    events: eventSchemas<ProjectSessionMachineEvent>(),
    input: types<ProjectSessionMachineInput>(),
    emitted: eventSchemas<ProjectSessionMachineEmitted>(),
  },
  actors: projectSessionActors,
  delays: {
    idleWindow: ({ context }) => context.idleWindowMilliseconds,
    parkWindow: ({ context }) => context.parkWindowMilliseconds,
    startBound: ({ context }) => context.startBoundMilliseconds,
    producerFlush: ({ context }) => context.producerFlushMilliseconds,
  },
  guards: {
    /* Asking is a user verb only: a policy close never reaches a session with a
     * run (the registry refuses it first) and quit asked once, at the app. */
    shouldAsk: (context: ProjectSessionMachineContext) => context.runs.length > 0 && context.closeReason === 'user',
    /* R4: only a session that opened clears a failure. `!== 'failed'` would be
     * true all through `opening`, so a region that timed out and then reported
     * ready before its last sibling finalised would settle `failed` with an
     * empty map and a row saying nothing (V2-9). */
    hasOpened: (context: ProjectSessionMachineContext) => context.reportedState === 'live',
    /* R3: not on screen *and* not the project the person navigated to. Minimising
     * the window must not park what is still in front of them (V1-7). */
    isParkable: (context: ProjectSessionMachineContext) => !context.visible && !context.focused,
  },
}).createMachine({
  id: 'project-session',
  version: '8',
  /* A fault no transition modelled is recorded and reported once, and the session keeps answering: the first is kept,
   * later ones are usually its consequences (MC-R12, D23; B2). */
  onError: ({ context, event }, enq) => {
    if (context.fault !== undefined) {
      return {};
    }
    enq(reportAppRuntimeFault, event.error);
    return { context: { fault: faultMessage(event.error, 'project-session fault') } };
  },
  context: ({ input }) => ({
    projectId: input.projectId,
    request: input.request,
    chatReady: false,
    /* No `revisions` child yet, so no check runs; the first one makes it `pending`. */
    availability: 'settled',
    fileCheckId: 0,
    fileCheckRunning: false,
    parentRef: input.parentRef,
    idleWindowMilliseconds: input.idleWindowMilliseconds ?? projectSessionIdleWindowMilliseconds,
    parkWindowMilliseconds: input.parkWindowMilliseconds ?? projectSessionParkWindowMilliseconds,
    startBoundMilliseconds: input.startBoundMilliseconds ?? projectSessionStartBoundMilliseconds,
    closeFlushMilliseconds: input.closeFlushMilliseconds ?? projectSessionCloseFlushMilliseconds,
    producerFlushMilliseconds: input.producerFlushMilliseconds ?? projectSessionProducerFlushMilliseconds,
    flushes: {},
    closeStep: undefined,
    closeSteps: 0,
    runs: [],
    stoppableRuns: [],
    dirty: false,
    pushed: true,
    visible: false,
    focused: false,
    pending: 0,
    attention: 0,
    failures: {},
    openFailed: false,
    closeReason: undefined,
    reportedState: 'opening',
    fileManagerChildRef: undefined,
    fileManagerRef: undefined,
    projectRef: undefined,
    runtimeRef: undefined,
    revisionsRef: undefined,
    hostConnectorRef: undefined,
    presenceRef: undefined,
    fileCheckRef: undefined,
    unloadRef: undefined,
    agentHostRef: undefined,
    computeRef: undefined,
    fault: undefined,
  }),
  initial: 'opening',
  on: {
    revisionState: ({ context, event }, enq) => {
      const patch = {
        dirty: event.dirty || event.recording === true,
        pushed: event.pushed,
        pending: event.pendingCount ?? context.pending,
      };
      reportFacts({ ...context, ...patch }, enq);
      return { context: patch };
    },
    fileManagerChanged: followFileManager,
    /*
     * A7c: a leave flush (focus's port, I3) or the unload's producer stage (the `unload` child, I6) asks the `project`
     * child to write what its runtime owes, in every state. The answer is matched by id (I18) and bounded by a timer on
     * the session's clock (I15); a session with no runtime child owes nothing and answers at once.
     */
    flushAsked: ({ context, event }, enq) => {
      if (context.projectRef === undefined) {
        const flushes = { ...context.flushes, [event.requestId]: event.kind };
        return {
          context:
            settleAskedFlush({ ...context, flushes }, enq, { requestId: event.requestId, error: undefined }) ?? {},
        };
      }
      if (context.flushes[event.requestId] !== undefined) {
        return {}; // MC-R18: already asked under this id; its answer settles both.
      }
      enq.sendTo(context.projectRef, { type: 'flushRuntime', requestId: event.requestId, kind: event.kind });
      enq.raise(
        { type: 'flushExpired', requestId: event.requestId },
        { id: flushTimerId(event.requestId), delay: context.producerFlushMilliseconds },
      );
      return { context: { flushes: { ...context.flushes, [event.requestId]: event.kind } } };
    },
    /* The `project` child's answer to an asked flush; `closing.flushingProducers` matches its own step first. */
    runtimeFlushSettled: ({ context, event }, enq) => ({
      context: settleAskedFlush(context, enq, { requestId: event.requestId, error: event.error }) ?? {},
    }),
    /* The writes ran past their bound: the flush is refused, and a later answer finds nothing to settle (MC-R18). */
    flushExpired: ({ context, event }, enq) => ({
      context: settleAskedFlush(context, enq, { requestId: event.requestId, error: producerFlushExpired }) ?? {},
    }),
    /* MC-R18: a close step's answer outside its step (the step failed, timed out or was left): nothing asks it now. */
    syncQuiesced: () => ({}),
    parametersClosed: () => ({}),
    runtimeClosed: () => ({}),
    /* A14: the `revisions` child's word on the file check. A check that still runs goes on as it is: a later
     * `filesChecking` is the same wait. */
    fileCheckChanged: ({ context, event }, enq) => {
      if (!event.settled) {
        /* A check is a later one only once the check has judged one of this client's statuses (`judged`): one that
         * starts before that, as after a Tau Cloud open, is still the client's first, which the open waits for (I20). */
        return context.fileCheckRunning ? {} : { context: startFileCheck(context, enq, !event.judged) };
      }
      if (!context.fileCheckRunning) {
        /* A repeat of the settled report. */
        return {};
      }
      if (context.fileCheckRef !== undefined) {
        enq.sendTo(context.fileCheckRef, { type: 'checkSettled' });
      }
      if (context.availability !== 'settled') {
        reportFacts({ ...context, availability: 'settled' }, enq);
      }
      return { context: { availability: 'settled', fileCheckRunning: false } };
    },
    /* A14: the check has outlasted its patience. A report about a check that settled or was replaced is stale (MC-R18). */
    fileCheckSlow: ({ context, event }, enq) => {
      if (event.check !== context.fileCheckId || !context.fileCheckRunning || context.availability === 'slow') {
        return {};
      }
      reportFacts({ ...context, availability: 'slow' }, enq);
      return { context: { availability: 'slow' } };
    },
    /* S1: the `project` child retries a deferred focused chat once the chats have arrived. */
    revisionChatsChanged: ({ context, event }, enq) => {
      if (context.projectRef !== undefined) {
        enq.sendTo(context.projectRef, event);
      }
      return {};
    },
    /* The `project` child reports each runtime it builds, and `undefined` while it rebuilds one (A6d); as for the file
     * manager, a stopped child tells nothing more and `stopChildren` clears the ref. */
    runtimeChanged: ({ event }) => ({ context: { runtimeRef: event.runtimeRef } }),
    /* M2: once ready, the chat session stays ready for focus's join; the registry hears it with the other facts. */
    chatReady: ({ context }, enq) => {
      if (context.chatReady) {
        return {};
      }
      reportFacts({ ...context, chatReady: true }, enq);
      return { context: { chatReady: true } };
    },
    /* Focus shows the chat the editor focused (I18); the registry carries it to focus. */
    chatFocused: ({ context, event }, enq) => {
      if (context.parentRef !== undefined) {
        enq.sendTo(context.parentRef, {
          type: 'sessionChatFocused',
          projectId: context.projectId,
          chatId: event.chatId,
          ...(event.requestedChatId === undefined ? {} : { requestedChatId: event.requestedChatId }),
        });
      }
      return {};
    },
    /* Answered in every state: the request is a fact the session keeps, whatever it is doing (MC-R16). The editor hears
     * it through the `project` child, whether or not the session was opened with a request. */
    chatRequested: ({ context, event }, enq) => {
      if (context.projectRef !== undefined) {
        enq.sendTo(context.projectRef, event);
      }
      return context.request === undefined
        ? {}
        : { context: { request: { ...context.request, chatId: event.chatId, createdChatId: event.createdChatId } } };
    },
    attention: ({ context, event }, enq) => {
      enq.emit({ type: 'attention', projectId: context.projectId, count: event.count });
      return { context: { attention: event.count } };
    },
    close: { target: '.closing', context: ({ event }) => ({ closeReason: event.reason }) },
    /*
     * R4: a region that fails outside its start bound, at the root.
     *
     * A kernel refusal arrives whenever the broker's guard is hit: minutes into
     * `live`, or — the blueprint's own case — milliseconds after the ninth
     * project opens, while the session is still `opening` and its runtime
     * region has *already* reported ready off the manifest load. The startup
     * regions' handlers are nested deeper and still win while a region is
     * `starting`, so admission is unchanged; everywhere else these record the
     * reason the row shows and clear it when the region comes back. No state
     * moves: the project stays live and closable, and everything that is not
     * its kernel still works.
     */
    childFailed: { context: ({ context, event }) => recordFailure(context, event) },
    /* A session that never opened keeps the reason it failed with: `failed` is
     * terminal for admission (the person reopens the project, which is a new
     * session), so a region coming back afterwards must not leave a red row
     * with nothing to say. The region came up after all, so its reason goes: a
     * row that stayed red after a reconnect would outlive the thing it is about. */
    /* Before the open settles the startup regions own the report; a repeat is stale there (MC-R18). */
    childReady: ({ context, event, guards }) =>
      guards.hasOpened(context)
        ? {
            context: {
              failures: Object.fromEntries(Object.entries(context.failures).filter(([name]) => name !== event.region)),
            },
          }
        : {},
    /* Counted in every state, so a run that starts while the project opens or closes still keeps it busy (I24);
     * `live` also moves between `idle` and `busy`. */
    projectedRunsChanged: ({ context, event }, enq) => {
      reportFacts({ ...context, runs: event.runs }, enq);
      return { context: { runs: event.runs, stoppableRuns: event.stoppableRuns } };
    },
    visibilityChanged: {
      context: ({ context, event }) => ({ visible: event.visible, focused: event.focused ?? context.focused }),
    },
  },
  states: {
    opening: {
      entry: ({ context }, enq) => ({ context: reportState(context, enq, 'opening') }),
      on: { replaceRuntime: handRuntimeReplacement },
      initial: 'starting',
      states: {
        starting: {
          entry: ({ context, actors, self }, enq) => ({
            context: {
              /* A14: first, so it runs before the `fileManager` child reports the file manager a check starts on. */
              fileCheckRef: enq.spawn(actors.fileCheck, { id: 'fileCheck', input: { parentRef: self } }),
              fileManagerChildRef: enq.spawn(actors.fileManager, {
                id: 'fileManager',
                input: { projectId: context.projectId },
              }),
              projectRef: enq.spawn(actors.project, {
                id: 'project',
                input: {
                  projectId: context.projectId,
                  ...(context.request === undefined ? {} : { request: context.request }),
                },
              }),
              agentHostRef: enq.spawn(actors.agentHost, { id: 'agentHost', input: { projectId: context.projectId } }),
              computeRef: enq.spawn(actors.compute, { id: 'compute', input: { projectId: context.projectId } }),
              /* S4: visibility from `environment` and focus, with nothing mounted (A7b). */
              presenceRef: enq.spawn(actors.presence, { id: 'presence', input: { projectId: context.projectId } }),
              /* A7c: registered once at the producer stage of `environment`'s sequencer (D26), with nothing mounted. */
              unloadRef: enq.spawn(actors.unload, { id: 'unload', input: { projectId: context.projectId } }),
            },
          }),
          type: 'parallel',
          onDone: ({ context }) =>
            context.openFailed ? { target: '#project-session.failed' } : { target: '#project-session.live' },
          states: {
            views: startupRegion('views'),
            runtime: startupRegion('runtime'),
            agentHost: startupRegion('agentHost'),
            compute: startupRegion('compute'),
          },
        },
      },
    },
    live: {
      entry: ({ context }, enq) => ({ context: reportState(context, enq, 'live') }),
      initial: 'idle',
      on: {
        replaceRuntime: handRuntimeReplacement,
        projectedRunsChanged: ({ context, event }, enq) => {
          const { runs } = event;
          reportFacts({ ...context, runs }, enq);
          /* R3: a run needs the kernel back whether or not anyone is looking. */
          if (runs.length > 0) {
            signalRuntime(context, enq, false);
          }
          const patch = { runs, stoppableRuns: event.stoppableRuns };
          return runs.length === 0 ? { target: '.idle', context: patch } : { target: '.busy', context: patch };
        },
      },
      states: {
        idle: {
          /* A session that comes back live with a run still in flight — a
           * cancelled close, for instance — is busy, not idle. */
          always: ({ context }) => (context.runs.length > 0 ? { target: 'busy' } : undefined),
          /* EQ15: the liveness idle-close window. The session never closes
           * itself — it tells the registry, which applies I24/I25.
           *
           * R6: `reenter` re-arms the window. A refusal is about the facts at
           * the time; the project is still idle afterwards, so it has to be
           * offered again rather than asked once and forgotten. */
          after: {
            /* R3: the kernel processes go, the session stays. Targetless, so the
             * idle window above keeps counting its own 30 minutes; re-entering
             * `idle` (activity, visibility, or that window re-arming) rearms this
             * one, which re-offers a park a rendering unit refused. For a project
             * that just stays hidden the only re-entry is the 30-minute window, so
             * that is the re-offer interval — not "the next idle re-entry" (V1-5).
             * Giving this delay a target would reset EQ15's window, which is the
             * one thing it must not touch. */
            parkWindow: ({ context, guards }, enq) => {
              /* Answered either way (MC-R16): a visible or focused project keeps its kernel. */
              if (!guards.isParkable(context)) {
                return {};
              }
              signalRuntime(context, enq, true);
              return {};
            },
            idleWindow: ({ context }, enq) => {
              /* A visible project is never idle-closed; the window re-arms on the next hidden report. */
              if (context.visible) {
                return {};
              }
              if (context.parentRef !== undefined) {
                enq.sendTo(context.parentRef, { type: 'idleExpired', projectId: context.projectId });
              }
              return { target: 'idle', reenter: true };
            },
          },
          /* Navigation and focus only, never activity streams (A35). */
          on: {
            /* No resume here: `activity` has no production sender (V1-6). */
            activity: { target: 'idle', reenter: true },
            visibilityChanged: ({ context, event }, enq) => {
              /* Only coming back resumes: a repeated hidden report must not re-fork
               * the kernel of a project nobody is looking at (Q2). Focus counts on
               * its own, so navigating to a project while the window is still hidden
               * has its kernel by the time the window returns. */
              if (event.visible || event.focused === true) {
                signalRuntime(context, enq, false);
              }
              return {
                target: 'idle',
                reenter: true,
                context: { visible: event.visible, focused: event.focused ?? context.focused },
              };
            },
          },
        },
        busy: {},
      },
    },
    closing: {
      entry: ({ context }, enq) => {
        const cleared = {
          ...context,
          failures: Object.fromEntries(Object.entries(context.failures).filter(([name]) => name !== 'close')),
        };
        return { context: { failures: cleared.failures, ...reportState(cleared, enq, 'closing') } };
      },
      initial: 'asking',
      states: {
        asking: {
          /* A6e: a close asked again after it started lifts the hold on a replacement it ignored or held. */
          entry: ({ context }, enq) => {
            handRuntimeReplacement({ context }, enq);
          },
          always: ({ context, guards }) => (guards.shouldAsk(context) ? undefined : { target: 'cancellingRuns' }),
          on: {
            /* Nothing is flushed or stopped yet, and a cancel keeps the session live with this runtime. */
            replaceRuntime: handRuntimeReplacement,
            confirmClose: { target: 'cancellingRuns' },
            /* A6e: a close asked again after it had started holds a replacement; cancelling it hands that back. */
            cancelClose: ({ context }, enq) => {
              handRuntimeReplacement({ context }, enq);
              return { target: '#project-session.live', context: { closeReason: undefined } };
            },
          },
        },
        cancellingRuns: {
          /* A6e: a replacement handed on before the close builds nothing once its flush settles; the close stops the
           * child, and a close step that fails hands `replaceRuntime` back, which lifts the hold. */
          entry: ({ context }, enq) => {
            if (context.projectRef !== undefined) {
              enq.sendTo(context.projectRef, { type: 'holdReplacement' });
            }
          },
          invoke: {
            src: 'cancelRuns',
            input: ({ context }) => ({ projectId: context.projectId, runs: context.stoppableRuns }),
            onDone: { target: 'flushingProducers' },
            onError: closeFailed,
          },
        },
        /*
         * S6: the `project` child flushes what its runtime owes (the producers and both stores), with nothing mounted. A
         * refusal (an uncertain write, a conflict being recorded) or writes that run past their bound leave every
         * resource intact, so the project stays live with the reason recorded and the close can be retried. Nothing
         * here closes anything: the parameter service closes in the next step, which only a settled flush reaches.
         */
        flushingProducers: {
          entry: ({ context }, enq) => {
            if (context.projectRef === undefined) {
              return {};
            }
            const step = nextCloseStep(context);
            enq.sendTo(context.projectRef, { type: 'flushRuntime', requestId: step.closeStep, kind: 'close' });
            return { context: step };
          },
          /* A session whose runtime child is gone has nothing to flush. */
          always: ({ context }) => (context.projectRef === undefined ? { target: 'closingParameters' } : undefined),
          after: {
            /* A6e: a kernel change the close ignored while it ran is handed back with the session, which is live again;
             * the child replaces only a runtime whose kernel is no longer selected. */
            producerFlush: ({ context }, enq) => {
              handRuntimeReplacement({ context }, enq);
              return {
                target: '#project-session.live',
                context: {
                  ...recordCloseFailure(context, producerFlushExpired),
                  closeReason: undefined,
                  closeStep: undefined,
                },
              };
            },
          },
          on: {
            runtimeFlushSettled: ({ context, event }, enq) => {
              if (event.requestId !== context.closeStep) {
                return {
                  context: settleAskedFlush(context, enq, { requestId: event.requestId, error: event.error }) ?? {},
                };
              }
              if (event.error === undefined) {
                return { target: 'closingParameters', context: { closeStep: undefined } };
              }
              handRuntimeReplacement({ context }, enq);
              return {
                target: '#project-session.live',
                context: {
                  ...recordCloseFailure(context, event.error),
                  closeReason: undefined,
                  closeStep: undefined,
                },
              };
            },
          },
        },
        /*
         * The parameter service closes (unsaved drafts refuse it), through the `project` child, once the writes it owes
         * landed within their bound (round 1 of A7c's review). It has no bound of its own, as on main: an expired bound
         * cannot leave a live session whose parameter service then closes under it. A refusal keeps the project live.
         */
        closingParameters: {
          entry: ({ context }, enq) => {
            if (context.projectRef === undefined) {
              return {};
            }
            const step = nextCloseStep(context);
            enq.sendTo(context.projectRef, { type: 'closeParameters', requestId: step.closeStep });
            return { context: step };
          },
          always: ({ context }) => (context.projectRef === undefined ? { target: 'flushing' } : undefined),
          on: {
            close: ignoreCommittedClose,
            parametersClosed: ({ context, event }, enq) => {
              if (event.requestId !== context.closeStep) {
                return {}; // MC-R18: not this step's answer.
              }
              if (event.error === undefined) {
                return { target: 'flushing', context: { closeStep: undefined } };
              }
              handRuntimeReplacement({ context }, enq);
              return {
                target: '#project-session.live',
                context: {
                  ...recordCloseFailure(context, event.error),
                  closeReason: undefined,
                  closeStep: undefined,
                },
              };
            },
          },
        },
        /* W13's seam, called and never reimplemented: the `revisions` child quiesces the client it opened, whose
         * `close` waits for `pushSettled` or the durable queue write. R15: the bound that applies is W13's
         * `syncQuiesceMilliseconds` inside the worker's `release()`, so this state imposes none of its own. */
        flushing: {
          entry: ({ context }, enq) => {
            if (context.revisionsRef === undefined) {
              return {};
            }
            const step = nextCloseStep(context);
            enq.sendTo(context.revisionsRef, { type: 'quiesce', requestId: step.closeStep });
            return { context: step };
          },
          /* No revision client was started (no file manager yet, or a registry composed without wiring). */
          always: ({ context }) => (context.revisionsRef === undefined ? { target: 'closingRuntime' } : undefined),
          on: {
            close: ignoreCommittedClose,
            syncQuiesced: ({ context, event }, enq) => {
              if (event.requestId !== context.closeStep) {
                return {}; // MC-R18: an earlier attempt's answer; this step asks under its own id.
              }
              return event.error === undefined
                ? { target: 'closingRuntime', context: { closeStep: undefined } }
                : closeFailed({ context, event: { error: event.error } }, enq);
            },
            /* A new file manager replaces the `revisions` child this step asked. The `fileManager` child reports the old
             * one gone before the new one arrives, so the step re-enters with no client and the close goes on: the old
             * child's teardown releases its client, and the worker's own release settles its sync (W13). A file manager
             * swapped in one report re-asks the new child. */
            fileManagerChanged: (args, enq) => ({
              ...followFileManager(args, enq),
              target: 'flushing',
              reenter: true,
            }),
          },
        },
        /* The runtime's kernels shut down before the agent host goes (`closeProjectRuntime`), through its child. */
        closingRuntime: {
          entry: ({ context }, enq) => {
            if (context.projectRef === undefined) {
              return {};
            }
            const step = nextCloseStep(context);
            enq.sendTo(context.projectRef, { type: 'closeRuntime', requestId: step.closeStep });
            return { context: step };
          },
          always: ({ context }) => (context.projectRef === undefined ? { target: 'releasingAgentHost' } : undefined),
          on: {
            close: ignoreCommittedClose,
            runtimeClosed: ({ context, event }, enq) => {
              if (event.requestId !== context.closeStep) {
                return {}; // MC-R18: not this step's answer.
              }
              return event.error === undefined
                ? { target: 'releasingAgentHost', context: { closeStep: undefined } }
                : closeFailed({ context, event: { error: event.error } }, enq);
            },
          },
        },
        releasingAgentHost: {
          on: { close: ignoreCommittedClose },
          invoke: {
            src: 'releaseAgentHost',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: { target: 'stopping' },
            onError: closeFailed,
          },
        },
        stopping: {
          entry: ({ context }, enq) => stopChildren(context, enq),
          always: { target: '#project-session.closed' },
        },
      },
    },
    /*
     * Not a root `final` state: a done actor emits `xstate.done.actor` at its
     * parent, and the registry has already stopped this child by then. The
     * session rests here until the registry lets it go.
     */
    closed: {
      entry: ({ context }, enq) => {
        const patch = reportState(context, enq, 'closed');
        if (context.parentRef !== undefined) {
          enq.sendTo(context.parentRef, {
            type: 'sessionClosed',
            projectId: context.projectId,
            reason: context.closeReason ?? 'user',
          });
        }
        return { context: patch };
      },
    },
    /* A failed session keeps its children until it is closed or the registry lets it go: a kernel change still replaces
     * its runtime, which may be the remedy (a kernel refused on this device, compute moved to another, A6e). */
    failed: {
      entry: ({ context }, enq) => ({ context: reportState(context, enq, 'failed') }),
      on: { replaceRuntime: handRuntimeReplacement },
    },
  },
  exit: ({ context }, enq) => stopChildren(context, enq),
});

/** The session's one-line answer for the registry's policies (I24, I25). @public */
export const isProjectSessionClosable = (context: ProjectSessionMachineContext): boolean =>
  context.runs.length === 0 && !context.dirty && context.pushed;

/** Why a policy close was refused, for the row that shows the reason. @public */
export const projectSessionCloseRefusal = (context: ProjectSessionMachineContext): string | undefined => {
  if (context.runs.length > 0) {
    return 'running';
  }
  if (context.dirty) {
    return 'dirty';
  }
  return context.pushed ? undefined : 'unpushed';
};
