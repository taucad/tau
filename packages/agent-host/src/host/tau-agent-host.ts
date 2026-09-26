/**
 * The portable Tau host (W7): one M1 incarnation per chat serves every command, and this module provides its
 * services — the chat logs and their one append chain, admission and resume preparation, and the drivers (the pi
 * session and the external runners). The legacy verbs are thin adapters over `command`, kept until W6 RH-S7.
 */

import { waitFor } from 'xstate';

import { createTurnContextSnapshot } from '#harness/cad-middleware.js';
import type { ClientContext } from '#harness/cad-middleware.js';
import { codedFailureDetail } from '#harness/coded-failure.js';
import { createInterruptRecoveryMessage } from '#harness/interrupt-recovery.js';
import { createAgentSession, fundingPrincipal, settledRowOf } from '#harness/session.js';
import type {
  AgentRunOutcome,
  AgentSession,
  AgentSessionModel,
  HostClock,
  CreateAgentSessionOptions,
} from '#harness/session.js';
import { createPortableId, transportFailureOfRun } from '#harness/session-record.js';
import type { ChatRunServices, DriverHandle, DriverReport } from '#host/chat-run-effects.js';
import type { ChatRunKind, ChatRunOutcomeEvent, ChatRunRow } from '#host/chat-run-events.js';
import { createChatRunRegistry } from '#host/chat-run-registry.js';
import { startExternalTurn } from '#host/external-turn.driver.js';
import {
  externalMarker,
  externalSessionOf,
  externalTurnKind,
  externalTurnOf,
  failureMarkerClearance,
  isInterruptPayload,
  latestTurnId,
  pendingToolCalls,
} from '#host/run-history.js';
import {
  chatRunState,
  emptyChatLedger,
  foldChatLedger,
  gateRows,
  isForeignInvocation,
  isRepeatSettlement,
  stampRows,
  unresolvedInvocations,
} from '#log/chat-ledger.js';
import type { ChatLedger, LogRowBody } from '#log/chat-ledger.js';
import { v1Batch } from '#log/event-log-appender.js';
import type { EventLogBatch } from '#log/event-log-appender.js';
import { reduceEventLog } from '#log/reducer.js';
import type {
  AgentLogEvent,
  AgentToolChoice,
  JsonObject,
  JsonValue,
  ProviderMessage,
  RunTrigger,
  TurnContextSnapshot,
  TurnModelConfig,
  UserProviderMessage,
} from '#log/event-types.js';
import type {
  AgentLiveEvent,
  AgentLiveEventPayload,
  DurableEventLog,
  HostRunSnapshot,
  InterruptApprovalPort,
  InterruptRequest,
  InterruptResolution,
  ModelTransport,
  ToolRegistry,
  TurnAttemptKey,
  TurnPlacementPort,
} from '#waist/ports.js';
import type { AgentChannelAdmissionConfig } from '#wire/admission.schema.js';
import type { CommandAnswer, CommandPayload, HostCommand } from '#wire/commands.schema.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';
import { refusalOf } from '#wire/refusals.js';
import type { RefusalCode } from '#wire/refusals.js';

type SessionEvent = LogRowBody;

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
  /** The gesture's key, stamped on the admission's rows so a re-send answers from the applied set (D15). */
  readonly commandId?: string | undefined;
};

/** A command's key, for the host verbs a keyed command drives (D15, SC-R7). @public */
export type CommandKey = Readonly<{ commandId?: string | undefined }>;

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
  /** The run's attempt, from 1; a resumed turn has the next one (W10 EA-S8). */
  readonly attempt: number;
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
  /**
   * Legacy: M1 records every pause as rows and resolves it through `resolve-interrupt`; the host never calls this
   * port. W6 RH-S7 removes the last caller.
   */
  readonly interruptPort?: InterruptApprovalPort | undefined;
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
  /** W8's placement port: when wired, every attempt is placed, settled and acknowledged (RA-R12). */
  readonly placement?: TurnPlacementPort | undefined;
  /**
   * How many times one live run re-prepares a funded call whose reply was lost in transit (EQ1: a bound on repeated
   * charges, not a consent). Default 1; a further loss ends the run with the transport's resumable code.
   */
  readonly lostReplyRetries?: number | undefined;
  /**
   * The host's timers, in milliseconds: M1's idle eviction, driver stop bound and cut retry, and the model-stream stall
   * bound (E9, 300 s).
   */
  readonly delays?:
    | Readonly<{ idleEviction?: number; driverStopBound?: number; cutRetry?: number; streamStall?: number }>
    | undefined;
  /** The clock every incarnation and its stream stall bound run on; the process's timers when absent. */
  readonly clock?: HostClock | undefined;
};

/** Complete browser-safe lifecycle surface assembled over the W1-W5 ports. @public */
export type TauAgentHost = {
  /**
   * Answer one keyed command (SC-R4–SC-R9). Never rejects: every refusal is a coded answer. Applied answers are given
   * only once the command's rows are durable (I18).
   */
  command(input: HostCommand): Promise<CommandAnswer>;
  /** Commit and execute one new user turn; resolves once the run ended. A legacy verb over {@link TauAgentHost.command}; W6 RH-S7 removes the last caller. */
  admit(request: TauAgentTurnRequest): Promise<readonly ProviderMessage[]>;
  /** Rebuild one chat from its event log and continue a non-terminal run. A legacy verb over {@link TauAgentHost.command}; W6 RH-S7 removes the last caller. */
  resume(chatId: string, key?: CommandKey): Promise<readonly ProviderMessage[]>;
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
   * Legacy: `command` answers a start once its admission is durable; W6 RH-S7 removes the last caller.
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
   * Legacy: Opening a chat's M1 incarnation abandons an orphan (RA-R9); W6's claim replaces this.
   */
  markAbandoned(chatId: string): Promise<HostRunSnapshot | undefined>;
  /** Abort an active run, durably pause it, and wait through the W5 port. A legacy verb over {@link TauAgentHost.command}; W6 RH-S7 removes the last caller. */
  interrupt(request: InterruptRequest & CommandKey): Promise<InterruptResolution>;
  /** Resolve a W5 request from an external presenter; settles once the resolution row is durable (SC-R9). A legacy verb over {@link TauAgentHost.command}; W6 RH-S7 removes the last caller. */
  resolveInterrupt(resolution: InterruptResolution & { readonly runId: string } & CommandKey): Promise<void>;
  /** Return unresolved W5 requests for one run. */
  pendingInterrupts(runId: string): Promise<readonly InterruptRequest[]>;
  /** Queue steering on an active run. A legacy verb over {@link TauAgentHost.command}; W6 RH-S7 removes the last caller. */
  steer(input: { readonly runId: string; readonly message: string }): Promise<void>;
  /** Cancel an active run without creating an approval request, then wait out its settlement. A legacy verb over {@link TauAgentHost.command}; W6 RH-S7 removes the last caller. */
  cancel(input: { readonly runId: string } & CommandKey): Promise<void>;
  /** Rebuild the current run projection from W1, refusing `NO_RUN_ADMITTED` when there is none. */
  snapshot(chatId: string): Promise<HostRunSnapshot>;
  /** The same projection as {@link TauAgentHost.snapshot}, answering `undefined` rather than refusing. */
  describeRun(chatId: string): Promise<HostRunSnapshot | undefined>;
  /** The chat's ledger: its applied set, generation and runs (W3), for the command owner. */
  ledger(chatId: string): Promise<ChatLedger>;
  /**
   * One long-poll read (SC-R14): a batch as soon as a row exists after `cursor`, else wait for the next append or the
   * signal. Refuses rather than clamps (SC-R12); a fenced chat answers `owner-fenced`.
   */
  read(input: ReadInput): Promise<ReadAnswer>;
  /** Read one bounded event batch for follower projection (the version-1 clamp; W6's follower forwarding). */
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
  assumeLeadership(chatId: string, generation: string | number): void;
  /** Abort one chat and close its cached appender after leadership loss. */
  relinquish(chatId: string): Promise<void>;
  /**
   * Close an idle chat's log, releasing its writer lock, and drop its ledger; the next use reopens and refolds
   * (L2a D18). A chat with a run under way is refused `CHAT_RUN_LIVE`: its idle policy and close barrier are its
   * owner's (W6, W7).
   */
  evictChat(chatId: string): Promise<void>;
  /** Stop active work and close every opened appender. */
  close(): Promise<void>;
};

