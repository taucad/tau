/**
 * The portable Tau host (W7): one M1 incarnation per chat serves every command, and this module provides its
 * services — the chat logs and their one append chain, admission and resume preparation, and the drivers (the pi
 * session and the external runners). The legacy verbs are thin adapters over `command`, kept only for their
 * remaining callers.
 */

import { sameSourceHealth } from '#log/projection-facts.js';
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
import type { ExternalAgentPort, ExternalRunKind, TauAgentAdmissionConfig } from '#host/external-agent.js';
import { startExternalTurn } from '#host/external-turn.driver.js';
import {
  externalMarker,
  externalSessionOf,
  externalTurnKind,
  externalTurnOf,
  failureMarkerClearance,
  isInterruptPayload,
  isJsonObject,
  latestTurnId,
  pendingToolCalls,
} from '#host/run-history.js';
import {
  chatRunState,
  emptyChatLedger,
  foldChatLedger,
  foldPhysicalChatLedger,
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
  DurableEventLog,
  HostRunSnapshot,
  InterruptRequest,
  HostToolApproval,
  HostToolApprovalRecord,
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
import { turnSettlementSchema } from '#wire/settlement.schema.js';

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
  /**
   * W8's placement port: every attempt is placed, settled and acknowledged (RA-R12). A host without one only reads: it
   * refuses every `start` and `resume` `REVISIONS_UNAVAILABLE` before any row, so no run edits unplaced (D13).
   */
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
  /**
   * Told each time a chat's incarnation becomes quiescent: no run executing, no command in flight and no settlement
   * awaiting `acknowledge` (`true`), and each time it stops being so (`false`). The launcher's leadership releases the
   * chat's lock once it is quiescent and nothing is in flight (W6 RH-R8).
   */
  readonly onChatQuiescent?: ((chatId: string, quiescent: boolean) => void) | undefined;
};

/** Complete browser-safe lifecycle surface assembled over the W1-W5 ports. @public */
export type TauAgentHost = {
  /**
   * Answer one keyed command (SC-R4–SC-R9). Never rejects: every refusal is a coded answer. Applied answers are given
   * only once the command's rows are durable (I18).
   */
  command(input: HostCommand): Promise<CommandAnswer>;
  /** Commit and execute one new user turn; resolves once the run ended. A legacy verb over {@link TauAgentHost.command}, kept for W7's host tests; it goes with them. */
  admit(request: TauAgentTurnRequest): Promise<readonly ProviderMessage[]>;
  /** Rebuild one chat from its event log and continue a non-terminal run. A legacy verb over {@link TauAgentHost.command}, kept for W7's host tests; it goes with them. */
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
   * Legacy: `command` answers a start once its admission is durable. Its last product caller is the v1 wire session
   * (`agent-wire-v1-session.ts`); it goes with that session.
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
   * Legacy: a claim opens the chat's M1 incarnation, which abandons an orphan (RA-R9, RH-R9); only W7's host tests
   * still call this.
   *
   * @param chatId - The chat whose current run may be abandoned.
   * @returns The chat's run projection after the record, or `undefined` when it has no run.
   */
  markAbandoned(chatId: string): Promise<HostRunSnapshot | undefined>;
  /** Abort an active run, durably pause it, and wait through the W5 port. A legacy verb over {@link TauAgentHost.command}, kept for W7's host tests; it goes with them. */
  interrupt(request: InterruptRequest & CommandKey): Promise<InterruptResolution>;
  /** Resolve a W5 request from an external presenter; settles once the resolution row is durable (SC-R9). A legacy verb over {@link TauAgentHost.command}, kept for W7's host tests; it goes with them. */
  resolveInterrupt(resolution: InterruptResolution & { readonly runId: string } & CommandKey): Promise<void>;
  /** Return unresolved W5 requests for one run. */
  pendingInterrupts(runId: string): Promise<readonly InterruptRequest[]>;
  /** Queue steering on an active run. A legacy verb over {@link TauAgentHost.command}; nothing calls it any more. */
  steer(input: { readonly runId: string; readonly message: string }): Promise<void>;
  /** Cancel an active run without creating an approval request, then wait out its settlement. A legacy verb over {@link TauAgentHost.command}, kept for W7's host tests; it goes with them. */
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
  /**
   * Lead one chat at `epoch`, the log's highest epoch plus one as the leader read it (D5, W6 RH-S3). Clears a
   * relinquished chat's fence; the next incarnation's first append claims the term, conditional on that read.
   */
  assumeLeadership(chatId: string, epoch: number): void;
  /**
   * Open the chat's incarnation and wait until it serves: its opening abandons a run no driver holds and reconciles
   * before any command (W6 RH-R9, W7 RA-R9). The claim, never a read, writes those rows.
   */
  claim(chatId: string): Promise<Readonly<{ takeover: boolean }> | Readonly<{ refused: CommandAnswer }>>;
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
 * Append one batch to a chat's log under `leaderEpoch`: stamped against the ledger, checked by the pure gate (RA-R6),
 * and appended one row at a time, skipping a settlement the ledger already holds (TS-R18). A keyed steer's message row
 * carries its command id (RA-R10). Every writer of the host goes through it, M1's settlement rows included; the Lean
 * model's `hostSettle` is this function over one settlement row.
 *
 * @param input - The chat, its log and ledger, the term and time the rows are stamped with, and a hook per landed row.
 * @returns The ledger after the batch.
 * @internal
 */
export const appendChatRows = async (
  input: Readonly<{
    chatId: string;
    log: Pick<DurableEventLog, 'append'>;
    ledger: ChatLedger;
    leaderEpoch: string;
    recordedAt: string;
    rows: readonly ChatRunRow[];
    onAppended?: (row: AgentLogEvent, ledger: ChatLedger) => void;
  }>,
): Promise<ChatLedger> => {
  const { chatId, log, leaderEpoch, recordedAt, rows } = input;
  let { ledger } = input;
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
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        effect: landed === 0 ? 'not-applied' : 'unknown',
      });
    }
    if (outcome.appended) {
      ledger = foldChatLedger(ledger, [row]);
      landed += 1;
      input.onAppended?.(row, ledger);
    }
  }
  return ledger;
};

