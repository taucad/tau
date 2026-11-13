/**
 * Project focus: which project the route is on, and the moves between projects (app state orchestration charter
 * D2, D3, D7, D13, D23 to D25; I2 to I4, I17, I18, I20; plan § 4 A5a; inventory S8 to S10, S12, S29 to S31, S34,
 * S38, S39). It conforms to `apps/ui/specs/project-focus/ProjectFocus.tla` with `Focus = "target"`; the rules it keeps
 * are that spec's README, "Rules the focus machine keeps (A5a)", and its five ruled statements.
 *
 * `idle → resolving → leaving → opening → focused`, with `held` for every access answer that is not ready (and for a
 * session start that failed), and `flushFailed` when the leave flush of the session being left fails.
 *
 * - **Requests.** Every route request has an id. A request for another project supersedes in any state; every answer
 *   is matched by its request id (I18) and by the library epoch it was given at.
 * - **The same project is not a new open** (D7). A request naming the project focus is on or moving to changes no
 *   state: focus takes its chat into the kept open request and, when the session is live, forwards a changed chat
 *   with `chatRequested`. No leave flush, no access question, no `resolving`.
 * - **The access answer is data.** Focus keeps the whole answer; the route-state selector reads it.
 * - **The open request** is built from a ready answer for the current epoch and kept per project. It replaces the
 *   route's `retainedKernels` (S34). It is usable only at its own epoch, so a library change drops every kept request.
 * - **Leave flush.** A move from a session starts its leave flush once the destination is ready (I3); one flush per
 *   session is in flight, and a return to the project being left keeps it. A failed one blocks in `flushFailed` until
 *   `retry` or a request for another project; a library change does not retry it (programme control's ruling, a
 *   named behaviour change). Focus never closes a session.
 * - **`opening` joins four facts** (I20): a ready answer for the current epoch, the session module, the session live
 *   in answer to focus's open, and the session's chat and first file check settled or `openPatienceMilliseconds`
 *   passed since the session reported live.
 * - **The registry's single `pendingOpen` slot.** Focus is the only sender of `open` (from A5b), so it knows which of
 *   its opens waits there. It withdraws its own waiting open (`cancelPendingOpen`) when it moves, takes a held answer
 *   or re-asks after a library change, and re-sends it when another open displaces it, when the registry drops it,
 *   or after `budgetRefused`.
 *
 * The selector reads focus's tags (MC-R28). The answer, the open, the pending open and the leave record are root keys,
 * not per-state context (MC-R26), because each one crosses state boundaries by rule: the leave record stays through
 * `held`, the pending open through a move until focus withdraws it, and the answer from `held` into `opening`.
 *
 * Every port is an actor ref from input (MC-R11, MC-R13): the library's route access, the registry, the leave flush,
 * the session module import and the route. Focus sends each its commands; their answers arrive as the public events
 * below, matched by id. Nothing here is wired yet: A5b connects the ports (plan § 4 A5b).
 *
 * The machine takes the spec's `AccessAsked`, `LeaveFlushStarted`, the settle of a move (`TLeft`), `OpenAsked` and
 * `OpenJoined` in the macrostep of the event that enables them; the conformance test applies those steps to the
 * model's state before it compares.
 */
