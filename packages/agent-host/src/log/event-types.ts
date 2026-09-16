import type { ModelCostRates, StopReason, Usage } from '@earendil-works/pi-ai';

/** A JSON object that is safe to persist in the session log. @public */
export type JsonObject = { readonly [key: string]: JsonValue };

/** A JSON value that is safe to persist in the session log. @public */
// oxlint-disable-next-line typescript/no-restricted-types -- JSON null is a durable wire value; undefined is not valid JSON.
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

/** Provider-neutral prompt-cache marker retained with a turn projection. @public */
export type PromptCacheControl = {
  readonly type: 'ephemeral';
  readonly scope?: 'global' | undefined;
};

/** One ordered system-prompt block retained beside pi's string prompt. @public */
export type ModelSystemPromptBlock = {
  readonly type: 'text';
  readonly text: string;
  readonly cacheControl?: PromptCacheControl | undefined;
};

/** Provider metadata retained for byte-faithful replay. @public */
export type ProviderMessageMetadata = {
  readonly [key: string]: JsonValue | Usage | StopReason | undefined;
  readonly api?: string | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly responseModel?: string | undefined;
  readonly responseId?: string | undefined;
  readonly diagnostics?: readonly JsonValue[] | undefined;
  readonly usage?: Usage | undefined;
  readonly stopReason?: StopReason | undefined;
  readonly errorMessage?: string | undefined;
  readonly timestamp?: number | undefined;
  readonly substituted?: boolean | undefined;
  readonly tauInternal?: JsonObject | undefined;
};

/**
 * A content-addressed attachment a durable message references rather than inlines.
 *
 * `path` is relative to the directory that owns the log (`attachments/<sha256>.<ext>`),
 * so the same row resolves in every checkout of the chat. Bytes are read back at
 * materialisation; the durable row never carries them. The legacy inline
 * `{ type: 'image', mimeType, data }` block stays readable forever (D14).
 *
 * `byteLength` is optional (P29): a writer that has the size records it, and a
 * writer that does not — a draft hydrated from a record, whose file part carries
 * no size — omits it rather than fabricating one. No reader requires it;
 * materialisation and render both resolve the bytes themselves.
 *
 * @public
 */
export type FileRefContentBlock = {
  readonly type: 'file-ref';
  readonly path: string;
  readonly mimeType: string;
  readonly byteLength?: number;
  readonly filename?: string;
};

type MessageBase = {
  readonly id: string;
  readonly content: JsonValue;
  readonly metadata?: ProviderMessageMetadata;
};

/** A provider-normalized user message. @public */
export type UserProviderMessage = MessageBase & { readonly role: 'user' };

/** A provider-normalized assistant message. @public */
export type AssistantProviderMessage = MessageBase & { readonly role: 'assistant' };

/** One file, and optionally one line, a tool call named. @public */
export type ToolCallLocation = {
  readonly path: string;
  readonly line?: number | undefined;
};

/**
 * The emitter's own tool-call facts, retained beside Tau's dispatch identity.
 *
 * One vocabulary for both emitters (N11): a Tau-dispatched call and an
 * external agent's call record the same fields, so a client renders them with
 * one projection and no second tool namespace exists. `toolCallId` is the
 * *emitter's* id — an ACP `tool_call.toolCallId`, say — which is why it is
 * recorded here rather than conflated with the message's own `toolCallId`.
 *
 * `kind` and `status` stay strings: their vocabularies belong to the protocol
 * that produced them and extend without Tau's involvement, and D14 keeps an
 * older reader able to read a newer writer's value.
 *
 * @public
 */
