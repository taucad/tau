import { util as zodUtility } from 'zod';
import { createAgentSession } from '#harness/session.js';
import {
  createPortableId,
  transportFailureDiagnosticType,
  transportFailureFromProviderMessages,
} from '#harness/session-record.js';
import { reduceEventLog } from '#log/reducer.js';
import type {
  AgentToolChoice,
  AgentLogEvent,
  InterruptRecordedEvent,
  JsonObject,
  JsonValue,
  LogEventBase,
  ProviderMessage,
  RunFailureDetail,
  RunTrigger,
  RunLifecycleState,
  UserProviderMessage,
} from '#log/event-types.js';
import type {
  AgentLiveEvent,
  AgentLiveEventPayload,
  DurableEventLog,
  HostRunFailure,
  HostRunSnapshot,
  InterruptApprovalPort,
  InterruptRequest,
  InterruptResolution,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
import type { EventLogBatch } from '#log/event-log-appender.js';
import type { AgentSession, AgentSessionModel, CreateAgentSessionOptions } from '#harness/session.js';
import type { ClientContext } from '#harness/cad-middleware.js';
import { createInterruptRecoveryMessage } from '#harness/interrupt-recovery.js';
import { canonicalJson } from '#harness/safeguards.js';
import { externalAgentStopCodes } from '#launchers/node/agent-wire.js';

type SessionEvent = AgentLogEvent extends infer Event
  ? Event extends LogEventBase
    ? Omit<Event, keyof LogEventBase>
    : never
  : never;

type HostSettlementEvent = Extract<
  SessionEvent,
  { readonly type: 'turn.finalized' | 'turn.conflicted' | 'turn.failed' }
>;

/** One client-generated turn admitted to the portable host. @public */
type TauAgentTurnRequestBase = {
  readonly chatId: string;
  readonly runId: string;
  readonly message: UserProviderMessage;
  readonly config?: TauAgentAdmissionConfig | undefined;
};

/**
 * Which agent runs the turn.
 *
 * Absent, the host composes a Tau admission and runs its own loop. Present, the
 * host routes the turn to the runner registered for `kind` — an ACP adapter on
 * a daemon, say — *before* composing any Tau admission, so an external turn
 * carries no Tau model, prompt or tool grant.
 *
 * Extra fields are the runner's own selection state. They ride the marker on
 * the turn's user message and come back on resume.
 *
 * @public
 */
export type ExternalRunKind = Readonly<Record<string, JsonValue | undefined>> & {
  readonly kind: string;
  readonly id: string;
};

/**
 * One durable event body. The host fills every {@link LogEventBase} field —
 * leader epoch, sequence, timestamp, run id — so an external runner cannot
 * break the log's ordering discipline by getting them wrong.
 *
 * @public
 */
export type ExternalAgentLogEvent = SessionEvent;

/**
 * One external-agent turn, and everything it may do to the chat's durable log.
 *
 * The host owns `run.lifecycle` and the approval inbox; a runner appends
 * *messages* — the thin projection of whatever its protocol reports (OQ-X2) —
 * and asks for approvals. That split is what keeps one client projection
 * rendering a Tau run and an external run identically (PH19).
 *
 * @public
 */
export type ExternalAgentTurn = {
  /** Agent id the client selected, e.g. `claude` or `codex`. */
  readonly agentId: string;
  /** The full selection, including any runner-specific fields. */
  readonly agent: ExternalRunKind;
  readonly chatId: string;
  readonly runId: string;
  /** The new user turn; absent when resuming one a restart left unanswered. */
  readonly message?: UserProviderMessage | undefined;
  /**
   * The admission the client sent, for the context an external agent can use.
   *
   * Nothing a Tau turn *negotiates* applies here — the agent brings its own
   * model, tools and login (X6) — but what the client **composed** does: the
   * CAD system prompt, the skill index and the editor snapshot are the same
   * facts a Tau turn works from, and an external agent that never receives them
   * is answering CAD questions with no kernel knowledge at all (V12). Absent on
   * a resumed turn, which sends no prompt.
   */
  readonly config?: TauAgentAdmissionConfig | undefined;
  /** Durable state a previous attempt remembered — a session id, a cursor, a branch. */
  readonly state?: JsonObject | undefined;
  /** Every durable event recorded for this chat so far. */
  readonly history: readonly AgentLogEvent[];
  /** Aborted by `cancel`, or by the host closing. */
  readonly signal: AbortSignal;
  /** Publish one non-durable text/reasoning delta before its durable envelope settles. */
  readonly publishLive?: ((event: AgentLiveEventPayload) => Promise<void>) | undefined;
  /**
   * Append replaceable session state after this turn settles.
   *
   * Unlike {@link append}, this capability may be retained by a session-scoped
   * external runner. The host still owns chat fencing, ordering and event
   * identity; the runner may use it only for state that ACP reports outside a
   * prompt, such as commands, plans and configuration.
   */
  readonly appendSession?: ((events: readonly ExternalAgentLogEvent[]) => Promise<void>) | undefined;
  /** Append durable events; each publishes on the host's event stream. */
  append(events: readonly ExternalAgentLogEvent[]): Promise<void>;
  /** Persist state that must survive a restart. Merges into what is there. */
  remember(state: JsonObject): Promise<void>;
  /**
   * Durably pause for an approval and await the decision (PH13 / OQ-X4).
   *
   * The whole resolution, not just its outcome: a request that offered a list
   * of options is answered by *one* of them, and a runner that has to
   * re-derive the choice from `approved` substitutes its own guess for the
   * human's decision.
   */
  approve(request: { readonly prompt: string; readonly payload?: JsonValue | undefined }): Promise<InterruptResolution>;
};

/**
 * What one external turn reported beyond the messages it appended.
 *
 * The runner never writes `run.lifecycle` itself — the host owns it — so a turn
 * that ended short has to be able to *say* so, or the host records the only
 * thing it can see (the promise resolved) as `completed` (V6).
 *
 * @public
 */
export type ExternalTurnOutcome = {
  /** Why the agent stopped, in its own protocol's vocabulary (ACP's `max_tokens`, …). */
  readonly stopReason?: string | undefined;
};

/**
 * Terminal lifecycle state for one external stop reason.
 *
 * Only `end_turn` is a completed turn. An agent that hit its output ceiling,
 * refused, or exhausted its own request budget stopped with work outstanding,
 * and recording that as `completed` tells every later reader — the transcript,
 * a resume, the user — that the turn finished (V6). A reason this host has
 * never heard of resolves to `completed`: D14 keeps an older reader able to read
 * a newer writer, and the reason itself is recorded verbatim either way.
 */
const externalStopStates = new Map<string, RunLifecycleState>([
  ['end_turn', 'completed'],
  ['cancelled', 'cancelled'],
  ['max_tokens', 'failed'],
  ['refusal', 'failed'],
  ['max_turn_requests', 'failed'],
]);

/** User-safe reason for a stop that ended the turn short. */
const externalStopDetail = new Map<string, string>([
  ['max_tokens', 'The agent reached its own output limit before finishing this turn.'],
  ['refusal', 'The agent declined to answer this turn.'],
  ['max_turn_requests', 'The agent used its whole request budget for this turn.'],
]);

/**
 * The durable terminal record for a throw that escaped the session.
 *
 * A coded refusal (`GatewayModelTransportError`, an external runner's error)
 * reaches here only when it was raised outside the model stream — the stream's
 * own wrapper turns a refusal into an assistant diagnostic the session reads
 * back. Record whatever code, status and structured `details` the throw carries
 * so this record is never poorer than that one.
 *
 * @param error - Whatever ended the run.
 * @returns The failure detail to persist.
 */
const codedFailureDetail = (error: unknown): RunFailureDetail => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- reading optional own properties off a thrown value.
  const fields = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
  const status = typeof fields?.['status'] === 'number' ? fields['status'] : undefined;
  const details = zodUtility.isObject(fields?.['details']) ? fields['details'] : undefined;
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(typeof fields?.['code'] === 'string' ? { code: fields['code'] } : {}),
    ...(status === undefined ? {} : { status }),
    ...(details === undefined ? {} : { details }),
  };
};

/**
 * The login record one thrown refusal carries, if it carries one.
 *
 * A runner refuses with a coded error (`EXTERNAL_AGENT_AUTH_REQUIRED`,
 * `EXTERNAL_AGENT_MODEL_UNAVAILABLE`, …) and may hang the facts a surface needs
 * on it — the login methods, a verification URL and code. The host is
 * deliberately incurious about the payload's shape: it records what it was
 * given, and the surfaces that render it own its schema (`agent-wire.ts`). The
 * code itself, and any stop `details`, ride {@link codedFailureDetail}.
 *
 * @param error - Whatever the external runner threw.
 * @returns The login record to append before the failure.
 */
const externalRefusalOf = (
  error: unknown,
): {
  readonly login: Omit<SessionEvent & { readonly type: 'interrupt.recorded' }, 'interruptId'> | undefined;
} => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- reading one optional own property off a thrown value.
  const fields = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
  const payload = fields?.['login'];
  return {
    login:
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? {
            type: 'interrupt.recorded',
            phase: 'requested',
            reason: error instanceof Error ? error.message : 'This agent needs you to sign in.',
            // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a refusal payload is JSON by construction of its wire schema.
            payload: payload as JsonValue,
          }
        : undefined,
  };
};

/** Runs external agents of one kind. @public */
export type ExternalAgentPort = {
  /**
   * Agent ids this port can start; anything else is refused at admission.
   *
   * Optional, because not every runner can enumerate. A daemon's ACP adapters
   * are resolved locally and known up front, so listing them buys a cheap
   * refusal before any durable event is written. A runner that can only find
   * out by opening its session omits this and refuses inside `run`, where it
   * genuinely knows.
   */
  list?(): readonly string[];
  /** Execute one turn; resolve when the agent's turn ends, throw to fail the run. */
  run(turn: ExternalAgentTurn): Promise<ExternalTurnOutcome | undefined>;
  /**
   * End whatever this chat holds open — a live protocol session, a process.
   *
   * Called when leadership is relinquished, when the host closes, and before a
   * rewound turn, whose new history the agent's own session must not carry.
   * Optional, because a runner that keeps nothing between turns has nothing to
   * close.
   */
  closeChat?(chatId: string): Promise<void>;
};

/**
 * The chat-scoped record one external session is resumed from (VSC3).
 *
 * It rides the marker on the chat's most recent external user message, so it
 * needs no event type of its own, and it is read per *agent*: switching agents
 * inside a chat must open the new agent's own session rather than hand it a
 * session id another vendor minted.
 *
 * @public
 */
export type ExternalSessionState = {
  readonly agentId: string;
  /** The vendor session a later turn resumes; absent until one has been remembered. */
  readonly acpSessionId?: string | undefined;
  /** Model the session was last set to. */
  readonly model?: string | undefined;
  /**
   * Revision mode the session was opened in (`direct` or `candidate`).
   *
   * The *host's* record of how it prepared that turn, never the agent's claim:
   * VI11 keeps the revision authority with the host, and this field is what a
   * later turn reads back to know which tree the vendor session was rooted in.
   */
  readonly mode?: string | undefined;
  /** Revision this session's working tree is based on. */
  readonly baseRevisionId?: string | undefined;
  /**
   * Absolute directory the session was opened against (V19).
   *
   * A candidate turn runs in a checkout of its own, so a session remembered
   * against a directory this turn does not run in cannot be resumed — the
   * conversation would be about files the new session cannot see.
   */
  readonly cwd?: string | undefined;
};

/** Marker distinguishing an externally executed turn in the durable log. */
const externalTurnKind = 'external-agent';

/**
 * The external-agent marker on the turn's own user message.
 *
 * Deliberately *not* a new event type: the vocabulary already carries
 * per-message provider metadata, and `tauInternal` is where Tau's own
 * non-provider facts live. A reader that knows nothing about external agents
 * still replays the log byte-for-byte.
 *
 * @param message - Message to inspect.
 * @returns The marker, when this message admitted an external turn.
 */
