/**
 * The version-1 daemon wire, kept for the compatibility window (I32; seam blueprint "Mixed builds"). The v1 peers are
 * an installed desktop daemon older than a newer web page, and older page or desktop builds; the published
 * `@taucad/cli@0.1.0-beta.0` never dials the daemon (its only command is `export`), and host, agent-host and mcp are
 * unpublished. A current daemon explicitly serves a legacy v1 client, and a current client that meets a v1 daemon (a hello with no `wire`
 * field) speaks v1 and replays reads only.
 *
 * Removed once the oldest supported desktop build ships the current wire. A current client refuses a hello naming
 * another wire with `WIRE_VERSION_UNSUPPORTED`. Removal checklist:
 * - this file and `launchers/agent-wire-v1-session.ts`;
 * - in `channel/agent-channel-client.ts`: the `v1Tail`, `v1Execute` and `v1Read` helpers, every `wire === 1` branch,
 *   and `helloWire`'s v1 answer (a hello with no `wire` becomes unsupported);
 * - in `launchers/agent-channel.ts`: the `request` call, the `events` listen, `liveEvents` with no chat, the v1
 *   session, and `AgentWireCompatProtocol` / `agentWireCompatSchemas` in favour of `AgentWireProtocol` /
 *   `agentWireProtocolSchemas`;
 * - the public `replayedStartOutcome` export (`src/index.ts`), whose only product caller is the v1 session;
 * - the compatibility sentence in `.nx/version-plans/agent-host-seam-contract.md`'s successor, and the mixed-builds
 *   cases in `test/seam/seam.daemon.test.ts`.
 *
 * Browser-safe: zod and zod-only schemas. The daemon's half lives in `launchers/agent-wire-v1-session.ts`.
 */

import { z } from 'zod';

import {
  agentLogEventSchema,
  jsonValueSchema,
  providerMessageSchema,
  userProviderMessageSchema,
} from '#log/event-schema.js';
import { agentChannelAdmissionConfigSchema } from '#wire/admission.schema.js';
import {
  agentLiveEventSchema,
  sourceLiveEventSchema,
  agentWireHelloSchema,
  agentWireProtocolSchemas,
  agentWireVersion,
} from '#wire/frames.schema.js';
import type { AgentWireProtocol } from '#wire/frames.schema.js';
import type { HostCommand } from '#wire/commands.schema.js';
import type { AgentLiveEvent, HostRunSnapshot } from '#waist/ports.js';
import type { AgentLogEvent, JsonValue } from '#log/event-types.js';

const text = z.string().min(1);
const batchRows = 16;
const batchBytes = 1_048_576;

const window = {
  cursor: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(batchRows),
  maxBytes: z.number().int().positive().max(batchBytes).optional(),
};
const startBase = {
  chatId: text,
  type: z.literal('start'),
  runId: text,
  message: userProviderMessageSchema,
  config: agentChannelAdmissionConfigSchema.optional(),
  /* Accepted from a v1 client and ignored: placement answers both (drift item 4). */
  mode: z.enum(['direct', 'candidate']).optional(),
  baseRevisionId: text.optional(),
};

/** Every v1 request, as `@taucad/cli@0.1.0-beta.0` and the v1 page send it. @internal */
export const v1RequestSchema = z.union([
  z.strictObject({ ...startBase, trigger: z.literal('submit') }),
  z.strictObject({ ...startBase, trigger: z.enum(['retry', 'edit', 'regenerate']), retainedMessageIds: z.array(text) }),
  z.strictObject({ chatId: text, type: z.literal('steer'), runId: text, message: z.string() }),
  z.strictObject({ chatId: text, type: z.literal('cancel'), runId: text }),
  z.strictObject({ chatId: text, type: z.literal('resume') }),
  z.strictObject({
    chatId: text,
    type: z.literal('interrupt'),
    runId: text,
    interruptId: text,
    kind: z.enum(['approval', 'operator', 'safeguard']),
    prompt: z.string(),
    payload: jsonValueSchema.optional(),
  }),
  z.strictObject({
    chatId: text,
    type: z.literal('resolve-interrupt'),
    runId: text,
    interruptId: text,
    outcome: z.enum(['approved', 'denied', 'cancelled']),
    optionId: text.optional(),
    payload: jsonValueSchema.optional(),
  }),
  z.strictObject({ chatId: text, type: z.literal('attach'), ...window }),
  z.strictObject({ chatId: text, type: z.literal('tail'), ...window }),
  z.strictObject({ type: z.literal('revision'), request: jsonValueSchema }),
]);

/** One v1 request. @internal */
export type V1Request = z.infer<typeof v1RequestSchema>;