import { z } from 'zod';
import { createActor, matchesState, setup, types } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, AnyActorRef, StateValue } from 'xstate';
import type { Project } from '@taucad/types';
import type { EventSchemaMap } from '@taucad/ui-core/lib/xstate.lib';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import { faultMessage, reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';

/**
 * How long `opening` waits for the session's chat and first file check after the session reports live, before it
 * focuses with whatever is unsettled (I20; programme control accepted 1,000 ms on 2026-11-13).
 *
 * @public
 */
export const openPatienceMilliseconds = 1000;

/** How a project URL addressed its project. @public */
export type FocusSlugs = Readonly<{ workspaceSlug: string; projectSlug: string }>;

/**
 * The library's access answer for a project URL: today's `ProjectRouteAccess`, restated here because infrastructure
 * does not import hooks (A3a's access machine will own the one type).
 *
 * @public
 */
export type FocusRouteAccess =
  | Readonly<{ status: 'ready'; project: Project }>
  | Readonly<{ status: 'trashed'; project: Project }>
  | Readonly<{ status: 'recovering'; recovery: Extract<PendingProjectRecovery, { status: 'recovering' }> }>
  | Readonly<{ status: 'recovery-failed'; recovery: Extract<PendingProjectRecovery, { status: 'failed' }> }>
  | Readonly<{ status: 'conflict' | 'unavailable' | 'missing' }>;

/** The library's access answer, or the port's failure to give one. @public */
export type FocusAccessAnswer = FocusRouteAccess | Readonly<{ status: 'error'; message: string }>;

/**
 * What focus holds as its answer: the library's answer, a project URL whose slugs name no project (`missing` with no
 * project), or a session start that failed after a ready answer (`start-failed`).
 *
 * @public
 */
export type FocusAnswer = FocusAccessAnswer | Readonly<{ status: 'start-failed' }>;

/** The native kernel a project's entry needs, and whether this host has it. @public */
export type FocusNativeKernel = Readonly<{ kernelName: string; runtimeKernelId: string; available: boolean }>;

/**
 * What every `open` carries (D7, R3-F2): the workspace slug the project was addressed by, the native kernel id its
 * entry needs, the chat the route names, and the library epoch of the ready answer it was built from (A5c).
 *
 * @public
 */
export type FocusOpenRequest = Readonly<{
  workspace: string;
  nativeKernelId?: string;
  chatId?: string;
  createdChatId?: string;
  epoch: number;
}>;

/**
 * Where a session is in the registry, as the registry's snapshot shows it: not in the live set, in it but not yet
 * live, live, closing, or failed after a close that did not finish (it then holds its slot).
 *
 * @public
 */
export type FocusSessionStatus = 'absent' | 'starting' | 'live' | 'closing' | 'failed';

/**
 * How the registry answered one `open` focus sent, matched by the open's id. The wiring reads it off the registry's
 * snapshot after the send, and again when the open waiting in `pendingOpen` is resumed, dropped or refused.
 *
 * - `live`: a spawn, a touch of a live session, or the resume of the waiting open (also `reopenRetained`);
 * - `waiting`: the open waits in `pendingOpen`;
 * - `start-failed`: the session could not start and holds no slot;
 * - `on-failed`: the open landed on a session that failed to close and holds its slot;
 * - `dropped`: the registry dropped the waiting open (stale under A5c), so focus sends it again;
 * - `refused`: `budgetRefused` named the waiting open while its project is still in the live set.
 *
 * @public
 */
export type FocusOpenResult = 'live' | 'waiting' | 'start-failed' | 'on-failed' | 'dropped' | 'refused';

/** Session availability: the first file check settled, or not yet. @public */
export type FocusAvailability = 'pending' | 'settled';

/** Commands focus sends the library's route access (A3a's access machine). @public */
export type FocusLibraryCommand =
  | Readonly<{ type: 'accessAsked'; requestId: string; projectId: string }>
  | Readonly<{ type: 'accessCancelled'; requestId: string }>;

/** Commands focus sends the registry (`sessions.machine`; the request arrives with A5c). @public */
export type FocusRegistryCommand =
  | Readonly<{ type: 'open'; projectId: string; request: FocusOpenRequest; requestId: string }>
  | Readonly<{ type: 'touch'; projectId: string }>
  | Readonly<{ type: 'cancelPendingOpen' }>
  | Readonly<{ type: 'chatRequested'; projectId: string; chatId?: string; createdChatId?: string }>;

/** The command focus sends the leave-flush port: flush the producers of the session being left. @public */
export type FocusFlushCommand = Readonly<{ type: 'leaveFlushAsked'; requestId: string; projectId: string }>;

/** The command focus sends the session module port: start the import. @public */
export type FocusModuleCommand = Readonly<{ type: 'moduleLoadAsked' }>;

/** Commands focus sends the route boundary. @public */
export type FocusRouteCommand =
  /** Show the chat the session focused, by replacing the URL (today `handleFocusedChatResolved`). */
  | Readonly<{ type: 'chatShown'; projectId: string; chatId: string }>
  /** The URL's `cloudOpen` marker was taken for this project: latch the intent and clear the marker. */
  | Readonly<{ type: 'cloudOpenTaken'; projectId: string }>;

/** The ports focus sends its commands to (MC-R11: real actor refs). @public */
export type FocusPorts = Readonly<{
  library: AnyActorRef;
  registry: AnyActorRef;
  flush: AnyActorRef;
  module: AnyActorRef;
  route: AnyActorRef;
}>;

/** What the machine reads off a ready answer's project: the native kernel its entry needs (S34). @public */
export type FocusPolicy = Readonly<{
  nativeKernelOf: (project: Project) => FocusNativeKernel | undefined;
}>;

/** Events focus accepts. @public */
export type FocusEvent =
  | Readonly<{
      type: 'routeRequested';
      requestId: string;
      slugs: FocusSlugs;
      /** Undefined while the slugs name no project yet. */
      projectId?: string;
      chatId?: string;
      createdChatId?: string;
      /** The slugs resolved and name no project. */
      slugsMissing?: boolean;
      /** The URL carries the `cloudOpen` marker. */
      cloudOpen?: boolean;
    }>
  | Readonly<{ type: 'routeLeft'; requestId: string }>
  | Readonly<{ type: 'accessAnswered'; requestId: string; epoch: number; answer: FocusAccessAnswer }>
  | Readonly<{ type: 'libraryChanged'; revision: number }>
  | Readonly<{ type: 'leaveFlushSettled'; requestId: string; ok: boolean }>
  | Readonly<{ type: 'moduleLoaded' }>
  | Readonly<{ type: 'openSettled'; requestId: string; result: FocusOpenResult }>
  | Readonly<{
      type: 'sessionFacts';
      projectId: string;
      status: FocusSessionStatus;
      chatReady: boolean;
      availability: FocusAvailability;
    }>
  | Readonly<{ type: 'focusedChatResolved'; projectId: string; chatId: string }>
  | Readonly<{ type: 'openRequested'; projectId: string }>
  | Readonly<{ type: 'retry' }>
  | Readonly<{ type: 'windowFocused' }>;

/** Focus's public alphabet, in the union's order. @public */
export const focusEventTypes = [
  'routeRequested',
  'routeLeft',
  'accessAnswered',
  'libraryChanged',
  'leaveFlushSettled',
  'moduleLoaded',
  'openSettled',
  'sessionFacts',
  'focusedChatResolved',
  'openRequested',
  'retry',
  'windowFocused',
] as const satisfies ReadonlyArray<FocusEvent['type']>;

/** What focus tells the app. @public */
export type FocusEmitted = Readonly<{
  type: 'openRefused';
  projectId: string;
  /** The library's answer; `ready` when focus has no slugs to address the project by. */
  answer: FocusAccessAnswer;
}>;

/** The `ProjectFocus.tla` action a transition refines (MC-R27); `Unmodelled` is outside the spec. @public */
export type FocusAction =
  | 'TRouteHeard'
  | 'AccessAnswered'
  | 'LibraryChanged'
  | 'LeaveFlushSettled'
  | 'ModuleLoaded'
  | 'TOpenAsked'
  | 'ChatReady'
  | 'OpenBoundPassed'
  | 'PersonOpenAsked'
  | 'TRetry'
  | 'Unmodelled';

/** The route request focus is on. @public */
export type FocusRequest = Readonly<{
  requestId: string;
  /** The route outside any project. */
  home: boolean;
  slugs?: FocusSlugs;
  projectId?: string;
  chatId?: string;
  createdChatId?: string;
  slugsMissing: boolean;
}>;

/** The answer focus holds for its request. @public */
export type FocusHeldAnswer = Readonly<{
  /** Undefined only for slugs that name no project. */
  projectId: string | undefined;
  /** The library epoch the answer was given at. */
  epoch: number;
  answer: FocusAnswer;
  kernel?: FocusNativeKernel;
}>;

/** The session focus is moving from, and its leave flush. @public */
export type FocusLeave = Readonly<{
  projectId: string;
  flush: 'none' | 'running' | 'ok' | 'failed';
  flushId?: string;
}>;

/** Focus's open of the project it is opening. @public */
export type FocusOpen = Readonly<{
  /** The open's id; undefined while no open is out. */
  openId?: string;
  /** The registry answered `live` (or `on-failed`). */
  live: boolean;
  /** The open bound passed since the session reported live. */
  patience: boolean;
  /** A person's reopen of the project focus was on. */
  person: boolean;
  /** The session reported its facts since this open was sent: only then does `absent` mean it went away (rule 11). */
  factsSeen: boolean;
}>;

/** The open focus knows waits in the registry's single `pendingOpen` slot. @public */
export type FocusPending = Readonly<{ openId: string; projectId: string; epoch: number; person: boolean }>;

/** A session's facts, as the registry reports them. @public */
export type FocusSessionFacts = Readonly<{
  status: FocusSessionStatus;
  chatReady: boolean;
  availability: FocusAvailability;
}>;

/** Focus's context. @public */
export type FocusContext = Readonly<{
  ports: FocusPorts;
  request: FocusRequest | undefined;
  /** The library epoch focus has heard of. */
  epoch: number;
  /** The access question out for the request, and the epoch it was asked at. */
  question: Readonly<{ requestId: string; epoch: number }> | undefined;
  answer: FocusHeldAnswer | undefined;
  /** The project focus last settled on (the model's `f.on`). */
  on: string | undefined;
  leave: FocusLeave | undefined;
  /** Every leave flush still running, by project: one per session (README, "one leave flush in flight"). */
  flights: Readonly<Record<string, string>>;
  /**
   * Flushes still running that started before focus joined their session again: a later leave waits for one and
   * then flushes again, because the person could edit after it started (I3).
   */
  renew: Readonly<Record<string, string>>;
  open: FocusOpen;
  pending: FocusPending | undefined;
  /**
   * The last open focus sent, focus's or a person's. Any open displaces the registry's single slot, so a `waiting`
   * reply for an earlier one names an open the slot no longer holds.
   */
  lastSent: Readonly<{ openId: string; projectId: string; epoch: number }> | undefined;
  module: 'unloaded' | 'loading' | 'loaded';
  facts: Readonly<Record<string, FocusSessionFacts>>;
  /** The open request focus last built per project, kept for a person's open (S34, S39). */
  kept: Readonly<Record<string, FocusOpenRequest>>;
  /** The chat each session was last given, by its open or by `chatRequested`. */
  forwarded: Readonly<Record<string, Readonly<{ chatId?: string; createdChatId?: string }>>>;
  /** The slugs each project was last addressed by. */
  slugsOf: Readonly<Record<string, FocusSlugs>>;
  /** Person opens out, by open id, and access questions a person's open asked, by request id. */
  personOpens: Readonly<Record<string, string>>;
  personAsks: Readonly<Record<string, string>>;
  /** The request whose `cloudOpen` marker focus has taken. */
  cloudOpenTaken: string | undefined;
  /** The counter every id focus mints is taken from. */
  serial: number;
  /** The first effect or child failure no transition modelled (D23). */
  fault: string | undefined;
}>;

/**
 * The categories the route-state selector asks about (MC-R28): a session focus opens or is on, focused, held on a
 * non-ready answer, and blocked on a failed leave flush.
 *
 * @public
 */
export type FocusTag = 'on-project' | 'focused' | 'held' | 'flush-failed';

/** Input focus is created with. @public */
export type FocusInput = Readonly<{ ports: FocusPorts; epoch?: number }>;

type State = 'idle' | 'resolving' | 'leaving' | 'opening' | 'focused' | 'held' | 'flushFailed';

/** The states the model calls `TWaiting`: focus waits on an answer for its request. */
const waitingStates: ReadonlySet<State> = new Set(['resolving', 'leaving', 'opening', 'focused', 'held']);

/**
 * The (state, event) pairs focus leaves unanswered (MC-R17):
 *
 * - `retry` outside `held` and `flushFailed`: nothing failed;
 * - `windowFocused` outside `opening` and `focused`: no ready project to touch.
 *
 * @public
 */
export const focusIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ...['idle', 'resolving', 'leaving', 'opening.pending', 'opening.live', 'focused'].map(
    (state) => [state, 'retry'] as const,
  ),
  ...['idle', 'resolving', 'leaving', 'held', 'flushFailed'].map((state) => [state, 'windowFocused'] as const),
];