const externalMarker = (
  message: ProviderMessage,
): (JsonObject & { readonly agentId: string; readonly runKind: string }) | undefined => {
  const marker = message.metadata?.tauInternal;
  if (
    marker === undefined ||
    typeof marker !== 'object' ||
    Array.isArray(marker) ||
    marker['kind'] !== externalTurnKind ||
    typeof marker['agentId'] !== 'string'
  ) {
    return undefined;
  }
  /* `runKind` is absent on markers written before the registry existed; those
   * were all ACP, which is what the node launcher registers under that key. */
  const runKind = typeof marker['runKind'] === 'string' ? marker['runKind'] : 'acp';
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the discriminating fields are checked above.
  return { ...marker, runKind } as JsonObject & { readonly agentId: string; readonly runKind: string };
};

/**
 * The external turn a log's last run admitted, if it was one.
 *
 * @param events - The chat's durable events.
 * @returns The marker and the message carrying it, or `undefined` for a Tau run.
 */
const externalTurnOf = (
  events: readonly AgentLogEvent[],
):
  | { readonly marker: JsonObject & { readonly agentId: string; readonly runKind: string }; readonly messageId: string }
  | undefined => {
  const runId = events.at(-1)?.runId;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.runId !== runId) {
      break;
    }
    if (event.type === 'message.appended' && event.message.role === 'user') {
      const marker = externalMarker(event.message);
      return marker ? { marker, messageId: event.message.id } : undefined;
    }
  }
  return undefined;
};

/**
 * The session one agent last held in this chat, across every run in its log.
 *
 * Deliberately *not* {@link externalTurnOf}: that one answers "is the last run
 * external and unfinished?" and stops at the run boundary, which is why every
 * turn used to start a fresh vendor session. This one answers "what has this
 * chat already opened with this agent?", so turn two continues turn one.
 *
 * @param events - The chat's durable events.
 * @param agentId - Agent this turn selected; a different agent gets its own session.
 * @returns The record the runner resumes from, or `undefined` for a first turn.
 */
const externalSessionOf = (
  events: readonly AgentLogEvent[],
  agentId: string,
): (JsonObject & ExternalSessionState) | undefined => {
  /* Reduced, not raw: `remember` records the session id by *replacing* the
   * user message's envelope, so only the reducer's view carries it. */
  const messages = reduceEventLog(events);
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== 'user') {
      continue;
    }
    const marker = externalMarker(message);
    /* The most recent marker that actually *names* a session: only the turn
     * that opened one records it, and every later turn of the same session
     * carries a bare marker. */
    if (!marker || marker.agentId !== agentId || typeof marker['acpSessionId'] !== 'string') {
      continue;
    }
    const { kind: _kind, runKind: _runKind, ...state } = marker;
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `agentId` is checked above and every other field is optional.
    return state as JsonObject & ExternalSessionState;
  }
  return undefined;
};

/** Exact per-admission model, prompt, tool, and client context. @public */
export type TauAgentAdmissionConfig = {
  readonly systemPrompt: string;
  readonly systemPromptBlocks?: CreateAgentSessionOptions['systemPromptBlocks'];
  /** Absent, the host's own default row runs the turn; a host with neither refuses it. */
  readonly model?: AgentSessionModel | undefined;
  readonly toolChoice: AgentToolChoice;
  readonly allowedTools?: readonly string[] | undefined;
  readonly snapshot?: JsonValue | undefined;
  readonly clientContext?: ClientContext | undefined;
  readonly contextMessages?: readonly UserProviderMessage[] | undefined;
  /** Present = an external runner owns this turn; see {@link ExternalRunKind}. */
  readonly agent?: ExternalRunKind | undefined;
};

/** Trigger-aware admission with an explicit retained prefix for rewind operations. @public */
export type TauAgentTurnRequest = TauAgentTurnRequestBase &
  (
    | { readonly trigger: 'submit'; readonly retainedMessageIds?: never }
    | {
        readonly trigger: Exclude<RunTrigger, 'submit'>;
        readonly retainedMessageIds: readonly string[];
      }
  );

/** Dependencies shared by every run created by one portable host. @public */
export type CreateTauAgentHostOptions = {
  readonly systemPrompt: string;
  readonly systemPromptBlocks?: CreateAgentSessionOptions['systemPromptBlocks'];
  /**
   * Default model row for turns whose admission names none. Optional: a host
   * whose every client sends its own row configures no fallback, and a `start`
   * that then names none is refused with `HOST_MODEL_UNAVAILABLE` rather than
   * run against a made-up model.
   */
  readonly model?: AgentSessionModel | undefined;
  readonly modelTransport: ModelTransport;
  readonly toolRegistry: ToolRegistry;
  /** Opens the project-root `.tau/chats/<chatId>/events.jsonl` appender. */
  readonly openEventLog: (chatId: string) => Promise<DurableEventLog>;
  readonly interruptPort: InterruptApprovalPort;
  readonly createId?: (() => string) | undefined;
  readonly createLeaderEpoch?: (() => string) | undefined;
  readonly now?: (() => Date) | undefined;
  readonly clientContext?:
    | CreateAgentSessionOptions['clientContext']
    | (() => Promise<ClientContext | undefined> | ClientContext | undefined);
  readonly recentSkills?: CreateAgentSessionOptions['recentSkills'];
  readonly substituteToolResult?: CreateAgentSessionOptions['substituteToolResult'];
  readonly summarize?: CreateAgentSessionOptions['summarize'];
  readonly safeguardThresholds?: CreateAgentSessionOptions['safeguardThresholds'];
  readonly onSafeguardOutcome?: CreateAgentSessionOptions['onSafeguardOutcome'];
  readonly allowImageBlocks?: CreateAgentSessionOptions['allowImageBlocks'];
  /** Reads the chat attachment bytes each run materialises (D15). */
  readonly attachments?: CreateAgentSessionOptions['attachments'];
  readonly onCompaction?: CreateAgentSessionOptions['onCompaction'];
  readonly onLiveEvent?: ((event: AgentLiveEvent) => void | Promise<void>) | undefined;
  /**
   * External runners by run kind (today: `acp` on a daemon).
   *
   * One routing point for every placement: `admit` dispatches on
   * `config.agent.kind` before it composes a Tau admission, and `resume`
   * reconnects from the marker the admission wrote. A kind with no runner is
   * refused at admission, never silently downgraded to a Tau turn.
   */
  readonly externalRunners?: Readonly<Record<string, ExternalAgentPort>> | undefined;
};

/** Complete browser-safe lifecycle surface assembled over the W1-W5 ports. @public */
export type TauAgentHost = {
  /** Commit and execute one new user turn. */
  admit(request: TauAgentTurnRequest): Promise<readonly ProviderMessage[]>;
  /** Rebuild one chat from its event log and continue a non-terminal run. */
  resume(chatId: string): Promise<readonly ProviderMessage[]>;
  /**
   * Wait until a concurrently started admission is durable and return its projection.
   *
   * Name the run when the answer has to be about *that* run — acknowledging a
   * `start`, for instance. A chat holds one reservation at a time, so asking
   * only by chat could be answered with a different run's snapshot while this
   * command's own rejection went unobserved. Omit it to ask the chat-level
   * question "is an admission under way here at all?", which is what a takeover
   * gate needs.
   *
   * @param chatId - The chat being asked about.
   * @param runId - The run whose admission to wait for, when the caller has one.
   */
  waitForAdmission(chatId: string, runId?: string): Promise<HostRunSnapshot | undefined>;
  /**
   * Record a non-terminal run whose executing host is gone as abandoned (I4).
   *
   * What a takeover does instead of resuming: resuming re-asks the provider for
   * a turn nobody requested — a second full-price call, whose reply the open
   * transcript drops and whose completion mints no revision, because the lease
   * it needed died with the document. Recording states the fact and stops;
   * `RUN_ABANDONED` is resumable, so the person's own *Resume* continues it.
   *
   * A paused run is not marked: it is waiting on a person, not on a host, and
   * its pending interrupt is what should be republished. A run this host is
   * itself driving is not marked either.
   *
   * @param chatId - The chat whose current run may be abandoned.
   * @returns The chat's run projection after the record, or `undefined` when it has no run.
   */
  markAbandoned(chatId: string): Promise<HostRunSnapshot | undefined>;
  /** Abort an active run, durably pause it, and wait through the W5 port. */
  interrupt(request: InterruptRequest): Promise<InterruptResolution>;
  /** Resolve a W5 request from an external presenter. */
  resolveInterrupt(resolution: InterruptResolution & { readonly runId: string }): Promise<void>;
  /** Return unresolved W5 requests for one run. */
  pendingInterrupts(runId: string): Promise<readonly InterruptRequest[]>;
  /** Queue steering on an active run. */
  steer(input: { readonly runId: string; readonly message: string }): Promise<void>;
  /** Cancel an active run without creating an approval request, then wait out its settlement. */
  cancel(input: { readonly runId: string }): Promise<void>;
  /** Rebuild the current run projection from W1, refusing `NO_RUN_ADMITTED` when there is none. */
  snapshot(chatId: string): Promise<HostRunSnapshot>;
  /** The same projection as {@link TauAgentHost.snapshot}, answering `undefined` rather than refusing. */
  describeRun(chatId: string): Promise<HostRunSnapshot | undefined>;
  /** Read one bounded event batch for follower projection. */
  readEvents(input: {
    readonly chatId: string;
    readonly cursor: number;
    readonly limit: number;
    /** Serialized-byte budget for the page; unbounded by bytes when absent. */
    readonly maxBytes?: number | undefined;
  }): Promise<EventLogBatch>;
  /** Append one revision-authority settlement through this chat's fenced writer. */
  recordSettlement(input: {
    readonly chatId: string;
    readonly runId: string;
    readonly event: HostSettlementEvent;
  }): Promise<void>;
  /** Bind one chat to the generation token minted by its current Web Lock lease. */
  assumeLeadership(chatId: string, generation: string): void;
  /** Abort one chat and close its cached appender after leadership loss. */
  relinquish(chatId: string): Promise<void>;
  /** Stop active work and close every opened appender. */
  close(): Promise<void>;
};

/** One admitted external turn, and the detached promise that settles it. */
type ExternalRun = {
  readonly chatId: string;
  readonly controller: AbortController;
  completion?: Promise<void> | undefined;
};

type ActiveRun = {
  readonly chatId: string;
  readonly runId: string;
  readonly session: AgentSession;
  completion?: Promise<void> | undefined;
};

type AdmissionReservation = {
  readonly chatId: string;
  runId?: string | undefined;
  readonly ready: Promise<ActiveRun | undefined>;
  readonly resolveReady: (active: ActiveRun | undefined) => void;
  readonly admitted: Promise<ActiveRun | undefined>;
  readonly resolveAdmitted: (active: ActiveRun | undefined) => void;
};

type InterruptPayload = {
  readonly kind: InterruptRequest['kind'];
  readonly prompt: string;
  readonly context?: JsonValue | undefined;
};

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

const isInterruptPayload = (value: JsonValue | undefined): value is InterruptPayload => {
  if (!isJsonObject(value)) {
    return false;
  }
  return (
    (value['kind'] === 'approval' || value['kind'] === 'operator' || value['kind'] === 'safeguard') &&
    typeof value['prompt'] === 'string'
  );
};

/**
 * This run's latest durable lifecycle state, or `undefined` when it has none.
 *
 * A run id that appears only on a *settlement* is not a run: the page can write
 * `turn.failed` under a run id whose admission never happened (an abandoned
 * lease), and defaulting that to `admitted` made the host treat the phantom as
 * live — it refused the real admission, fabricated a `completed` record for a
 * run that never ran, and let a replayed `start` resume it instead of admitting
 * it, losing the user's message. Every caller now handles `undefined` as
 * "no such run".
 *
 * @param events - Every durable record of the chat.
 * @param runId - The run being asked about.
 * @returns Its latest lifecycle state, or `undefined` when it has no record.
 */
const lifecycleFor = (events: readonly AgentLogEvent[], runId: string): RunLifecycleState | undefined => {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.runId === runId && event.type === 'run.lifecycle') {
      return event.state;
    }
  }
  return undefined;
};