const snapshotSchema = z.strictObject({
  chatId: text,
  runId: text,
  turnId: text,
  state: z.enum(['admitted', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  messages: z.array(providerMessageSchema),
  failure: z
    .strictObject({
      code: text,
      message: z.string(),
      status: z.number().int().optional(),
      details: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

/** A v1 replay window: may be clamped (a v1 reader detects it through `foldReadAnswer`). @internal */
export const v1BatchSchema = z.strictObject({
  cursor: z.number().int().nonnegative(),
  nextCursor: z.number().int().nonnegative(),
  endCursor: z.number().int().nonnegative(),
  events: z.array(agentLogEventSchema).max(batchRows),
});

/** One v1 batch. @internal */
export type V1Batch = Readonly<{
  cursor: number;
  nextCursor: number;
  endCursor: number;
  events: readonly AgentLogEvent[];
}>;

const resultOperation = z.enum(['start', 'steer', 'cancel', 'resume', 'interrupt', 'resolve-interrupt']);

/** Every v1 answer. @internal */
export const v1ResponseSchema = z.union([
  z.strictObject({ type: z.literal('result'), operation: resultOperation, snapshot: snapshotSchema }),
  z.strictObject({ type: z.literal('tail'), chatId: text, batch: v1BatchSchema }),
  z.strictObject({
    type: z.literal('attach'),
    chatId: text,
    batch: v1BatchSchema,
    leadership: z.strictObject({ role: z.literal('leader'), generation: text }),
    snapshot: snapshotSchema.optional(),
    takeover: z.boolean(),
  }),
  z.strictObject({ type: z.literal('revision'), result: jsonValueSchema, status: jsonValueSchema }),
]);

/** One v1 answer. @internal */
export type V1Response =
  | Readonly<{ type: 'result'; operation: z.infer<typeof resultOperation>; snapshot: HostRunSnapshot }>
  | Readonly<{ type: 'tail'; chatId: string; batch: V1Batch }>
  | Readonly<{
      type: 'attach';
      chatId: string;
      batch: V1Batch;
      leadership: Readonly<{ role: 'leader'; generation: string }>;
      snapshot?: HostRunSnapshot;
      takeover: boolean;
    }>
  | Readonly<{ type: 'revision'; result: JsonValue; status: JsonValue }>;

/** A v1 durable or live frame, addressed to its chat. @internal */
export type V1Addressed<Event> = Readonly<{ chatId: string; event: Event }>;

/**
 * The daemon protocol during the window: the current wire's verbs, `read`, `revision` and per-chat `liveEvents`, beside v1's
 * `request`, all-chat `events`, and `liveEvents` with no argument.
 *
 * @internal
 */
export type AgentWireCompatProtocol = {
  readonly hello: unknown;
  readonly calls: AgentWireProtocol['calls'] & {
    readonly request: { args: V1Request; result: V1Response };
  };
  readonly notifies: Record<never, never>;
  readonly listens: {
    /* V2 names its chat; v1 names none, which the published v1 wire carries as `null` (a JSON frame has no undefined). */
    readonly liveEvents: {
      // oxlint-disable-next-line typescript/no-restricted-types -- the v1 wire's own `null` argument.
      args: Readonly<{ chatId: string }> | null;
      event: AgentLiveEvent | V1Addressed<AgentLiveEvent>;
    };
    // oxlint-disable-next-line typescript/no-restricted-types -- the v1 wire's own `null` argument.
    readonly events: { args: null; event: V1Addressed<AgentLogEvent> };
    readonly catchUp: AgentWireProtocol['listens']['catchUp'];
    readonly revisionEvents: AgentWireProtocol['listens']['revisionEvents'];
  };
};

const addressed = <Event extends z.ZodType>(event: Event) => z.strictObject({ chatId: text, event });

/**
 * Validators for {@link AgentWireCompatProtocol}. The hello is read loosely here so a client can tell a v1 daemon (no
 * `wire`) from one of another version; the owner still sends {@link agentWireHelloSchema}'s shape.
 *
 * @internal
 */
export const agentWireCompatSchemas = {
  hello: z.unknown(),
  calls: {
    ...agentWireProtocolSchemas.calls,
    request: { args: v1RequestSchema, result: v1ResponseSchema },
  },
  notifies: {},
  listens: {
    catchUp: agentWireProtocolSchemas.listens.catchUp,
    liveEvents: {
      args: z.union([z.strictObject({ chatId: text }), z.null()]),
      event: z.union([sourceLiveEventSchema, agentLiveEventSchema, addressed(agentLiveEventSchema)]),
    },
    events: { args: z.null(), event: addressed(agentLogEventSchema) },
    revisionEvents: agentWireProtocolSchemas.listens.revisionEvents,
  },
};

/**
 * Which wire an owner's hello names: the current version, 1 (no `wire` field: a v1 daemon), or another version.
 *
 * @param hello - The hello payload as received.
 * @returns The wire the client speaks, or `unsupported`.
 * @internal
 */
export const helloWire = (hello: unknown): 1 | typeof agentWireVersion | 'unsupported' => {
  if (agentWireHelloSchema.safeParse(hello).success) {
    return agentWireVersion;
  }
  return typeof hello === 'object' && hello !== null && 'wire' in hello ? 'unsupported' : 1;
};

/**
 * One keyed command in v1's vocabulary: the key is dropped, since a v1 owner has no applied set.
 *
 * @param command - The current-wire command.
 * @returns The v1 request.
 * @internal
 */
export const v1RequestFor = (command: HostCommand): V1Request => {
  switch (command.type) {
    case 'start': {
      const { checkoutId: _placement, retainedMessageIds, ...start } = command.payload;
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- SC-G8: a real message is not the schema's output type.
      return (
        start.trigger === 'submit'
          ? { ...start, type: 'start', trigger: 'submit' }
          : { ...start, type: 'start', trigger: start.trigger, retainedMessageIds: retainedMessageIds ?? [] }
      ) as V1Request;
    }
    case 'resume': {
      // ponytail: a v1 owner resumes the chat's current run and cannot take a Resume-time model selection.
      return { type: 'resume', chatId: command.payload.chatId };
    }
    case 'attach': {
      return { type: 'attach', chatId: command.payload.chatId, cursor: 0, limit: 1, maxBytes: 1 };
    }
    case 'steer': {
      return { ...command.payload, type: 'steer' };
    }
    case 'cancel': {
      return { ...command.payload, type: 'cancel' };
    }
    case 'interrupt': {
      return { ...command.payload, type: 'interrupt' };
    }
    case 'resolve-interrupt': {
      return { ...command.payload, type: 'resolve-interrupt' };
    }
  }
};