const slugsSchema = z.object({ workspaceSlug: z.string(), projectSlug: z.string() });
const accessAnswerSchema = z.custom<FocusAccessAnswer>(
  (value) => typeof value === 'object' && value !== null && typeof (value as { status?: unknown }).status === 'string',
);

const focusEventSchemas = {
  routeRequested: z.object({
    requestId: z.string(),
    slugs: slugsSchema,
    projectId: z.string().optional(),
    chatId: z.string().optional(),
    createdChatId: z.string().optional(),
    slugsMissing: z.boolean().optional(),
    cloudOpen: z.boolean().optional(),
  }),
  routeLeft: z.object({ requestId: z.string() }),
  accessAnswered: z.object({ requestId: z.string(), epoch: z.number(), answer: accessAnswerSchema }),
  libraryChanged: z.object({ revision: z.number() }),
  leaveFlushSettled: z.object({ requestId: z.string(), ok: z.boolean() }),
  moduleLoaded: z.object({}),
  openSettled: z.object({
    requestId: z.string(),
    result: z.enum(['live', 'waiting', 'start-failed', 'on-failed', 'dropped', 'refused']),
  }),
  sessionFacts: z.object({
    projectId: z.string(),
    status: z.enum(['absent', 'starting', 'live', 'closing', 'failed']),
    chatReady: z.boolean(),
    availability: z.enum(['pending', 'settled']),
  }),
  focusedChatResolved: z.object({ projectId: z.string(), chatId: z.string() }),
  openRequested: z.object({ projectId: z.string() }),
  retry: z.object({}),
  windowFocused: z.object({}),
} satisfies Record<FocusEvent['type'], z.ZodType>;

/**
 * The runtime schemas, typed as the exported unions.
 * ponytail: alpha.59 makes a Zod schema's optional keys required in the inferred event (MC-R30), and
 * `routeRequested` has five; drop the cast when xstate keeps optional keys.
 */
// oxlint-disable-next-line typescript/consistent-type-assertions -- see above; `validated()` still checks the Zod values.
const focusEvents = focusEventSchemas as unknown as EventSchemaMap<FocusEvent>;

const focusEmittedSchemas = {
  openRefused: z.object({ projectId: z.string(), answer: accessAnswerSchema }),
} satisfies Record<FocusEmitted['type'], z.ZodType>;

