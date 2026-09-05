// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createAgentSession } from '#harness/session.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createPortableId, transportFailureFromProviderMessages } from '#harness/session-record.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { reduceEventLog } from '#log/reducer.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentToolChoice,
  AgentLogEvent,
  InterruptRecordedEvent,
  JsonObject,
  JsonValue,
  LogEventBase,
  ProviderMessage,
  RunTrigger,
  RunLifecycleState,
  UserProviderMessage,
} from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentLiveEvent,
  DurableEventLog,
  HostRunSnapshot,
  InterruptApprovalPort,
  InterruptRequest,
  InterruptResolution,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { EventLogBatch } from '#log/event-log-appender.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentSession, AgentSessionModel, CreateAgentSessionOptions } from '#harness/session.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ClientContext } from '#harness/cad-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createInterruptRecoveryMessage } from '#harness/interrupt-recovery.js';

type SessionEvent = AgentLogEvent extends infer Event
  ? Event extends LogEventBase
    ? Omit<Event, keyof LogEventBase>
    : never
  : never;

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
 * a daemon, a Paseo daemon session in a browser tab — *before* composing any
 * Tau admission, so an external turn carries no Tau model, prompt or tool grant.
 *
 * Extra fields are the runner's own selection state (a Paseo `connectionId`,
 * say). They ride the marker on the turn's user message and come back on resume.
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
  /** Agent id the client selected, e.g. `claude`, `codex`, or a Paseo agent. */
  readonly agentId: string;
  /** The full selection, including any runner-specific fields. */
  readonly agent: ExternalRunKind;
  readonly chatId: string;
  readonly runId: string;
  /** The new user turn; absent when resuming one a restart left unanswered. */
  readonly message?: UserProviderMessage | undefined;
  /** Durable state a previous attempt remembered — a session id, a cursor, a branch. */
  readonly state?: JsonObject | undefined;
  /** Every durable event recorded for this chat so far. */
  readonly history: readonly AgentLogEvent[];
  /** Append durable events; each publishes on the host's event stream. */
  append(events: readonly ExternalAgentLogEvent[]): Promise<void>;
  /** Persist state that must survive a restart. Merges into what is there. */
  remember(state: JsonObject): Promise<void>;
  /** Durably pause for an approval and await the decision (PH13 / OQ-X4). */
  approve(request: {
    readonly prompt: string;
    readonly payload?: JsonValue | undefined;
  }): Promise<InterruptResolution['outcome']>;
  /** Aborted by `cancel`, or by the host closing. */
  readonly signal: AbortSignal;
};