/**
 * The chat's current run: the last one the log actually admitted.
 *
 * Read off the last `run.lifecycle` record rather than the log's tail, because
 * the tail can be a settlement under a run that was never admitted. One chat
 * runs one run at a time, so that record names both the run and its state.
 *
 * @param events - Every durable record of the chat.
 * @returns The run and its state, or `undefined` when nothing was admitted.
 */
const currentRun = (
  events: readonly AgentLogEvent[],
): { readonly runId: string; readonly state: RunLifecycleState } | undefined => {
  const lifecycle = events.findLast((event) => event.type === 'run.lifecycle');
  return lifecycle?.type === 'run.lifecycle' ? { runId: lifecycle.runId, state: lifecycle.state } : undefined;
};

/** Settlement records may never precede their run's admission; see {@link runLedgerOf}. */
const settlementTypes = new Set<AgentLogEvent['type']>(['turn.finalized', 'turn.conflicted', 'turn.failed']);

/** `LogEventBase`: the position the log stamps on, which a body being appended does not carry. */
const logEnvelopeKeys = new Set<string>(['version', 'leaderEpoch', 'sequence', 'recordedAt', 'runId']);

/**
 * What one chat's run is doing, as the host decides legality by.
 *
 * `none` is a chat with no run in memory and none in its log; `terminal` is one
 * whose last run ended. The three in between are the host's own in-memory
 * stages: `reserved` before a session exists, `admitted` once it does, and
 * `running`/`paused` from the durable lifecycle.
 *
 * @internal
 */
export type HostRunState = 'none' | 'reserved' | 'admitted' | 'running' | 'paused' | 'terminal';

/**
 * What one *run* is, as far as appending to it goes.
 *
 * A different subject from {@link HostRunState}, which is about the **chat**:
 * `admit`, `resume` and `cancel` are asked of whatever run the chat is on, and
 * `settle` is asked of one named run. Mixing the two is what let the table
 * claim `admit: ['none','terminal']` per run while the guard beneath it refused
 * any run id with a lifecycle record at all.
 *
 * @internal
 */
export type HostRunAppendState =
  /** No lifecycle record: nothing admitted this run. */
  | 'unadmitted'
  /** Admitted and not ended. */
  | 'open'
  /** Ended, and no settlement recorded yet. */
  | 'terminal'
  /** Ended and settled: exactly one settlement, which is the invariant (V10). */
  | 'settled';

/**
 * One operation whose legality the *chat's* run decides.
 *
 * `cancel` is deliberately absent. It names a run id rather than a chat, and is
 * decided from the in-memory run that id resolves to — `activeRunFor` returns
 * nothing for a run this host is not driving, and cancelling nothing is a
 * no-op. A row here would be data no reader consults, which is the state the
 * whole table was in before.
 *
 * @internal
 */
export type HostRunOperation = 'admit' | 'resume';

/**
 * The one place `admit` and `resume` agree about the chat's run.
 *
 * These decided for themselves, from different readings of the same facts: a
 * `lifecycleFor` that defaulted to `admitted`, a reservation map and an
 * `activeBy*` map. Their disagreement is what let a settlement be recorded
 * under a run that was never admitted and then made the host read that record
 * as proof the run *was* admitted.
 *
 * @internal
 */
const chatRunOperationLegality: Readonly<Record<HostRunOperation, ReadonlySet<HostRunState>>> = {
  admit: new Set<HostRunState>(['none', 'terminal']),
  /* `terminal` is admissible because a run the gateway *refused* never reached
   * the provider: its history is whole and the host continues it at the one
   * call it could not fund. Which terminal runs those are is
   * {@link isResumableRunFailure}'s knowledge, not the ledger's. */
  resume: new Set<HostRunState>(['admitted', 'running', 'paused', 'terminal']),
};

/**
 * The states a run accepts a settlement from.
 *
 * `unadmitted` is the refusal that matters (`SETTLEMENT_WITHOUT_RUN`): a
 * `turn.failed` for a run with no `run.lifecycle` is a record of a lease the
 * page abandoned, not of a turn. `settled` refuses a *second, differing*
 * settlement; an identical one is a no-op, which is what makes at-least-once
 * delivery from the page safe (V10).
 *
 * @internal
 */
const runSettlementLegality: ReadonlySet<HostRunAppendState> = new Set<HostRunAppendState>(['open', 'terminal']);

/**
 * Whether one chat-level operation is legal against a run in this state.
 *
 * @internal
 * @param operation - The operation being attempted.
 * @param state - The chat's current run state.
 * @returns `true` when the ledger allows it.
 */
export const isHostRunOperationLegal = (operation: HostRunOperation, state: HostRunState): boolean =>
  chatRunOperationLegality[operation].has(state);

/**
 * Whether a settlement may be appended to a run in this state.
 *
 * @internal
 * @param state - The run's append state.
 * @returns `true` when the ledger allows it.
 */
export const isHostSettlementLegal = (state: HostRunAppendState): boolean => runSettlementLegality.has(state);

/**
 * Whether one lifecycle record may follow what its run has already recorded (I1).
 *
 * Two clauses survive falsification, and both are about the *attempt*: an
 * `admitted` row is the run's first word, and a settlement is its last. What
 * the dropped "nothing after terminal" rule got wrong is the middle — a
 * cancelled run's own teardown re-records `cancelled`, and a resume reopens a
 * run the log has already ended — so everything before the settlement stays
 * legal.
 *
 * A `running` row *after* a settlement is the one reopening: the same run id
 * takes a second attempt, and only a run whose terminal failure can be
 * continued, or one paused waiting on a person, may take it. Without this,
 * `resume` re-ran a settled run and the page's second settlement was refused
 * `SETTLEMENT_CONFLICT` with no way forward.
 *
 * @internal
 * @param input - The row being appended, the run's append state, and whether it may reopen.
 * @returns `true` when the ledger allows the record.
 */
export const isHostLifecycleLegal = (input: {
  readonly next: RunLifecycleState;
  readonly state: HostRunAppendState;
  readonly lifecycle: RunLifecycleState | undefined;
  readonly reopenable: boolean;
}): boolean => {
  if (input.next === 'admitted') {
    return input.state === 'unadmitted';
  }
  if (input.state !== 'settled') {
    return true;
  }
  /* A settlement that landed while the run was still executing closed its
   * *lease*, not its execution: the run still owes the log the record of how it
   * ended, and refusing that row would kill a live run outright. An attempt is
   * closed once it has both ended and settled. */
  if (hostRunStateOfLifecycle(input.lifecycle) !== 'terminal') {
    return true;
  }
  return input.next === 'running' && input.reopenable;
};

/**
 * The state a run's durable lifecycle puts it in.
 *
 * @internal
 * @param lifecycle - The run's latest lifecycle state, or `undefined` when it has none.
 * @returns The ledger state that lifecycle implies.
 */
export const hostRunStateOfLifecycle = (lifecycle: RunLifecycleState | undefined): HostRunState => {
  // ponytail: named instead of `terminalStates.has`, whose `Set#has` never narrows the union.
  if (lifecycle === 'admitted' || lifecycle === 'running' || lifecycle === 'paused') {
    return lifecycle;
  }
  return lifecycle === undefined ? 'none' : 'terminal';
};

/** What one run's records add up to. @internal */
export type HostRunLedgerEntry = Readonly<{
  lifecycle: RunLifecycleState | undefined;
  /** The settlement already recorded for this run, if any. */
  settlement: AgentLogEvent | undefined;
  state: HostRunAppendState;
}>;

/** One chat's whole run ledger, folded from its log. @internal */
export type HostRunLedger = Readonly<{
  /** The run the chat is on: the last one the log admitted. */
  chat: Readonly<{ runId: string; state: HostRunState }> | undefined;
  runs: ReadonlyMap<string, HostRunLedgerEntry>;
}>;

/**
 * What one run's records make it, in the append ledger's vocabulary.
 *
 * @param entry - The run's latest lifecycle and its settlement, if it has one.
 * @returns The append state those two facts imply.
 */
const appendStateOf = (entry: {
  readonly lifecycle: RunLifecycleState | undefined;
  readonly settlement: AgentLogEvent | undefined;
}): HostRunAppendState => {
  if (hostRunStateOfLifecycle(entry.lifecycle) === 'none') {
    return 'unadmitted';
  }
  if (entry.settlement !== undefined) {
    return 'settled';
  }
  return hostRunStateOfLifecycle(entry.lifecycle) === 'terminal' ? 'terminal' : 'open';
};

/**
 * One fold over the chat's log, consulted at the append boundary (V12).
 *
 * Every legality question the host asks of durable facts is answered from here,
 * so a change to what a record means is a change to one function rather than a
 * surprise in one of four readers.
 *
 * @internal
 * @param events - Every durable record of the chat.
 * @returns The chat's current run and the per-run append states.
 */
export const runLedgerOf = (events: readonly AgentLogEvent[]): HostRunLedger => {
  const runs = new Map<string, { lifecycle: RunLifecycleState | undefined; settlement: AgentLogEvent | undefined }>();
  let chatRunId: string | undefined;
  for (const event of events) {
    const entry = runs.get(event.runId) ?? { lifecycle: undefined, settlement: undefined };
    if (event.type === 'run.lifecycle') {
      /* A `running` row after a settlement reopens the run: the same run id
       * takes a second attempt, which holds its own lease and records its own
       * settlement (I1). Without this the first attempt's settlement stayed in
       * the entry forever, so every row the second attempt wrote read as "a run
       * that is already settled" and the reopened run could never end. */
      if (event.state === 'running' && entry.settlement !== undefined) {
        entry.settlement = undefined;
      }
      entry.lifecycle = event.state;
      chatRunId = event.runId;
    } else if (settlementTypes.has(event.type)) {
      entry.settlement ??= event;
    }
    runs.set(event.runId, entry);
  }
  const folded = new Map<string, HostRunLedgerEntry>();
  for (const [runId, entry] of runs) {
    folded.set(runId, { ...entry, state: appendStateOf(entry) });
  }
  const chatLifecycle = chatRunId === undefined ? undefined : folded.get(chatRunId)?.lifecycle;
  return {
    chat: chatRunId === undefined ? undefined : { runId: chatRunId, state: hostRunStateOfLifecycle(chatLifecycle) },
    runs: folded,
  };
};

/**
 * Every code a refusal on the admission, resume or settlement path carries (I3).
 *
 * One code per *recovery*, because the only question a consumer has is "what do
 * I do now?". `RUN_ADMISSION_CONFLICT` named five conditions at once — a live
 * run, three duplicate run ids and an external one — so the page's recovery had
 * to match a regular expression over the message text, and still could not tell
 * "wait for the run that is running" from "this run id is taken, never retry".
 * `libs/chat` re-exports this union as the wire contract, so a new code cannot
 * be added to one side of the boundary alone.
 *
 * @public
 */
export const agentHostRefusalCodes = [
  /** The chat holds a non-terminal run, in memory or durably. Carries `state` and, when one is bound, `runId`: wait for that run, bounded, then admit once. */
  'CHAT_RUN_LIVE',
  /** A reservation, an active run or a durable lifecycle already holds this run id. Carries `runId`; never retry — attach, or answer with its settlement. */
  'RUN_ID_TAKEN',
  /** Nothing on this chat can be continued; the card says so instead of appearing to do nothing. */
  'RESUME_UNAVAILABLE',
  /** A non-terminal run whose executing host is gone, as {@link TauAgentHost.markAbandoned} records it. Offer Resume. */
  'RUN_ABANDONED',
  /** This chat admitted no run. Readers that can live without one call `describeRun`, which answers `undefined`. */
  'NO_RUN_ADMITTED',
  /** A rewinding trigger did not retain an unchanged strict history prefix. */
  'HISTORY_PREFIX_INVALID',
  /** A second, differing settlement for one run. */
  'SETTLEMENT_CONFLICT',
  /** A settlement for a run nothing admitted. */
  'SETTLEMENT_WITHOUT_RUN',
  /** The revision root refused a lease this run already holds. */
  'TURN_ALREADY_LEASED',
  /** Another tab or process leads this chat now. */
  'LEADERSHIP_LOST',
] as const;

/** One member of {@link agentHostRefusalCodes}. @public */
export type AgentHostRefusalCode = (typeof agentHostRefusalCodes)[number];