export type ToolCallProjection = {
  /** The emitter's own call id. */
  readonly toolCallId: string;
  /** What the call does, in the emitter's vocabulary (`read`, `edit`, …). */
  readonly kind?: string | undefined;
  /** Human-readable summary the emitter chose. */
  readonly title?: string | undefined;
  /** Where the call had reached when this message was recorded. */
  readonly status?: string | undefined;
  /** Files the call named. */
  readonly locations?: readonly ToolCallLocation[] | undefined;
  /** Presentation blocks the emitter rendered, verbatim. */
  readonly content?: JsonValue | undefined;
  /**
   * The emitter's *programmatic* tool name, when it has one.
   *
   * `title` is a human sentence an agent composed ("List files in 'src'"); this
   * is the identity a client can switch on. ACP's own `ToolCall.name` is
   * experimental and neither shipping adapter sets it, so a projection
   * recovers this from wherever the emitter actually put it.
   */
  readonly nativeName?: string | undefined;
  /**
   * The emitter's `_meta`, verbatim.
   *
   * D14: the log preserves facts it has no field for. `_meta` is where both
   * ACP adapters put their vendor identity, so dropping it would make the
   * emitter's own tool name unrecoverable from the durable record.
   */
  readonly meta?: JsonValue | undefined;
};

/** A complete tool-call input retained before dispatch. @public */
export type ToolInputProviderMessage = MessageBase & {
  readonly role: 'tool-input';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly call?: ToolCallProjection | undefined;
};

/** A complete tool result retained after dispatch. @public */
export type ToolOutputProviderMessage = MessageBase & {
  readonly role: 'tool-output';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly isError: boolean;
  readonly call?: ToolCallProjection | undefined;
};

/** A stable-id provider message reconstructed by the event-log reducer. @public */
export type ProviderMessage =
  | UserProviderMessage
  | AssistantProviderMessage
  | ToolInputProviderMessage
  | ToolOutputProviderMessage;

/** Catalog provider identities accepted by the portable host. @public */
export const modelProviderKinds = [
  'openai',
  'anthropic',
  'ollama',
  'vertexai',
  'cerebras',
  'together',
  'morph',
  'xai',
  'moonshot',
  'tau',
] as const;

/** Catalog provider identity used to select an honest provider wire. @public */
export type ModelProviderKind = (typeof modelProviderKinds)[number];

/** Fields shared by every version-one event-log record. @public */
export type LogEventBase = {
  readonly version: 1;
  readonly leaderEpoch: string;
  readonly sequence: number;
  readonly recordedAt: string;
  readonly runId: string;
};

/** Appends one stable-id message to provider history. @public */
export type MessageAppendedEvent = LogEventBase & {
  readonly type: 'message.appended';
  readonly message: ProviderMessage;
};

/** Replaces one durable provider envelope without moving its message. @public */
export type MessageEnvelopeReplacedEvent = LogEventBase & {
  readonly type: 'message.envelope-replaced';
  readonly messageId: string;
  readonly replacement: ProviderMessage;
};

/** Evicts compacted messages and inserts their summary at the first eviction position. @public */
export type HistoryCompactedEvent = LogEventBase & {
  readonly type: 'history.compacted';
  readonly evictedMessageIds: readonly string[];
  readonly summary: ProviderMessage;
};

/** User action that admits a new turn. @public */
export type RunTrigger = 'submit' | 'retry' | 'edit' | 'regenerate';

/** Rewinds provider history to an unchanged prefix before a replacement turn. @public */
export type HistoryRewoundEvent = LogEventBase & {
  readonly type: 'history.rewound';
  readonly trigger: Exclude<RunTrigger, 'submit'>;
  readonly retainedMessageIds: readonly string[];
};

/** Replaces snapshot-context content by stable message id. @public */
export type SnapshotContextRefreshedEvent = LogEventBase & {
  readonly type: 'snapshot-context.refreshed';
  readonly messageId: string;
  readonly content: JsonValue;
};

