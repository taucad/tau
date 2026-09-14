/**
 * The T0 event-log command vocabulary, transport-free.
 *
 * This is the *same* vocabulary the browser worker speaks over a MessagePort
 * (`apps/ui/app/workers/agent-host.contract.ts`), minus the two frames that are
 * MessagePort-only by construction: `initialize` (it transfers ports) and
 * `capabilities` (it probes OPFS). A daemon is configured from its own CLI, so
 * the client never initializes it — everything else is byte-identical, which is
 * what lets one client projection render a run without knowing whether it came
 * from a worker or a socket.
 *
 * Zod only: no `node:` import may reach here, because the WebSocket client half
 * validates against these same schemas inside a browser bundle.
 */

import { z } from 'zod';

import {
  agentLogEventSchema,
  jsonValueSchema,
  modelReasoningConfigSchema,
  providerMessageSchema,
  userProviderMessageSchema,
} from '#log/event-schema.js';
import { modelProviderKinds } from '#log/event-types.js';
import { isGatewayProviderKind } from '#transport/gateway-model-transport.js';
import type { AgentLiveEvent, HostRunSnapshot, InterruptRequest, InterruptResolution } from '#waist/ports.js';
import type { EventLogBatch } from '#log/event-log-appender.js';
import type { AgentLogEvent, RunTrigger, UserProviderMessage } from '#log/event-types.js';
import type { TauAgentAdmissionConfig } from '#host/tau-agent-host.js';

/** Maximum durable events transferred in one replay window. @public */
export const agentChannelTailBatchLimit = 16;

/**
 * Maximum serialized bytes transferred in one replay window.
 *
 * A count alone does not bound a page: one `read_file` result inside a single
 * record can be larger than a whole ordinary transcript, so sixteen records is
 * an unbounded promise. A client may ask for less; it may not ask for more.
 *
 * @public
 */
export const agentChannelTailByteLimit = 1_048_576;

const nonEmptyString = z.string().min(1);

/**
 * Every typed refusal an external-agent run may carry to a surface (VSC4).
 *
 * A refusal is a *fact about the agent*, not a stack trace: each code names one
 * thing the user can act on — log in, pick another model, install the adapter —
 * so a surface renders an affordance rather than a vendor sentence with a
 * stderr tail attached. The code travels on `run.lifecycle.detail.code` and on
 * a thrown channel error alike; the facts a login needs travel beside it as an
 * {@link externalAgentLoginSchema} interrupt.
 *
 * @public
 */
export const externalAgentRefusalCodes = [
  'EXTERNAL_AGENT_AUTH_REQUIRED',
  'EXTERNAL_AGENT_MODEL_UNAVAILABLE',
  'EXTERNAL_AGENT_UNAVAILABLE',
  'EXTERNAL_AGENT_CONTENT_UNSUPPORTED',
  'CLI_TOO_OLD',
  'CLI_NOT_FOUND',
  'ADAPTER_NOT_INSTALLED',
  'ADAPTER_NO_BIN',
] as const;

/** One {@link externalAgentRefusalCodes} value. @public */
export type ExternalAgentRefusalCode = (typeof externalAgentRefusalCodes)[number];

/**
 * One external agent, exactly as every tier carries it (VSC1).
 *
 * This is the **sole** shape of `externalAgents`: the daemon's `ready` frame,
 * `GET /.well-known/tau-host`, the API relay, the desktop preload bootstrap and
 * the browser's placement ladder all speak it, and the string list it replaced
 * is gone (EQ18, VI9). It lives beside the refusal codes because it is wire
 * vocabulary both the host and the browser import from one place.
 *
 * Every field is bounded because all of it is **daemon-authored text rendered
 * in a browser**: `displayName` and a model `name` come from a vendor adapter's
 * own config options, so they are untrusted at render time exactly as an
 * agent's message text is.
 *
 * A `refusal` is an agent this installation *knows about* and cannot start.
 * It is carried rather than dropped so a GUI can say why a row is missing
 * instead of silently offering less than the user installed (V9).
 *
 * @public
 */