/**
 * The refusal a chat that already holds a run answers an admission with.
 *
 * One builder for both readings of the same fact — the in-memory reservation or
 * active session, and the durable ledger — because a recovery that can only
 * recognise one of them hangs on the other.
 *
 * @param input - The chat, the live run's id when one is bound to it, and its state.
 * @returns The coded error the caller throws.
 */
const chatRunLiveRefusal = (input: {
  readonly chatId: string;
  readonly runId: string | undefined;
  readonly state: HostRunState;
}): Error =>
  Object.assign(new Error(`Chat ${input.chatId} has a ${input.state} run; admit the next turn after it ends.`), {
    code: 'CHAT_RUN_LIVE' satisfies AgentHostRefusalCode,
    state: input.state,
    ...(input.runId === undefined ? {} : { runId: input.runId }),
  });

/**
 * The refusal a run id that is already spoken for answers with.
 *
 * Distinct from {@link chatRunLiveRefusal} because the recovery is the
 * opposite: a taken run id is the idempotency key (V9), so the caller attaches
 * or answers with the run's settlement rather than waiting and retrying.
 *
 * @param input - The run id, and what already holds it.
 * @returns The coded error the caller throws.
 */
const runIdTakenRefusal = (input: { readonly runId: string; readonly held: string }): Error =>
  Object.assign(new Error(`Run ${input.runId} ${input.held}.`), {
    code: 'RUN_ID_TAKEN' satisfies AgentHostRefusalCode,
    runId: input.runId,
  });

/**
 * The refusal an illegal settlement append answers with.
 *
 * @param input - The chat, the run and the append state the settlement met.
 * @returns The coded error the writer throws.
 */
const settlementRefusal = (input: {
  readonly chatId: string;
  readonly runId: string;
  readonly state: HostRunAppendState;
}): Error =>
  input.state === 'settled'
    ? Object.assign(new Error(`Run ${input.runId} in chat ${input.chatId} is already settled differently.`), {
        code: 'SETTLEMENT_CONFLICT',
      })
    : Object.assign(
        new Error(`Run ${input.runId} was never admitted in chat ${input.chatId}; its settlement cannot be recorded.`),
        { code: 'SETTLEMENT_WITHOUT_RUN' },
      );

/**
 * Whether two settlement records say the same thing.
 *
 * At-least-once delivery from the page is what makes "every admitted run
 * settles exactly once" reachable at all, so a repeat of the same fact has to
 * be a no-op rather than a refusal (V10).
 *
 * Compared over the **union** of both bodies' keys, with the log's own
 * canonical encoding. Reading only the *new* body's keys let a settlement that
 * named no revision dedupe silently against a stored one that did — the
 * absent keys were never compared — while `JSON.stringify` made two records
 * carrying the same fields in a different order disagree.
 *
 * @param stored - The settlement already in the log.
 * @param body - The settlement being appended, without its envelope.
 * @returns `true` when the append would add nothing.
 */
const isSameSettlement = (stored: AgentLogEvent, body: SessionEvent): boolean => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- index reads over a closed union of record shapes.
  const storedFields = stored as unknown as Record<string, unknown>;
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- index reads over a closed union of record shapes.
  const bodyFields = body as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(storedFields), ...Object.keys(bodyFields)])].every(
    (key) => logEnvelopeKeys.has(key) || canonicalJson(storedFields[key]) === canonicalJson(bodyFields[key]),
  );
};

const internalKind = (message: ProviderMessage): string | undefined => {
  const metadata = message.metadata?.tauInternal;
  // oxlint-disable-next-line typescript/dot-notation -- JsonObject keys are index-signature properties under noPropertyAccessFromIndexSignature.
  const kind = metadata?.['kind'];
  return isJsonObject(metadata) && typeof kind === 'string' ? kind : undefined;
};

const latestTurnId = (messages: readonly ProviderMessage[], fallback: string): string =>
  messages.findLast((message) => message.role === 'user' && internalKind(message) !== 'interrupt-recovery')?.id ??
  fallback;

const unresolvedInterrupt = (events: readonly AgentLogEvent[], runId: string) => {
  const resolved = new Set(
    events.flatMap((event) =>
      event.runId === runId && event.type === 'interrupt.recorded' && event.phase === 'resolved'
        ? [event.interruptId]
        : [],
    ),
  );
  return events.findLast(
    (event): event is InterruptRecordedEvent =>
      event.runId === runId &&
      event.type === 'interrupt.recorded' &&
      event.phase === 'requested' &&
      !resolved.has(event.interruptId),
  );
};

const lastInterruptResolution = (events: readonly AgentLogEvent[], runId: string): InterruptResolution | undefined => {
  const event = events.findLast(
    (candidate): candidate is InterruptRecordedEvent =>
      candidate.runId === runId && candidate.type === 'interrupt.recorded' && candidate.phase === 'resolved',
  );
  if (!event) {
    return undefined;
  }
  const { payload } = event;
  if (!isJsonObject(payload)) {
    return undefined;
  }
  const { outcome } = payload;
  if (outcome !== 'approved' && outcome !== 'denied' && outcome !== 'cancelled') {
    return undefined;
  }
  return {
    interruptId: event.interruptId,
    outcome,
    ...(typeof payload['optionId'] === 'string' ? { optionId: payload['optionId'] } : {}),
    ...('response' in payload ? { payload: payload['response'] } : {}),
  };
};

const pendingToolInputs = (messages: readonly ProviderMessage[]) => {
  const outputs = new Set(messages.flatMap((message) => (message.role === 'tool-output' ? [message.toolCallId] : [])));
  return messages.filter(
    (message): message is Extract<ProviderMessage, { readonly role: 'tool-input' }> =>
      message.role === 'tool-input' && !outputs.has(message.toolCallId),
  );
};

/**
 * The failed call's marker, rewritten as the tool-use turn it actually was.
 *
 * A stream that fails *after* it completed a tool call leaves the marker mid
 * history — the tool's own rows follow it — so there is no prefix to rewind to.
 * Left as it stands, its transport-failure diagnostic is what every later
 * `snapshot()` reports as this chat's failure, and the re-issued call tells the
 * model its own last turn errored. Rewriting it keeps the work that settled and
 * drops the failure: the message the stream would have written had it simply
 * ended after that call.
 *
 * @param marker - The last assistant message of the failed run.
 * @param messages - The reduced history the resume starts from.
 * @returns The replacement envelope, or `undefined` when no tool call settled.
 */
const settledMarkerEnvelope = (
  marker: ProviderMessage,
  messages: readonly ProviderMessage[],
): ProviderMessage | undefined => {
  const settled = new Set(messages.flatMap((message) => (message.role === 'tool-output' ? [message.toolCallId] : [])));
  const isCall = (block: JsonValue): boolean => isJsonObject(block) && block['type'] === 'toolCall';
  /* A call with no durable result is one the stream never finished writing. It
   * has no `tool-input` row either, and a provider refuses an unanswered call,
   * so it leaves with the failure. */
  const blocks: readonly JsonValue[] = Array.isArray(marker.content) ? marker.content : [];
  const content = blocks.filter(
    (block) => !isCall(block) || (isJsonObject(block) && typeof block['id'] === 'string' && settled.has(block['id'])),
  );
  if (!content.some((block) => isCall(block))) {
    return undefined;
  }
  const { errorMessage: _failed, diagnostics, ...metadata } = marker.metadata ?? {};
  const kept = diagnostics?.filter(
    (diagnostic) => !isJsonObject(diagnostic) || diagnostic['type'] !== transportFailureDiagnosticType,
  );
  return {
    ...marker,
    content,
    metadata: { ...metadata, stopReason: 'toolUse', ...(kept?.length ? { diagnostics: kept } : {}) },
  };
};

/**
 * The record that clears a resumable failure's marker before its call is re-issued.
 *
 * The stream wrapper records a failed call as an assistant message carrying the
 * transport-failure diagnostic. Left in place, pi refuses to continue from an
 * assistant tail and the recovery reminder tells the model a network drop
 * cancelled tools that in fact settled. The marker takes one of two shapes:
 * nothing ran after it, and retracting it restores the exact context the failed
 * call was built from; or a tool it had already started settled behind it, and
 * only its envelope can change ({@link settledMarkerEnvelope}) because a rewind
 * retains a prefix and the marker is no longer the tail.
 *
 * @param messages - The reduced history of the failed run.
 * @returns The event to append, or `undefined` when there is nothing to clear.
 */
const failureMarkerClearance = (messages: readonly ProviderMessage[]): SessionEvent | undefined => {
  const marker = messages.findLast((message) => message.role === 'assistant');
  if (!marker) {
    return undefined;
  }
  if (messages.at(-1) === marker) {
    return {
      type: 'history.rewound',
      trigger: 'retry',
      retainedMessageIds: messages.slice(0, -1).map((message) => message.id),
    };
  }
  /* Behind the tail, only a message that is provably the failure marker may be
   * rewritten: an ordinary assistant turn that happens to be the last one is
   * somebody's real output. */
  const isMarker = marker.metadata?.diagnostics?.some(
    (diagnostic) => isJsonObject(diagnostic) && diagnostic['type'] === transportFailureDiagnosticType,
  );
  const replacement = isMarker ? settledMarkerEnvelope(marker, messages) : undefined;
  return replacement === undefined
    ? undefined
    : { type: 'message.envelope-replaced', messageId: marker.id, replacement };
};

const terminalStates = new Set<RunLifecycleState>(['completed', 'failed', 'cancelled']);

/**
 * Failure codes whose run can be continued at the step it stopped on.
 *
 * A model call that failed — refused before it was funded, or dropped in the
 * middle of its stream — leaves the turn's history whole, and the only thing
 * missing is that one call. It is whole because the session settles what it
 * started: a tool the stream dispatched mid-response (`prestartTool`) records
 * its real result before the run is marked failed, so a resume continues from
 * the work that happened rather than re-applying it. Re-issuing that one call
 * is the entire recovery — no rewind of the turn, and no second charge for tool
 * work the customer already paid for. A failure that a second attempt would
 * only meet again (no evictable history, a lost leadership, a model the catalog
 * does not carry) ends the run for good and is dispatched afresh.
 *
 * One set, read by the host's own `resume` and by the surfaces that decide
 * whether to offer Resume at all. The non-resumable half is ruled by
 * `tau-agent-host.test.ts`, which keys both code unions exhaustively.
 */
const resumableRunFailureCodes = new Set<string>([
  'INSUFFICIENT_CREDIT',
  'INVALID_REQUEST',
  'MALFORMED_RESPONSE',
  'NETWORK_ERROR',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  /* The run's own host died with its document: nothing about the turn failed,
   * so continuing it at the step it stopped on is the whole recovery. Written
   * by {@link TauAgentHost.markAbandoned}, never by a run that is still alive. */
  'RUN_ABANDONED',
  // A session that expired mid-turn: signing in again is the whole recovery.
  'UNAUTHENTICATED',
  'UPSTREAM_REJECTED',
]);

/**
 * Whether an external agent's own stop leaves the turn continuable.
 *
 * An external turn stops on its provider's terms, not on a code Tau can rule:
 * the same `EXTERNAL_AGENT_LIMIT_REACHED` is a rate limit that clears in a
 * minute, a quota that clears at a stated hour, or a context ceiling only a new
 * session clears. The agent says which in `failure.actions`
 * ({@link externalAgentStopCodes}):
 *
 * - `retry` — the agent's own word that trying again can work.
 * - no actions at all on a `limit` — nothing helps *now*; what clears a quota
 *   is time, so the surface holds Resume until the reported reset and then
 *   continues the same vendor session.
 * - any other action (`new_session`, `login`) — that action has to happen
 *   first, and no resume can stand in for it.
 *
 * @param failure - The terminal record, as the runner attached its details.
 * @returns `true` when continuing the agent's own session is the recovery.
 */
const externalStopIsResumable = (failure: RunFailureDetail): boolean => {
  if (!externalAgentStopCodes.some((code) => code === failure.code)) {
    return false;
  }
  const stop = zodUtility.isObject(failure.details) ? failure.details['failure'] : undefined;
  const actions = zodUtility.isObject(stop) ? stop['actions'] : undefined;
  if (!Array.isArray(actions)) {
    return false;
  }
  return (
    actions.includes('retry') || (actions.length === 0 && zodUtility.isObject(stop) && stop['category'] === 'limit')
  );
};