/** Records a safeguard decision independently of provider history. @public */
export type SafeguardRecordedEvent = LogEventBase &
  (
    | {
        readonly type: 'safeguard.recorded';
        readonly safeguardId: string;
        readonly action: 'nudge';
        readonly reason: string;
        readonly message: UserProviderMessage;
      }
    | {
        readonly type: 'safeguard.recorded';
        readonly safeguardId: string;
        readonly action: 'terminate';
        readonly reason: string;
      }
  );

/** Records an interrupt request or resolution. @public */
export type InterruptRecordedEvent = LogEventBase & {
  readonly type: 'interrupt.recorded';
  readonly interruptId: string;
  readonly phase: 'requested' | 'resolved';
  readonly reason: string;
  readonly payload?: JsonValue;
};

/**
 * The host-attested settlement of one turn, as the chat's own log carries it
 * (A4, D9, S9).
 *
 * The host — never the agent and never the client — records what a turn wrote,
 * so the fact reaches the client the way every other durable fact does: one
 * record in the chat's log, replayed on every reattach. **One schema on every
 * host**: `turn.machine` emits the same settlement in the browser worker, the
 * daemon, the Electron utility and the cloud, so a revision card is projected
 * from one shape wherever the turn ran.
 *
 * @public
 */
export type TurnFinalizedLogEvent = LogEventBase & {
  readonly type: 'turn.finalized';
  /** Stable user-message id of the turn this revision records. */
  readonly turnId: string;
  readonly runId: string;
  readonly chatId: string;
  readonly projectId: string;
  /** The checkout the turn ran on; absent when the host could not name one. */
  readonly checkoutId?: string | undefined;
  /** Absent when the turn changed nothing, so nothing was minted (I5). */
  readonly revisionId?: string | undefined;
  /** The branch the checkout tracks, absent when it is detached. */
  readonly branch?: string | undefined;
  /** Paths that differ between the revision's first parent and the revision. */
  readonly changedPaths: readonly string[];
  /** Object id of the recorded **tree**, not of the revision that carries it. */
  readonly treeId?: string | undefined;
  readonly trigger: 'turn';
  /** Every lease on the checkout when the turn was placed (AC9). */
  readonly runIds: readonly string[];
};

/** A turn whose writes could not be merged into the checkout it ran on. @public */
export type TurnConflictedLogEvent = LogEventBase & {
  readonly type: 'turn.conflicted';
  readonly turnId: string;
  readonly runId: string;
  readonly chatId: string;
  readonly checkoutId?: string | undefined;
};

/** A turn that ran and ended without a revision: no outcome is silent. @public */
export type TurnFailedLogEvent = LogEventBase & {
  readonly type: 'turn.failed';
  readonly turnId: string;
  readonly runId: string;
  readonly chatId: string;
  readonly checkoutId?: string | undefined;
  readonly reason: string;
};

/** A durable run lifecycle state. @public */
export type RunLifecycleState = 'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** Storage guarantee attached to the first lifecycle marker for each run. @public */
export const storageDurabilityClasses = [
  'exclusive-append',
  'stream-append',
  'transactional-rewrite',
  'ephemeral',
] as const;

/** Storage guarantee attached to the first lifecycle marker for each run. @public */
export type StorageDurabilityClass = (typeof storageDurabilityClasses)[number];

/** Provider-visible tool selection committed with one admission. @public */
export type AgentToolChoice = 'none' | 'auto' | 'any' | 'custom' | readonly string[];

/** Provider reasoning controls frozen with one admitted model row. @public */
export type ModelReasoningConfig = {
  readonly effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
  readonly summary?: 'auto' | 'concise' | 'detailed' | undefined;
  readonly display?: 'summarized' | 'omitted' | undefined;
  readonly budgetTokens?: number | undefined;
};

/** Model selection committed with one admission so takeover can resume it exactly. @public */
export type TurnModelConfig = {
  readonly id: string;
  readonly contextWindow: number;
  readonly maxTokens?: number | undefined;
  readonly providerKind?: ModelProviderKind | undefined;
  readonly cost?: ModelCostRates | undefined;
  readonly reasoning?: ModelReasoningConfig | undefined;
};