export const externalAgentDescriptorSchema = z.strictObject({
  /** Stable registry id, the value `acpAgentExecutionSchema.agentId` carries. */
  id: z.string().min(1).max(64),
  /** Product name for the selector row. */
  displayName: z.string().min(1).max(64),
  /**
   * Models the discovery probe read off the agent's `category: 'model'` select,
   * in the order the agent listed them. Empty when the probe failed or timed
   * out — never a reason to drop the agent (EQ1 fallback B).
   */
  models: z
    .array(z.strictObject({ id: z.string().min(1).max(128), name: z.string().min(1).max(128) }))
    .max(64)
    .default([]),
  /** The select's `currentValue`: what a turn naming no model actually runs. */
  defaultModel: z.string().min(1).max(128).optional(),
  /** Present exactly when this agent cannot be started; `models` is then empty. */
  refusal: z.enum(externalAgentRefusalCodes).optional(),
});

/** One agent as every tier carries it (VSC1). @public */
export type ExternalAgentDescriptor = z.infer<typeof externalAgentDescriptorSchema>;

/** One login method an agent offered, flattened for presentation. @public */
export const externalAgentAuthMethodSchema = z.strictObject({
  id: nonEmptyString,
  name: nonEmptyString,
  description: z.string().optional(),
  /**
   * A command line the *user* runs in their own terminal, ready to copy.
   *
   * X6: Tau never runs it and never sees what it produces — the vendor's
   * credential stays in the vendor's own store on the user's own machine.
   */
  terminalCommand: nonEmptyString.optional(),
});

/**
 * What a surface needs to get the user logged in to an external agent.
 *
 * One shape for both portable flows, because both end at the same banner: a
 * `-32000` refusal carries the `authMethods` the agent offered, and a URL
 * elicitation carries the verification `url` and `code` the agent is waiting
 * on. It is the payload of an `interrupt.recorded` of kind
 * `external-agent-login` and the payload of the `EXTERNAL_AGENT_AUTH_REQUIRED`
 * refusal, so a renderer written once serves both (V11).
 *
 * @public
 */
export const externalAgentLoginSchema = z.strictObject({
  kind: z.literal('external-agent-login'),
  /** Agent the user has to log in to. */
  agentId: nonEmptyString,
  /** Methods the agent listed at `initialize`; empty for a bare URL elicitation. */
  authMethods: z.array(externalAgentAuthMethodSchema),
  /** Where the user completes a URL (device-code) login. */
  url: z.string().optional(),
  /** The verification code that URL asks for, when the agent sent one. */
  code: z.string().optional(),
  /** The elicitation this login answers; absent for an initialize-time refusal. */
  elicitationId: nonEmptyString.optional(),
});

/** The login facts a surface renders; see {@link externalAgentLoginSchema}. @public */
export type ExternalAgentLogin = z.infer<typeof externalAgentLoginSchema>;

/** One cache-aware system-prompt block accepted at admission. @public */
export const agentChannelSystemPromptBlockSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
  cacheControl: z.strictObject({ type: z.literal('ephemeral'), scope: z.literal('global').optional() }).optional(),
});

/** Catalog pricing in dollars per million tokens. @public */
export const agentChannelModelCostSchema = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});

/** One catalog model row a client may name for its turn. @public */
export const agentChannelModelSchema = z.strictObject({
  id: nonEmptyString,
  providerKind: z.enum(modelProviderKinds).refine(isGatewayProviderKind),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive().optional(),
  cost: agentChannelModelCostSchema.optional(),
  reasoning: modelReasoningConfigSchema.optional(),
});

/** How the turn may use tools: a mode, or an explicit allowlist. @public */
export const agentChannelToolChoiceSchema = z.union([z.enum(['none', 'auto', 'any', 'custom']), z.array(z.string())]);

/* Loose, deliberately: the browser assembles richer skill rows than the host
 * consumes (`resourceUri`, `source`, `version`, …) and a strict relist here
 * would reject real client payloads at admission. */
const clientContextSchema = z.strictObject({
  skills: z
    .array(z.looseObject({ name: nonEmptyString, description: z.string(), fingerprint: z.string().optional() }))
    .optional(),
  memory: z.record(z.string(), z.string()).optional(),
});

/**
 * Which agent runs the turn.
 *
 * Absent — the overwhelming case — the daemon's own pi harness runs it against
 * a Tau model. Present, the daemon starts an *external* agent through its
 * pinned ACP adapter, which brings its own model, its own tools and the user's
 * own CLI login (X6). Nothing about the Tau model rows applies to that run.
 *
 * @public
 */