// oxlint-disable-next-line typescript/consistent-type-assertions -- as `focusEvents`.
const focusEmitted = focusEmittedSchemas as unknown as EventSchemaMap<FocusEmitted>;

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes; drop the cast when xstate types it.
 *
 * @param tla - The `ProjectFocus.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 */
const refines = <F>(tla: FocusAction, to: F): F =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

/** Every command focus sends a port. */
type FocusCommand =
  | FocusLibraryCommand
  | FocusRegistryCommand
  | FocusFlushCommand
  | FocusModuleCommand
  | FocusRouteCommand;

/** The effects a transition queues: the sends to the ports and the one emitted refusal. */
type Effects = Readonly<{
  sendTo: (ref: AnyActorRef, event: FocusCommand) => void;
  emit: (event: FocusEmitted) => void;
}>;

type Context = FocusContext;
/** What a helper reads to take one step: the context before it, the state it starts in, and the effects queue. */
type Step = Readonly<{ context: Context; state: State; effects: Effects }>;
type Patch = { -readonly [K in keyof Context]: Context[K] };

const noOpen: FocusOpen = { live: false, patience: false, person: false, factsSeen: false };

/** The state a snapshot value names, without `opening`'s substate. */
const stateOf = (value: StateValue): State => (typeof value === 'string' ? value : Object.keys(value)[0]) as State;

/** Two requests name the same project, or, while neither names one, the same slugs (D7). */
const sameProject = (left: FocusRequest, right: FocusRequest): boolean => {
  if (left.home || right.home) {
    return left.home && right.home;
  }
  if (left.projectId !== undefined || right.projectId !== undefined) {
    return left.projectId === right.projectId;
  }
  return (
    left.slugs?.workspaceSlug === right.slugs?.workspaceSlug && left.slugs?.projectSlug === right.slugs?.projectSlug
  );
};

const sameSlugs = (left: FocusSlugs | undefined, right: FocusSlugs | undefined): boolean =>
  left !== undefined && left.workspaceSlug === right?.workspaceSlug && left.projectSlug === right.projectSlug;

/** Focus holds an answer for the library's current epoch (the model's `Fresh`). */
const isFresh = (context: Context): boolean => context.answer !== undefined && context.answer.epoch === context.epoch;

const isReady = (context: Context): boolean => context.answer?.answer.status === 'ready';

/** Focus's own open waits in `pendingOpen` for the project it is opening (the model's `FocusPending`). */
const focusPending = (context: Context, state: State): boolean =>
  context.pending !== undefined &&
  !context.pending.person &&
  state === 'opening' &&
  context.open.openId === context.pending.openId;

/** The session being left owes no leave flush: there is none, it flushed, or it is gone (the model's `LeaveDone`). */
const leaveDone = (context: Context): boolean =>
  context.leave === undefined ||
  context.leave.flush === 'ok' ||
  context.facts[context.leave.projectId]?.status === 'absent';

/** A session the leave flush can run on: live or failed (the model's `Closeable`); unreported counts as live. */
const closeable = (context: Context, projectId: string): boolean => {
  const status = context.facts[projectId]?.status;
  return status === undefined || status === 'live' || status === 'failed' || status === 'starting';
};

const nextId = (context: Patch, prefix: string): string => {
  context.serial += 1;
  return `${prefix}:${context.serial}`;
};

const sendRegistry = (effects: Effects, context: Context, command: FocusRegistryCommand): void => {
  effects.sendTo(context.ports.registry, command);
};

/** Start the session module import once, beside the first project request (S31). */
const warm = (context: Patch, effects: Effects): void => {
  if (context.module === 'unloaded') {
    context.module = 'loading';
    effects.sendTo(context.ports.module, { type: 'moduleLoadAsked' } satisfies FocusModuleCommand);
  }
};

/** Withdraw the open waiting in `pendingOpen` (the registry's `cancelPendingOpen`). */
const withdraw = (context: Patch, effects: Effects): void => {
  if (context.pending !== undefined) {
    sendRegistry(effects, context, { type: 'cancelPendingOpen' });
    context.pending = undefined;
  }
};

/** The open request for `projectId` from the ready answer focus holds and its route request. */
const buildRequest = (context: Context, projectId: string, workspace: string): FocusOpenRequest => {
  const { answer, request } = context;
  const nativeKernelId = answer?.kernel?.runtimeKernelId;
  const onRequest = request?.projectId === projectId;
  return {
    workspace,
    ...(nativeKernelId === undefined ? {} : { nativeKernelId }),
    ...(onRequest && request.chatId !== undefined ? { chatId: request.chatId } : {}),
    ...(onRequest && request.createdChatId !== undefined ? { createdChatId: request.createdChatId } : {}),
    epoch: answer?.epoch ?? context.epoch,
  };
};

const withoutKey = <T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));

/** Send an open and record what the session is given. */
const sendOpen = (
  context: Patch,
  effects: Effects,
  { projectId, request, prefix }: Readonly<{ projectId: string; request: FocusOpenRequest; prefix: 'open' | 'person' }>,
): string => {
  const openId = nextId(context, prefix);
  /* Any open displaces the single slot: a wait keeps only the latest destination, and a spawn or a touch clears it
   * (`sessions.machine.ts`). The registry says nothing to the displaced open's sender, so focus, which sends every
   * open, derives it (rule 9). */
  if (context.pending !== undefined && context.pending.projectId !== projectId) {
    if (!context.pending.person && context.open.openId === context.pending.openId) {
      context.open = { ...context.open, openId: undefined };
    }
    context.pending = undefined;
  }
  sendRegistry(effects, context, { type: 'open', projectId, request, requestId: openId });
  context.lastSent = { openId, projectId, epoch: request.epoch };
  context.kept = { ...context.kept, [projectId]: request };
  context.forwarded = {
    ...context.forwarded,
    [projectId]: {
      ...(request.chatId === undefined ? {} : { chatId: request.chatId }),
      ...(request.createdChatId === undefined ? {} : { createdChatId: request.createdChatId }),
    },
  };
  return openId;
};

/** Forward the request's chat to a live session when it differs from what the session was last given (rule 2). */
const forwardChat = (context: Patch, effects: Effects, projectId: string): void => {
  const { request } = context;
  if (request?.projectId !== projectId) {
    return;
  }
  const given = context.forwarded[projectId];
  if (given?.chatId === request.chatId && given?.createdChatId === request.createdChatId) {
    return;
  }
  sendRegistry(effects, context, {
    type: 'chatRequested',
    projectId,
    ...(request.chatId === undefined ? {} : { chatId: request.chatId }),
    ...(request.createdChatId === undefined ? {} : { createdChatId: request.createdChatId }),
  });
  context.forwarded = {
    ...context.forwarded,
    [projectId]: {
      ...(request.chatId === undefined ? {} : { chatId: request.chatId }),
      ...(request.createdChatId === undefined ? {} : { createdChatId: request.createdChatId }),
    },
  };
};

/** Settle `opening` on the project: the model's `OpenJoined`, `OpenLost` and `OpenOnFailed` end the move here. */
const settleOn = (context: Patch, projectId: string): State => {
  context.on = projectId;
  context.leave = undefined;
  const running = context.flights[projectId];
  if (running !== undefined) {
    context.renew = { ...context.renew, [projectId]: running };
  }
  return 'focused';
};

/**
 * The steps focus takes as soon as they are enabled, in the macrostep of the event that enabled them: the model's
 * `TAccessAsked`, `TLeaveFlushStarted`, `TLeft`, `TOpenAsked`, `TOpenJoined`, `TOpenLost` and `TOpenOnFailed`.
 */
// oxlint-disable-next-line complexity -- One loop over the model's enabled focus steps; splitting it hides their order.
const advance = (context: Patch, start: State, effects: Effects): State => {
  let state = start;
  for (let step = 0; step < 8; step += 1) {
    const before = state;
    const { request } = context;
    const projectId = request?.projectId;
    // TAccessAsked: once per request id, and again once the epoch moved since the question or the answer.
    if (
      waitingStates.has(state) &&
      request !== undefined &&
      projectId !== undefined &&
      !isFresh(context) &&
      !(context.question?.requestId === request.requestId && context.question.epoch === context.epoch)
    ) {
      /* The re-ask is where focus notices a library change: it withdraws its own waiting open, and any open of its
       * waiting from an older epoch, and opens again only from the fresh answer (rule 9). */
      const own = focusPending(context, state);
      if (context.pending !== undefined && (context.pending.epoch !== context.epoch || own)) {
        withdraw(context, effects);
        if (own) {
          context.open = { ...context.open, openId: undefined };
        }
      }
      effects.sendTo(context.ports.library, {
        type: 'accessAsked',
        requestId: request.requestId,
        projectId,
      } satisfies FocusLibraryCommand);
      context.question = { requestId: request.requestId, epoch: context.epoch };
      warm(context, effects);
    }
    // TLeaveFlushStarted: the destination is ready and the session being left still owes its flush.
    if (state === 'leaving' && context.leave?.flush === 'none' && closeable(context, context.leave.projectId)) {
      const from = context.leave.projectId;
      /* One flush per session in flight: a flush still running for this session, started before a return to it, is
       * the one focus waits for (README, "one leave flush in flight across a return"). */
      const running = context.flights[from];
      /* A flush that started before focus joined the session again does not cover what the person did since: wait
       * for it, then flush again (its settle frees the flight and re-enters this step). */
      if (running === undefined || context.renew[from] !== running) {
        const flushId = running ?? nextId(context, 'flush');
        if (running === undefined) {
          effects.sendTo(context.ports.flush, {
            type: 'leaveFlushAsked',
            requestId: flushId,
            projectId: from,
          } satisfies FocusFlushCommand);
          context.flights = { ...context.flights, [from]: flushId };
        }
        context.leave = { projectId: from, flush: 'running', flushId };
      }
    }
    // TLeft: the session being left closed while focus waited; its close flush ran in place of the leave flush.
    if (state === 'leaving' && context.leave?.flush !== 'running' && leaveDone(context)) {
      state = request?.home === true ? 'idle' : 'opening';
    }
    // TOpenAsked: the open carries the request built from the current ready answer (D7).
    if (state === 'opening' && context.open.openId === undefined && isReady(context) && isFresh(context)) {
      const target = context.answer?.projectId;
      if (target !== undefined) {
        const workspace = context.slugsOf[target]?.workspaceSlug ?? '';
        const openId = sendOpen(context, effects, {
          projectId: target,
          request: buildRequest(context, target, workspace),
          prefix: 'open',
        });
        context.open = { openId, live: false, patience: false, person: false, factsSeen: false };
      }
    }
    // The join (I20), or the session focus opened went away or failed before it.
    if (state === 'opening' && context.open.live && isReady(context)) {
      const target = context.answer?.projectId;
      const facts = target === undefined ? undefined : context.facts[target];
      if (target !== undefined && facts !== undefined) {
        if ((facts.status === 'absent' || facts.status === 'failed') && context.open.factsSeen) {
          state = settleOn(context, target);
        } else if (
          facts.status === 'live' &&
          isFresh(context) &&
          context.module === 'loaded' &&
          ((facts.chatReady && facts.availability === 'settled') || context.open.patience)
        ) {
          forwardChat(context, effects, target);
          state = settleOn(context, target);
        }
      }
    }
    if (state === before) {
      return state;
    }
  }
  return state;
};

/** The state value for a state: `opening` is `live` once focus's open went live and the session reports live. */
const valueOf = (context: Context, state: State): string => {
  if (state !== 'opening') {
    return state;
  }
  const target = context.answer?.projectId;
  return context.open.live && target !== undefined && context.facts[target]?.status === 'live'
    ? 'opening.live'
    : 'opening.pending';
};

/**
 * A transition's result: `state` is entered only when it differs from the current value, so `opening.live`'s open
 * bound keeps counting across the events it takes.
 */
const result = (value: StateValue, context: Context, state: State): { target?: string; context: Context } => {
  const next = valueOf(context, state);
  return matchesState(next, value) ? { context } : { target: `#focus.${next}`, context };
};

