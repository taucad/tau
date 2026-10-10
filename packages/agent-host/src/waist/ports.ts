import type { EventLogAppender } from '#log/event-log-appender.js';
import type { ModelCostRates, StopReason, Usage } from '@earendil-works/pi-ai';
import type {
  JsonObject,
  JsonValue,
  LogEventBase,
  ModelReasoningConfig,
  ModelProviderKind,
  ModelSystemPromptBlock,
  ProviderMessage,
  RunLifecycleState,
  TurnConflictedLogEvent,
  TurnFailedLogEvent,
  TurnFinalizedLogEvent,
  TurnPlacement,
} from '#log/event-types.js';
import type { InvocationResolution } from '#wire/gateway.js';

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
  /**
   * `sequential` when one call's effect spans more than one path or state outside the workspace: pi then runs the whole
   * batch in call order (EQ6). Parallel when absent.
   */
  readonly executionMode?: 'sequential' | 'parallel' | undefined;
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
  | (AgentLiveEventBase & {
      readonly type: 'text-delta';
      readonly delta: string;
      /** UTF-16 offset in this block, for reconciliation with durable checkpoints. */
      readonly offset?: number | undefined;
    })
  | (AgentLiveEventBase & { readonly type: 'text-end'; readonly content: string })
  | (AgentLiveEventBase & { readonly type: 'thinking-start'; readonly timestamp?: number | undefined })
  | (AgentLiveEventBase & {
      readonly type: 'thinking-delta';
      readonly delta: string;
      /** UTF-16 offset in this block, for reconciliation with durable checkpoints. */
      readonly offset?: number | undefined;
    })
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
  /**
   * The chat this invocation belongs to, for the gateway's spend attribution.
   * Per request rather than per transport: one transport serves every chat in a
   * worker. Absent when the caller has no chat identity to give.
   */
  readonly chatId?: string | undefined;
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
  /**
   * Documents whose bytes this request carries, keyed by the lowercase hex
   * SHA-256 each `⟃tau:document:<sha256>⟄` sentinel text block in `messages`
   * names (D15). A transport replaces every sentinel with its provider's native
   * document block and must refuse a sentinel it cannot resolve (D21). Absent
   * when no message references a document.
   */
  readonly documents?: ReadonlyMap<string, MaterializedDocument> | undefined;
  /** Canonical tools available for this request. */
  readonly tools: readonly HostToolDefinition[];
  /** Cancels provider work and transport reads. */
  readonly signal: AbortSignal;
};

/**
 * One document's bytes, read for a single model request and never persisted (D15).
 *
 * @public
 */
export type MaterializedDocument = {
  /** The document's bytes, base64-encoded without a `data:` prefix. */
  readonly data: string;
  /** The media type the durable `file-ref` recorded, e.g. `application/pdf`. */
  readonly mediaType: string;
  /** The user-facing name the durable `file-ref` recorded, when it recorded one. */
  readonly filename?: string | undefined;
};

/** Input for one invocation resolution. The signal cancels the lookup, not the attempt. @public */
export type InvocationResolutionRequest = {
  /** The prepared attempt's id, the gateway's attempt key. */
  readonly attemptId: string;
  /** Cancels the lookup; a `TimeoutError` reason answers `unavailable`, any other reason rethrows. */
  readonly signal: AbortSignal;
};

/**
 * Whether this transport's calls are funded by Tau's gateway ledger (library-API §11: one facet, not optional methods).
 * A self-host transport is `unfunded`; the host refuses a chat whose attempts were funded elsewhere
 * (`MODEL_ATTEMPT_OTHER_ACCOUNT`) and never resolves them.
 *
 * @public
 */
export type InvocationFunding =
  | { readonly type: 'unfunded' }
  | {
      readonly type: 'funded';
      /** Whether this provider/model selection uses Tau's funded gateway. */
      usesBillingAttempt(providerKind: ModelProviderKind | undefined): boolean;
      /**
       * Two-way lookup: the gateway voids an unknown key before answering `voided` (GI-R3). A sign-in failure throws
       * `UNAUTHENTICATED` as `stream` does; an answer this build cannot read throws `MALFORMED_RESPONSE`.
       */
      resolveInvocation(request: InvocationResolutionRequest): Promise<InvocationResolution>;
      /**
       * The signed-in account the gateway charges (W7 RA-S11, `MODEL_ATTEMPT_OTHER_ACCOUNT`); `undefined` means
       * unknown, so the host cannot check the attempt's account.
       */
      principal(): Promise<string | undefined>;
    };

/** W3: bearer/local model boundary with normalized streaming and usage. @public */
export type ModelTransport = {
  /** Whether Tau's gateway ledger funds this transport's calls, and how an attempt is resolved (GI-S4, RA-S11). */
  readonly funding: InvocationFunding;
  /** Start one provider stream. */
  stream(request: ModelStreamRequest): AsyncIterable<ModelStreamEvent>;
};