export const agentChannelRunKindSchema = z.strictObject({
  kind: z.literal('acp'),
  id: nonEmptyString,
  /** Adapter-specific model id; absent takes whatever the adapter defaults to. */
  model: nonEmptyString.max(128).optional(),
  /** Exact ACP session configuration ids and values. */
  config: z.record(nonEmptyString, z.union([z.string(), z.boolean()])).optional(),
});

/** Per-admission model, prompt, tool and client context accepted over the wire. @public */
export const agentChannelAdmissionConfigSchema = z.strictObject({
  agent: agentChannelRunKindSchema.optional(),
  systemPrompt: z.string(),
  systemPromptBlocks: z
    .union([
      z.tuple([agentChannelSystemPromptBlockSchema, agentChannelSystemPromptBlockSchema]),
      z.tuple([
        agentChannelSystemPromptBlockSchema,
        agentChannelSystemPromptBlockSchema,
        agentChannelSystemPromptBlockSchema,
      ]),
    ])
    .optional(),
  model: agentChannelModelSchema.optional(),
  toolChoice: agentChannelToolChoiceSchema,
  allowedTools: z.array(z.string()).optional(),
  snapshot: jsonValueSchema.optional(),
  contextPayload: clientContextSchema.optional(),
  contextMessages: z.array(userProviderMessageSchema).optional(),
});

/** Client-supplied admission overrides. @public */
export type AgentChannelAdmissionConfig = z.infer<typeof agentChannelAdmissionConfigSchema>;

const commandBase = { chatId: nonEmptyString };
const startBase = {
  ...commandBase,
  type: z.literal('start'),
  runId: nonEmptyString,
  message: userProviderMessageSchema,
  config: agentChannelAdmissionConfigSchema.optional(),
  /**
   * How the host records what this turn writes (N26, V19).
   *
   * Beside `config`, not inside it: the mode governs the *host's* revision, not
   * the model admission, and it applies identically to a Tau turn and to an
   * external one. Absent means `direct` — the mode every host records — so a
   * client that never learned about revisions still admits.
   */
  mode: z.enum(['direct', 'candidate']).optional(),
  /** Revision the turn's base is recorded under; minted by the host when absent. */
  baseRevisionId: nonEmptyString.optional(),
};
const tailWindow = {
  cursor: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(agentChannelTailBatchLimit),
  maxBytes: z.number().int().positive().max(agentChannelTailByteLimit).optional(),
};

/** Every command one client may issue on the `/agent` channel. @public */
export const agentChannelCommandSchema = z.union([
  z.strictObject({ ...startBase, trigger: z.literal('submit') }),
  z.strictObject({
    ...startBase,
    trigger: z.enum(['retry', 'edit', 'regenerate']),
    retainedMessageIds: z.array(nonEmptyString),
  }),
  z.strictObject({ ...commandBase, type: z.literal('steer'), runId: nonEmptyString, message: z.string() }),
  z.strictObject({ ...commandBase, type: z.literal('cancel'), runId: nonEmptyString }),
  z.strictObject({ ...commandBase, type: z.literal('resume') }),
  /* Additive beside the browser vocabulary, never a replacement: a daemon runs
   * unattended, so something has to be able to *raise* the approval a later
   * client resolves. A browser-shaped client simply never sends it. */
  z.strictObject({
    ...commandBase,
    type: z.literal('interrupt'),
    runId: nonEmptyString,
    interruptId: nonEmptyString,
    kind: z.enum(['approval', 'operator', 'safeguard']),
    prompt: z.string(),
    payload: jsonValueSchema.optional(),
  }),
  z.strictObject({
    ...commandBase,
    type: z.literal('resolve-interrupt'),
    runId: nonEmptyString,
    interruptId: nonEmptyString,
    outcome: z.enum(['approved', 'denied', 'cancelled']),
    /* The option the human actually chose, when the request offered a list. */
    optionId: nonEmptyString.optional(),
    payload: jsonValueSchema.optional(),
  }),
  z.strictObject({ ...commandBase, type: z.literal('attach'), ...tailWindow }),
  z.strictObject({ ...commandBase, type: z.literal('tail'), ...tailWindow }),
]);

type AgentChannelStartCommand = {
  readonly type: 'start';
  readonly chatId: string;
  readonly runId: string;
  readonly message: UserProviderMessage;
  readonly config?: AgentChannelAdmissionConfig | undefined;
  /** How the host records this turn; absent means `direct`. */
  readonly mode?: 'direct' | 'candidate' | undefined;
  /** Revision the turn's base is recorded under; minted by the host when absent. */
  readonly baseRevisionId?: string | undefined;
} & (
  | { readonly trigger: 'submit'; readonly retainedMessageIds?: never }
  | { readonly trigger: Exclude<RunTrigger, 'submit'>; readonly retainedMessageIds: readonly string[] }
);