type TransitionArgs = Readonly<{ context: Context; value: StateValue }>;
type Enq = Readonly<{
  sendTo: (ref: AnyActorRef, event: FocusCommand) => void;
  emit: (event: FocusEmitted) => void;
}>;

const effectsOf = (enq: Enq): Effects => ({
  sendTo: (ref, event) => {
    enq.sendTo(ref, event);
  },
  emit: (event) => {
    enq.emit(event);
  },
});

/** Build focus's machine over the policy that reads a ready project (MC-R4's composition passes the app's). */
// oxlint-disable-next-line max-lines-per-function, @typescript-eslint/explicit-module-boundary-types -- One machine: its transitions are the model's focus actions, and its type is what `setup` infers.
export const createFocusMachine = (policy: FocusPolicy) => {
  /** Hear a route request (the model's `TRouteHeard`). */
  // oxlint-disable-next-line complexity -- The model's one action, with its two branches.
  const heard = (
    { context, state, effects }: Step,
    next: FocusRequest,
    cloudOpen: boolean,
  ): { patch: Patch; state: State } => {
    const patch: Patch = { ...context };
    /* The retained route: a renamed directory's slugs stop resolving for a moment, and the path the route still shows
     * keeps the project it named (today's `retainedRoute`, S30). */
    const retained =
      !next.home && next.projectId === undefined && sameSlugs(context.request?.slugs, next.slugs)
        ? context.request?.projectId
        : undefined;
    const request: FocusRequest = retained === undefined ? next : { ...next, projectId: retained, slugsMissing: false };
    const { projectId } = request;
    if (projectId !== undefined && request.slugs !== undefined) {
      patch.slugsOf = { ...context.slugsOf, [projectId]: request.slugs };
    }
    if (cloudOpen && projectId !== undefined && context.cloudOpenTaken !== request.requestId) {
      patch.cloudOpenTaken = request.requestId;
      effects.sendTo(context.ports.route, { type: 'cloudOpenTaken', projectId } satisfies FocusRouteCommand);
    }
    if (!request.home) {
      warm(patch, effects);
    }
    if (context.request !== undefined && sameProject(context.request, request) && (state !== 'idle' || request.home)) {
      // Rule 2: the same project is not a move. The chat travels into the kept request and to a live session.
      patch.request = request;
      /* The question out was asked under the previous request id, whose answer is now stale (I18): focus asks again
       * under the new id unless it already holds a fresh answer (`TAccessAsked`). */
      if (context.question !== undefined && context.question.requestId !== request.requestId) {
        effects.sendTo(context.ports.library, {
          type: 'accessCancelled',
          requestId: context.question.requestId,
        } satisfies FocusLibraryCommand);
        patch.question = undefined;
      }
      if (projectId !== undefined) {
        const kept = context.kept[projectId];
        if (kept !== undefined) {
          const { chatId: _chat, createdChatId: _created, ...rest } = kept;
          patch.kept = {
            ...context.kept,
            [projectId]: {
              ...rest,
              ...(request.chatId === undefined ? {} : { chatId: request.chatId }),
              ...(request.createdChatId === undefined ? {} : { createdChatId: request.createdChatId }),
            },
          };
        }
        const live = context.facts[projectId]?.status === 'live';
        if (live && (state === 'focused' || (state === 'opening' && context.open.live))) {
          forwardChat(patch, effects, projectId);
        }
      } else if (request.slugsMissing && state === 'resolving') {
        patch.answer = { projectId: undefined, epoch: context.epoch, answer: { status: 'missing' } };
        return { patch, state: 'held' };
      }
      return { patch, state };
    }
    // Rule 3: another project starts a move from the session focus was on.
    const from = context.on !== undefined && context.on !== projectId ? context.on : undefined;
    const leave: FocusLeave | undefined =
      from === undefined
        ? undefined
        : context.leave?.projectId === from && context.leave.flush !== 'failed'
          ? context.leave
          : { projectId: from, flush: 'none' };
    if (focusPending(context, state)) {
      withdraw(patch, effects);
    }
    if (context.question !== undefined && context.question.requestId !== request.requestId) {
      effects.sendTo(context.ports.library, {
        type: 'accessCancelled',
        requestId: context.question.requestId,
      } satisfies FocusLibraryCommand);
    }
    patch.request = request;
    patch.question = undefined;
    patch.answer = undefined;
    patch.leave = leave;
    patch.open = noOpen;
    if (request.home) {
      return { patch, state: from === undefined ? 'idle' : 'leaving' };
    }
    if (projectId === undefined && request.slugsMissing) {
      patch.answer = { projectId: undefined, epoch: context.epoch, answer: { status: 'missing' } };
      return { patch, state: 'held' };
    }
    return { patch, state: 'resolving' };
  };

  /** Take the access answer for focus's request (the model's `TAnswered`). */
  // oxlint-disable-next-line complexity -- The model's one action: the answer, the next state, the kept request and the withdraw.
  const answered = (
    { context, state, effects }: Step,
    answer: FocusAccessAnswer,
    epoch: number,
  ): { patch: Patch; state: State } => {
    const patch: Patch = { ...context, epoch: Math.max(context.epoch, epoch), question: undefined };
    const projectId = context.request?.projectId;
    if (projectId === undefined) {
      return { patch, state };
    }
    const ready = answer.status === 'ready';
    const kernel = answer.status === 'ready' ? policy.nativeKernelOf(answer.project) : undefined;
    patch.answer = { projectId, epoch, answer, ...(kernel === undefined ? {} : { kernel }) };
    let next: State = state;
    if (!ready) {
      next = 'held';
    } else if (state === 'resolving' || state === 'held') {
      next = leaveDone(context) ? 'opening' : context.leave?.flush === 'failed' ? 'flushFailed' : 'leaving';
    }
    if (next === 'held') {
      patch.open = noOpen;
    }
    if (ready) {
      const workspace = context.slugsOf[projectId]?.workspaceSlug ?? '';
      patch.kept = { ...patch.kept, [projectId]: buildRequest(patch, projectId, workspace) };
    } else {
      patch.kept = withoutKey(patch.kept, projectId);
    }
    /* Withdraw a waiting open that no longer stands: focus's own once it stops opening from this answer
     * (`PendingAfter`), and any other once the request kept for its project is no longer at its epoch
     * (`StandingAfter`), unless focus is opening that project from this answer. */
    const { pending } = patch;
    if (pending !== undefined) {
      const own = !pending.person && context.open.openId === pending.openId;
      const stillOpening = next === 'opening' || next === 'leaving' || next === 'focused';
      const opensIt = next === 'opening' && patch.open.openId !== undefined && pending.projectId === projectId;
      const standing = opensIt || patch.kept[pending.projectId]?.epoch === pending.epoch;
      if ((own && !stillOpening) || (!own && !standing)) {
        withdraw(patch, effects);
      }
    }
    return { patch, state: next };
  };

  /**
   * Send a person's open and say what it does to focus (`PersonOpenAsked`): a reopen of the focused project joins its
   * facts again, and an open of the project focus is opening takes the slot in place of focus's own, so focus waits
   * for that open's reply instead (the model's `FocusPending` is by project).
   */
  const personOpen = (
    { context, state, effects }: Readonly<{ context: Patch; state: State; effects: Effects }>,
    projectId: string,
    request: FocusOpenRequest,
  ): State => {
    const opening = state === 'opening' && context.open.openId !== undefined && !context.open.live;
    const openId = sendOpen(context, effects, { projectId, request, prefix: 'person' });
    context.personOpens = { ...context.personOpens, [openId]: projectId };
    if (context.answer?.projectId !== projectId) {
      return state;
    }
    if (state === 'focused') {
      context.open = { openId, live: false, patience: false, person: true, factsSeen: false };
      return 'opening';
    }
    if (opening) {
      context.open = { ...context.open, openId, factsSeen: false };
      if (context.pending?.projectId === projectId) {
        context.pending = undefined;
      }
    }
    return state;
  };

  /** A person's open asked the library first: open on `ready`, otherwise report the refusal. */
  const personAnswered = (
    { context, value, effects }: Readonly<{ context: Context; value: StateValue; effects: Effects }>,
    projectId: string,
    event: Extract<FocusEvent, { type: 'accessAnswered' }>,
  ): { target?: string; context: Context } => {
    const patch: Patch = { ...context, personAsks: withoutKey(context.personAsks, event.requestId) };
    const slugs = context.slugsOf[projectId];
    if (event.epoch < context.epoch) {
      // MC-R18: an answer from before a library change says nothing now. Ask again at the current epoch.
      const requestId = nextId(patch, 'person');
      patch.personAsks = { ...patch.personAsks, [requestId]: projectId };
      effects.sendTo(context.ports.library, {
        type: 'accessAsked',
        requestId,
        projectId,
      } satisfies FocusLibraryCommand);
      return { context: patch };
    }
    if (event.answer.status !== 'ready' || slugs === undefined) {
      effects.emit({ type: 'openRefused', projectId, answer: event.answer });
      return { context: patch };
    }
    const kernel = policy.nativeKernelOf(event.answer.project);
    const request: FocusOpenRequest = {
      workspace: slugs.workspaceSlug,
      ...(kernel === undefined ? {} : { nativeKernelId: kernel.runtimeKernelId }),
      epoch: event.epoch,
    };
    const next = personOpen({ context: patch, state: stateOf(value), effects }, projectId, request);
    return result(value, patch, advance(patch, next, effects));
  };

  return setup({
    schemas: {
      context: types<FocusContext>(),
      events: focusEvents,
      input: types<FocusInput>(),
      emitted: focusEmitted,
      transitionMeta: types<{ tla: FocusAction }>(),
      tags: types<FocusTag>(),
    },
    delays: { openPatience: openPatienceMilliseconds },
  }).createMachine({
    id: 'focus',
    version: '1',
    /* A fault no transition modelled is recorded and reported once, and focus keeps answering (MC-R12, D23). */
    onError: refines('Unmodelled', ({ context, event }: { context: Context; event: { error: unknown } }, enq) => {
      if (context.fault !== undefined) {
        return {};
      }
      enq(reportAppRuntimeFault, event.error);
      return { context: { fault: faultMessage(event.error, 'focus fault') } };
    }),
    context: ({ input }: { input: FocusInput }) => ({
      ports: input.ports,
      request: undefined,
      epoch: input.epoch ?? 0,
      question: undefined,
      answer: undefined,
      on: undefined,
      leave: undefined,
      flights: {},
      renew: {},
      open: noOpen,
      pending: undefined,
      lastSent: undefined,
      module: 'unloaded',
      facts: {},
      kept: {},
      forwarded: {},
      slugsOf: {},
      personOpens: {},
      personAsks: {},
      cloudOpenTaken: undefined,
      serial: 0,
      fault: undefined,
    }),
    initial: 'idle',
    on: {
      routeRequested: refines(
        'TRouteHeard',
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'routeRequested' }> },
          enq: Enq,
        ) => {
          const effects = effectsOf(enq);
          const state = stateOf(value);
          const next: FocusRequest = {
            requestId: event.requestId,
            home: false,
            slugs: event.slugs,
            ...(event.projectId === undefined ? {} : { projectId: event.projectId }),
            ...(event.chatId === undefined ? {} : { chatId: event.chatId }),
            ...(event.createdChatId === undefined ? {} : { createdChatId: event.createdChatId }),
            slugsMissing: event.slugsMissing === true,
          };
          const heardRequest = heard({ context, state, effects }, next, event.cloudOpen === true);
          return result(value, heardRequest.patch, advance(heardRequest.patch, heardRequest.state, effects));
        },
      ),
      routeLeft: refines(
        'TRouteHeard',
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'routeLeft' }> },
          enq: Enq,
        ) => {
          const effects = effectsOf(enq);
          const state = stateOf(value);
          const left = heard(
            { context, state, effects },
            { requestId: event.requestId, home: true, slugsMissing: false },
            false,
          );
          return result(value, left.patch, advance(left.patch, left.state, effects));
        },
      ),
      accessAnswered: refines(
        'AccessAnswered',
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'accessAnswered' }> },
          enq: Enq,
        ) => {
          const effects = effectsOf(enq);
          const state = stateOf(value);
          const asker = context.personAsks[event.requestId];
          if (asker !== undefined) {
            return personAnswered({ context, value, effects }, asker, event);
          }
          /* MC-R18: only the answer to the request focus is on, given at the epoch focus knows or a later one. An
           * answer from an older epoch is stale: the re-ask that epoch's change caused is already out. */
          const { question } = context;
          if (
            !waitingStates.has(state) ||
            event.requestId !== context.request?.requestId ||
            question?.requestId !== event.requestId ||
            event.epoch < Math.max(context.epoch, question.epoch)
          ) {
            // ...and only while that question is out: a re-delivery, or the answer to an ask a re-ask replaced.
            return {};
          }
          const { patch, state: next } = answered({ context, state, effects }, event.answer, event.epoch);
          return result(value, patch, advance(patch, next, effects));
        },
      ),
      libraryChanged: refines(
        'LibraryChanged',
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'libraryChanged' }> },
          enq: Enq,
        ) => {
          if (event.revision <= context.epoch) {
            // MC-R18: a revision focus already knows is a re-delivery.
            return {};
          }
          const effects = effectsOf(enq);
          const patch: Patch = { ...context, epoch: event.revision };
          return result(value, patch, advance(patch, stateOf(value), effects));
        },
      ),
      leaveFlushSettled: refines(
        'LeaveFlushSettled',
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'leaveFlushSettled' }> },
          enq: Enq,
        ) => {
          const flight = Object.entries(context.flights).find(([, flushId]) => flushId === event.requestId);
          const mine = context.leave?.flushId === event.requestId && context.leave.flush === 'running';
          if (flight === undefined && !mine) {
            // MC-R18: a flush focus did not ask for, or one that already settled.
            return {};
          }
          const effects = effectsOf(enq);
          const state = stateOf(value);
          const patch: Patch = {
            ...context,
            flights: flight === undefined ? context.flights : withoutKey(context.flights, flight[0]),
            renew: flight === undefined ? context.renew : withoutKey(context.renew, flight[0]),
          };
          let next = state;
          if (mine) {
            patch.leave = { ...context.leave, flush: event.ok ? 'ok' : 'failed' };
            if (state === 'leaving') {
              next = event.ok ? (context.request?.home === true ? 'idle' : 'opening') : 'flushFailed';
            }
          }
          return result(value, patch, advance(patch, next, effects));
        },
      ),
      moduleLoaded: refines('ModuleLoaded', ({ context, value }: TransitionArgs, enq: Enq) => {
        if (context.module === 'loaded') {
          // MC-R18: a re-delivery.
          return {};
        }
        const patch: Patch = { ...context, module: 'loaded' };
        return result(value, patch, advance(patch, stateOf(value), effectsOf(enq)));
      }),
      openSettled: refines(
        'TOpenAsked',
        // oxlint-disable-next-line complexity -- One registry answer per open result, each a row of the model's `Outcomes`.
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'openSettled' }> },
          enq: Enq,
        ) => {
          const effects = effectsOf(enq);
          const state = stateOf(value);
          const patch: Patch = { ...context };
          const own = context.open.openId === event.requestId;
          const personProject = context.personOpens[event.requestId];
          /* Any open displaces the registry's single slot, and the reply can arrive after focus sent another: a wait
           * for an open that is not the last one sent is already displaced (rule 9). */
          const latest = context.lastSent?.openId === event.requestId;
          if (event.result === 'waiting' && !latest) {
            if (own) {
              patch.open = { ...context.open, openId: undefined };
              return result(value, patch, advance(patch, state, effects));
            }
            return personProject === undefined
              ? {}
              : { context: { personOpens: withoutKey(context.personOpens, event.requestId) } };
          }
          if (!own && personProject === undefined) {
            if (event.result === 'waiting') {
              /* Focus's own open from before it moved waits in the slot: withdraw it, since focus no longer opens
               * that project from that answer (rule 9, `PendingAfter`). */
              sendRegistry(effects, context, { type: 'cancelPendingOpen' });
              return {};
            }
            // MC-R18: an open focus no longer stands behind (displaced, withdrawn or superseded).
            return {};
          }
          if (personProject !== undefined && (event.result !== 'waiting' || !own)) {
            patch.personOpens =
              event.result === 'waiting' ? context.personOpens : withoutKey(context.personOpens, event.requestId);
          }
          if (context.pending?.openId === event.requestId && event.result !== 'waiting') {
            patch.pending = undefined;
          }
          if (!own) {
            if (event.result === 'waiting' && personProject !== undefined) {
              patch.pending = {
                openId: event.requestId,
                projectId: personProject,
                epoch: context.lastSent?.epoch ?? context.epoch,
                person: true,
              };
            }
            return result(value, patch, state);
          }
          let next = state;
          switch (event.result) {
            case 'live': {
              patch.open = { ...context.open, live: true };
              // A chat the route switched to while the open was out reaches the session now it is live (rule 2).
              if (
                context.answer?.projectId !== undefined &&
                context.facts[context.answer.projectId]?.status === 'live'
              ) {
                forwardChat(patch, effects, context.answer.projectId);
              }
              break;
            }
            case 'waiting': {
              const sent = context.lastSent;
              if (sent !== undefined) {
                patch.pending = {
                  openId: event.requestId,
                  projectId: sent.projectId,
                  epoch: sent.epoch,
                  person: false,
                };
              }
              break;
            }
            case 'start-failed': {
              if (context.open.person) {
                // A person's reopen that could not start leaves focus where it was (`PersonOpenAsked`).
                patch.open = { ...context.open, openId: undefined };
                next = 'focused';
              } else {
                patch.open = noOpen;
                patch.answer =
                  context.answer === undefined ? undefined : { ...context.answer, answer: { status: 'start-failed' } };
                next = 'held';
              }
              break;
            }
            case 'on-failed': {
              const target = context.answer?.projectId;
              patch.open = { ...context.open, live: true };
              if (state === 'opening' && target !== undefined) {
                next = settleOn(patch, target);
              }
              break;
            }
            case 'dropped': {
              patch.open = { ...context.open, openId: undefined };
              break;
            }
            case 'refused': {
              // Rule 12: withdraw the refused open, then send it again; as built it is a touch of the failed session.
              sendRegistry(effects, context, { type: 'cancelPendingOpen' });
              patch.pending = undefined;
              patch.open = { ...context.open, openId: undefined };
              break;
            }
          }
          return result(value, patch, advance(patch, next, effects));
        },
      ),
      sessionFacts: refines(
        'ChatReady',
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'sessionFacts' }> },
          enq: Enq,
        ) => {
          const patch: Patch = {
            ...context,
            facts: {
              ...context.facts,
              [event.projectId]: { status: event.status, chatReady: event.chatReady, availability: event.availability },
            },
          };
          if (context.open.openId !== undefined && context.answer?.projectId === event.projectId) {
            patch.open = { ...context.open, factsSeen: true };
          }
          return result(value, patch, advance(patch, stateOf(value), effectsOf(enq)));
        },
      ),
      focusedChatResolved: refines(
        'Unmodelled',
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'focusedChatResolved' }> },
          enq: Enq,
        ) => {
          const state = stateOf(value);
          if (context.request?.projectId !== event.projectId || (state !== 'focused' && state !== 'opening')) {
            // MC-R18: the session focus is no longer on, or not yet on.
            return {};
          }
          const kept = context.kept[event.projectId];
          const given = context.forwarded[event.projectId];
          enq.sendTo(context.ports.route, {
            type: 'chatShown',
            projectId: event.projectId,
            chatId: event.chatId,
          } satisfies FocusRouteCommand);
          return {
            context: {
              kept:
                kept === undefined
                  ? context.kept
                  : { ...context.kept, [event.projectId]: { ...kept, chatId: event.chatId } },
              forwarded: { ...context.forwarded, [event.projectId]: { ...given, chatId: event.chatId } },
            },
          };
        },
      ),
      openRequested: refines(
        'PersonOpenAsked',
        (
          { context, event, value }: TransitionArgs & { event: Extract<FocusEvent, { type: 'openRequested' }> },
          enq: Enq,
        ) => {
          const effects = effectsOf(enq);
          const state = stateOf(value);
          const patch: Patch = { ...context };
          const kept = context.kept[event.projectId];
          if (kept === undefined || kept.epoch !== context.epoch) {
            // Rule 13: a kept request is usable only at its epoch. Ask the library first; open only on `ready`.
            const requestId = nextId(patch, 'person');
            patch.personAsks = { ...context.personAsks, [requestId]: event.projectId };
            effects.sendTo(context.ports.library, {
              type: 'accessAsked',
              requestId,
              projectId: event.projectId,
            } satisfies FocusLibraryCommand);
            return { context: patch };
          }
          const next = personOpen({ context: patch, state, effects }, event.projectId, kept);
          return result(value, patch, advance(patch, next, effects));
        },
      ),
      retry: refines('TRetry', ({ context, value }: TransitionArgs, enq: Enq) => {
        const state = stateOf(value);
        if (state !== 'held' && state !== 'flushFailed') {
          return undefined;
        }
        const effects = effectsOf(enq);
        const patch: Patch = { ...context };
        let next: State;
        if (state === 'flushFailed') {
          patch.leave = context.leave === undefined ? undefined : { projectId: context.leave.projectId, flush: 'none' };
          next = 'leaving';
        } else if (context.request?.projectId === undefined) {
          // A URL whose slugs name no project: nothing to ask again until the route changes.
          return { context };
        } else {
          patch.answer = undefined;
          patch.question = undefined;
          patch.open = noOpen;
          next = 'resolving';
        }
        return result(value, patch, advance(patch, next, effects));
      }),
      windowFocused: refines('Unmodelled', ({ context, value }: TransitionArgs, enq: Enq) => {
        const state = stateOf(value);
        const projectId = context.answer?.projectId;
        if ((state !== 'opening' && state !== 'focused') || projectId === undefined || !isReady(context)) {
          return undefined;
        }
        // Coming back to the window is attention: the idle window measures time since the person was here (R16).
        enq.sendTo(context.ports.registry, { type: 'touch', projectId } satisfies FocusRegistryCommand);
        return {};
      }),
    },
    states: {
      idle: {},
      resolving: {},
      leaving: {},
      opening: {
        tags: ['on-project'],
        initial: 'pending',
        states: {
          pending: {},
          live: {
            after: {
              openPatience: refines('OpenBoundPassed', ({ context, value }: TransitionArgs, enq: Enq) => {
                const patch: Patch = { ...context, open: { ...context.open, patience: true } };
                return result(value, patch, advance(patch, 'opening', effectsOf(enq)));
              }),
            },
          },
        },
      },
      focused: { tags: ['on-project', 'focused'] },
      held: { tags: ['held'] },
      flushFailed: { tags: ['flush-failed'] },
    },
  });
};

/** Focus's machine type. @public */
export type FocusMachine = ReturnType<typeof createFocusMachine>;

/**
 * An unstarted focus actor (MC-R4): the app's policy, the five ports, and the actor options tests inject.
 *
 * @param input - The policy, the ports, the library epoch at creation, and `clock`, `inspect` and `onRejectedEvent`.
 * @returns The actor, unstarted.
 * @public
 */
export const createFocus = (
  input: Readonly<{ policy: FocusPolicy; ports: FocusPorts; epoch?: number }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): Actor<FocusMachine> => {
  const { policy, ports, epoch, clock, inspect, onRejectedEvent } = input;
  // An explicit `undefined` would replace xstate's own default, so only what was given is passed on.
  return createActor(createFocusMachine(policy), {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
    input: { ports, ...(epoch === undefined ? {} : { epoch }) },
  });
};