/**
 * The API-owned operation a funded call was bound to, read off the accepted response. Bind is its only producer, so
 * it carries no status: the bound row writes `pending` for older readers (GI-R6, gi-surface-trim). @public
 */
export type ModelInvocationBinding = {
  readonly operationId: string;
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
  /**
   * Ask the person for a durable approval, or read the one they already gave (D5).
   *
   * Optional, unlike the rest of the invocation: one registry serves runs under
   * hosts that cannot pause a run — an API-coordinated run, an MCP call from an
   * external adapter — and a tool that needs consent under such a host hands
   * its record back `awaiting-approval` for the person to answer in Tau's own
   * surface, rather than failing or, worse, proceeding.
   */
  readonly approve?: HostToolApproval | undefined;
};

/**
 * One durable approval a tool asks of the person before an effect it must not
 * take alone — a physical print, a paid job (D5).
 *
 * Under a Tau host the request is the run's native durable interrupt: asking
 * records `interrupt.recorded` and pauses the run, which ends this attempt (D10,
 * TS-R10), so the call never returns an answer; it rejects as the attempt is
 * aborted. The person's decision resolves the interrupt and reaches the
 * registry's `answerApproval` at once; the run continues as its next attempt,
 * which is told the answer, and a call asking again under the same key reads it
 * through `recall`. A denial ends the paused run (`resolved`, `cancelled`).
 *
 * The whole resolution, not just its outcome: a request that offered options is
 * answered by one of them, and re-deriving the choice from `approved` would
 * substitute the host's guess for the human's decision.
 *
 * @public
 */
export type HostToolApproval = ((request: {
  /** Names what is being approved across attempts: the next attempt recalls it by this key. */
  readonly key?: string | undefined;
  readonly prompt: string;
  readonly payload?: JsonObject | undefined;
}) => Promise<InterruptResolution>) & {
  /**
   * The person's answer to this run's request under `key`, until a call recalls it: the recalling call spends it.
   *
   * @param key - The key the request was asked under.
   * @returns The payload that was asked and its resolution, or `undefined` when none is waiting to be used.
   */
  readonly recall?: ((key: string) => Promise<HostToolApprovalRecord | undefined>) | undefined;
};

/** A resolved approval a tool asked for, as its next attempt recalls it. @public */
export type HostToolApprovalRecord = Readonly<{
  /** The payload the request carried. */
  payload: JsonObject;
  resolution: InterruptResolution;
}>;

/** Normalized result of one tool dispatch. @public */
export type HostToolResult = {
  /** Complete JSON-safe tool output retained by W1. */
  readonly content: JsonValue;
  /** Whether the tool completed with a model-visible failure. */
  readonly isError: boolean;
  /**
   * The recalled approval this call used (D5). The host sets it and records it on the call's output row, so one
   * answer is spent by the call that recalled it and by no other.
   */
  readonly approval?: Readonly<{ interruptId: string }> | undefined;
};

/**
 * A person's answer to an approval a registry's tool asked for (D5), as the host hands it back to that registry.
 *
 * @public
 */
export type HostToolApprovalAnswer = Readonly<{
  /** The tool that asked. */
  toolName: string;
  /** The payload its request carried. */
  payload: JsonObject;
  /** The answer: `approved`, `denied`, or `cancelled` with the run. */
  resolution: InterruptResolution;
}>;