/**
 * Whether a failed run's terminal record can be resumed at its blocked step.
 *
 * Reads the whole record, not just its code: an external agent's stop is
 * resumable or not by the actions the agent itself reported.
 *
 * @param failure - `RunFailureDetail` from the run's terminal record.
 * @returns `true` when `resume` will continue this run rather than replay it.
 * @public
 */
export const isResumableRunFailure = (failure: RunFailureDetail | undefined): boolean =>
  failure?.code !== undefined && (resumableRunFailureCodes.has(failure.code) || externalStopIsResumable(failure));

/**
 * The coded failure this run ended on, as its own lifecycle record states it.
 *
 * The one record every failure writes, whoever raised it: a model call leaves
 * its diagnostic on an assistant message as well, but an external agent's stop
 * leaves only this. A codeless failure is omitted — there is nothing for a
 * surface or a resume to rule on.
 *
 * @param events - The chat's durable events.
 * @param runId - The run to describe.
 * @returns The terminal failure, or `undefined` unless the run failed with a code.
 */
const terminalFailureOf = (events: readonly AgentLogEvent[], runId: string): HostRunFailure | undefined => {
  const last = events.findLast((event) => event.runId === runId && event.type === 'run.lifecycle');
  const detail = last?.type === 'run.lifecycle' && last.state === 'failed' ? last.detail : undefined;
  return detail?.code === undefined ? undefined : { ...detail, code: detail.code };
};

/* Whether this run's terminal record is a refusal {@link isResumableRunFailure} covers. */
const refusedResumably = (events: readonly AgentLogEvent[], runId: string): boolean =>
  isResumableRunFailure(terminalFailureOf(events, runId));

/**
 * Assemble Tau's portable run lifecycle over the pi adapter and W1-W5 ports.
 *
 * @param options - Browser-safe host dependencies.
 * @returns One reusable host bound to the injected ports.
 * @public
 */