/**
 * What the person answered to the approvals this run paused on since it last ran (D5, GM.r1 H2), as one reminder the
 * continued attempt reads. The paused call's own output only says the run paused (TS-R10 ends the attempt before any
 * answer exists), so without this the model saw a failed call and nothing else.
 *
 * A denial or a Stop ends the run with no attempt left to tell, so the chat's next run is told instead (`ended`): its
 * calls ask again, because a recalled answer never crosses runs.
 *
 * @param events - The chat's rows.
 * @param runId - The run being continued, or the ended run the next one follows.
 * @param at - The reminder's time, and whether it is for the next run after `runId` ended.
 * @returns The reminder, or `undefined` when no approval was answered since the run's last attempt.
 */
const approvalAnswers = (
  events: readonly AgentLogEvent[],
  runId: string,
  at: Readonly<{ timestamp: number; ended?: boolean }>,
): UserProviderMessage | undefined => {
  const { timestamp, ended = false } = at;
  const asked = new Map<string, Readonly<{ prompt: string; toolName: string; toolCallId: string }>>();
  let answers: Array<Readonly<{ interruptId: string; line: string }>> = [];
  for (const row of events) {
    if (row.runId !== runId) {
      continue;
    }
    if (row.type === 'run.lifecycle' && row.state === 'running') {
      /* Answered before this attempt ran: that attempt was already told. */
      answers = [];
    } else if (row.type === 'interrupt.recorded' && isJsonObject(row.payload)) {
      const { context, prompt, outcome } = row.payload;
      if (row.phase === 'requested' && isJsonObject(context) && typeof context['approvalTool'] === 'string') {
        asked.set(row.interruptId, {
          prompt: typeof prompt === 'string' ? prompt : '',
          toolName: context['approvalTool'],
          toolCallId: typeof context['approvalCall'] === 'string' ? context['approvalCall'] : '',
        });
      } else if (row.phase === 'resolved' && typeof outcome === 'string' && asked.has(row.interruptId)) {
        const { prompt: question, toolName, toolCallId } = asked.get(row.interruptId)!;
        answers.push({
          interruptId: row.interruptId,
          line: `- ${outcome}: "${question}" (your call ${toolCallId} to ${toolName})`,
        });
      }
    }
  }
  if (answers.length === 0) {
    return undefined;
  }
  const anchorId = answers.map(({ interruptId }) => interruptId).join(':');
  return {
    id: `tau:approval-answer:${anchorId}`,
    role: 'user',
    content: [
      '<system-reminder>',
      ended
        ? "The last run paused for the person's approval, and they answered:"
        : "The run paused for the person's approval, and they answered:",
      ...answers.map(({ line }) => line),
      ended
        ? 'That run has ended, so its answers do not carry into this one: a call that needs approval asks again.'
        : 'The tool has their answer: call it again with the same input to continue from it; it does not ask again.',
      '</system-reminder>',
    ].join('\n'),
    metadata: {
      tauInternal: { kind: 'approval-answer', anchorId, pruning: 'preserve-until-compaction' },
      timestamp,
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
  const deferredLogCloses = new Map<
    string,
    {
      owners: number;
      drop: boolean;
      dropping: boolean;
      done: PromiseWithResolvers<void>;
      failure?: unknown;
    }
  >();
  const approvalScans = new Set<Readonly<{ chatId: string; done: Promise<void> }>>();
  /** Every run id this host has seen → its chat, for the verbs that name only a run. */
  const runChats = new Map<string, string>();
  /** Each chat's start or resume in flight, for {@link TauAgentHost.waitForAdmission}. */
  const admissions = new Map<string, Readonly<{ runId?: string; answer: Promise<CommandAnswer> }>>();
  /** Host-shaped admissions the legacy `admit` hands `prepareAdmission` beside its command. */
  const legacyConfigs = new Map<string, TauAgentAdmissionConfig>();
  let closed = false;
  let closing: Promise<void> | undefined;

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

  /** A closed host needs the durable rows in memory; an external tool callback may outlive its close. */
  const drainApprovalScans = async (chatId?: string): Promise<void> => {
    const pending: Array<Promise<void>> = [];
    for (const scan of approvalScans) {
      if (chatId === undefined || scan.chatId === chatId) {
        pending.push(scan.done);
      }
    }
    await Promise.all(pending);
  };

  /** Concurrent retirements keep their registry fences independent; the final owner closes the shared log. */
  const deferLogClose = async (chatId: string): Promise<(drop: boolean) => Promise<void>> => {
    let state = deferredLogCloses.get(chatId);
    if (state?.dropping) {
      await state.done.promise;
      if (closed) {
        return async () => undefined;
      }
      return deferLogClose(chatId);
    }
    if (state === undefined) {
      state = { owners: 0, drop: false, dropping: false, done: Promise.withResolvers<void>() };
      deferredLogCloses.set(chatId, state);
    }
    state.owners++;
    return async (drop) => {
      state.drop ||= drop;
      state.owners--;
      if (state.owners === 0) {
        state.dropping = true;
        try {
          if (state.drop) {
            await drainApprovalScans(chatId);
            await serial(chatId, async () => dropLog(chatId));
          }
        } catch (error) {
          state.failure = error;
        } finally {
          state.done.resolve();
          deferredLogCloses.delete(chatId);
        }
      }
      await state.done.promise;
      if ('failure' in state) {
        throw state.failure;
      }
    };
  };

  const waitForChatTeardown = (chatId: string): Promise<void> | undefined => {
    if (!deferredLogCloses.has(chatId)) {
      return undefined;
    }
    const wait = async (): Promise<void> => {
      for (;;) {
        const pending = deferredLogCloses.get(chatId);
        if (pending === undefined) {
          return;
        }
        // oxlint-disable-next-line no-await-in-loop -- a later teardown may start before this waiter resumes.
        await pending.done.promise;
      }
    };
    return wait();
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

  /** Settle a promise nobody reads, so its rejection is not reported as unhandled. */
  const settleQuietly = async (pending: Promise<unknown>): Promise<void> => {
    try {
      await pending;
    } catch {
      /* Answered elsewhere: the race already took the outcome. */
    }
  };

  /**
   * Approvals a call of this host recalled, by run and interrupt: spent the moment a call recalls one, so two
   * parallel calls under one key never both use one answer (GM.r1 L4). The output row's `approval` mark is the durable
   * spend a later incarnation reads.
   *
   * ponytail: grows by one entry per recalled approval for the host's life; drop a run's entries when it settles if
   * a host ever serves enough approvals for that to matter.
   */
  const recalledApprovals = new Set<string>();

  /**
   * A tool's resolved approval under `key` in this run, until a call uses it (D5).
   *
   * The request row names the key and the tool; the answer is the `resolved` row of the same interrupt. The call that
   * recalls an answer spends it: its output row carries the interrupt (`metadata.approval`), and this host remembers
   * the recall, so a later call under the same key asks again rather than reusing one decision twice (GM.r1 M1).
   */
  const recallApproval = async (
    { chatId, runId }: Readonly<{ chatId: string; runId: string }>,
    key: string,
  ): Promise<HostToolApprovalRecord | undefined> => {
    const rows = await readRows(chatId);
    const asked = new Map<string, JsonObject>();
    const answered: HostToolApprovalRecord[] = [];
    const spent = new Set<string>();
    for (const row of rows) {
      if (row.runId !== runId) {
        continue;
      }
      if (row.type === 'message.appended' && row.message.role === 'tool-output') {
        const approval: unknown = row.message.metadata?.['approval'];
        if (typeof approval === 'object' && approval !== null && 'interruptId' in approval) {
          spent.add(String(approval.interruptId));
        }
      } else if (row.type === 'interrupt.recorded' && isJsonObject(row.payload)) {
        const { context } = row.payload;
        if (row.phase === 'requested' && isJsonObject(context) && context['approvalKey'] === key) {
          const { approvalKey: _key, approvalTool: _tool, approvalCall: _call, ...payload } = context;
          asked.set(row.interruptId, payload);
        } else if (row.phase === 'resolved' && asked.has(row.interruptId)) {
          const { outcome, optionId, response } = row.payload;
          if (outcome === 'approved' || outcome === 'denied' || outcome === 'cancelled') {
            answered.push({
              payload: asked.get(row.interruptId)!,
              resolution: {
                interruptId: row.interruptId,
                outcome,
                ...(typeof optionId === 'string' ? { optionId } : {}),
                ...(response === undefined ? {} : { payload: response }),
              },
            });
          }
        }
      }
    }
    const found = answered.findLast(
      ({ resolution }) =>
        !spent.has(resolution.interruptId) && !recalledApprovals.has(`${runId}/${resolution.interruptId}`),
    );
    if (found !== undefined) {
      /* Claimed after the read, with no await between: a parallel call's recall sees it spent (GM.r1 L4). */
      recalledApprovals.add(`${runId}/${found.resolution.interruptId}`);
    }
    return found;
  };

  /**
   * Hand the chat's answers to the tools that asked (D5, GM.r1 H2): after a `resolve-interrupt` or a `cancel` is
   * applied, each approval request that command's own rows answered goes to the registry's `answerApproval`, so what
   * the tool guards follows the person's answer whether or not the run continues. A Stop hands over only the requests
   * it cancelled, never an earlier approval. The registry is idempotent, so an answer handed over twice settles once.
   * A hand-over lost to a crash or a throwing registry is reconciled when the run continues: an applied `resume`
   * hands over every answered request of its run (without `commandId`).
   *
   * @param chatId - The chat the command named.
   * @param runId - The run it named.
   * @param selection - The command whose answers to hand over, or none for every answer of the run, and the log-read barrier.
   */
  const answerApprovals = async (
    chatId: string,
    runId: string,
    selection: Readonly<{ commandId: string | undefined; scanned: () => void }>,
  ): Promise<void> => {
    const { answerApproval } = options.toolRegistry;
    if (answerApproval === undefined) {
      return;
    }
    const asked = new Map<string, Readonly<{ toolName: string; payload: JsonObject }>>();
    const rows = await readRows(chatId);
    selection.scanned();
    for (const row of rows) {
      if (row.runId !== runId || row.type !== 'interrupt.recorded' || !isJsonObject(row.payload)) {
        continue;
      }
      const { context } = row.payload;
      if (row.phase === 'requested' && isJsonObject(context) && typeof context['approvalTool'] === 'string') {
        const { approvalKey: _key, approvalTool: toolName, approvalCall: _call, ...payload } = context;
        asked.set(row.interruptId, { toolName, payload });
      } else if (
        row.phase === 'resolved' &&
        asked.has(row.interruptId) &&
        (selection.commandId === undefined || row.commandId === selection.commandId)
      ) {
        const { outcome, optionId, response } = row.payload;
        if (outcome === 'approved' || outcome === 'denied' || outcome === 'cancelled') {
          // oxlint-disable-next-line no-await-in-loop -- one tool's answer at a time, in the order the chat gave them.
          await answerApproval({
            ...asked.get(row.interruptId)!,
            resolution: {
              interruptId: row.interruptId,
              outcome,
              ...(typeof optionId === 'string' ? { optionId } : {}),
              ...(response === undefined ? {} : { payload: response }),
            },
          });
        }
      }
    }
  };

  /**
   * The approval a Tau attempt's tool asks through (D5): the run's native durable interrupt.
   *
   * Asking sends the chat's own `interrupt` command, keyed by the tool call, as a person's operator interrupt would:
   * M1 aborts this attempt's driver and records `interrupt.recorded` and `paused` as its ending (running.tau, D10,
   * TS-R10). The call therefore never answers; it rejects saying the run paused for the person, which is what its
   * output row tells the model. The decision resolves the interrupt; the next attempt is told the answer and the
   * tool's `recall` finds it.
   *
   * @param key - The attempt the tool runs in.
   * @param invocation - The tool call asking.
   * @returns The approval for that call, and the recalled approval it used, if any.
   */
  const approvalFor = (
    key: TurnAttemptKey,
    invocation: Readonly<{ toolCallId: string; toolName: string; signal: AbortSignal }>,
  ): Readonly<{ approve: HostToolApproval; spent: () => string | undefined }> => {
    let spent: string | undefined;
    const recall = async (approvalKey: string): Promise<HostToolApprovalRecord | undefined> => {
      const record = await recallApproval(key, approvalKey);
      spent ??= record?.resolution.interruptId;
      return record;
    };
    const approve = async (request: Parameters<HostToolApproval>[0]): Promise<InterruptResolution> => {
      if (request.key !== undefined) {
        const prior = await recall(request.key);
        if (prior !== undefined) {
          return prior.resolution;
        }
      }
      const { signal } = invocation;
      const aborted = Promise.withResolvers<never>();
      const onAbort = (): void => {
        aborted.reject(new Error(`The run paused for the person's approval: ${request.prompt}`));
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
      const ask = async (): Promise<never> => {
        const answer = await execute({
          type: 'interrupt',
          commandId: `approval:${key.runId}/${String(key.attempt)}/${invocation.toolCallId}`,
          payload: {
            chatId: key.chatId,
            runId: key.runId,
            interruptId: createId(),
            kind: 'approval',
            prompt: request.prompt,
            payload: {
              ...request.payload,
              ...(request.key === undefined ? {} : { approvalKey: request.key }),
              approvalTool: invocation.toolName,
              approvalCall: invocation.toolCallId,
            },
          },
        });
        const refused = refusal(answer);
        if (refused) {
          throw refused;
        }
        /* Applied: M1 is ending this attempt, and the abort answers the call. */
        return aborted.promise;
      };
      const answered = ask();
      try {
        return await Promise.race([aborted.promise, answered]);
      } finally {
        signal.removeEventListener('abort', onAbort);
        /* The loser of the race settles later with nobody listening. */
        void settleQuietly(answered);
        void settleQuietly(aborted.promise);
      }
    };
    return { approve: Object.assign(approve, { recall }), spent: () => spent };
  };

  /** A Tau attempt's tools, each call carrying its approval and marking the recalled one it used (D5). */
  const approvingTools = (key: TurnAttemptKey, tools: ToolRegistry): ToolRegistry => ({
    list: () => tools.list(),
    invoke: async (invocation) => {
      const { approve, spent } = approvalFor(key, invocation);
      let result: Awaited<ReturnType<ToolRegistry['invoke']>>;
      try {
        result = await tools.invoke({ ...invocation, approve });
      } catch (error) {
        /* The call recorded no spend, so its claim is released and a retry recalls the approval rather than asking. */
        const claimed = spent();
        if (claimed !== undefined) {
          recalledApprovals.delete(`${key.runId}/${claimed}`);
        }
        throw error;
      }
      const interruptId = spent();
      return interruptId === undefined ? result : { ...result, approval: { interruptId } };
    },
  });

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
    const read = foldPhysicalChatLedger(emptyChatLedger, await log.read());
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
  const nextRow = (chatId: string, signal?: AbortSignal): Readonly<{ promise: Promise<void>; release(): void }> => {
    const waiting = Promise.withResolvers<void>();
    const store = storeOf(chatId);
    const release = (): void => {
      store.readers.delete(release);
      signal?.removeEventListener('abort', release);
      waiting.resolve();
    };
    store.readers.add(release);
    signal?.addEventListener('abort', release, { once: true });
    if (signal?.aborted) {
      release();
    }
    return { promise: waiting.promise, release };
  };

  /* D13: a run edits only through its placement's lease, so a host with no placement runs none. */
  const refuseUnplaced = (): void => {
    if (options.placement === undefined) {
      throw coded(
        'REVISIONS_UNAVAILABLE' satisfies RefusalCode,
        'This host has no revision placement, so it cannot run an agent turn. Open the project and send again.',
        { effect: 'not-applied' },
      );
    }
  };

  /** Write one batch under `leaderEpoch`, inside the chat's chain ({@link appendChatRows}). */
  const write = async (
    chatId: string,
    leaderEpoch: string,
    rows: readonly ChatRunRow[],
  ): Promise<Readonly<{ ledger: ChatLedger; messageIds: readonly string[] }>> => {
    const store = storeOf(chatId);
    const messageIds: string[] = [];
    try {
      const ledger = await appendChatRows({
        chatId,
        log: await logOf(chatId),
        ledger: await ledgerOf(chatId),
        leaderEpoch,
        recordedAt: now().toISOString(),
        rows,
        onAppended: (row, ledger) => {
          store.ledger = ledger;
          runChats.set(row.runId, chatId);
          if (row.type === 'message.appended') {
            messageIds.push(row.message.id);
          }
          wake(store);
        },
      });
      return { ledger, messageIds };
    } catch (error) {
      if (codedFailureDetail(error).code === 'LOG_FENCED') {
        // The log moved under this writer: the next incarnation rereads it (RA-A9).
        store.ledger = undefined;
      }
      throw error;
    }
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
      if (bodies.some((body) => body.type === 'turn.changed')) {
        throw coded(
          'FRAME_UNREADABLE' satisfies RefusalCode,
          'Turn-change proof is written by the placement authority, not by an agent.',
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
      /* TS-S9: M1 writes a settlement only in the one shape, attempt and code included; nothing of the batch lands. */
      const unwritable = rows.find(
        ({ runId, body }) =>
          (body.type === 'turn.finalized' || body.type === 'turn.conflicted' || body.type === 'turn.failed') &&
          !turnSettlementSchema.safeParse({ ...body, runId }).success,
      );
      if (unwritable !== undefined) {
        throw coded(
          'EVENT_INVALID' satisfies RefusalCode,
          `This settlement for run ${unwritable.runId} is not in the settlement shape.`,
        );
      }
      const store = storeOf(chatId);
      if (ends !== undefined) {
        /* The gate closes before the ending batch is queued: a driver row queued after it is refused (RA-R6). */
        store.live.delete(attemptKeyOf(ends));
      }
      return serial(chatId, async () => write(chatId, leaderEpoch, rows));
    },
    prepareAdmission: async ({ chatId, commandId, payload }) => {
      refuseUnplaced();
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
      /* The chat's last run ended on answers no attempt was told (a denial, a Stop): this run is told first. */
      const lastRunId = events.findLast(
        (row) => row.type === 'run.lifecycle' && row.state === 'admitted' && row.runId !== start.runId,
      )?.runId;
      const told =
        rewind === undefined && lastRunId !== undefined
          ? approvalAnswers(events, lastRunId, { timestamp: now().getTime(), ended: true })
          : undefined;
      return {
        kind: 'tau',
        turnId: start.message.id,
        intent: intent({ kind: 'tau', ...base, selection: turnModelOf(model), context }),
        start: told === undefined ? [] : [{ type: 'message.appended', message: told }],
        ...(start.checkoutId === undefined ? {} : { checkoutId: start.checkoutId }),
      };
    },
    prepareResume: async ({ chatId, runId, payload }) => {
      refuseUnplaced();
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
      const answered = approvalAnswers(events, runId, { timestamp: now().getTime() });
      if (answered) {
        recovery.push({ type: 'message.appended', message: answered });
      }
      return {
        kind: 'tau',
        turnId: entry?.turnId ?? latestTurnId(history, runId),
        /* The tail already answers the turn: the attempt ends with no call. */
        mode:
          entry?.failure?.code !== 'USER_STOPPED' && !reminder && !answered && history.at(-1)?.role === 'assistant'
            ? 'complete'
            : 'continue',
        /* `running` first, so the command's cursor is the reopening row (ChatRunSlot.tla resume; W7.r1). */
        intent: [running, ...recovery],
      };
    },
    startDriver: ({ key, kind, mode, leaderEpoch, report, grant }) => {
      const { chatId, runId } = key;
      const store = storeOf(chatId);
      store.live.add(attemptKeyOf(key));
      const append = driverAppender({ chatId, key, leaderEpoch });
      const opening = logOf(chatId);
      const capturedLog = store.log;
      const capturedDeliver = store.deliver;
      const publishLive = (event: AgentLiveEvent): void | Promise<void> => {
        if (
          closed ||
          store.log !== capturedLog ||
          capturedDeliver === undefined ||
          store.deliver !== capturedDeliver ||
          !store.live.has(attemptKeyOf(key))
        ) {
          return;
        }
        return options.onLiveEvent?.(event);
      };
      if (kind === 'external') {
        return deferredDriver(
          (async () => {
            const log = await opening;
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
                ...(grant === undefined ? {} : { root: grant.root }),
                ...(mode === 'start' && admission?.message ? { message: admission.message } : {}),
                ...(mode === 'start' && admission?.config ? { config: admission.config } : {}),
                ...(state === undefined ? {} : { state }),
                history: events,
                append,
                /* Session state the agent reports between prompts outlives the attempt: not gated by it (VSC3). */
                appendSession: driverAppender({ chatId, key, leaderEpoch, gated: false }),
                publishLive: async (event) => {
                  await publishLive({ ...event, chatId, runId });
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
          const log = await opening;
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
              toolRegistry: approvingTools(key, grant?.tools ?? options.toolRegistry),
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
              onLiveEvent: publishLive,
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
      if (!closed && !deferredLogCloses.has(chatId)) {
        await serial(chatId, async () => dropLog(chatId));
      }
    },
    ...(options.placement === undefined ? {} : { placement: options.placement }),
  };

  const registry = createChatRunRegistry({
    services,
    createTerm: options.createLeaderEpoch ?? createPortableId,
    ...(options.delays === undefined ? {} : { delays: options.delays }),
    ...(options.clock === undefined ? {} : { actorOptions: { clock: options.clock } }),
    ...(options.onChatQuiescent === undefined ? {} : { onQuiescent: options.onChatQuiescent }),
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
    const failure =
      entry?.failure?.code === 'USER_STOPPED'
        ? entry.failure
        : (transportFailureOfRun({ events, messages, runId }) ?? entry?.failure);
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
    const teardown = waitForChatTeardown(command.payload.chatId);
    if (teardown !== undefined) {
      await teardown;
    }
    if (closed) {
      return {
        commandId: command.commandId,
        generation: 0,
        status: 'refused',
        effect: 'not-applied',
        code: 'HOST_CLOSED',
        message: 'The Tau agent host is closed.',
      };
    }
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
    if (command.type === 'resolve-interrupt' || command.type === 'cancel' || command.type === 'resume') {
      const { chatId, runId } = command.payload;
      const scanned = Promise.withResolvers<void>();
      const scan = { chatId, done: scanned.promise };
      approvalScans.add(scan);
      const finishScan = (): void => {
        scanned.resolve();
        approvalScans.delete(scan);
      };
      /* A resume reconciles every answer of its run; an answer or a Stop hands over only what its own rows resolved. */
      const answeredBy = command.type === 'resume' ? undefined : command.commandId;
      const answerTools = async (): Promise<void> => {
        try {
          const applied = await answer;
          if (applied.status === 'applied') {
            await answerApprovals(chatId, runId, { commandId: answeredBy, scanned: finishScan });
          }
        } catch (error) {
          console.error('[agent-host] a tool could not act on the answer to its approval', chatId, runId, error);
        } finally {
          finishScan();
        }
      };
      /* Not awaited: an approved print uploads before it answers, and the command answers when its rows are durable. */
      void answerTools();
    }
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
      const teardown = waitForChatTeardown(chatId);
      if (teardown !== undefined) {
        await teardown;
      }
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
      const teardown = waitForChatTeardown(chatId);
      if (teardown !== undefined) {
        await teardown;
      }
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
        await nextRow(chatId).promise;
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
      signal?.throwIfAborted();
      const { chatId } = request;
      for (;;) {
        if (registry.isFenced(chatId)) {
          return { status: 'refused', chatId, reason: 'owner-fenced' };
        }
        /* SC-R14: register the wake before reading, so a row appended while the read is in flight is not missed. */
        const woken = nextRow(chatId, signal);
        try {
          // The existing chat queue owns append/dropLog as well as this bounded observation; parking stays outside it.
          // oxlint-disable-next-line no-await-in-loop -- a long poll re-observes after each wake.
          const answer = await serial(chatId, async (): Promise<ReadAnswer> => {
            signal?.throwIfAborted();
            const log = await logOf(chatId);
            const ledger = await ledgerOf(chatId);
            const batch = await log.readBatch(request);
            if (batch.status === 'refused') {
              return { status: 'refused', chatId, reason: batch.reason, expected: batch.expected };
            }
            const [intact, anomalies] = await Promise.all([log.historyIntact(), log.anomalies()]);
            return {
              status: 'batch',
              chatId,
              cursor: batch.cursor,
              nextCursor: batch.nextCursor,
              endCursor: batch.endCursor,
              events: [...batch.events],
              sourceHealth: {
                historyIntact: ledger.historyIntact && intact,
                newerHistory: ledger.newerHistory,
                quarantined: anomalies.some((anomaly) => anomaly.kind === 'quarantined'),
              },
            };
          });
          if (
            answer.status === 'refused' ||
            answer.events.length > 0 ||
            !sameSourceHealth(request.sourceHealth, answer.sourceHealth) ||
            closed ||
            signal?.aborted
          ) {
            return answer;
          }
          // oxlint-disable-next-line no-await-in-loop -- one park per empty read.
          await woken.promise;
        } finally {
          woken.release();
        }
      }
    },
    readEvents: async ({ chatId, cursor, limit, maxBytes }) => {
      // The version-1 wire's read: a cursor past the end is clamped here, and only here (CL-R7).
      return v1Batch(await readBatchOf(chatId, { cursor, limit, maxBytes }));
    },
    assumeLeadership: (chatId, epoch) => {
      assertOpen();
      /* The term id stays unique per incarnation; its integer epoch is the ledger's, stamped at the claim (W3). */
      registry.assume(chatId, `${String(epoch)}:${createId()}`);
    },
    claim: async (chatId) => {
      const teardown = waitForChatTeardown(chatId);
      if (teardown !== undefined) {
        await teardown;
      }
      if (closed) {
        return {
          refused: {
            commandId: 'claim',
            generation: 0,
            status: 'refused',
            effect: 'not-applied',
            code: 'HOST_CLOSED',
            message: 'The Tau agent host is closed.',
          },
        };
      }
      return registry.claim(chatId);
    },
    relinquish: async (chatId) => {
      if (closed) {
        await closing;
        return;
      }
      const finish = await deferLogClose(chatId);
      let drop = false;
      try {
        await registry.relinquish(chatId);
        wake(storeOf(chatId));
        await closeExternalChat(chatId).catch(() => undefined);
        drop = true;
      } finally {
        await finish(drop);
      }
    },
    evictChat: async (chatId) => {
      assertOpen();
      const finish = await deferLogClose(chatId);
      let drop = false;
      try {
        await registry.evict(chatId);
        drop = true;
      } finally {
        await finish(drop);
      }
    },
    /* One close: a concurrent second call awaits the first rather than resolving early. A close that failed is let
     * go, so the next call tries again (W6.r1 round 4). */
    close: async () => {
      closing ??= (async () => {
        closed = true;
        await registry.close();
        await Promise.allSettled([...deferredLogCloses.values()].map(async ({ done }) => done.promise));
        await drainApprovalScans();
        for (const store of stores.values()) {
          wake(store);
        }
        await Promise.allSettled([...stores.keys()].map(async (chatId) => closeExternalChat(chatId)));
        await Promise.allSettled([...stores.keys()].map(async (chatId) => serial(chatId, async () => dropLog(chatId))));
      })();
      const attempt = closing;
      try {
        await attempt;
      } catch (error) {
        if (closing === attempt) {
          closing = undefined;
        }
        throw error;
      }
    },
  };
};