/** W4: canonical schemas plus direct environment-owned tool dispatch. @public */
export type ToolRegistry = {
  /**
   * Act on the person's answer to an approval one of these tools asked for (D5).
   *
   * The host calls it when the answer is recorded (`resolve-interrupt`, or `cancel` of the paused run), so what the
   * tool guards (a print request) follows the chat's answer whether or not the run continues. It must be idempotent:
   * the answer may also reach the tool through `recall` when the run continues.
   */
  readonly answerApproval?: ((answer: HostToolApprovalAnswer) => Promise<void>) | undefined;
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

/** One attempt of one agent run against one checkout (I9, D15). `turnId` is the user message id. @public */
export type TurnAttemptKey = Readonly<{ chatId: string; turnId: string; runId: string; attempt: number }>;

/** What every verb that addresses one attempt takes: the request id every answer echoes (D14), and the key. @public */
export type TurnAttemptInput = Readonly<{ requestId: string; key: TurnAttemptKey }>;

/** `admit`: lease the attempt, pre-mint a dirty base, and hand out its tools. @public */
export type TurnAdmitInput = TurnAttemptInput &
  Readonly<{
    /** The person's placement choice (TS-R12). Absent: the chat record's checkout, then the live one. */
    checkoutId?: string | undefined;
  }>;

/** `complete`: settle the attempt. `cut` is true for every attempt that executed, whatever its outcome (TS-R11). @public */
export type TurnCompleteInput = TurnAttemptInput & Readonly<{ cut: boolean }>;

/** `reconcile`: list the lease records of the project, or of one chat. @public */
export type TurnReconcileInput = Readonly<{ requestId: string; chatId?: string | undefined }>;

/** `settlements`: a listen that replays every unacknowledged fact on subscribe. @public */
export type TurnSettlementsInput = Readonly<{ signal: AbortSignal }>;

/**
 * Where an attempt runs (TS-S0's `TurnPlacement`, renamed so it does not collide with the log's placement record,
 * which this package already exports as `TurnPlacement`). The record part is what attempt 1's `running` row stores.
 *
 * @public
 */
export type TurnPlacementGrant = TurnPlacement &
  Readonly<{
    /** Where the attempt's files are rooted in this host's namespace (an external agent's cwd). */
    root: string;
    /** The attempt's tools over that root. `complete`, `abandon` and the session fence revoke them. */
    tools: ToolRegistry;
  }>;

/** One settlement row as the port publishes it: a `turn.*` body keyed by run and attempt. @public */
export type TurnSettlementRow = Readonly<{ runId: string; attempt: number }> &
  (
    | Omit<TurnFinalizedLogEvent, keyof LogEventBase>
    | Omit<TurnConflictedLogEvent, keyof LogEventBase>
    | (Omit<TurnFailedLogEvent, keyof LogEventBase> & Readonly<{ code?: string | undefined }>)
  );

/** An answer to one port request. A refusal is data; a dead session rejects instead. @public */
export type TurnPlacementAnswer<Result extends Record<string, unknown>, Code extends string> =
  | (Readonly<{ requestId: string; status: 'applied' | 'replayed' }> & Result)
  | Readonly<{
      requestId: string;
      status: 'refused';
      code: Code;
      /** Names the recovery. */
      message: string;
      details?: Readonly<Record<string, unknown>> | undefined;
    }>;

/** What the root publishes. Delivery is at least once; M1's append is idempotent per key (TS-R18). @public */
export type TurnPlacementFact =
  /** The admitted tools changed a versioned file in this attempt. */
  | Readonly<{ kind: 'changed'; key: TurnAttemptKey; checkoutId: string }>
  | Readonly<{ kind: 'settled'; key: TurnAttemptKey; row: TurnSettlementRow }>
  /** A lease this session did not admit refused one of its operations (TS-R16, TS-R17). */
  | Readonly<{ kind: 'leaseHeld'; key: TurnAttemptKey; checkoutId: string }>;

type NoResult = Readonly<Record<never, never>>;

/**
 * The host's placement and settlement port (D9, TS-S0 consumer-port). One instance per project (I23). M1 drives its
 * order: `admit` after the intent row, `complete` after the ending row, `abandon` at the stop bound and on fencing,
 * `acknowledge` after the `turn.*` row. Function-typed properties, so an adapter's drifted input is caught.
 *
 * @public
 */
export type TurnPlacementPort = Readonly<{
  admit: (
    input: TurnAdmitInput,
  ) => Promise<
    TurnPlacementAnswer<
      Readonly<{ placement: TurnPlacementGrant }>,
      | 'CHECKOUT_UNKNOWN'
      | 'CHECKOUT_CONFLICT'
      | 'BASE_CUT_FAILED'
      | 'TURN_ALREADY_LEASED'
      | 'REVISIONS_UNAVAILABLE'
      | 'SESSION_FENCED'
    >
  >;
  complete: (
    input: TurnCompleteInput,
  ) => Promise<
    TurnPlacementAnswer<NoResult, 'TURN_UNKNOWN' | 'CUT_FAILED' | 'LEASE_HELD_ELSEWHERE' | 'SESSION_FENCED'>
  >;
  abandon: (input: TurnAttemptInput) => Promise<TurnPlacementAnswer<NoResult, 'TURN_UNKNOWN' | 'SESSION_FENCED'>>;
  reconcile: (
    input: TurnReconcileInput,
  ) => Promise<
    TurnPlacementAnswer<
      Readonly<{ held: ReadonlyArray<Readonly<{ key: TurnAttemptKey; checkoutId: string }>> }>,
      'REVISIONS_UNAVAILABLE' | 'SESSION_FENCED'
    >
  >;
  settlements: (input: TurnSettlementsInput) => AsyncIterable<TurnPlacementFact>;
  acknowledge: (
    input: TurnAttemptInput,
  ) => Promise<TurnPlacementAnswer<NoResult, 'LEASE_HELD_ELSEWHERE' | 'REVISIONS_BUSY' | 'SESSION_FENCED'>>;
}>;

/** A launcher live delta qualified by its emitting writer incarnation. @public */
export type SourceLiveEvent = AgentLiveEvent & { readonly sourceGeneration: string };