export const createTauAgentHost = (options: CreateTauAgentHostOptions): TauAgentHost => {
  const createId = options.createId ?? createPortableId;
  const createLeaderEpoch = options.createLeaderEpoch ?? createPortableId;
  const now = options.now ?? (() => new Date());
  const logs = new Map<string, Promise<DurableEventLog>>();
  const leaderEpochs = new Map<string, string>();
  const activeByChat = new Map<string, ActiveRun>();
  const activeByRun = new Map<string, ActiveRun>();
  const reservationsByChat = new Map<string, AdmissionReservation>();
  const reservationsByRun = new Map<string, AdmissionReservation>();
  const fencedChats = new Set<string>();
  let closed = false;

  const assertOpen = (): void => {
    if (closed) {
      throw new Error('The Tau agent host is closed.');
    }
  };

  const logFor = async (chatId: string): Promise<DurableEventLog> => {
    const current = logs.get(chatId);
    if (current) {
      return current;
    }
    const opened = options.openEventLog(chatId);
    logs.set(chatId, opened);
    try {
      return await opened;
    } catch (error) {
      // A failed open must not poison the cache: the next attempt should retry,
      // and close() must not re-raise a rejection that its caller already saw.
      if (logs.get(chatId) === opened) {
        logs.delete(chatId);
      }
      throw error;
    }
  };

  const leaderEpochFor = (chatId: string): string => {
    if (fencedChats.has(chatId)) {
      throw Object.assign(new Error(`Leadership for chat ${chatId} was lost.`), { code: 'LEADERSHIP_LOST' });
    }
    const current = leaderEpochs.get(chatId);
    if (current) {
      return current;
    }
    const created = createLeaderEpoch();
    leaderEpochs.set(chatId, created);
    return created;
  };

  const assertGeneration = (chatId: string, generation: string): void => {
    if (fencedChats.has(chatId) || leaderEpochs.get(chatId) !== generation) {
      throw Object.assign(new Error(`Generation ${generation} no longer leads chat ${chatId}.`), {
        code: 'LEADERSHIP_LOST',
      });
    }
  };

  const fencedLog = (chatId: string, generation: string, log: DurableEventLog): DurableEventLog => ({
    append: async (event) => {
      assertGeneration(chatId, generation);
      if (event.leaderEpoch !== generation) {
        throw Object.assign(new Error(`Append generation does not match the leader for chat ${chatId}.`), {
          code: 'LEADERSHIP_LOST',
        });
      }
      return log.append(event);
    },
    read: async () => log.read(),
    readBatch: async (input) => log.readBatch(input),
    close: async () => log.close(),
  });

  /**
   * What this chat's run is doing in memory, in the ledger's vocabulary.
   *
   * @param chatId - The chat being asked about.
   * @returns `running` while a session is live, `reserved` while one is being
   * composed or an external runner holds the chat, and `none` otherwise.
   */
  const memoryRunStateOf = (chatId: string): HostRunState => {
    if (activeByChat.has(chatId)) {
      return 'running';
    }
    return reservationsByChat.has(chatId) || externalByChat.has(chatId) ? 'reserved' : 'none';
  };

  /** Serializes every writer on one chat's log; see {@link append}. */
  const chatAppends = new Map<string, Promise<void>>();

  const reserve = (chatId: string, runId?: string): AdmissionReservation => {
    const state = memoryRunStateOf(chatId);
    if (!isHostRunOperationLegal('admit', state)) {
      /* The *live* run's id, not the refused one: the caller's recovery waits
       * for the run that is in the way. A reservation that has not bound a run
       * id yet has none to name, and the caller falls back to its own bound. */
      throw chatRunLiveRefusal({
        chatId,
        runId:
          activeByChat.get(chatId)?.runId ?? reservationsByChat.get(chatId)?.runId ?? externalByChat.get(chatId)?.runId,
        state,
      });
    }
    if (runId && (reservationsByRun.has(runId) || activeByRun.has(runId))) {
      throw runIdTakenRefusal({ runId, held: 'is already admitted' });
    }
    const ready = Promise.withResolvers<ActiveRun | undefined>();
    const admitted = Promise.withResolvers<ActiveRun | undefined>();
    const reservation: AdmissionReservation = {
      chatId,
      ...(runId ? { runId } : {}),
      ready: ready.promise,
      resolveReady: ready.resolve,
      admitted: admitted.promise,
      resolveAdmitted: admitted.resolve,
    };
    reservationsByChat.set(chatId, reservation);
    if (runId) {
      reservationsByRun.set(runId, reservation);
    }
    return reservation;
  };

  const releaseReservation = (reservation: AdmissionReservation): void => {
    if (reservationsByChat.get(reservation.chatId) === reservation) {
      reservationsByChat.delete(reservation.chatId);
    }
    if (reservation.runId && reservationsByRun.get(reservation.runId) === reservation) {
      reservationsByRun.delete(reservation.runId);
    }
  };

  /**
   * Write one batch, with the chat's whole ledger already folded (I1).
   *
   * Runs inside {@link append}'s per-chat queue, which is what makes reading
   * the tail for the next sequence number safe and what makes the fold below
   * describe the log this batch is actually landing on.
   *
   * @param input - Chat, run, log handle, the bodies, and the epoch to write under.
   */
  const appendRecords = async (input: {
    readonly chatId: string;
    readonly log: DurableEventLog;
    readonly runId: string;
    readonly events: readonly SessionEvent[];
    readonly leaderEpoch?: string | undefined;
  }): Promise<void> => {
    /* A caller that already bound itself to an epoch writes under *that* one:
     * a session whose leadership was replaced mid-run must be fenced off, not
     * quietly re-stamped with whoever leads now. */
    const leaderEpoch = input.leaderEpoch ?? leaderEpochFor(input.chatId);
    const existing = await input.log.read();
    const entry = runLedgerOf(existing).runs.get(input.runId);
    let lifecycle = entry?.lifecycle;
    let settlement = entry?.settlement;
    /* A run this host is *executing* counts as admitted: its first lifecycle
     * row may not have landed yet, and a settlement is a fact about a turn that
     * really ran. A merely *reserved* run does not, and that is the difference
     * the original bypass missed: `reserve` registers the run at the top of
     * `admit`, before any session exists, so a lease that failed inside that
     * window wrote a phantom settlement the real one then conflicted with. */
    const executing = activeByRun.has(input.runId) || externalByRun.has(input.runId);
    const tail = existing.at(-1);
    let sequence = tail?.leaderEpoch === leaderEpoch ? tail.sequence + 1 : 0;
    for (const body of input.events) {
      /* Recomputed per body, not read once before the loop: two settlements in
       * one batch both saw "nothing settled yet" and both landed. */
      const state = appendStateOf({ lifecycle, settlement });
      if (settlementTypes.has(body.type)) {
        if (settlement !== undefined) {
          /* Exactly once: an identical repeat is the delivery guarantee doing
           * its job, a differing one is two authorities disagreeing. */
          if (isSameSettlement(settlement, body)) {
            continue;
          }
          throw settlementRefusal({ chatId: input.chatId, runId: input.runId, state });
        }
        if (!executing && !isHostSettlementLegal(state)) {
          throw settlementRefusal({ chatId: input.chatId, runId: input.runId, state });
        }
      } else if (
        body.type === 'run.lifecycle' &&
        !isHostLifecycleLegal({
          next: body.state,
          state,
          lifecycle,
          reopenable: lifecycle === 'paused' || refusedResumably(existing, input.runId),
        })
      ) {
        throw runIdTakenRefusal({
          runId: input.runId,
          held:
            body.state === 'admitted'
              ? 'has already been admitted'
              : 'is settled; only a resumable or paused run reopens',
        });
      }
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a spread of the body union cannot narrow to one record shape.
      const event = {
        ...body,
        version: 1,
        leaderEpoch,
        sequence,
        recordedAt: now().toISOString(),
        runId: input.runId,
      } as AgentLogEvent;
      // oxlint-disable-next-line no-await-in-loop -- W1 event ordering requires sequential durable appends.
      const outcome = await fencedLog(input.chatId, leaderEpoch, input.log).append(event);
      if (outcome.appended) {
        sequence++;
      }
      if (event.type === 'run.lifecycle') {
        lifecycle = event.state;
        if (event.state === 'running') {
          /* The reopening row starts a second attempt, which settles on its
           * own terms; the first attempt's settlement stays in the log. */
          settlement = undefined;
        }
      } else if (settlementTypes.has(event.type)) {
        settlement = event;
      }
    }
  };

  /**
   * The single choke point every durable record passes through (I2, V12).
   *
   * Serialized per chat, and that is load-bearing rather than defensive: the
   * next sequence number is derived from the log's own tail, so two concurrent
   * writers read the same tail and the second is rejected `EVENT_MUTATED`. The
   * run's own `AgentSession` used to be one of those writers, with a private
   * sequence counter of its own, so a settlement recorded for one run of a chat
   * could kill another run of the same chat mid-stream — and half the records
   * in the log never met the legality fold at all.
   *
   * @param input - Chat, run, log handle, the bodies, and the epoch to write under.
   */
  const append = async (input: {
    readonly chatId: string;
    readonly log: DurableEventLog;
    readonly runId: string;
    readonly events: readonly SessionEvent[];
    readonly leaderEpoch?: string | undefined;
  }): Promise<void> => {
    const prior = chatAppends.get(input.chatId) ?? Promise.resolve();
    let outcome: { readonly error: unknown } | undefined;
    /* The *chain* absorbs a failure so one refused append does not wedge the
     * chat's whole queue; the caller still sees it, re-thrown below. */
    const chained = (async (): Promise<void> => {
      await prior;
      try {
        await appendRecords(input);
      } catch (error) {
        outcome = { error };
      }
    })();
    chatAppends.set(input.chatId, chained);
    await chained;
    if (outcome) {
      throw outcome.error;
    }
  };

  /**
   * The model row the run's committed turn context recorded, if any turn got that far.
   *
   * @param log - The chat's durable log.
   * @param runId - The run being resumed.
   * @returns The committed model row, or `undefined` before the first commit.
   */
  const committedModelOf = async (log: DurableEventLog, runId: string): Promise<AgentSessionModel | undefined> => {
    const events = await log.read();
    const committed = events.findLast(
      (event) => event.runId === runId && event.type === 'turn.history-projection-committed',
    );
    return committed?.type === 'turn.history-projection-committed' ? committed.context.model : undefined;
  };

  const sessionFor = async (input: {
    readonly chatId: string;
    readonly runId: string;
    readonly leaderEpoch: string;
    readonly log: DurableEventLog;
    readonly config?: TauAgentAdmissionConfig | undefined;
  }): Promise<AgentSession> => {
    const clientContext =
      input.config?.clientContext ??
      (typeof options.clientContext === 'function' ? await options.clientContext() : options.clientContext);
    /* A resume names no admission: the model it ran on is the one its first
     * turn committed to the log, which a host with no default row must honour. */
    const model = input.config?.model ?? options.model ?? (await committedModelOf(input.log, input.runId));
    if (!model) {
      throw Object.assign(new Error('This Tau host configures no model; the admission must name one.'), {
        code: 'HOST_MODEL_UNAVAILABLE',
      });
    }
    return createAgentSession({
      chatId: input.chatId,
      runId: input.runId,
      leaderEpoch: input.leaderEpoch,
      systemPrompt: input.config?.systemPrompt ?? options.systemPrompt,
      systemPromptBlocks: input.config?.systemPromptBlocks ?? options.systemPromptBlocks,
      model,
      modelTransport: options.modelTransport,
      toolRegistry: options.toolRegistry,
      toolChoice: input.config?.toolChoice,
      allowedTools: input.config?.allowedTools,
      snapshot: input.config?.snapshot,
      contextMessages: input.config?.contextMessages,
      eventLog: fencedLog(input.chatId, input.leaderEpoch, input.log),
      /* I2: the session's own rows go through the host's one serialized writer,
       * so there is one sequence counter and one legality fold for every record
       * in the log rather than one of each per writer. */
      appendEvent: async (event) =>
        append({
          chatId: input.chatId,
          log: input.log,
          runId: input.runId,
          leaderEpoch: input.leaderEpoch,
          events: [event],
        }),
      clientContext,
      recentSkills: options.recentSkills,
      substituteToolResult: options.substituteToolResult,
      summarize: options.summarize,
      safeguardThresholds: options.safeguardThresholds,
      onSafeguardOutcome: options.onSafeguardOutcome,
      allowImageBlocks: options.allowImageBlocks,
      attachments: options.attachments,
      createId,
      now,
      onCompaction: options.onCompaction,
      onLiveEvent: options.onLiveEvent,
    });
  };

  const bindReservationRun = (reservation: AdmissionReservation, runId: string): void => {
    const existing = reservationsByRun.get(runId);
    if (existing && existing !== reservation) {
      throw runIdTakenRefusal({ runId, held: 'is already admitted' });
    }
    reservation.runId = runId;
    reservationsByRun.set(runId, reservation);
  };

  const execute = async (input: {
    readonly chatId: string;
    readonly runId: string;
    readonly log: DurableEventLog;
    readonly message?: UserProviderMessage | undefined;
    readonly reservation: AdmissionReservation;
    readonly config?: TauAgentAdmissionConfig | undefined;
  }): Promise<readonly ProviderMessage[]> => {
    let active: ActiveRun;
    try {
      active = {
        chatId: input.chatId,
        runId: input.runId,
        session: await sessionFor({ ...input, leaderEpoch: leaderEpochFor(input.chatId) }),
      };
    } catch (error) {
      input.reservation.resolveReady(undefined);
      input.reservation.resolveAdmitted(undefined);
      throw error;
    }
    activeByChat.set(input.chatId, active);
    activeByRun.set(input.runId, active);
    input.reservation.resolveReady(active);
    try {
      active.completion = input.message
        ? active.session.prompt(input.message, () => {
            input.reservation.resolveAdmitted(active);
          })
        : active.session.agent.continue();
      if (!input.message) {
        input.reservation.resolveAdmitted(active);
      }
      await active.completion;
      input.reservation.resolveAdmitted(active);
      const completed = await active.session.snapshot();
      return completed.messages;
    } catch (error) {
      input.reservation.resolveReady(undefined);
      input.reservation.resolveAdmitted(undefined);
      await append({
        chatId: input.chatId,
        log: input.log,
        runId: input.runId,
        events: [
          {
            type: 'run.lifecycle',
            state: 'failed',
            detail: codedFailureDetail(error),
          },
        ],
      });
      throw error;
    } finally {
      activeByChat.delete(input.chatId);
      activeByRun.delete(input.runId);
      releaseReservation(input.reservation);
    }
  };

  const externalByChat = new Map<string, { readonly runId: string; readonly controller: AbortController }>();
  /** `completion` is assigned as soon as the turn is detached; see {@link runExternal}. */
  const externalByRun = new Map<string, ExternalRun>();
  /**
   * Chats whose runner may still hold a live session, by run kind.
   *
   * A live ACP session outlives its run (V2), so the host has to remember which
   * runner to tell when the chat itself is done with.
   */
  const externalChats = new Map<string, string>();
  const detached = new Set<Promise<void>>();

  /**
   * Tell this chat's runner to end whatever it holds open for it.
   *
   * @param chatId - Chat being relinquished, rewound, or closed.
   */
  const closeExternalChat = async (chatId: string): Promise<void> => {
    const kind = externalChats.get(chatId);
    if (kind === undefined) {
      return;
    }
    externalChats.delete(chatId);
    await options.externalRunners?.[kind]?.closeChat?.(chatId);
  };

  /**
   * Cancel every interrupt a run still holds open.
   *
   * `pause` settles on a resolution and on nothing else — it never rejects and
   * never observes an abort — so an outstanding `session/request_permission` is
   * settled here or never: the record is durable, and every consumer of
   * `approval-requested` (banner, activity, unread badge, pending list) would
   * otherwise wait on a run that is already over (5-review S1). It is also what
   * lets a cancel reach a terminal state at all, since the runner's own turn is
   * blocked inside `approve` until the request it asked for is answered (V8).
   *
   * The resolution is recorded by `approve`, the one writer of that record.
   *
   * @param runId - The run being ended.
   */
  const cancelPendingInterrupts = async (runId: string): Promise<void> => {
    const pending = await options.interruptPort.pending({ runId });
    /* `allSettled`: one port that refuses a resolution must not cost the run its
     * terminal record, which is the caller this runs inside. */
    await Promise.allSettled(
      pending.map(async ({ interruptId }) => options.interruptPort.resume({ interruptId, outcome: 'cancelled' })),
    );
  };

  /**
   * Execute one external turn, and answer as soon as its admission is durable.
   *
   * @param input - Chat, run, selected agent, and the user message when new.
   */
  const runExternal = async (input: {
    readonly chatId: string;
    readonly runId: string;
    readonly agent: ExternalRunKind;
    readonly message?: UserProviderMessage | undefined;
    readonly state?: JsonObject | undefined;
    readonly config?: TauAgentAdmissionConfig | undefined;
  }): Promise<void> => {
    const port = options.externalRunners?.[input.agent.kind];
    if (!port) {
      throw Object.assign(new Error(`This Tau host runs no ${input.agent.kind} agents.`), {
        code: 'EXTERNAL_AGENT_UNAVAILABLE',
      });
    }
    const inventory = port.list?.();
    if (inventory && !inventory.includes(input.agent.id)) {
      throw Object.assign(new Error(`This Tau host cannot start the ${input.agent.id} agent.`), {
        code: 'EXTERNAL_AGENT_UNAVAILABLE',
      });
    }
    if (externalByChat.has(input.chatId)) {
      throw chatRunLiveRefusal({
        chatId: input.chatId,
        runId: externalByChat.get(input.chatId)?.runId,
        state: memoryRunStateOf(input.chatId),
      });
    }
    const log = await logFor(input.chatId);
    const controller = new AbortController();
    const appendEvents = async (events: readonly ExternalAgentLogEvent[]): Promise<void> =>
      append({ chatId: input.chatId, runId: input.runId, log, events });

    /* The admission is the durable boundary the caller waits on: the marker on
     * the user message is what a later attach reads to know this run needs an
     * external resume rather than the Tau host's. */
    let messageId = input.message?.id;
    await appendEvents([
      ...(input.message
        ? ([
            {
              type: 'message.appended',
              message: {
                ...input.message,
                metadata: {
                  ...input.message.metadata,
                  tauInternal: {
                    ...input.agent,
                    kind: externalTurnKind,
                    runKind: input.agent.kind,
                    agentId: input.agent.id,
                  },
                },
              },
            },
          ] as const)
        : []),
      /* Only a turn that carries a message is an *admission*; a resumed
       * external run continues the run it already has, and a second `admitted`
       * row for one run id is what the ledger refuses (I1). */
      ...(input.message ? ([{ type: 'run.lifecycle', state: 'admitted' }] as const) : []),
      { type: 'run.lifecycle', state: 'running' },
    ]);
    messageId ??= externalTurnOf(await log.read())?.messageId;
    externalByChat.set(input.chatId, { runId: input.runId, controller });
    externalChats.set(input.chatId, input.agent.kind);
    const tracked: ExternalRun = { chatId: input.chatId, controller };
    externalByRun.set(input.runId, tracked);

    const remember = async (state: JsonObject): Promise<void> => {
      /* Reduced, not raw: a `remember` merges into what the *last* one wrote,
       * and the last one wrote a `message.envelope-replaced`. Reading the
       * original `message.appended` instead made every call after the first
       * silently drop its predecessor's fields — the session id among them, so
       * a chat whose turn also recorded its model could never be resumed. */
      const current = reduceEventLog(await log.read()).findLast((message) => message.id === messageId);
      if (!current) {
        return;
      }
      await appendEvents([
        {
          type: 'message.envelope-replaced',
          messageId: current.id,
          replacement: {
            ...current,
            metadata: {
              ...current.metadata,
              tauInternal: {
                ...externalMarker(current),
                kind: externalTurnKind,
                runKind: input.agent.kind,
                agentId: input.agent.id,
                ...state,
              },
            },
          },
        },
      ]);
    };

    const approve = async (request: {
      readonly prompt: string;
      readonly payload?: JsonValue | undefined;
    }): Promise<InterruptResolution> => {
      const interruptId = createId();
      await appendEvents([
        {
          type: 'interrupt.recorded',
          interruptId,
          phase: 'requested',
          reason: request.prompt,
          payload: {
            kind: 'approval',
            prompt: request.prompt,
            /* Attribution is durable truth (V6): the banner has to be able to
             * name who is asking from the record itself. The live selection has
             * already moved on by the time a restart re-renders this, and it was
             * never the same fact — a chat can hold one agent's paused run while
             * the composer shows another. */
            agentId: input.agent.id,
            ...(request.payload === undefined ? {} : { context: request.payload }),
          },
        },
        { type: 'run.lifecycle', state: 'paused' },
      ]);
      const resolution = await options.interruptPort.pause({
        interruptId,
        runId: input.runId,
        kind: 'approval',
        prompt: request.prompt,
        ...(request.payload === undefined ? {} : { payload: request.payload }),
      });
      await appendEvents([
        {
          type: 'interrupt.recorded',
          interruptId,
          phase: 'resolved',
          reason: resolution.outcome,
          payload: {
            outcome: resolution.outcome,
            ...(resolution.optionId === undefined ? {} : { optionId: resolution.optionId }),
            ...(resolution.payload === undefined ? {} : { response: resolution.payload }),
          },
        },
        ...(resolution.outcome === 'approved' ? ([{ type: 'run.lifecycle', state: 'running' }] as const) : []),
      ]);
      return resolution;
    };

    const completion = (async (): Promise<void> => {
      try {
        const outcome = await port.run({
          agentId: input.agent.id,
          agent: input.agent,
          chatId: input.chatId,
          runId: input.runId,
          ...(input.message ? { message: input.message } : {}),
          ...(input.state ? { state: input.state } : {}),
          ...(input.config ? { config: input.config } : {}),
          history: await log.read(),
          append: appendEvents,
          appendSession: appendEvents,
          publishLive: async (event) => {
            await options.onLiveEvent?.({ ...event, chatId: input.chatId, runId: input.runId });
          },
          remember,
          approve,
          signal: controller.signal,
        });
        const { stopReason } = outcome ?? {};
        const state = controller.signal.aborted
          ? 'cancelled'
          : ((stopReason === undefined ? undefined : externalStopStates.get(stopReason)) ?? 'completed');
        const detail = stopReason === undefined ? undefined : externalStopDetail.get(stopReason);
        await appendEvents([
          {
            type: 'run.lifecycle',
            state,
            ...(stopReason === undefined ? {} : { stopReason }),
            ...(state === 'completed' || detail === undefined ? {} : { detail: { message: detail } }),
          },
        ]);
      } catch (error) {
        /* A refusal is a fact the user can act on, so the code the runner threw
         * is recorded and the affordance it carried — a login's URL, code or
         * command — is recorded *first*, as an interrupt every surface already
         * renders (V11/VSC4). Without both, a logged-out agent reaches the user
         * as one opaque sentence with a stderr tail (r4 §2). */
        const refusal = externalRefusalOf(error);
        /* Before the terminal record, so the appends `approve` issues when it
         * wakes are already queued on this chat's chain ahead of it. */
        await cancelPendingInterrupts(input.runId);
        /* Settled in the same breath it is requested: nothing ever answers a
         * login — there is no completion event and the affordance is
         * deliberately buttonless — so an unresolved record would leave every
         * consumer of `approval-requested` (banner, activity, unread badge)
         * stuck on a run that is already over. The payload rides the requested
         * record, so the surfaces still have the login to render. */
        const loginInterruptId = createId();
        await appendEvents([
          ...(refusal.login
            ? ([
                { ...refusal.login, interruptId: loginInterruptId },
                {
                  type: 'interrupt.recorded',
                  interruptId: loginInterruptId,
                  phase: 'resolved',
                  reason: 'cancelled',
                  payload: { outcome: 'cancelled' },
                },
              ] as const)
            : []),
          controller.signal.aborted
            ? { type: 'run.lifecycle', state: 'cancelled' }
            : { type: 'run.lifecycle', state: 'failed', detail: codedFailureDetail(error) },
        ]);
      } finally {
        if (externalByChat.get(input.chatId)?.runId === input.runId) {
          externalByChat.delete(input.chatId);
        }
        externalByRun.delete(input.runId);
      }
    })();
    tracked.completion = completion;
    detached.add(completion);
    const untrack = async (): Promise<void> => {
      try {
        await completion;
      } finally {
        detached.delete(completion);
      }
    };
    // async-iife: an external run outlives this call by design; `close()` drains `detached`.
    void untrack();
  };

  /**
   * Continue an external run a restart left unanswered.
   *
   * The state the previous attempt remembered (its protocol session id, its
   * cursor, the branch it worked in) rides the same log, so the runner
   * reconnects to the agent's own session rather than starting the turn again.
   *
   * @param chatId - Chat to recover.
   * @returns `true` when this chat's last run was external and was restarted.
   */
  const resumeExternal = async (chatId: string): Promise<boolean> => {
    const log = await logFor(chatId);
    const events = await log.read();
    const current = currentRun(events);
    const external = externalTurnOf(events);
    /* A terminal run has nothing to continue — unless the agent stopped it and
     * said a retry can help, which is the same continuation one attempt later
     * (R9/S11). */
    if (!current || !external || (terminalStates.has(current.state) && !refusedResumably(events, current.runId))) {
      return false;
    }
    const { agentId, kind: _kind, runKind, ...state } = external.marker;
    await runExternal({
      chatId,
      runId: current.runId,
      agent: { kind: runKind, id: agentId },
      /* The session this chat *reached*, not the one its admission asked for:
       * `remember` records the vendor session id by replacing the user
       * message's envelope, which only the reducer's view carries. Resuming
       * from the raw marker opened a second vendor session and replayed the
       * turn on the person's own quota. */
      state: externalSessionOf(events, agentId) ?? state,
    });
    return true;
  };

  const recordResolution = async (input: {
    readonly chatId: string;
    readonly log: DurableEventLog;
    readonly runId: string;
    readonly resolution: InterruptResolution;
  }): Promise<void> =>
    append({
      chatId: input.chatId,
      log: input.log,
      runId: input.runId,
      events: [
        {
          type: 'interrupt.recorded',
          interruptId: input.resolution.interruptId,
          phase: 'resolved',
          reason: input.resolution.outcome,
          payload: {
            outcome: input.resolution.outcome,
            ...(input.resolution.optionId === undefined ? {} : { optionId: input.resolution.optionId }),
            ...(input.resolution.payload === undefined ? {} : { response: input.resolution.payload }),
          },
        },
        ...(input.resolution.outcome === 'approved' ? [] : ([{ type: 'run.lifecycle', state: 'cancelled' }] as const)),
      ],
    });

  const waitForDurableResolution = async (input: {
    readonly chatId: string;
    readonly log: DurableEventLog;
    readonly request: InterruptRequest;
  }): Promise<InterruptResolution> => {
    const resolution = await options.interruptPort.pause(input.request);
    await recordResolution({
      chatId: input.chatId,
      log: input.log,
      runId: input.request.runId,
      resolution,
    });
    return resolution;
  };

  const activeRunFor = async (runId: string): Promise<ActiveRun | undefined> => {
    const active = activeByRun.get(runId);
    if (active) {
      return active;
    }
    return reservationsByRun.get(runId)?.ready;
  };

  /**
   * The chat's run as its log describes it, or `undefined` when it has none.
   *
   * Non-throwing, because most readers can live without a run and need the
   * transcript regardless: `attach` is how a chat is opened at all, and every
   * command epilogue answers with the projection it just changed. A thrown
   * `NO_RUN_ADMITTED` from there made a chat whose live run could not be
   * resumed impossible to open ever again — the permanent wedge, re-armed from
   * the other side. {@link TauAgentHost.snapshot} still refuses for the callers
   * that genuinely require a run.
   *
   * @param chatId - The chat being described.
   * @returns Its current run projection, or `undefined` when nothing was admitted.
   */
  const describeRun = async (chatId: string): Promise<HostRunSnapshot | undefined> => {
    assertOpen();
    const log = await logFor(chatId);
    const events = await log.read();
    const last = events.at(-1);
    if (!last) {
      return undefined;
    }
    const messages = reduceEventLog(events);
    /* A log with no lifecycle record at all admits no run, and the tail is the
     * only identity there is to answer with. Every log a host writes opens with
     * one, so this is the shape of a log written by nothing that ran. */
    const current = currentRun(events);
    if (current === undefined && memoryRunStateOf(chatId) === 'none') {
      /* R2: a run with no lifecycle record is not a run. Answering `admitted`
       * for one is the same default that made an abandoned lease's settlement
       * look like a live turn. The only honest reading left is the instant
       * between an admission's first record and its `admitted` row, and the
       * reservation above still holds that. */
      return undefined;
    }
    const runId = current?.runId ?? last.runId;
    /* The assistant diagnostic first, because it carries the transport's own
     * refusal fields; the lifecycle record when there is no such marker, which
     * is every failure that never was a model call — an external agent's stop
     * writes no assistant message at all. Without the fallback a surface read
     * no failure for those runs and could only rewind the turn (F1). */
    const failure = transportFailureFromProviderMessages(messages) ?? terminalFailureOf(events, runId);
    return {
      chatId,
      runId,
      turnId: latestTurnId(messages, runId),
      state: current?.state ?? 'admitted',
      messages,
      ...(failure ? { failure } : {}),
    };
  };

  const snapshot = async (chatId: string): Promise<HostRunSnapshot> => {
    const described = await describeRun(chatId);
    if (!described) {
      throw Object.assign(new Error(`Chat ${chatId} has no admitted run to describe.`), {
        code: 'NO_RUN_ADMITTED' satisfies AgentHostRefusalCode,
      });
    }
    return described;
  };

  return {
    admit: async (request) => {
      assertOpen();
      const reservation = reserve(request.chatId, request.runId);
      let executing = false;
      try {
        const log = await logFor(request.chatId);
        const events = await log.read();
        const ledger = runLedgerOf(events);
        if (ledger.chat !== undefined && !isHostRunOperationLegal('admit', ledger.chat.state)) {
          /* The same refusal the in-memory check raises, from the same builder:
           * a fresh worker's host has no run in memory, so this is the only
           * branch a reload-then-send ever reaches, and a recovery that could
           * not recognise it waited on nothing. */
          throw chatRunLiveRefusal({
            chatId: request.chatId,
            runId: ledger.chat.runId,
            state: ledger.chat.state,
          });
        }
        /* A *lifecycle* record is what makes this run id taken. Refusing on any
         * record at all refused every turn whose id a settlement had already
         * been written under, which is how one abandoned lease made a chat
         * single-turn for the rest of its life. */
        if (lifecycleFor(events, request.runId) !== undefined) {
          throw runIdTakenRefusal({ runId: request.runId, held: 'has already been admitted' });
        }
        // A history with nothing in it has nothing to rewind, so a rewinding
        // trigger *is* a first turn and runs as one. Gating on the log's
        // *records* instead wedged the chat whose first turn was stopped inside
        // the admission window: the log holds `admitted, cancelled`, the
        // projection is empty, and `0 >= 0` refused every later retry and edit
        // with `HISTORY_PREFIX_INVALID` forever.
        const projection = request.trigger === 'submit' ? [] : reduceEventLog(events);
        if (request.trigger !== 'submit' && projection.length > 0) {
          const messages = projection;
          /* The rewind point is the turn the caller names, and the prefix it
           * keeps is this log's own.
           *
           * A caller's transcript ids are not these: one run is one assistant
           * message on a page and any number of provider messages here, so a
           * caller can only ever name the *user* message its turn belongs to —
           * that id it minted and this log stored verbatim. Matching its
           * `retainedMessageIds` against this projection refused every rewind
           * whose retained prefix contained an assistant message, which is
           * every turn after the first (F2).
           *
           * ponytail: `retainedMessageIds` stays on the start input for the
           * caller that rewinds to a turn this log has never seen — the branch
           * below. The cleanup is to drop it from the waist entirely and make
           * the rewound turn the only thing a rewinding trigger carries. */
          const rewindTo = messages.findIndex((message) => message.id === request.message.id);
          if (
            rewindTo === -1 &&
            (request.retainedMessageIds.length > messages.length ||
              request.retainedMessageIds.some((id, index) => messages[index]?.id !== id))
          ) {
            throw Object.assign(new Error('Retry/edit/regenerate must retain an unchanged strict history prefix.'), {
              code: 'HISTORY_PREFIX_INVALID',
            });
          }
          await append({
            chatId: request.chatId,
            log,
            runId: request.runId,
            events: [
              {
                type: 'history.rewound',
                trigger: request.trigger,
                retainedMessageIds:
                  rewindTo === -1
                    ? request.retainedMessageIds
                    : messages.slice(0, rewindTo).map((message) => message.id),
              },
            ],
          });
        }
        const external = request.config?.agent;
        if (external) {
          /* Routed before `execute`, so an external turn never composes a Tau
           * admission: it carries no Tau model, prompt or tool grant. */
          executing = true;
          releaseReservation(reservation);
          reservation.resolveReady(undefined);
          reservation.resolveAdmitted(undefined);
          /* The chat's own session (VSC3), read on every trigger. A rewind keeps
           * the selection and drops the session: the vendor thread holds a turn
           * Tau has just retracted, so it is closed and a new one is opened. */
          const remembered = externalSessionOf(events, external.id);
          let state = remembered;
          if (request.trigger !== 'submit') {
            await closeExternalChat(request.chatId);
            if (remembered) {
              const { acpSessionId: _retired, ...carried } = remembered;
              state = carried;
            }
          }
          await runExternal({
            chatId: request.chatId,
            runId: request.runId,
            agent: external,
            message: request.message,
            ...(state ? { state } : {}),
            /* Defined by construction: `external` was read off it. */
            config: request.config,
          });
          return reduceEventLog(await log.read());
        }
        executing = true;
        return await execute({
          chatId: request.chatId,
          runId: request.runId,
          log,
          message: request.message,
          reservation,
          config: request.config,
        });
      } finally {
        if (!executing) {
          reservation.resolveReady(undefined);
          reservation.resolveAdmitted(undefined);
          releaseReservation(reservation);
        }
      }
    },
    resume: async (chatId) => {
      assertOpen();
      const reservation = reserve(chatId);
      let executing = false;
      try {
        const log = await logFor(chatId);
        let events = await log.read();
        if (events.length === 0) {
          throw new Error(`Chat ${chatId} has no durable session log.`);
        }
        const ledger = runLedgerOf(events);
        if (ledger.chat === undefined || !isHostRunOperationLegal('resume', ledger.chat.state)) {
          /* The ledger's `resume` row is every state but `none`, and `none` is
           * exactly a chat whose log admitted no run. Nothing to continue: the
           * caller gets the history as it stands rather than a fabricated
           * lifecycle for a run that never ran. */
          return reduceEventLog(events);
        }
        const { runId } = ledger.chat;
        const entry = ledger.runs.get(runId);
        const state = entry?.lifecycle;
        if (state === undefined) {
          return reduceEventLog(events);
        }
        /* A settled attempt is closed (I1). Reopening it is legal only for a
         * run the gateway refused resumably, or one paused waiting on a person
         * — the fold knows, and the chat-keyed memory `resume` used to read
         * does not survive the settlement that clears it. Without this the host
         * re-ran a settled run and the page's second, differing settlement was
         * refused `SETTLEMENT_CONFLICT` with no way forward. */
        if (entry?.state === 'settled' && !(state === 'paused' || refusedResumably(events, runId))) {
          return reduceEventLog(events);
        }
        if (terminalStates.has(state)) {
          if (!refusedResumably(events, runId)) {
            return reduceEventLog(events);
          }
          /* An external stop clears nothing: its trailing assistant message is
           * the agent's own work, and the vendor session still holds the turn
           * this resume continues. */
          const cleared = externalTurnOf(events) ? undefined : failureMarkerClearance(reduceEventLog(events));
          if (cleared) {
            await append({ chatId, log, runId, events: [cleared] });
            events = await log.read();
          }
        }
        if (externalTurnOf(events)) {
          /* An external run has no `AgentSession` to continue — its runner
           * reconnects to the agent's own session from the remembered state. */
          releaseReservation(reservation);
          reservation.resolveReady(undefined);
          reservation.resolveAdmitted(undefined);
          if (!externalByChat.has(chatId)) {
            await resumeExternal(chatId);
          }
          return reduceEventLog(await log.read());
        }
        bindReservationRun(reservation, runId);

        if (state === 'paused') {
          const pending = unresolvedInterrupt(events, runId);
          let resolution = lastInterruptResolution(events, runId);
          if (pending) {
            if (!isInterruptPayload(pending.payload)) {
              throw new Error(`Interrupt ${pending.interruptId} has no durable W5 request payload.`);
            }
            resolution = await waitForDurableResolution({
              chatId,
              log,
              request: {
                interruptId: pending.interruptId,
                runId,
                kind: pending.payload.kind,
                prompt: pending.payload.prompt,
                payload: pending.payload.context,
              },
            });
            events = await log.read();
          }
          if (resolution?.outcome !== 'approved') {
            return reduceEventLog(events);
          }
        }

        const history = reduceEventLog(events);
        const missingOutputs = pendingToolInputs(history);
        const disconnectedOutputs = missingOutputs.map(
          (message): ProviderMessage => ({
            id: createId(),
            role: 'tool-output',
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            content: {
              errorCode: 'CLIENT_DISCONNECTED',
              message: 'The prior host stopped before this tool returned. Verify state before retrying.',
            },
            isError: true,
            metadata: { timestamp: now().getTime() },
          }),
        );
        const recoveryEvents: SessionEvent[] = [
          { type: 'run.lifecycle', state: 'running' },
          ...disconnectedOutputs.map((message): SessionEvent => ({ type: 'message.appended', message })),
        ];
        const tail = history.at(-1);
        const reminder = await createInterruptRecoveryMessage({
          messages: [...history, ...disconnectedOutputs],
          timestamp: now().getTime(),
        });
        if (missingOutputs.length > 0 && !reminder) {
          throw new Error('Interrupted tool history could not produce a recovery reminder.');
        }
        if (reminder) {
          recoveryEvents.push({
            type: 'message.appended',
            message: reminder,
          });
        } else if (tail?.role === 'assistant') {
          await append({ chatId, log, runId, events: [{ type: 'run.lifecycle', state: 'completed' }] });
          return reduceEventLog(await log.read());
        }
        await append({ chatId, log, runId, events: recoveryEvents });
        executing = true;
        return await execute({ chatId, runId, log, reservation });
      } finally {
        if (!executing) {
          reservation.resolveReady(undefined);
          reservation.resolveAdmitted(undefined);
          releaseReservation(reservation);
        }
      }
    },
    waitForAdmission: async (chatId, runId) => {
      assertOpen();
      /* An external run holds no reservation and no `AgentSession` — its
       * admission is already durable by the time `runExternal` returns — but it
       * is every bit as admitted, and a caller asking "is a run already under
       * way here?" must not be told no and start a second one. */
      const external = externalByChat.get(chatId);
      if (external) {
        return runId !== undefined && external.runId !== runId ? undefined : snapshot(chatId);
      }
      /* Keyed by run when the caller named one: the chat-keyed reservation is
       * "whatever this chat is admitting", which answered one command with
       * another run's snapshot — the very run-id mismatch this wait exists to
       * prevent — while the refused command's own rejection went unobserved. */
      const reservation = runId === undefined ? reservationsByChat.get(chatId) : reservationsByRun.get(runId);
      if (!reservation || reservation.chatId !== chatId) {
        return undefined;
      }
      const active = await reservation.admitted;
      return active?.session.snapshot();
    },
    markAbandoned: async (chatId) => {
      assertOpen();
      const log = await logFor(chatId);
      const { chat } = runLedgerOf(await log.read());
      if (
        chat === undefined ||
        chat.state === 'none' ||
        chat.state === 'terminal' ||
        /* Waiting on a person, not on a host: republish its interrupt. */
        chat.state === 'paused' ||
        /* Ours: a takeover speaks only for a run whose driver is gone. */
        activeByRun.has(chat.runId) ||
        reservationsByRun.has(chat.runId) ||
        externalByRun.has(chat.runId)
      ) {
        return describeRun(chatId);
      }
      await append({
        chatId,
        log,
        runId: chat.runId,
        events: [
          {
            type: 'run.lifecycle',
            state: 'failed',
            detail: {
              code: 'RUN_ABANDONED' satisfies AgentHostRefusalCode,
              message: 'The host executing this run is gone. Resume the turn to continue it.',
            },
          },
        ],
      });
      return describeRun(chatId);
    },
    interrupt: async (request) => {
      assertOpen();
      const active = await activeRunFor(request.runId);
      if (!active) {
        throw new Error(`Run ${request.runId} is not active.`);
      }
      active.session.abort();
      await (active.completion ?? active.session.agent.waitForIdle());
      const log = await logFor(active.chatId);
      await append({
        chatId: active.chatId,
        log,
        runId: request.runId,
        events: [
          {
            type: 'interrupt.recorded',
            interruptId: request.interruptId,
            phase: 'requested',
            reason: request.prompt,
            payload: {
              kind: request.kind,
              prompt: request.prompt,
              ...(request.payload === undefined ? {} : { context: request.payload }),
            },
          },
          { type: 'run.lifecycle', state: 'paused' },
        ],
      });
      return waitForDurableResolution({ chatId: active.chatId, log, request });
    },
    resolveInterrupt: async ({ runId, ...resolution }) => {
      const pending = await options.interruptPort.pending({ runId });
      if (!pending.some((request) => request.interruptId === resolution.interruptId)) {
        throw new Error(
          `Interrupt ${resolution.interruptId} is not pending on run ${runId}: it was already resolved, cancelled with the run, or never issued.`,
        );
      }
      await options.interruptPort.resume(resolution);
    },
    pendingInterrupts: async (runId) => options.interruptPort.pending({ runId }),
    steer: async ({ runId, message }) => {
      assertOpen();
      if (externalByRun.has(runId)) {
        /* No external protocol Tau speaks has a steering frame: a mid-turn
         * nudge would have to become a second prompt, which is a different
         * turn, not this one. A typed refusal beats a silent no-op. */
        throw Object.assign(new Error('An external agent cannot be steered mid-turn.'), {
          code: 'EXTERNAL_AGENT_UNSUPPORTED',
        });
      }
      const active = await activeRunFor(runId);
      if (!active) {
        throw new Error(`Run ${runId} is not active.`);
      }
      active.session.steer(message);
    },
    cancel: async ({ runId }) => {
      assertOpen();
      const external = externalByRun.get(runId);
      if (external) {
        external.controller.abort();
        /* An outstanding approval outlives the abort: the runner's turn is
         * suspended inside `approve`, and a protocol that asked the *client* for
         * a decision cannot finish until the client gives one. Cancelling it is
         * that answer — without it the wait below never returns (V8). */
        await cancelPendingInterrupts(runId);
        /* D12 keeps the four meanings apart: requesting cancellation is not
         * observing settlement. A caller that reads the snapshot next must see
         * the runner's terminal `cancelled`, exactly as the Tau branch below
         * waits out its session. Detaching a client never comes through here. */
        await external.completion;
        return;
      }
      const active = await activeRunFor(runId);
      if (!active) {
        return;
      }
      active.session.abort();
      /* No drain here, unlike the external branch: a Tau run is ended by
       * `interrupt` *before* its durable pause begins, so an active Tau run never
       * holds a pending interrupt — a paused chat is answered by
       * `resolveInterrupt`, not by cancel (6-review F2, falsified). */
      await (active.completion ?? active.session.agent.waitForIdle());
    },
    snapshot,
    describeRun,
    readEvents: async ({ chatId, cursor, limit, maxBytes }) => {
      const log = await logFor(chatId);
      return log.readBatch({ cursor, limit, maxBytes });
    },
    recordSettlement: async ({ chatId, runId, event }) => {
      assertOpen();
      await append({ chatId, runId, log: await logFor(chatId), events: [event] });
    },
    assumeLeadership: (chatId, generation) => {
      assertOpen();
      const current = leaderEpochs.get(chatId);
      if (current && current !== generation && (reservationsByChat.has(chatId) || activeByChat.has(chatId))) {
        throw new Error(`Cannot replace the leader generation while chat ${chatId} is active.`);
      }
      fencedChats.delete(chatId);
      leaderEpochs.set(chatId, generation);
    },
    relinquish: async (chatId) => {
      fencedChats.add(chatId);
      leaderEpochs.delete(chatId);
      const active = activeByChat.get(chatId);
      active?.session.abort();
      if (active?.completion) {
        await Promise.allSettled([active.completion]);
      }
      /* An external run is aborted exactly as a Tau run is: giving up leadership
       * of a chat cannot leave an agent still writing into its tree. */
      const external = externalByChat.get(chatId);
      if (external) {
        external.controller.abort();
        await Promise.allSettled([externalByRun.get(external.runId)?.completion]);
      }
      await closeExternalChat(chatId);
      const log = logs.get(chatId);
      logs.delete(chatId);
      if (log) {
        const opened = await log.catch(() => undefined);
        await opened?.close();
      }
    },
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      for (const reservation of reservationsByChat.values()) {
        reservation.resolveReady(undefined);
        reservation.resolveAdmitted(undefined);
      }
      reservationsByChat.clear();
      reservationsByRun.clear();
      const active = [...activeByRun.values()];
      for (const { controller } of externalByRun.values()) {
        controller.abort();
      }
      await Promise.allSettled(detached);
      await Promise.allSettled([...externalChats.keys()].map(async (chatId) => closeExternalChat(chatId)));
      for (const run of active) {
        run.session.abort();
      }
      await Promise.allSettled(active.flatMap((run) => (run.completion ? [run.completion] : [])));
      await Promise.all(
        [...logs.values()].map(async (logPromise) => {
          const log = await logPromise.catch(() => undefined);
          await log?.close();
        }),
      );
    },
  };
};