/**
 * The one durable shape every terminal-run reason uses.
 *
 * A coded transport refusal fills `code` and `status` too, and `details` when
 * the gateway attached structured fields; a host-level throw carries only
 * `message`. Older logs recorded either nothing or a bare `{ message }`, both
 * of which still parse.
 *
 * @public
 */
export type RunFailureDetail = {
  /** User-safe reason. */
  readonly message: string;
  /** Stable transport/gateway refusal code when the failure carried one. */
  readonly code?: string | undefined;
  /** HTTP status when the transport received one. */
  readonly status?: number | undefined;
  /**
   * Structured fields the coded refusal carried, such as an
   * `INSUFFICIENT_CREDIT` denial's required and available credit atoms.
   */
  readonly details?: Record<string, unknown> | undefined;
};

/** Records a run lifecycle transition. @public */
export type RunLifecycleEvent = LogEventBase & {
  readonly type: 'run.lifecycle';
  readonly state: RunLifecycleState;
  readonly storageDurability?: StorageDurabilityClass | undefined;
  readonly detail?: RunFailureDetail | undefined;
  /**
   * Why the executor stopped, in its own vocabulary, on a terminal marker.
   *
   * A string, not a union: an external runner's reasons belong to the protocol
   * that produced them (ACP's `max_tokens`, `refusal`, `max_turn_requests`) and
   * extend without Tau's involvement, and D14 keeps an older reader able to read
   * a newer writer's value. It *narrows* {@link RunLifecycleState}, which cannot
   * say why a turn ended short, and never replaces it (V6).
   */
  readonly stopReason?: string | undefined;
};

/** Records one Tau-gateway invocation identity before any provider request. @public */
export type ModelInvocationPreparedEvent = LogEventBase & {
  readonly type: 'model.invocation-prepared';
  readonly attemptId: string;
  readonly purpose: 'generation' | 'compaction';
  readonly modelId: string;
};

/** Binds a prepared gateway attempt to the API-owned financial operation. @public */
export type ModelInvocationBoundEvent = LogEventBase & {
  readonly type: 'model.invocation-bound';
  readonly attemptId: string;
  readonly operationId: string;
  readonly status: 'pending' | 'terminal' | 'unavailable';
};

/** Commits the exact retained history prefix and the next user message at turn start. @public */
export type TurnContextSnapshot = {
  readonly version: 1;
  readonly systemPrompt: string;
  readonly systemPromptBlocks?: readonly ModelSystemPromptBlock[] | undefined;
  readonly model?: TurnModelConfig | undefined;
  readonly toolChoice?: AgentToolChoice | undefined;
  readonly allowedTools?: readonly string[] | undefined;
  readonly snapshot?: JsonValue | undefined;
  readonly initialMessages: readonly UserProviderMessage[];
  readonly postCompactionMessages: readonly UserProviderMessage[];
};

/** Commits one user turn together with the exact model context derived for it. @public */
export type TurnHistoryProjectionCommittedEvent = LogEventBase & {
  readonly type: 'turn.history-projection-committed';
  readonly retainedMessageIds: readonly string[];
  readonly message: UserProviderMessage;
  readonly context: TurnContextSnapshot;
};

/** Versioned vocabulary for one JSON object in the durable event log. @public */
export type AgentLogEvent =
  | MessageAppendedEvent
  | MessageEnvelopeReplacedEvent
  | HistoryCompactedEvent
  | HistoryRewoundEvent
  | SnapshotContextRefreshedEvent
  | SafeguardRecordedEvent
  | InterruptRecordedEvent
  | TurnFinalizedLogEvent
  | TurnConflictedLogEvent
  | TurnFailedLogEvent
  | RunLifecycleEvent
  | ModelInvocationPreparedEvent
  | ModelInvocationBoundEvent
  | TurnHistoryProjectionCommittedEvent;