/** Runs external agents of one kind. @public */
export type ExternalAgentPort = {
  /**
   * Agent ids this port can start; anything else is refused at admission.
   *
   * Optional, because not every runner can enumerate. A daemon's ACP adapters
   * are resolved locally and known up front, so listing them buys a cheap
   * refusal before any durable event is written. A Paseo agent lives on the
   * user's daemon behind an E2EE relay, and the only way to "list" it is to
   * open the session — so that port omits this and refuses inside `run`, where
   * it genuinely knows.
   */
  list?(): readonly string[];
  /** Execute one turn; resolve when the agent's turn ends, throw to fail the run. */
  run(turn: ExternalAgentTurn): Promise<void>;
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

/** Exact per-admission model, prompt, tool, and client context. @public */
export type TauAgentAdmissionConfig = {
  readonly systemPrompt: string;
  readonly systemPromptBlocks?: CreateAgentSessionOptions['systemPromptBlocks'];
  readonly model: AgentSessionModel;
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
  readonly model: AgentSessionModel;
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
  readonly onCompaction?: CreateAgentSessionOptions['onCompaction'];
  readonly onLiveEvent?: ((event: AgentLiveEvent) => void | Promise<void>) | undefined;
  /**
   * External runners by run kind (`acp` on a daemon, `paseo` in a browser tab).
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
  /** Wait until a concurrently started admission is durable and return its current projection. */
  waitForAdmission(chatId: string): Promise<HostRunSnapshot | undefined>;
  /** Abort an active run, durably pause it, and wait through the W5 port. */
  interrupt(request: InterruptRequest): Promise<InterruptResolution>;
  /** Resolve a W5 request from an external presenter. */
  resolveInterrupt(resolution: InterruptResolution & { readonly runId: string }): Promise<void>;
  /** Return unresolved W5 requests for one run. */
  pendingInterrupts(runId: string): Promise<readonly InterruptRequest[]>;
  /** Queue steering on an active run. */
  steer(input: { readonly runId: string; readonly message: string }): Promise<void>;
  /** Cancel an active run without creating an approval request. */
  cancel(input: { readonly runId: string }): Promise<void>;
  /** Rebuild the current run projection from W1. */
  snapshot(chatId: string): Promise<HostRunSnapshot>;
  /** Read one bounded event batch for follower projection. */
  readEvents(input: {
    readonly chatId: string;
    readonly cursor: number;
    readonly limit: number;
  }): Promise<EventLogBatch>;
  /** Bind one chat to the generation token minted by its current Web Lock lease. */
  assumeLeadership(chatId: string, generation: string): void;
  /** Abort one chat and close its cached appender after leadership loss. */
  relinquish(chatId: string): Promise<void>;
  /** Stop active work and close every opened appender. */
  close(): Promise<void>;
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

const lifecycleFor = (events: readonly AgentLogEvent[], runId: string): RunLifecycleState => {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.runId === runId && event.type === 'run.lifecycle') {
      return event.state;
    }
  }
  return 'admitted';
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

const terminalStates = new Set<RunLifecycleState>(['completed', 'failed', 'cancelled']);

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
    // A failed open must not poison the cache: the next attempt should retry,
    // and close() must not re-raise a rejection that its caller already saw.
    opened.catch(() => {
      if (logs.get(chatId) === opened) {
        logs.delete(chatId);
      }
    });
    return opened;
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

  const reserve = (chatId: string, runId?: string): AdmissionReservation => {
    if (reservationsByChat.has(chatId) || activeByChat.has(chatId)) {
      throw Object.assign(new Error(`Chat ${chatId} already has an admitted run.`), {
        code: 'RUN_ADMISSION_CONFLICT',
      });
    }
    if (runId && (reservationsByRun.has(runId) || activeByRun.has(runId))) {
      throw Object.assign(new Error(`Run ${runId} is already admitted.`), { code: 'RUN_ADMISSION_CONFLICT' });
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

  const append = async (input: {
    readonly chatId: string;
    readonly log: DurableEventLog;
    readonly runId: string;
    readonly events: readonly SessionEvent[];
  }): Promise<void> => {
    const leaderEpoch = leaderEpochFor(input.chatId);
    const existing = await input.log.read();
    const tail = existing.at(-1);
    let sequence = tail?.leaderEpoch === leaderEpoch ? tail.sequence + 1 : 0;
    for (const body of input.events) {
      // oxlint-disable-next-line no-await-in-loop -- W1 event ordering requires sequential durable appends.
      const outcome = await fencedLog(input.chatId, leaderEpoch, input.log).append({
        ...body,
        version: 1,
        leaderEpoch,
        sequence,
        recordedAt: now().toISOString(),
        runId: input.runId,
      } as AgentLogEvent);
      if (outcome.appended) {
        sequence++;
      }
    }
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
    return createAgentSession({
      chatId: input.chatId,
      runId: input.runId,
      leaderEpoch: input.leaderEpoch,
      systemPrompt: input.config?.systemPrompt ?? options.systemPrompt,
      systemPromptBlocks: input.config?.systemPromptBlocks ?? options.systemPromptBlocks,
      model: input.config?.model ?? options.model,
      modelTransport: options.modelTransport,
      toolRegistry: options.toolRegistry,
      toolChoice: input.config?.toolChoice,
      allowedTools: input.config?.allowedTools,
      snapshot: input.config?.snapshot,
      contextMessages: input.config?.contextMessages,
      eventLog: fencedLog(input.chatId, input.leaderEpoch, input.log),
      clientContext,
      recentSkills: options.recentSkills,
      substituteToolResult: options.substituteToolResult,
      summarize: options.summarize,
      safeguardThresholds: options.safeguardThresholds,
      onSafeguardOutcome: options.onSafeguardOutcome,
      allowImageBlocks: options.allowImageBlocks,
      createId,
      now,
      onCompaction: options.onCompaction,
      onLiveEvent: options.onLiveEvent,
    });
  };

  const bindReservationRun = (reservation: AdmissionReservation, runId: string): void => {
    const existing = reservationsByRun.get(runId);
    if (existing && existing !== reservation) {
      throw Object.assign(new Error(`Run ${runId} is already admitted.`), { code: 'RUN_ADMISSION_CONFLICT' });
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
            detail: { message: error instanceof Error ? error.message : String(error) },
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
  const externalByRun = new Map<string, { readonly chatId: string; readonly controller: AbortController }>();
  /** Serializes each chat's external appends; see {@link appendExternal}. */
  const externalAppends = new Map<string, Promise<void>>();
  const detached = new Set<Promise<void>>();

  const appendExternalEvents = async (input: {
    readonly chatId: string;
    readonly runId: string;
    readonly log: DurableEventLog;
    readonly events: readonly ExternalAgentLogEvent[];
  }): Promise<void> => append(input);

  /**
   * Append event bodies under this chat's leader epoch, continuing its sequence.
   *
   * Serialized per chat, and that is load-bearing rather than defensive: the
   * next sequence number is derived from the log's own tail, so two concurrent
   * appends — an agent's tool update landing while its approval resolves — both
   * read the same tail and the second is rejected `EVENT_MUTATED`.
   *
   * @param input - Chat, run, log handle, and the bodies to append.
   */
  const appendExternal = async (input: {
    readonly chatId: string;
    readonly runId: string;
    readonly log: DurableEventLog;
    readonly events: readonly ExternalAgentLogEvent[];
  }): Promise<void> => {
    const prior = externalAppends.get(input.chatId) ?? Promise.resolve();
    let outcome: { readonly error: unknown } | undefined;
    /* The *chain* absorbs a failure so one bad append does not wedge the chat's
     * whole queue; the caller still sees it, re-thrown below. */
    const chained = (async (): Promise<void> => {
      await prior;
      try {
        await appendExternalEvents(input);
      } catch (error) {
        outcome = { error };
      }
    })();
    externalAppends.set(input.chatId, chained);
    await chained;
    if (outcome) {
      throw outcome.error;
    }
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
      throw Object.assign(new Error(`Chat ${input.chatId} already has an admitted run.`), {
        code: 'RUN_ADMISSION_CONFLICT',
      });
    }
    const log = await logFor(input.chatId);
    const controller = new AbortController();
    const appendEvents = async (events: readonly ExternalAgentLogEvent[]): Promise<void> =>
      appendExternal({ chatId: input.chatId, runId: input.runId, log, events });

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
      { type: 'run.lifecycle', state: 'admitted' },
      { type: 'run.lifecycle', state: 'running' },
    ]);
    messageId ??= externalTurnOf(await log.read())?.messageId;
    externalByChat.set(input.chatId, { runId: input.runId, controller });
    externalByRun.set(input.runId, { chatId: input.chatId, controller });

    const remember = async (state: JsonObject): Promise<void> => {
      const events = await log.read();
      const current = events.findLast(
        (event): event is Extract<AgentLogEvent, { readonly type: 'message.appended' }> =>
          event.type === 'message.appended' && event.message.id === messageId,
      );
      if (!current) {
        return;
      }
      await appendEvents([
        {
          type: 'message.envelope-replaced',
          messageId: current.message.id,
          replacement: {
            ...current.message,
            metadata: {
              ...current.message.metadata,
              tauInternal: {
                ...externalMarker(current.message),
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
    }): Promise<InterruptResolution['outcome']> => {
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
            ...(resolution.payload === undefined ? {} : { response: resolution.payload }),
          },
        },
        ...(resolution.outcome === 'approved' ? ([{ type: 'run.lifecycle', state: 'running' }] as const) : []),
      ]);
      return resolution.outcome;
    };

    const completion = (async (): Promise<void> => {
      try {
        await port.run({
          agentId: input.agent.id,
          agent: input.agent,
          chatId: input.chatId,
          runId: input.runId,
          ...(input.message ? { message: input.message } : {}),
          ...(input.state ? { state: input.state } : {}),
          history: await log.read(),
          append: appendEvents,
          remember,
          approve,
          signal: controller.signal,
        });
        await appendEvents([{ type: 'run.lifecycle', state: controller.signal.aborted ? 'cancelled' : 'completed' }]);
      } catch (error) {
        await appendEvents([
          controller.signal.aborted
            ? { type: 'run.lifecycle', state: 'cancelled' }
            : {
                type: 'run.lifecycle',
                state: 'failed',
                detail: { message: error instanceof Error ? error.message : String(error) },
              },
        ]);
      } finally {
        if (externalByChat.get(input.chatId)?.runId === input.runId) {
          externalByChat.delete(input.chatId);
        }
        externalByRun.delete(input.runId);
      }
    })();
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
    const last = events.at(-1);
    const external = externalTurnOf(events);
    if (!last || !external || terminalStates.has(lifecycleFor(events, last.runId))) {
      return false;
    }
    const { agentId, kind: _kind, runKind, ...state } = external.marker;
    await runExternal({
      chatId,
      runId: last.runId,
      agent: { kind: runKind, id: agentId },
      state,
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

  const snapshot = async (chatId: string): Promise<HostRunSnapshot> => {
    assertOpen();
    const log = await logFor(chatId);
    const events = await log.read();
    const last = events.at(-1);
    if (!last) {
      throw new Error(`Chat ${chatId} has no durable session log.`);
    }
    const messages = reduceEventLog(events);
    const failure = transportFailureFromProviderMessages(messages);
    return {
      chatId,
      runId: last.runId,
      turnId: latestTurnId(messages, last.runId),
      state: lifecycleFor(events, last.runId),
      messages,
      ...(failure ? { failure } : {}),
    };
  };

  return {
    admit: async (request) => {
      assertOpen();
      const reservation = reserve(request.chatId, request.runId);
      let executing = false;
      try {
        const log = await logFor(request.chatId);
        const events = await log.read();
        const latest = events.at(-1);
        if (latest && !terminalStates.has(lifecycleFor(events, latest.runId))) {
          throw new Error(`Chat ${request.chatId} has a non-terminal run; resume it before admitting another turn.`);
        }
        if (events.some((event) => event.runId === request.runId)) {
          throw new Error(`Run ${request.runId} has already been admitted.`);
        }
        // An empty log has nothing to rewind, so a rewinding trigger *is* a
        // first turn and runs as one. Refusing it instead — an empty retain
        // cannot match a prefix of nothing — permanently wedged any chat whose
        // first turn never reached the host: every later retry was refused
        // with `HISTORY_PREFIX_INVALID` and the chat had no way out.
        if (request.trigger !== 'submit' && events.length > 0) {
          const messages = reduceEventLog(events);
          if (
            request.retainedMessageIds.length >= messages.length ||
            request.retainedMessageIds.some((id, index) => messages[index]?.id !== id)
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
                retainedMessageIds: request.retainedMessageIds,
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
          await runExternal({
            chatId: request.chatId,
            runId: request.runId,
            agent: external,
            message: request.message,
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
        const last = events.at(-1);
        if (!last) {
          throw new Error(`Chat ${chatId} has no durable session log.`);
        }
        const { runId } = last;
        const state = lifecycleFor(events, runId);
        if (terminalStates.has(state)) {
          return reduceEventLog(events);
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
    waitForAdmission: async (chatId) => {
      assertOpen();
      /* An external run holds no reservation and no `AgentSession` — its
       * admission is already durable by the time `runExternal` returns — but it
       * is every bit as admitted, and a caller asking "is a run already under
       * way here?" must not be told no and start a second one. */
      if (externalByChat.has(chatId)) {
        return snapshot(chatId);
      }
      const reservation = reservationsByChat.get(chatId);
      if (!reservation) {
        return undefined;
      }
      const active = await reservation.admitted;
      return active?.session.snapshot();
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
        throw new Error(`Interrupt ${resolution.interruptId} does not belong to run ${runId}.`);
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
        return;
      }
      const active = await activeRunFor(runId);
      if (!active) {
        return;
      }
      active.session.abort();
      await (active.completion ?? active.session.agent.waitForIdle());
    },
    snapshot,
    readEvents: async ({ chatId, cursor, limit }) => {
      const log = await logFor(chatId);
      return log.readBatch({ cursor, limit });
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