/** A chat's log, its ledger, its one append chain, and the attempts whose drivers may still write (RA-R6). */
type ChatStore = {
  log?: Promise<DurableEventLog> | undefined;
  ledger?: ChatLedger | undefined;
  /** Every write and every open/close of this chat, in order: one sequence counter, one fold (I2). */
  chain: Promise<unknown>;
  /** `${runId}:${attempt}` of each attempt whose driver's gate is open. */
  live: Set<string>;
  /** The live incarnation's outcome channel: a driver's rows advance its ledger (RA-R7). */
  deliver?: ((event: ChatRunOutcomeEvent) => void) | undefined;
  readers: Set<() => void>;
  /** The run kind whose runner may hold a session open for this chat (V2). */
  externalKind?: string | undefined;
  /** The ledger the host's close left: a read after close answers from it and opens nothing (L2a D14). */
  final?: ChatLedger | undefined;
};

type AdmissionRecord = Readonly<{
  kind: ChatRunKind;
  trigger: RunTrigger;
  turnId: string;
  message: UserProviderMessage;
  selection?: TurnModelConfig;
  context?: TurnContextSnapshot;
  rewind?: Readonly<{ trigger: Exclude<RunTrigger, 'submit'>; retainedMessageIds: readonly string[] }>;
  agent?: ExternalRunKind;
  config?: TauAgentAdmissionConfig;
  state?: JsonObject;
  checkoutId?: string;
}>;

const attemptKeyOf = (key: TurnAttemptKey): string => `${key.runId}:${String(key.attempt)}`;

/** A reply lost in transit: the transport's own failure, or a stalled stream. Not a refusal the gateway decided. */
const isLostReply = (ended: AgentRunOutcome): boolean => {
  const code = ended.outcome === 'failed' ? ended.failure?.code : undefined;
  return code !== undefined && (refusalOf(code).owner === 'transport' || code === 'MODEL_STREAM_STALLED');
};

const coded = (code: string, message: string, fields: Readonly<Record<string, unknown>> = {}): Error =>
  Object.assign(new Error(message), { code, ...fields });

/** The durable subset of a session model row. */
const turnModelOf = (model: AgentSessionModel): TurnModelConfig => ({
  id: model.id,
  contextWindow: model.contextWindow,
  ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
  ...(model.providerKind === undefined ? {} : { providerKind: model.providerKind }),
  ...(model.cost === undefined ? {} : { cost: model.cost }),
  ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
});

/** The wire's admission onto the host's: host defaults fill what the client omitted. */
const admissionConfigOf = (
  config: AgentChannelAdmissionConfig | undefined,
  fallback: Readonly<{ systemPrompt: string }>,
): TauAgentAdmissionConfig => ({
  systemPrompt: config?.systemPrompt ?? fallback.systemPrompt,
  ...(config?.systemPromptBlocks ? { systemPromptBlocks: config.systemPromptBlocks } : {}),
  ...(config?.model ? { model: config.model } : {}),
  toolChoice: config?.toolChoice ?? 'auto',
  ...(config?.allowedTools ? { allowedTools: config.allowedTools } : {}),
  ...(config?.snapshot === undefined ? {} : { snapshot: config.snapshot }),
  ...(config?.contextPayload ? { clientContext: config.contextPayload } : {}),
  ...(config?.contextMessages ? { contextMessages: config.contextMessages } : {}),
  ...(config?.agent
    ? {
        agent: {
          kind: config.agent.kind,
          id: config.agent.id,
          ...(config.agent.model ? { model: config.agent.model } : {}),
          ...(config.agent.config ? { config: config.agent.config } : {}),
        },
      }
    : {}),
});

/** Settles when `promise` does, never rejecting: a queue link one failure does not wedge. */
const absorbed = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    /* The caller of the link observes the failure; the queue does not. */
  }
};

/** A driver built asynchronously: M1 may abort or decide before it exists, and the calls wait for it. */
const deferredDriver = (build: Promise<DriverHandle>, report: (report: DriverReport) => void): DriverHandle => {
  let handle: DriverHandle | undefined;
  let aborted = false;
  const queued: Array<(ready: DriverHandle) => void> = [];
  const settle = async (): Promise<void> => {
    let ready: DriverHandle;
    try {
      ready = await build;
    } catch (error) {
      report({ type: 'agentEnded', outcome: aborted ? 'aborted' : 'failed', failure: codedFailureDetail(error) });
      return;
    }
    handle = ready;
    for (const call of queued.splice(0)) {
      call(ready);
    }
  };
  void settle();
  const via = (call: (ready: DriverHandle) => void): void => {
    if (handle === undefined) {
      queued.push(call);
    } else {
      call(handle);
    }
  };
  return {
    steer: (commandId, message) => {
      via((ready) => {
        ready.steer(commandId, message);
      });
    },
    abort: (reason) => {
      aborted = true;
      via((ready) => {
        ready.abort(reason);
      });
    },
    decide: (resolution) => {
      via((ready) => {
        ready.decide(resolution);
      });
    },
  };
};

/**
 * Assemble Tau's portable host: one M1 incarnation per chat (W7), over the chat logs, the pi session driver and the
 * external runners.
 *
 * @param options - Browser-safe host dependencies.
 * @returns One reusable host bound to the injected ports.
 * @public
 */
