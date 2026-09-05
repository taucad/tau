// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { EventLogAppender } from '#log/event-log-appender.js';
import type { ModelCostRates, StopReason, Usage } from '@earendil-works/pi-ai';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  JsonObject,
  JsonValue,
  ModelProviderKind,
  ModelSystemPromptBlock,
  ProviderMessage,
  RunTrigger,
  RunLifecycleState,
} from '#log/event-types.js';

/** W1: ordered, durable event-log port owned by the active host. @public */
export type DurableEventLog = EventLogAppender;

/** Canonical tool definition presented to a model or harness. @public */
export type HostToolDefinition = {
  /** Stable tool name. */
  readonly name: string;
  /** Model-facing purpose and usage boundary. */
  readonly description: string;
  /** JSON Schema object for tool input. */
  readonly inputSchema: JsonObject;
};

/** One normalized streaming event from the model transport. @public */
export type ModelStreamEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'thinking-delta'; readonly text: string; readonly signature?: string | undefined }
  | { readonly type: 'message-metadata'; readonly metadata: NonNullable<ProviderMessage['metadata']> }
  | {
      readonly type: 'tool-input';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly input: JsonValue;
    }
  | { readonly type: 'usage'; readonly usage: Usage }
  | { readonly type: 'completed'; readonly stopReason: StopReason };

/** Non-durable model output projected only while its run is live. @public */
export type AgentLiveEvent = {
  readonly type: 'text-delta' | 'thinking-delta';
  readonly chatId: string;
  readonly runId: string;
  readonly messageId: string;
  readonly contentIndex: number;
  readonly delta: string;
};

/** Complete input for one model stream. @public */
export type ModelStreamRequest = {
  /** Gateway or local-provider model identity. */
  readonly modelId: string;
  /** Catalog pricing in dollars per million tokens. */
  readonly modelCost?: ModelCostRates | undefined;
  /** Catalog-resolved provider identity; transports must reject unsupported wires. */
  readonly providerKind?: ModelProviderKind | undefined;
  /** Requested output-token ceiling; the gateway clamps it to the catalog and remaining context. */
  readonly maxTokens?: number | undefined;
  /** System instruction supplied before provider history. */
  readonly systemPrompt: string;
  /** Optional cache-aware structure for the same prompt; pi continues to consume `systemPrompt`. */
  readonly systemPromptBlocks?: readonly ModelSystemPromptBlock[] | undefined;
  /** Provider-normalized history rebuilt from W1. */
  readonly messages: readonly ProviderMessage[];
  /** Canonical tools available for this request. */
  readonly tools: readonly HostToolDefinition[];
  /** Cancels provider work and transport reads. */
  readonly signal: AbortSignal;
};

/** W3: bearer/local model boundary with normalized streaming and usage. @public */
export type ModelTransport = {
  /** Start one provider stream. */
  stream(request: ModelStreamRequest): AsyncIterable<ModelStreamEvent>;
};

/** Input for one direct in-host tool dispatch. @public */
export type HostToolInvocation = {
  /** Stable model-issued tool-call identity. */
  readonly toolCallId: string;
  /** Registered tool name. */
  readonly toolName: string;
  /** Validated tool input. */
  readonly input: JsonValue;
  /** Cancels the active tool operation. */
  readonly signal: AbortSignal;
};

/** Normalized result of one tool dispatch. @public */
export type HostToolResult = {
  /** Complete JSON-safe tool output retained by W1. */
  readonly content: JsonValue;
  /** Whether the tool completed with a model-visible failure. */
  readonly isError: boolean;
};

/** W4: canonical schemas plus direct environment-owned tool dispatch. @public */
export type ToolRegistry = {
  /** Return every tool currently visible to the run. */
  list(): readonly HostToolDefinition[];
  /** Validate and dispatch one tool invocation. */
  invoke(invocation: HostToolInvocation): Promise<HostToolResult>;
};

/** Durable interrupt or approval request presented outside the harness. @public */
export type InterruptRequest = {
  /** Stable interrupt identity. */
  readonly interruptId: string;
  /** Run paused by this interrupt. */
  readonly runId: string;
  /** Reason the host paused. */
  readonly kind: 'approval' | 'operator' | 'safeguard';
  /** User-facing request text. */
  readonly prompt: string;
  /** Optional structured context for the presenter. */
  readonly payload?: JsonValue | undefined;
};

/** Durable resolution supplied to a paused run. @public */
export type InterruptResolution = {
  /** Interrupt being resolved. */
  readonly interruptId: string;
  /** Operator or policy decision. */
  readonly outcome: 'approved' | 'denied' | 'cancelled';
  /** Optional structured response. */
  readonly payload?: JsonValue | undefined;
};

/** W5: durable pause, presentation, and resume boundary. @public */
export type InterruptApprovalPort = {
  /** Persist and pause until a matching resolution is resumed. */
  pause(request: InterruptRequest): Promise<InterruptResolution>;
  /** List unresolved requests for presentation. */
  pending(input: { readonly runId: string }): Promise<readonly InterruptRequest[]>;
  /** Resolve a durable request and wake its paused run. */
  resume(resolution: InterruptResolution): Promise<void>;
};

/** Immutable identity and current state of one admitted run. @public */
export type HostRun = {
  /** Conversation identity whose workspace log owns the run. */
  readonly chatId: string;
  /** Client-generated execution identity. */
  readonly runId: string;
  /** User-message identity that serves as the turn id. */
  readonly turnId: string;
  /** Current durable lifecycle state. */
  readonly state: RunLifecycleState;
};

/** Structured model-transport refusal retained on a failed run. @public */
export type HostRunFailure = {
  /** Stable transport/provider refusal code. */
  readonly code: string;
  /** User-safe failure detail. */
  readonly message: string;
  /** HTTP status when the transport received one. */
  readonly status?: number | undefined;
};

/** Browser-safe snapshot returned by the run host. @public */
export type HostRunSnapshot = HostRun & {
  /** Current provider history rebuilt from the event log. */
  readonly messages: readonly ProviderMessage[];
  /** Typed model refusal, when the failed run originated at the transport boundary. */
  readonly failure?: HostRunFailure | undefined;
};

/** W6: run admission, steering, cancellation, resume, and snapshot commands. @public */
export type RunLifecycleCommands = {
  /** Admit a new execution identity and initial user turn. */
  admit(
    input: {
      readonly chatId: string;
      readonly runId: string;
      readonly message: Extract<ProviderMessage, { readonly role: 'user' }>;
    } & (
      | { readonly trigger: 'submit'; readonly retainedMessageIds?: never }
      | { readonly trigger: Exclude<RunTrigger, 'submit'>; readonly retainedMessageIds: readonly string[] }
    ),
  ): Promise<HostRun>;
  /** Add operator steering to an active run. */
  steer(input: { readonly runId: string; readonly message: string }): Promise<void>;
  /** Cancel an active or paused run. */
  cancel(input: { readonly runId: string; readonly reason?: string | undefined }): Promise<void>;
  /** Resume an interrupted run from its durable state. */
  resume(input: { readonly runId: string }): Promise<HostRun>;
  /** Read a projection rebuilt from durable host state. */
  snapshot(input: { readonly runId: string }): Promise<HostRunSnapshot>;
};