/** One bounded replay window a client may ask for. @public */
export type AgentChannelTailWindow = {
  readonly cursor: number;
  readonly limit: number;
  /** Serialized-byte budget for the page; the daemon's own bound applies when absent. */
  readonly maxBytes?: number | undefined;
};

/** One client command on the `/agent` channel. @public */
export type AgentChannelCommand =
  | AgentChannelStartCommand
  | { readonly type: 'steer'; readonly chatId: string; readonly runId: string; readonly message: string }
  | { readonly type: 'cancel'; readonly chatId: string; readonly runId: string }
  | { readonly type: 'resume'; readonly chatId: string }
  | ({ readonly type: 'interrupt'; readonly chatId: string } & InterruptRequest)
  | ({ readonly type: 'resolve-interrupt'; readonly chatId: string; readonly runId: string } & InterruptResolution)
  | ({ readonly type: 'tail'; readonly chatId: string } & AgentChannelTailWindow)
  | ({ readonly type: 'attach'; readonly chatId: string } & AgentChannelTailWindow);

/** Operations that answer with a run projection. @public */
export type AgentChannelResultOperation = 'start' | 'steer' | 'cancel' | 'resume' | 'interrupt' | 'resolve-interrupt';

/** Leadership marker; a daemon is always the single leader for its workspace. @public */
export type AgentChannelLeadership =
  | { readonly role: 'leader'; readonly generation: string }
  | { readonly role: 'follower'; readonly generation?: string | undefined };

/** One answer to an {@link AgentChannelCommand}. @public */
export type AgentChannelResponse =
  | { readonly type: 'result'; readonly operation: AgentChannelResultOperation; readonly snapshot: HostRunSnapshot }
  | { readonly type: 'tail'; readonly chatId: string; readonly batch: EventLogBatch }
  | {
      readonly type: 'attach';
      readonly chatId: string;
      readonly batch: EventLogBatch;
      readonly leadership: AgentChannelLeadership;
      readonly snapshot?: HostRunSnapshot | undefined;
      readonly takeover: boolean;
    };

