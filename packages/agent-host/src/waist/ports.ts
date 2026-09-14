import type { EventLogAppender } from '#log/event-log-appender.js';
import type { ModelCostRates, StopReason, Usage } from '@earendil-works/pi-ai';
import type {
  JsonObject,
  JsonValue,
  ModelReasoningConfig,
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
  | { readonly type: 'text-start'; readonly contentIndex: number }
  | { readonly type: 'text-delta'; readonly contentIndex?: number | undefined; readonly text: string }
  | { readonly type: 'text-end'; readonly contentIndex: number; readonly content: string }
  | { readonly type: 'thinking-start'; readonly contentIndex: number }
  | {
      readonly type: 'thinking-delta';
      readonly contentIndex?: number | undefined;
      readonly text: string;
    }
  | { readonly type: 'thinking-end'; readonly contentIndex: number; readonly content: string }
  | { readonly type: 'thinking-signature'; readonly contentIndex: number; readonly signature: string }
  | {
      readonly type: 'message-metadata';
      readonly metadata: NonNullable<ProviderMessage['metadata']>;
    }
  | {
      readonly type: 'tool-input-start';
      readonly contentIndex?: number | undefined;
      readonly toolCallId: string;
      readonly toolName: string;
    }
  | {
      readonly type: 'tool-input-delta';
      readonly contentIndex: number;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly delta: string;
    }
  | {
      readonly type: 'tool-input';
      readonly contentIndex?: number | undefined;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly input: JsonValue;
      readonly thoughtSignature?: string | undefined;
    }
  | { readonly type: 'usage'; readonly usage: Usage }
  | { readonly type: 'completed'; readonly stopReason: StopReason };

/** Non-durable model output projected only while its run is live. @public */
type AgentLiveEventBase = {
  readonly chatId: string;
  readonly runId: string;
  readonly messageId: string;
  readonly contentIndex: number;
};

/** Non-durable model output projected only while its run is live. @public */
export type AgentLiveEvent =
  | (AgentLiveEventBase & { readonly type: 'text-start' })
  | (AgentLiveEventBase & { readonly type: 'text-delta'; readonly delta: string })
  | (AgentLiveEventBase & { readonly type: 'text-end'; readonly content: string })
  | (AgentLiveEventBase & { readonly type: 'thinking-start'; readonly timestamp?: number | undefined })
  | (AgentLiveEventBase & { readonly type: 'thinking-delta'; readonly delta: string })
  | (AgentLiveEventBase & {
      readonly type: 'thinking-end';
      readonly content: string;
      readonly timestamp?: number | undefined;
    })
  | (AgentLiveEventBase & {
      readonly type: 'tool-input-start';
      readonly toolCallId: string;
      readonly toolName: string;
    })
  | (AgentLiveEventBase & {
      readonly type: 'tool-input-delta';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly delta: string;
    })
  | (AgentLiveEventBase & {
      readonly type: 'tool-input-end';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly input: JsonValue;
    })
  | (AgentLiveEventBase & {
      readonly type: 'tool-output-update';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly output: JsonValue;
      readonly isError: boolean;
    });

/** One live event before its chat/run identity is attached. @public */
export type AgentLiveEventPayload = AgentLiveEvent extends infer Event
  ? Event extends AgentLiveEvent
    ? Omit<Event, 'chatId' | 'runId'>
    : never
  : never;

/** Complete input for one model stream. @public */
export type ModelStreamRequest = {
  /** Durable caller identity for this one Tau gateway invocation. */
  readonly attemptId: string;
  /** Why this distinct provider invocation exists. */
  readonly invocationPurpose: 'generation' | 'compaction';
  /** Called after the response header is validated and before its stream is consumed. */
  readonly onInvocationBound?: ((binding: ModelInvocationBinding) => Promise<void>) | undefined;
  /** Gateway or local-provider model identity. */
  readonly modelId: string;
  /** Catalog pricing in dollars per million tokens. */
  readonly modelCost?: ModelCostRates | undefined;
  /** Catalog-resolved provider identity; transports must reject unsupported wires. */
  readonly providerKind?: ModelProviderKind | undefined;
  /** Effective catalog reasoning controls frozen at admission. */
  readonly reasoning?: ModelReasoningConfig | undefined;
  /** Requested output-token ceiling; the gateway clamps it to the catalog and remaining context. */
  readonly maxTokens?: number | undefined;
  /** Catalog context window of the selected model, in tokens. */
  readonly contextWindow?: number | undefined;
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
  /** Whether this provider/model selection uses Tau's funded gateway. */
  usesBillingAttempt?: ((providerKind: ModelProviderKind | undefined) => boolean) | undefined;
  /** Resolve an ambiguous prepared attempt without dispatching it again. */
  lookupAttempt?: ((attemptId: string, signal: AbortSignal) => Promise<ModelInvocationBinding | undefined>) | undefined;
  /** Start one provider stream. */
  stream(request: ModelStreamRequest): AsyncIterable<ModelStreamEvent>;
};

/** Opaque API-owned operation binding exposed to portable hosts. @public */
export type ModelInvocationBinding = {
  readonly operationId: string;
  readonly status: 'pending' | 'terminal' | 'unavailable';
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
  /** Forward a genuine partial result produced by the executing registry. */
  readonly onUpdate?: ((result: HostToolResult) => void) | undefined;
  /**
   * The run this call serves, when one owns it.
   *
   * A registry that roots a turn somewhere other than the host's own workspace
   * — a candidate revision's checkout (V19) — has no other way to tell which
   * turn is calling: one registry serves every concurrent run. Absent for a
   * dispatch that belongs to no Tau run, such as an MCP call from an external
   * adapter, which is served at the workspace root.
   */
  readonly runId?: string | undefined;
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
  /**
   * The exact option the decider chose, when the request offered a list.
   *
   * An outcome is not a choice: an ACP permission request may offer both
   * "allow once" and "allow always", and re-deriving one from `approved`
   * substitutes the host's guess for the human's decision.
   */
  readonly optionId?: string | undefined;
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
  /**
   * Structured fields the refusal carried, such as an `INSUFFICIENT_CREDIT`
   * denial's required and available credit atoms. Owned by the code, so it
   * travels opaquely to whichever surface renders the refusal.
   */
  readonly details?: Record<string, unknown> | undefined;
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
      | {
          readonly trigger: Exclude<RunTrigger, 'submit'>;
          readonly retainedMessageIds: readonly string[];
        }
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
