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

type MessageBase = {
  readonly id: string;
  readonly content: JsonValue;
  readonly metadata?: ProviderMessageMetadata;
};

/** A provider-normalized user message. @public */
export type UserProviderMessage = MessageBase & { readonly role: 'user' };

/** A provider-normalized assistant message. @public */
export type AssistantProviderMessage = MessageBase & { readonly role: 'assistant' };

/** A complete tool-call input retained before dispatch. @public */
export type ToolInputProviderMessage = MessageBase & {
  readonly role: 'tool-input';
  readonly toolCallId: string;
  readonly toolName: string;
};

/** A complete tool result retained after dispatch. @public */
export type ToolOutputProviderMessage = MessageBase & {
  readonly role: 'tool-output';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly isError: boolean;
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

/** Model selection committed with one admission so takeover can resume it exactly. @public */
export type TurnModelConfig = {
  readonly id: string;
  readonly contextWindow: number;
  readonly maxTokens?: number | undefined;
  readonly providerKind?: ModelProviderKind | undefined;
  readonly cost?: ModelCostRates | undefined;
};

/**
 * The one durable shape every terminal-run reason uses.
 *
 * A coded transport refusal fills all three fields; a host-level throw carries
 * only `message`. Older logs recorded either nothing or a bare `{ message }`,
 * both of which still parse.
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
};

/** Records a run lifecycle transition. @public */
export type RunLifecycleEvent = LogEventBase & {
  readonly type: 'run.lifecycle';
  readonly state: RunLifecycleState;
  readonly storageDurability?: StorageDurabilityClass | undefined;
  readonly detail?: RunFailureDetail | undefined;
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
  | RunLifecycleEvent
  | TurnHistoryProjectionCommittedEvent;