export const createTauAgentHost = (options: CreateTauAgentHostOptions): TauAgentHost => {
  const createId = options.createId ?? createPortableId;
  const now = options.now ?? (() => new Date());
  const stores = new Map<string, ChatStore>();
  /** Every run id this host has seen → its chat, for the verbs that name only a run. */
  const runChats = new Map<string, string>();
  /** Each chat's start or resume in flight, for {@link TauAgentHost.waitForAdmission}. */
  const admissions = new Map<string, Readonly<{ runId?: string; answer: Promise<CommandAnswer> }>>();
  /** Host-shaped admissions the legacy `admit` hands `prepareAdmission` beside its command. */
  const legacyConfigs = new Map<string, TauAgentAdmissionConfig>();
  /** The term a settlement is written under when no incarnation is live. */
  const settlementTerms = new Map<string, string>();
  let closed = false;

  const storeOf = (chatId: string): ChatStore => {
    let store = stores.get(chatId);
    if (store === undefined) {
      store = { chain: Promise.resolve(), live: new Set(), readers: new Set() };
      stores.set(chatId, store);
    }
    return store;
  };

  const assertOpen = (): void => {
    if (closed) {
      throw coded('HOST_CLOSED' satisfies RefusalCode, 'The Tau agent host is closed.');
    }
  };

  /** Run `work` after everything already queued on the chat; a failure does not wedge the queue. */
  const serial = async <Result>(chatId: string, work: () => Promise<Result>): Promise<Result> => {
    const store = storeOf(chatId);
    const previous = store.chain;
    const run = async (): Promise<Result> => {
      await previous;
      return work();
    };
    const result = run();
    store.chain = absorbed(result);
    return result;
  };

  const logOf = async (chatId: string): Promise<DurableEventLog> => {
    const store = storeOf(chatId);
    if (store.log === undefined) {
      const opened = options.openEventLog(chatId);
      store.log = opened;
      const forget = async (): Promise<void> => {
        try {
          await opened;
        } catch {
          if (store.log === opened) {
            store.log = undefined;
          }
        }
      };
      void forget();
    }
    return store.log;
  };

  const readRows = async (chatId: string): Promise<readonly AgentLogEvent[]> => {
    const log = await logOf(chatId);
    return log.read();
  };

  const messagesOf = async (chatId: string): ReturnType<DurableEventLog['messages']> => {
    const log = await logOf(chatId);
    return log.messages();
  };

  const readBatchOf = async (
    chatId: string,
    request: Parameters<DurableEventLog['readBatch']>[0],
  ): ReturnType<DurableEventLog['readBatch']> => {
    const log = await logOf(chatId);
    return log.readBatch(request);
  };

  const ledgerOf = async (chatId: string): Promise<ChatLedger> => {
    const store = storeOf(chatId);
    if (store.ledger !== undefined) {
      return store.ledger;
    }
    const log = await logOf(chatId);
    const read = foldChatLedger(emptyChatLedger, await log.read());
    // `read` returns rows only; a quarantined line the ledger never saw still breaks the history (CL-S2).
    const folded = (await log.historyIntact()) ? read : { ...read, historyIntact: false };
    store.ledger = folded;
    for (const runId of Object.keys(folded.runs)) {
      runChats.set(runId, chatId);
    }
    return folded;
  };

  const dropLog = async (chatId: string): Promise<void> => {
    const store = storeOf(chatId);
    const { log } = store;
    if (closed) {
      store.final = store.ledger ?? store.final;
    }
    store.log = undefined;
    store.ledger = undefined;
    const opened = await log?.catch(() => undefined);
    await opened?.close();
  };

  const wake = (store: ChatStore): void => {
    for (const reader of new Set(store.readers)) {
      reader();
    }
  };

  /** Resolves on the chat's next durable row, the host closing, or `signal`. */
  const nextRow = async (chatId: string, signal?: AbortSignal): Promise<void> =>
    new Promise<void>((resolve) => {
      const store = storeOf(chatId);
      const woken = (): void => {
        store.readers.delete(woken);
        signal?.removeEventListener('abort', woken);
        resolve();
      };
      store.readers.add(woken);
      signal?.addEventListener('abort', woken, { once: true });
    });

  /**
   * Write one batch under `leaderEpoch`, inside the chat's chain: stamped against the ledger, checked by the pure gate
   * (RA-R6), and appended one row at a time. A keyed steer's message row carries its command id (RA-R10).
   */
  const write = async (
    chatId: string,
    leaderEpoch: string,
    rows: readonly ChatRunRow[],
  ): Promise<Readonly<{ ledger: ChatLedger; messageIds: readonly string[] }>> => {
    const log = await logOf(chatId);
    let ledger = await ledgerOf(chatId);
    const recordedAt = now().toISOString();
    let scratch = ledger;
    const stamped = rows.map((row) => {
      const steer =
        row.body.type === 'message.appended' && row.body.message.id.startsWith('steer:')
          ? row.body.message.id.slice('steer:'.length)
          : undefined;
      const commandId = row.commandId ?? steer;
      const [event] = stampRows({
        ledger: scratch,
        leaderEpoch,
        runId: row.runId,
        recordedAt,
        ...(commandId === undefined ? {} : { commandId }),
        bodies: [row.body],
      });
      scratch = foldChatLedger(scratch, [event]);
      return event!;
    });
    /* PrepareOnlyWhenResolved is on: every writer records a resolved attempt before the next is prepared (RA-S11). */
    const gated = gateRows(ledger, stamped);
    if (!gated.ok) {
      const row = stamped[gated.row]!;
      throw coded(
        gated.code,
        gated.code === 'CHAT_RUN_LIVE'
          ? `Chat ${chatId} has a ${chatRunState(ledger)} run; send the command again after it ends.`
          : `Run ${row.runId} cannot record ${row.type === 'run.lifecycle' ? `"${row.state}"` : row.type} (${gated.code}).`,
        { effect: 'not-applied', ...(gated.code === 'RUN_ID_TAKEN' ? { runId: row.runId } : {}) },
      );
    }
    const store = storeOf(chatId);
    const messageIds: string[] = [];
    let landed = 0;
    for (const row of stamped) {
      if (isRepeatSettlement(ledger, row)) {
        continue;
      }
      let outcome: Awaited<ReturnType<DurableEventLog['append']>>;
      try {
        // oxlint-disable-next-line no-await-in-loop -- W1 event ordering requires sequential durable appends.
        outcome = await log.append(row);
      } catch (error) {
        if (codedFailureDetail(error).code === 'LOG_FENCED') {
          // The log moved under this writer: the next incarnation rereads it (RA-A9).
          store.ledger = undefined;
        }
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          effect: landed === 0 ? 'not-applied' : 'unknown',
        });
      }
      if (outcome.appended) {
        ledger = foldChatLedger(ledger, [row]);
        store.ledger = ledger;
        landed += 1;
        runChats.set(row.runId, chatId);
        if (row.type === 'message.appended') {
          messageIds.push(row.message.id);
        }
        wake(store);
      }
    }
    return { ledger, messageIds };
  };

  /** A driver's rows: refused once M1 closed its attempt's gate, then handed to M1's ledger (RA-R6, RA-R7). */
  const driverAppender =
    ({
      chatId,
      key,
      leaderEpoch,
      gated = true,
    }: Readonly<{ chatId: string; key: TurnAttemptKey; leaderEpoch: string; gated?: boolean }>) =>
    async (bodies: readonly LogRowBody[]): Promise<void> => {
      const store = storeOf(chatId);
      /* L2a D14: no row reaches a chat whose host closed or whose incarnation ended; nothing reopens its log. */
      assertOpen();
      const { deliver } = store;
      if (deliver === undefined || (gated && !store.live.has(attemptKeyOf(key)))) {
        throw coded(
          'RUN_NOT_LIVE' satisfies RefusalCode,
          `Run ${key.runId}'s attempt ${String(key.attempt)} has ended.`,
        );
      }
      const committed = await serial(chatId, async () =>
        write(
          chatId,
          leaderEpoch,
          bodies.map((body) => ({ runId: key.runId, body })),
        ),
      );
      /* The incarnation's own channel: it drops the outcome if the incarnation stopped meanwhile (RV4). */
      deliver({ type: 'rowsCommitted', ledger: committed.ledger, messageIds: committed.messageIds });
    };

  const closeExternalChat = async (chatId: string): Promise<void> => {
    const store = storeOf(chatId);
    const kind = store.externalKind;
    if (kind === undefined) {
      return;
    }
    store.externalKind = undefined;
    await options.externalRunners?.[kind]?.closeChat?.(chatId);
  };

  const admittedRowOf = (
    events: readonly AgentLogEvent[],
    runId: string,
  ): (AgentLogEvent & { readonly admission?: AdmissionRecord }) | undefined =>
    events.find((event) => event.runId === runId && event.type === 'run.lifecycle' && event.state === 'admitted') as
      | (AgentLogEvent & { readonly admission?: AdmissionRecord })
      | undefined;

  /**
   * Resolve every unresolved model attempt in the chat before a Resume prepares anything (RA-S11, EQ1): each terminal
   * or voided answer becomes a settled row; a pending one refuses `MODEL_ATTEMPT_PENDING`; an attempt another account
   * funded (or any, on an unfunded transport) refuses `MODEL_ATTEMPT_OTHER_ACCOUNT` before any lookup, and is neither
   * voided nor recorded (RV5-F2).
   */
  const resolveInvocations = async (ledger: ChatLedger): Promise<LogRowBody[]> => {
    const open = unresolvedInvocations(ledger);
    if (open.length === 0) {
      return [];
    }
    const { funding } = options.modelTransport;
    if (funding.type !== 'funded') {
      throw coded(
        'MODEL_ATTEMPT_OTHER_ACCOUNT' satisfies RefusalCode,
        "A Tau account funded this chat's last model request; sign in to that account to continue it.",
        { details: { attemptId: open[0]! } },
      );
    }
    const principal = await fundingPrincipal(funding);
    const foreign = open.find((attemptId) => isForeignInvocation(ledger.invocations[attemptId]!, principal));
    if (foreign !== undefined) {
      throw coded(
        'MODEL_ATTEMPT_OTHER_ACCOUNT' satisfies RefusalCode,
        "Another Tau account funded this chat's last model request; sign in to that account to continue it.",
        { details: { attemptId: foreign } },
      );
    }
    const rows: LogRowBody[] = [];
    for (const attemptId of open) {
      // oxlint-disable-next-line no-await-in-loop -- one lookup at a time, in preparation order.
      const resolution = await funding.resolveInvocation({ attemptId, signal: new AbortController().signal });
      if (resolution.status === 'pending' || resolution.status === 'unavailable') {
        throw coded(
          'MODEL_ATTEMPT_PENDING' satisfies RefusalCode,
          "The gateway has not finished this chat's last model request; resume once it has.",
          { details: { attemptId } },
        );
      }
      rows.push(settledRowOf(attemptId, resolution) as LogRowBody);
    }
    return rows;
  };

  // ── M1's services (RA-R7) ────────────────────────────────────────────────────────────────────────

  const services: ChatRunServices = {
    openLog: async ({ chatId, deliver }) =>
      serial(chatId, async () => {
        const store = storeOf(chatId);
        /* Every incarnation refolds (MC-R5): a stale writer may have appended since the last one read. */
        store.ledger = undefined;
        const ledger = await ledgerOf(chatId);
        store.deliver = deliver;
        const runId = ledger.currentRunId;
        const repair: ChatRunRow[] = [];
        if (runId !== undefined) {
          const opened = await logOf(chatId);
          const events = await opened.read();
          const admitted = admittedRowOf(events, runId);
          const rewind = admitted?.admission?.rewind;
          if (
            rewind !== undefined &&
            !events.some((event) => event.runId === runId && event.type === 'history.rewound')
          ) {
            /* Split admission (L2a D7): the intent landed without its rewind; the journaled rewind finishes it. */
            repair.push({ runId, body: { type: 'history.rewound', ...rewind } });
          }
        }
        /* Model attempts (GI-R10): each answered attempt is recorded now; a pending one waits for the next claim or
         * Resume, and an attempt another account funded is never asked about (Resume refuses it, RV5-F2). */
        const { funding } = options.modelTransport;
        const unresolved = unresolvedInvocations(ledger);
        if (funding.type === 'funded' && unresolved.length > 0) {
          /* The account is asked only when there is something to resolve; an account it cannot read resolves
           * nothing now, as a pending lookup does (Resume refuses it UNAUTHENTICATED). */
          const principal = await fundingPrincipal(funding).catch(() => null);
          const own =
            principal === null
              ? []
              : unresolved.filter((attemptId) => !isForeignInvocation(ledger.invocations[attemptId]!, principal));
          for (const attemptId of own) {
            // oxlint-disable-next-line no-await-in-loop -- one lookup at a time, in preparation order.
            const resolution = await funding
              .resolveInvocation({ attemptId, signal: new AbortController().signal })
              .catch(() => undefined);
            if (resolution?.status === 'terminal' || resolution?.status === 'voided') {
              repair.push({
                runId: ledger.invocations[attemptId]!.runId,
                body: settledRowOf(attemptId, resolution) as LogRowBody,
              });
            }
          }
        }
        return { ledger, repair };
      }),
    append: async ({ chatId, leaderEpoch, rows, ends }) => {
      const store = storeOf(chatId);
      if (ends !== undefined) {
        /* The gate closes before the ending batch is queued: a driver row queued after it is refused (RA-R6). */
        store.live.delete(attemptKeyOf(ends));
      }
      return serial(chatId, async () => write(chatId, leaderEpoch, rows));
    },
    prepareAdmission: async ({ chatId, commandId, payload }) => {
      const start = payload as unknown as CommandPayload<'start'>;
      const config =
        legacyConfigs.get(commandId) ?? admissionConfigOf(start.config, { systemPrompt: options.systemPrompt });
      legacyConfigs.delete(commandId);
      const log = await logOf(chatId);
      const events = await log.read();
      const { agent } = config;
      if (agent !== undefined) {
        const port = options.externalRunners?.[agent.kind];
        if (port === undefined) {
          throw coded(
            'EXTERNAL_AGENT_UNAVAILABLE' satisfies RefusalCode,
            `This Tau host runs no ${agent.kind} agents.`,
          );
        }
        const inventory = port.list?.();
        if (inventory && !inventory.includes(agent.id)) {
          throw coded(
            'EXTERNAL_AGENT_UNAVAILABLE' satisfies RefusalCode,
            `This Tau host cannot start the ${agent.id} agent.`,
          );
        }
      }
      /* A history with nothing in it has nothing to rewind, so a rewinding trigger is a first turn. */
      let rewind: AdmissionRecord['rewind'];
      if (start.trigger !== 'submit') {
        const messages = await log.messages();
        if (messages.length > 0) {
          /* The rewind point is the turn the caller names; the prefix it keeps is this log's own (F2). */
          const rewindTo = messages.findIndex((message) => message.id === start.message.id);
          const retained = start.retainedMessageIds ?? [];
          if (
            rewindTo === -1 &&
            (retained.length > messages.length || retained.some((id, index) => messages[index]?.id !== id))
          ) {
            throw coded(
              'HISTORY_PREFIX_INVALID',
              'Retry/edit/regenerate must retain an unchanged strict history prefix.',
            );
          }
          rewind = {
            trigger: start.trigger,
            retainedMessageIds: rewindTo === -1 ? retained : messages.slice(0, rewindTo).map((message) => message.id),
          };
        }
      }
      const base = {
        trigger: start.trigger,
        turnId: start.message.id,
        message: start.message,
        ...(rewind === undefined ? {} : { rewind }),
        ...(start.checkoutId === undefined ? {} : { checkoutId: start.checkoutId }),
      };
      const intent = (admission: AdmissionRecord): LogRowBody[] => [
        { type: 'run.lifecycle', state: 'admitted', admission } as unknown as LogRowBody,
        ...(rewind === undefined ? [] : [{ type: 'history.rewound', ...rewind } satisfies LogRowBody]),
      ];
      if (agent !== undefined) {
        /* The chat's own session (VSC3). A rewind keeps the selection and drops the vendor session, which holds a
         * turn Tau has just retracted. */
        const remembered = externalSessionOf(events, agent.id);
        let state: JsonObject | undefined = remembered;
        if (rewind !== undefined) {
          await closeExternalChat(chatId);
          if (remembered) {
            const { acpSessionId: _retired, ...carried } = remembered;
            state = carried;
          }
        }
        const marked: UserProviderMessage = {
          ...start.message,
          metadata: {
            ...start.message.metadata,
            tauInternal: { ...agent, kind: externalTurnKind, runKind: agent.kind, agentId: agent.id },
          },
        };
        return {
          kind: 'external',
          turnId: start.message.id,
          intent: intent({
            kind: 'external',
            ...base,
            agent,
            config,
            ...(state === undefined ? {} : { state }),
          } as AdmissionRecord),
          start: [{ type: 'message.appended', message: marked }],
          ...(start.checkoutId === undefined ? {} : { checkoutId: start.checkoutId }),
        };
      }
      const model = config.model ?? options.model;
      if (model === undefined) {
        throw coded('HOST_MODEL_UNAVAILABLE', 'This Tau host configures no model; the admission must name one.');
      }
      const clientContext =
        config.clientContext ??
        (typeof options.clientContext === 'function' ? await options.clientContext() : options.clientContext);
      /* Journaled (RA-R3): a restart before the turn commits replays exactly this admission. */
      const context = await createTurnContextSnapshot({
        chatId,
        systemPrompt: config.systemPrompt,
        systemPromptBlocks: config.systemPromptBlocks ?? options.systemPromptBlocks,
        model: turnModelOf(model),
        toolChoice: config.toolChoice,
        allowedTools: config.allowedTools,
        snapshot: config.snapshot,
        contextMessages: config.contextMessages,
        clientContext,
        recentSkills: options.recentSkills,
      });
      return {
        kind: 'tau',
        turnId: start.message.id,
        intent: intent({ kind: 'tau', ...base, selection: turnModelOf(model), context }),
        start: [],
        ...(start.checkoutId === undefined ? {} : { checkoutId: start.checkoutId }),
      };
    },
    prepareResume: async ({ chatId, runId, payload }) => {
      const resume = payload as unknown as CommandPayload<'resume'>;
      const log = await logOf(chatId);
      const ledger = await ledgerOf(chatId);
      const entry = ledger.runs[runId];
      const events = await log.read();
      const settled = await resolveInvocations(ledger);
      const selection = resume.selection === undefined ? {} : { selection: resume.selection };
      const running = { type: 'run.lifecycle', state: 'running', ...selection } as unknown as LogRowBody;
      if (entry?.kind === 'external' || externalTurnOf(events) !== undefined) {
        return { kind: 'external', turnId: entry?.turnId ?? runId, mode: 'continue', intent: [running, ...settled] };
      }
      if (entry?.committed !== true && admittedRowOf(events, runId)?.admission !== undefined) {
        /* The turn never committed: the journaled admission is replayed (RA-R3). */
        return { kind: 'tau', turnId: entry?.turnId ?? runId, mode: 'start', intent: [running, ...settled] };
      }
      const recovery: LogRowBody[] = [...settled];
      let history = await log.messages();
      if (entry?.lifecycle === 'failed') {
        const cleared = failureMarkerClearance(history);
        if (cleared?.type === 'history.rewound') {
          const retained = new Set(cleared.retainedMessageIds);
          history = history.filter((message) => retained.has(message.id));
        } else if (cleared?.type === 'message.envelope-replaced') {
          history = history.map((message) => (message.id === cleared.messageId ? cleared.replacement : message));
        }
        if (cleared) {
          recovery.push(cleared);
        }
      }
      const missing = pendingToolCalls(history);
      const disconnected = missing.map(
        (call): ProviderMessage => ({
          id: createId(),
          role: 'tool-output',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          content: {
            errorCode: 'CLIENT_DISCONNECTED',
            message: 'The prior host stopped before this tool returned. Verify state before retrying.',
          },
          isError: true,
          metadata: { timestamp: now().getTime() },
        }),
      );
      recovery.push(...disconnected.map((message): LogRowBody => ({ type: 'message.appended', message })));
      const reminder = await createInterruptRecoveryMessage({
        messages: [...history, ...disconnected],
        timestamp: now().getTime(),
      });
      if (missing.length > 0 && !reminder) {
        throw coded('HISTORY_INVALID', 'Interrupted tool history could not produce a recovery reminder.');
      }
      if (reminder) {
        recovery.push({ type: 'message.appended', message: reminder });
      }
      return {
        kind: 'tau',
        turnId: entry?.turnId ?? latestTurnId(history, runId),
        /* The tail already answers the turn: the attempt ends with no call. */
        mode: !reminder && history.at(-1)?.role === 'assistant' ? 'complete' : 'continue',
        /* `running` first, so the command's cursor is the reopening row (ChatRunSlot.tla resume; W7.r1). */
        intent: [running, ...recovery],
      };
    },
    startDriver: ({ key, kind, mode, leaderEpoch, report, grant }) => {
      const { chatId, runId } = key;
      const store = storeOf(chatId);
      store.live.add(attemptKeyOf(key));
      const append = driverAppender({ chatId, key, leaderEpoch });
      if (kind === 'external') {
        return deferredDriver(
          (async () => {
            const log = await logOf(chatId);
            const events = await log.read();
            const admission = admittedRowOf(events, runId)?.admission;
            const marker = externalTurnOf(events)?.marker;
            const agentId = admission?.agent?.id ?? marker?.agentId;
            const runKind = admission?.agent?.kind ?? marker?.runKind ?? 'acp';
            const port = options.externalRunners?.[runKind];
            if (agentId === undefined || port === undefined) {
              throw coded(
                'EXTERNAL_AGENT_UNAVAILABLE' satisfies RefusalCode,
                `This Tau host runs no ${runKind} agents.`,
              );
            }
            store.externalKind = runKind;
            const agent: ExternalRunKind = admission?.agent ?? { kind: runKind, id: agentId };
            /* The session this chat reached, not the one its admission asked for: `remember` replaces the user
             * message's envelope, which only the reducer's view carries. */
            const state =
              mode === 'start' ? admission?.state : (externalSessionOf(events, agentId) ?? admission?.state);
            const remember = async (remembered: JsonObject): Promise<void> => {
              const current = externalTurnOf(await log.read());
              const message =
                current && reduceEventLog(await log.read()).findLast((entry) => entry.id === current.messageId);
              if (!message) {
                return;
              }
              await append([
                {
                  type: 'message.envelope-replaced',
                  messageId: message.id,
                  replacement: {
                    ...message,
                    metadata: {
                      ...message.metadata,
                      tauInternal: {
                        ...externalMarker(message),
                        kind: externalTurnKind,
                        runKind,
                        agentId,
                        ...remembered,
                      },
                    },
                  },
                },
              ]);
            };
            return startExternalTurn({
              port,
              turn: {
                agentId,
                agent,
                chatId,
                runId,
                attempt: key.attempt,
                ...(mode === 'start' && admission?.message ? { message: admission.message } : {}),
                ...(mode === 'start' && admission?.config ? { config: admission.config } : {}),
                ...(state === undefined ? {} : { state }),
                history: events,
                append,
                /* Session state the agent reports between prompts outlives the attempt: not gated by it (VSC3). */
                appendSession: driverAppender({ chatId, key, leaderEpoch, gated: false }),
                publishLive: async (event) => {
                  await options.onLiveEvent?.({ ...event, chatId, runId });
                },
                remember,
              },
              createInterruptId: createId,
              append,
              report,
            });
          })(),
          report,
        );
      }
      return deferredDriver(
        (async () => {
          const log = await logOf(chatId);
          const events = await log.read();
          const admission = admittedRowOf(events, runId)?.admission;
          const resumed = events.findLast(
            (event) => event.runId === runId && event.type === 'run.lifecycle' && event.state === 'running',
          ) as (AgentLogEvent & { readonly selection?: TurnModelConfig }) | undefined;
          const selection = mode === 'start' ? undefined : resumed?.selection;
          const committed = events.findLast(
            (event) => event.runId === runId && event.type === 'turn.history-projection-committed',
          );
          const model =
            selection ??
            (mode === 'start' ? admission?.selection : undefined) ??
            (committed?.type === 'turn.history-projection-committed' ? committed.context.model : undefined) ??
            options.model ??
            admission?.selection;
          if (model === undefined) {
            throw coded('HOST_MODEL_UNAVAILABLE', 'This Tau host configures no model; the admission must name one.');
          }
          const clientContext =
            typeof options.clientContext === 'function' ? await options.clientContext() : options.clientContext;
          const build = async (first: boolean): Promise<AgentSession> =>
            createAgentSession({
              chatId,
              runId,
              leaderEpoch,
              systemPrompt: admission?.context?.systemPrompt ?? options.systemPrompt,
              systemPromptBlocks: options.systemPromptBlocks,
              model,
              modelTransport: options.modelTransport,
              /* The attempt's tools, as W8 granted them over its checkout (RA-R12); the host's without placement. */
              toolRegistry: grant?.tools ?? options.toolRegistry,
              eventLog: log,
              /* I2: the session's rows go through the chat's one chain, gated by its attempt (RA-R6). */
              appendEvent: async (event) => append([event as LogRowBody]),
              ...(first && mode === 'start' && admission?.context !== undefined ? { context: admission.context } : {}),
              ...(selection === undefined ? {} : { selection }),
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
              clock: options.clock,
              streamStall: options.delays?.streamStall,
            });
          let session = await build(true);
          let stopped = false;
          /* Read through a call: `abort` lands between the loop's awaits, which narrowing cannot see. */
          const isStopped = (): boolean => stopped;
          const { funding } = options.modelTransport;
          const funded = funding.type === 'funded' && funding.usesBillingAttempt(model.providerKind);
          /* EQ1, charge and proceed: a funded reply lost in transit is retried in this live run, at most
           * `lostReplyRetries` times. The next attempt's prepare resolves and records the lost one first
           * (ChargeAfterRecordedLoss); a further loss ends the run with the transport's resumable code. */
          const drive = async (): Promise<AgentRunOutcome> => {
            const message = admission?.message;
            let ended =
              mode === 'start' && message !== undefined ? await session.prompt(message) : await session.continue();
            if (!funded) {
              return ended;
            }
            for (let retries = options.lostReplyRetries ?? 1; retries > 0; retries--) {
              if (stopped || !isLostReply(ended)) {
                break;
              }
              /* A stop can land at any await below: no funded call leaves after it (W7.r1 finding 5). */
              // oxlint-disable-next-line no-await-in-loop -- the failure marker is cleared before the step continues.
              const cleared = failureMarkerClearance(await log.messages());
              if (cleared && !isStopped()) {
                // oxlint-disable-next-line no-await-in-loop -- as above.
                await append([cleared]);
              }
              if (isStopped()) {
                break;
              }
              // oxlint-disable-next-line no-await-in-loop -- one session per try.
              session = await build(false);
              if (isStopped()) {
                session.abort();
                break;
              }
              // oxlint-disable-next-line no-await-in-loop -- as above.
              ended = await session.continue();
            }
            return ended;
          };
          const reportEnding = async (): Promise<void> => {
            let ended: AgentRunOutcome;
            try {
              ended = await drive();
            } catch (error) {
              report({
                type: 'agentEnded',
                outcome: stopped ? 'aborted' : 'failed',
                failure: codedFailureDetail(error),
              });
              return;
            }
            report({
              type: 'agentEnded',
              outcome: ended.outcome,
              ...(ended.failure === undefined ? {} : { failure: ended.failure }),
            });
          };
          void reportEnding();
          return {
            steer: (commandId: string, text: string) => {
              session.steer(text, `steer:${commandId}`);
            },
            abort: () => {
              stopped = true;
              session.abort();
            },
            decide: () => undefined,
          };
        })(),
        report,
      );
    },
    closeLog: async (chatId) => {
      const store = storeOf(chatId);
      store.deliver = undefined;
      store.live.clear();
      await closeExternalChat(chatId).catch(() => undefined);
      await serial(chatId, async () => dropLog(chatId));
    },
    ...(options.placement === undefined ? {} : { placement: options.placement }),
  };

  const registry = createChatRunRegistry({
    services,
    createTerm: options.createLeaderEpoch ?? createPortableId,
    ...(options.delays === undefined ? {} : { delays: options.delays }),
    ...(options.clock === undefined ? {} : { actorOptions: { clock: options.clock } }),
  });

  /** Wait until the chat's incarnation holds no slot: its attempt ended, was recorded and settled. */
  const slotReleased = async (chatId: string): Promise<void> => {
    const actor = registry.actorOf(chatId);
    if (actor !== undefined) {
      await waitFor(actor, (snapshot) => snapshot.status !== 'active' || !snapshot.hasTag('slotHeld')).catch(
        () => undefined,
      );
    }
  };

  const refusal = (answer: CommandAnswer): Error | undefined =>
    answer.status === 'refused'
      ? coded(answer.code, answer.message, {
          ...answer.details,
          ...(answer.effect === 'unknown' ? { effect: 'unknown' } : {}),
        })
      : undefined;

  const describeRun = async (chatId: string): Promise<HostRunSnapshot | undefined> => {
    assertOpen();
    const ledger = await ledgerOf(chatId);
    const runId = ledger.currentRunId;
    /* R2 (D19): a run with no lifecycle record is not a run; nothing is inferred as `admitted`. */
    if (runId === undefined) {
      return undefined;
    }
    const log = await logOf(chatId);
    const events = await log.read();
    /* The incremental, tolerant history: reading never fails a chat, even one it refuses to run (D16). */
    const messages = await log.messages();
    const entry = ledger.runs[runId];
    /* This run's own assistant diagnostic first, then its lifecycle record (F1). */
    const failure = transportFailureOfRun({ events, messages, runId }) ?? entry?.failure;
    return {
      chatId,
      runId,
      turnId: entry?.turnId ?? latestTurnId(messages, runId),
      state: entry?.lifecycle ?? 'admitted',
      messages,
      ...(failure ? { failure } : {}),
    };
  };

  const snapshot = async (chatId: string): Promise<HostRunSnapshot> => {
    const described = await describeRun(chatId);
    if (!described) {
      throw coded('NO_RUN_ADMITTED' satisfies RefusalCode, `Chat ${chatId} has no admitted run to describe.`);
    }
    return described;
  };

  const chatOfRun = (runId: string): string => {
    const chatId = runChats.get(runId);
    if (chatId === undefined) {
      throw coded('RUN_NOT_LIVE' satisfies RefusalCode, `Run ${runId} is not active.`);
    }
    return chatId;
  };

  const execute = async (command: HostCommand): Promise<CommandAnswer> => {
    if (command.type === 'attach') {
      const { chatId } = command.payload;
      const claim = await registry.claim(chatId);
      if ('refused' in claim) {
        return { ...claim.refused, commandId: command.commandId };
      }
      const ledger = await ledgerOf(chatId);
      const run = await describeRun(chatId);
      return {
        commandId: command.commandId,
        generation: ledger.maxEpoch,
        status: 'applied',
        effect: 'not-applied',
        details: {
          ...(run === undefined ? {} : { snapshot: run as unknown as JsonValue }),
          takeover: claim.takeover,
          endCursor: ledger.position.cursor,
        },
      };
    }
    if (command.type === 'start') {
      /* Known before any row, so a legacy cancel of a reserving run finds its chat. */
      runChats.set(command.payload.runId, command.payload.chatId);
    }
    const answer = registry.execute(command);
    if (command.type === 'start' || command.type === 'resume') {
      const entry = { runId: command.payload.runId, answer };
      admissions.set(command.payload.chatId, entry);
      const release = async (): Promise<void> => {
        await absorbed(answer);
        if (admissions.get(command.payload.chatId) === entry) {
          admissions.delete(command.payload.chatId);
        }
      };
      void release();
    }
    return answer;
  };

  const pendingInterrupts = async (runId: string): Promise<readonly InterruptRequest[]> => {
    const chatId = runChats.get(runId);
    if (chatId === undefined) {
      return [];
    }
    const ledger = await ledgerOf(chatId);
    const pending = ledger.runs[runId]?.pendingInterrupts ?? {};
    if (Object.keys(pending).length === 0) {
      return [];
    }
    const events = await readRows(chatId);
    return events.flatMap((event): InterruptRequest[] =>
      event.runId === runId &&
      event.type === 'interrupt.recorded' &&
      event.phase === 'requested' &&
      pending[event.interruptId] !== undefined &&
      isInterruptPayload(event.payload)
        ? [
            {
              interruptId: event.interruptId,
              runId,
              kind: event.payload.kind,
              prompt: event.payload.prompt,
              ...(event.payload.context === undefined ? {} : { payload: event.payload.context }),
            },
          ]
        : [],
    );
  };

  return {
    command: execute,
    admit: async (request) => {
      assertOpen();
      const commandId = request.commandId ?? `start:${request.runId}`;
      if (request.config !== undefined) {
        legacyConfigs.set(commandId, request.config);
      }
      const answer = await execute({
        type: 'start',
        commandId,
        payload: {
          chatId: request.chatId,
          runId: request.runId,
          message: request.message,
          trigger: request.trigger,
          ...(request.trigger === 'submit' ? {} : { retainedMessageIds: [...request.retainedMessageIds] }),
        },
      });
      legacyConfigs.delete(commandId);
      const refused = refusal(answer);
      if (refused) {
        throw refused;
      }
      const actor = registry.actorOf(request.chatId);
      if (request.config?.agent === undefined) {
        await slotReleased(request.chatId);
      } else if (actor !== undefined) {
        /* An external admission answers once its turn is running: the runner owns it from there. */
        await waitFor(actor, (snapshot) => snapshot.status !== 'active' || !snapshot.matches('reserving')).catch(
          () => undefined,
        );
      }
      if (registry.isFenced(request.chatId)) {
        throw coded('LEADERSHIP_LOST' satisfies RefusalCode, `This host no longer leads chat ${request.chatId}.`);
      }
      return messagesOf(request.chatId);
    },
    resume: async (chatId, key) => {
      assertOpen();
      const ledger = await ledgerOf(chatId);
      const runId = ledger.currentRunId;
      if (runId === undefined) {
        if (ledger.position.cursor === 0) {
          throw coded('NO_RUN_ADMITTED' satisfies RefusalCode, `Chat ${chatId} has no durable session log.`);
        }
        return messagesOf(chatId);
      }
      const answer = await execute({
        type: 'resume',
        commandId: key?.commandId ?? createId(),
        payload: { chatId, runId },
      });
      const refused = refusal(answer);
      if (refused && answer.status === 'refused' && answer.code !== 'RESUME_UNAVAILABLE') {
        throw refused;
      }
      if (answer.status === 'applied' && answer.effect === 'durable' && ledger.runs[runId]?.kind !== 'external') {
        await slotReleased(chatId);
      }
      return messagesOf(chatId);
    },
    waitForAdmission: async (chatId, runId) => {
      assertOpen();
      const pending = admissions.get(chatId);
      if (pending !== undefined && (runId === undefined || pending.runId === runId)) {
        const answer = await pending.answer;
        return answer.status === 'refused' ? undefined : describeRun(chatId);
      }
      const actor = registry.actorOf(chatId);
      const live = actor?.getSnapshot().hasTag('slotHeld') === true;
      if (!live) {
        return undefined;
      }
      const described = await describeRun(chatId);
      return runId === undefined || described?.runId === runId ? described : undefined;
    },
    markAbandoned: async (chatId) => {
      assertOpen();
      /* Opening the chat's incarnation abandons an orphan as its term's claim (RA-R9). */
      const claim = await registry.claim(chatId);
      if ('refused' in claim) {
        throw refusal(claim.refused) ?? coded('HOST_FAULT', 'The chat could not be claimed.');
      }
      return describeRun(chatId);
    },
    interrupt: async ({ commandId, ...request }) => {
      assertOpen();
      const chatId = chatOfRun(request.runId);
      const answer = await execute({
        type: 'interrupt',
        commandId: commandId ?? createId(),
        payload: {
          chatId,
          runId: request.runId,
          interruptId: request.interruptId,
          kind: request.kind,
          prompt: request.prompt,
          ...(request.payload === undefined ? {} : { payload: request.payload }),
        },
      });
      const refused = refusal(answer);
      if (refused) {
        throw refused;
      }
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- waits row by row for the person's decision.
        const ledger = await ledgerOf(chatId);
        const resolution = ledger.runs[request.runId]?.lastResolution;
        if (resolution?.interruptId === request.interruptId) {
          return resolution;
        }
        if (closed) {
          throw coded('HOST_CLOSED' satisfies RefusalCode, 'The Tau agent host is closed.');
        }
        // oxlint-disable-next-line no-await-in-loop -- as above.
        await nextRow(chatId);
      }
    },
    resolveInterrupt: async ({ runId, commandId, ...resolution }) => {
      assertOpen();
      const chatId = runChats.get(runId);
      if (chatId === undefined) {
        throw coded(
          'INTERRUPT_NOT_PENDING' satisfies RefusalCode,
          `Interrupt ${resolution.interruptId} is not pending on run ${runId}: it was already resolved, cancelled with the run, or never issued.`,
        );
      }
      const answer = await execute({
        type: 'resolve-interrupt',
        commandId: commandId ?? createId(),
        payload: {
          chatId,
          runId,
          interruptId: resolution.interruptId,
          outcome: resolution.outcome,
          ...(resolution.optionId === undefined ? {} : { optionId: resolution.optionId }),
          ...(resolution.payload === undefined ? {} : { payload: resolution.payload }),
        },
      });
      const refused = refusal(answer);
      if (refused) {
        throw refused;
      }
    },
    pendingInterrupts,
    steer: async ({ runId, message }) => {
      assertOpen();
      const answer = await execute({
        type: 'steer',
        commandId: createId(),
        payload: { chatId: chatOfRun(runId), runId, message },
      });
      const refused = refusal(answer);
      if (refused) {
        throw refused;
      }
    },
    cancel: async ({ runId, commandId }) => {
      assertOpen();
      const chatId = runChats.get(runId);
      if (chatId === undefined) {
        return;
      }
      const answer = await execute({ type: 'cancel', commandId: commandId ?? createId(), payload: { chatId, runId } });
      if (answer.status === 'refused' && (answer.code === 'HOST_CLOSED' || answer.code === 'LEADERSHIP_LOST')) {
        throw refusal(answer) ?? coded('HOST_FAULT', 'The cancel was refused.');
      }
    },
    snapshot,
    describeRun,
    ledger: async (chatId) => {
      if (!closed) {
        return ledgerOf(chatId);
      }
      /* A closed host still answers a final read from the ledger its close left, so its caller settles what the
       * close drained; it never reopens the log (L2a D14). */
      const final = stores.get(chatId)?.final;
      if (final === undefined) {
        assertOpen();
      }
      return final!;
    },
    read: async ({ signal, ...request }) => {
      assertOpen();
      const { chatId } = request;
      for (;;) {
        if (registry.isFenced(chatId)) {
          return { status: 'refused', chatId, reason: 'owner-fenced' };
        }
        /* SC-R14: register the wake before reading, so a row appended while the read is in flight is not missed. */
        const woken = nextRow(chatId, signal);
        // oxlint-disable-next-line no-await-in-loop -- a long poll re-reads after each wake.
        const answer = await readBatchOf(chatId, request);
        if (answer.status === 'refused') {
          return { status: 'refused', chatId, reason: answer.reason, expected: answer.expected };
        }
        if (answer.events.length > 0 || closed || signal?.aborted) {
          return {
            status: 'batch',
            chatId,
            cursor: answer.cursor,
            nextCursor: answer.nextCursor,
            endCursor: answer.endCursor,
            events: [...answer.events],
          };
        }
        // oxlint-disable-next-line no-await-in-loop -- one park per empty read.
        await woken;
      }
    },
    readEvents: async ({ chatId, cursor, limit, maxBytes }) => {
      // The version-1 wire's read: a cursor past the end is clamped here, and only here (CL-R7).
      return v1Batch(await readBatchOf(chatId, { cursor, limit, maxBytes }));
    },
    recordSettlement: async ({ chatId, runId, event }) => {
      assertOpen();
      if (registry.isFenced(chatId)) {
        throw coded('LEADERSHIP_LOST' satisfies RefusalCode, `This host no longer leads chat ${chatId}.`);
      }
      /* A settlement is a fact about an ended attempt, not a command: it opens no incarnation, so it abandons
       * nothing. Written under the live term, else the assumed one, else this host's own. */
      let leaderEpoch = registry.termOf(chatId) ?? settlementTerms.get(chatId);
      if (leaderEpoch === undefined) {
        leaderEpoch = (options.createLeaderEpoch ?? createPortableId)();
        settlementTerms.set(chatId, leaderEpoch);
      }
      const term = leaderEpoch;
      const committed = await serial(chatId, async () => write(chatId, term, [{ runId, body: event }]));
      storeOf(chatId).deliver?.({ type: 'rowsCommitted', ledger: committed.ledger, messageIds: [] });
    },
    assumeLeadership: (chatId, generation) => {
      assertOpen();
      registry.assume(chatId, String(generation));
    },
    relinquish: async (chatId) => {
      await registry.relinquish(chatId);
      wake(storeOf(chatId));
      await closeExternalChat(chatId).catch(() => undefined);
      await serial(chatId, async () => dropLog(chatId));
    },
    evictChat: async (chatId) => {
      assertOpen();
      await registry.evict(chatId);
      await serial(chatId, async () => dropLog(chatId));
    },
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await registry.close();
      for (const store of stores.values()) {
        wake(store);
      }
      await Promise.allSettled([...stores.keys()].map(async (chatId) => closeExternalChat(chatId)));
      await Promise.allSettled([...stores.keys()].map(async (chatId) => serial(chatId, async () => dropLog(chatId))));
    },
  };
};