const hostRunSnapshotSchema = z.strictObject({
  chatId: nonEmptyString,
  runId: nonEmptyString,
  turnId: nonEmptyString,
  state: z.enum(['admitted', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  messages: z.array(providerMessageSchema),
  failure: z
    .strictObject({
      code: nonEmptyString,
      message: z.string(),
      status: z.number().int().optional(),
      /* The refusal's own fields, opaque on the wire: the code owns the shape
       * and the surface that renders it owns the schema. @see HostRunFailure */
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

const eventLogBatchSchema = z
  .strictObject({
    cursor: z.number().int().nonnegative(),
    nextCursor: z.number().int().nonnegative(),
    endCursor: z.number().int().nonnegative(),
    events: z.array(agentLogEventSchema).max(agentChannelTailBatchLimit),
  })
  .refine(({ cursor, events, nextCursor }) => nextCursor === cursor + events.length, {
    path: ['nextCursor'],
    message: 'must equal cursor plus event count',
  })
  .refine(({ nextCursor, endCursor }) => endCursor >= nextCursor, {
    path: ['endCursor'],
    message: 'before nextCursor',
  });

const leadershipSchema = z.union([
  z.strictObject({ role: z.literal('leader'), generation: nonEmptyString }),
  z.strictObject({ role: z.literal('follower'), generation: z.string().optional() }),
]);

/** Every answer a daemon may return on the `/agent` channel. @public */
export const agentChannelResponseSchema = z.union([
  z.strictObject({
    type: z.literal('result'),
    operation: z.enum(['start', 'steer', 'cancel', 'resume', 'interrupt', 'resolve-interrupt']),
    snapshot: hostRunSnapshotSchema,
  }),
  z.strictObject({ type: z.literal('tail'), chatId: nonEmptyString, batch: eventLogBatchSchema }),
  z.strictObject({
    type: z.literal('attach'),
    chatId: nonEmptyString,
    batch: eventLogBatchSchema,
    leadership: leadershipSchema,
    snapshot: hostRunSnapshotSchema.optional(),
    takeover: z.boolean(),
  }),
]);

/** One durable event, addressed to its chat. @public */
export type AgentChannelEvent = { readonly chatId: string; readonly event: AgentLogEvent };
/** One ephemeral model delta, addressed to its chat. @public */
export type AgentChannelLiveEvent = { readonly chatId: string; readonly event: AgentLiveEvent };

/** Durable-event stream frame schema. @public */
export const agentChannelEventSchema = z.strictObject({ chatId: nonEmptyString, event: agentLogEventSchema });
const liveEventBase = {
  chatId: nonEmptyString,
  runId: nonEmptyString,
  messageId: nonEmptyString,
  contentIndex: z.number().int().nonnegative(),
};
const liveToolEventBase = {
  ...liveEventBase,
  toolCallId: nonEmptyString,
  toolName: nonEmptyString,
};

/** Ephemeral-delta stream frame schema. @public */
export const agentChannelLiveEventSchema = z.strictObject({
  chatId: nonEmptyString,
  event: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('text-start'), ...liveEventBase }),
    z.strictObject({
      type: z.literal('thinking-start'),
      ...liveEventBase,
      timestamp: z.number().int().nonnegative().optional(),
    }),
    z.strictObject({
      type: z.enum(['text-delta', 'thinking-delta']),
      ...liveEventBase,
      delta: z.string(),
    }),
    z.strictObject({
      type: z.literal('text-end'),
      ...liveEventBase,
      content: z.string(),
    }),
    z.strictObject({
      type: z.literal('thinking-end'),
      ...liveEventBase,
      content: z.string(),
      timestamp: z.number().int().nonnegative().optional(),
    }),
    z.strictObject({
      type: z.literal('tool-input-start'),
      ...liveToolEventBase,
    }),
    z.strictObject({
      type: z.literal('tool-input-delta'),
      ...liveToolEventBase,
      delta: z.string(),
    }),
    z.strictObject({
      type: z.literal('tool-input-end'),
      ...liveToolEventBase,
      input: jsonValueSchema,
    }),
    z.strictObject({
      type: z.literal('tool-output-update'),
      ...liveToolEventBase,
      output: jsonValueSchema,
      isError: z.boolean(),
    }),
  ]),
});

/**
 * The `/agent` channel protocol, shaped exactly like the browser worker's.
 *
 * Kept as a plain structural type so this module stays free of `@taucad/rpc`:
 * the binding to a channel server lives with whichever transport mounts it.
 *
 * @public
 */
export type AgentChannelProtocol = {
  readonly calls: {
    readonly request: { readonly args: AgentChannelCommand; readonly result: AgentChannelResponse };
  };
  readonly notifies: Record<never, never>;
  readonly listens: {
    readonly events: { readonly args: undefined; readonly wireArgs: unknown; readonly event: AgentChannelEvent };
    readonly liveEvents: {
      readonly args: undefined;
      readonly wireArgs: unknown;
      readonly event: AgentChannelLiveEvent;
    };
  };
};

/** Wire validators for {@link AgentChannelProtocol}, ready for `protocolSchemas`. @public */
export const agentChannelProtocolSchemas = {
  calls: { request: { args: agentChannelCommandSchema, result: agentChannelResponseSchema } },
  notifies: {},
  listens: {
    events: { args: z.null(), event: agentChannelEventSchema },
    liveEvents: { args: z.null(), event: agentChannelLiveEventSchema },
  },
};

/** Narrow a validated command into the admission request the host core takes. @public */
export const admissionConfigFor = (
  config: AgentChannelAdmissionConfig | undefined,
  fallback: { readonly systemPrompt: string; readonly model?: TauAgentAdmissionConfig['model'] },
): TauAgentAdmissionConfig => ({
  systemPrompt: config?.systemPrompt ?? fallback.systemPrompt,
  ...(config?.systemPromptBlocks ? { systemPromptBlocks: config.systemPromptBlocks } : {}),
  model: config?.model ?? fallback.model,
  toolChoice: config?.toolChoice ?? 'auto',
  ...(config?.allowedTools ? { allowedTools: config.allowedTools } : {}),
  ...(config?.snapshot === undefined ? {} : { snapshot: config.snapshot }),
  ...(config?.contextPayload ? { clientContext: config.contextPayload } : {}),
  ...(config?.contextMessages ? { contextMessages: config.contextMessages } : {}),
});
