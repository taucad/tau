/**
 * The reads, the hello, the live deltas and the whole agent protocol that both legs serve (SC T5, T8). Zod only.
 */

import { z } from 'zod';
import { agentWireLimits } from '#wire/limits.js';

import { projectionBatchSchema, projectionSourceHealthSchema } from '#log/projection-facts.js';
import { jsonValueSchema } from '#log/event-schema.js';
import type { JsonValue } from '#log/event-types.js';
import type { SourceLiveEvent } from '#waist/ports.js';
import { chatIdSchema, commandAnswerSchema, commandFrameSchema, commandVerbs } from '#wire/commands.schema.js';
import type { CommandAnswer, CommandFrame, CommandVerb } from '#wire/commands.schema.js';

/** The agent protocol version the rpc hello carries as `wire`; today's unversioned protocol counts as 1. @public */
export const agentWireVersion = 3;

/** The owner's hello payload: its agent protocol version and build, compared for equality (I32). @public */
export const agentWireHelloSchema = z.strictObject({ wire: z.literal(agentWireVersion), build: z.string().min(1) });

/** The owner's hello. @public */
export type AgentWireHello = z.infer<typeof agentWireHelloSchema>;

const position = z.number().int().nonnegative();
const chatId = chatIdSchema;

/** A row's identity in the chat log: its term and its position in the term (W3's key). @public */
export const rowKeySchema = z.strictObject({ leaderEpoch: z.string().min(1), sequence: position });

/**
 * One long-poll read from the reader's own cursor (`es`). `last` is the key of the row at `cursor - 1`; `limit` and
 * `maxBytes` are required on every read (SC-R11).
 *
 * @public
 */
export const readRequestSchema = z.strictObject({
  chatId,
  cursor: position,
  last: rowKeySchema.optional(),
  /** Source identity acquired at cursor zero; launchers refuse a missing/stale token at positive cursors. */
  sourceGeneration: z.string().min(1).optional(),
  sourceHealth: projectionSourceHealthSchema.optional(),
  limit: z.number().int().positive().max(agentWireLimits.batchRows),
  maxBytes: z.number().int().positive().max(agentWireLimits.batchBytes),
});

/** One read. @public */
export type ReadRequest = z.infer<typeof readRequestSchema>;

/** A reader's input: the read plus a signal that ends the long poll (D17: detach is client-local). @public */
export type ReadInput = ReadRequest & { readonly signal?: AbortSignal };

/**
 * A batch (`en`) or a refusal (`ef`): never a clamp (SC-R12). `events` are opaque JSON rows; W3's tolerant reader
 * interprets them.
 *
 * @public
 */
export const readAnswerSchema = z.discriminatedUnion('status', [
  z
    .strictObject({
      status: z.literal('batch'),
      chatId,
      cursor: position,
      nextCursor: position,
      endCursor: position,
      sourceGeneration: z.string().min(1).optional(),
      sourceHealth: projectionSourceHealthSchema,
      events: z.array(z.unknown()),
    })
    .refine((batch) => batch.nextCursor === batch.cursor + batch.events.length && batch.endCursor >= batch.nextCursor, {
      path: ['nextCursor'],
      message: 'must equal cursor plus event count, at or before endCursor',
    }),
  z.strictObject({
    status: z.literal('refused'),
    chatId,
    reason: z.enum(['cursor-ahead', 'identity-mismatch', 'owner-fenced', 'unreadable']),
    expected: z
      .strictObject({
        endCursor: position.optional(),
        last: rowKeySchema.optional(),
        generation: z.number().int().positive().optional(),
        sourceGeneration: z.string().min(1).optional(),
      })
      .optional(),
  }),
]);

/** One read's answer. @public */
export type ReadAnswer = z.infer<typeof readAnswerSchema>;

const liveEventBase = {
  chatId,
  runId: z.string().min(1),
  messageId: z.string().min(1),
  contentIndex: z.number().int().nonnegative(),
};
const liveToolEventBase = { ...liveEventBase, toolCallId: z.string().min(1), toolName: z.string().min(1) };

/** One immutable catch-up stream request; cursor and source are captured by its owner. @public */
export const catchUpRequestSchema = readRequestSchema.pick({ chatId: true, limit: true, maxBytes: true });
/** The portable request for one catch-up lease. @public */
export type CatchUpRequest = z.infer<typeof catchUpRequestSchema>;
/** Catch-up request with consumer-local cancellation. @public */
export type CatchUpInput = CatchUpRequest & { readonly signal?: AbortSignal | undefined };
/** A captured end position validated against current authoritative bytes. @public */
export const catchUpPositionSchema = z.strictObject({
  cursor: position,
  last: rowKeySchema.optional(),
  sourceGeneration: z.string().min(1),
});
/** Provisional pages become publishable only after their matching validated marker. @public */
export const catchUpFrameSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('page'),
    answer: projectionBatchSchema,
  }),
  z.strictObject({
    type: z.literal('validated'),
    position: catchUpPositionSchema,
    observedEndCursor: position,
    health: projectionSourceHealthSchema,
  }),
  z.strictObject({
    type: z.literal('refused'),
    answer: z.union([
      readAnswerSchema.options[1],
      z.strictObject({ status: z.literal('refused'), chatId, reason: z.enum(['capacity-exceeded', 'writer-owned']) }),
    ]),
  }),
]);
/** One immutable catch-up page, validation marker or refusal. @public */
export type CatchUpFrame = z.infer<typeof catchUpFrameSchema>;

/** One ephemeral model delta (`liveEvents`); `offset` is optional on both legs and only ACP produces it (drift 8). @public */
export const agentLiveEventSchema = z.discriminatedUnion('type', [
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
    offset: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({ type: z.literal('text-end'), ...liveEventBase, content: z.string() }),
  z.strictObject({
    type: z.literal('thinking-end'),
    ...liveEventBase,
    content: z.string(),
    timestamp: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({ type: z.literal('tool-input-start'), ...liveToolEventBase }),
  z.strictObject({ type: z.literal('tool-input-delta'), ...liveToolEventBase, delta: z.string() }),
  z.strictObject({ type: z.literal('tool-input-end'), ...liveToolEventBase, input: jsonValueSchema }),
  z.strictObject({
    type: z.literal('tool-output-update'),
    ...liveToolEventBase,
    output: jsonValueSchema,
    isError: z.boolean(),
  }),
]);

/** A current-protocol live delta carrying its authoritative writer incarnation. @public */
export const sourceLiveEventSchema = z.discriminatedUnion('type', [
  agentLiveEventSchema.options[0].extend({ sourceGeneration: z.string().min(1) }),
  ...agentLiveEventSchema.options.slice(1).map((schema) => schema.extend({ sourceGeneration: z.string().min(1) })),
]);

/** One revision-root projection or page-facing outcome, served beside the agent verbs on the daemon leg. @public */
export const agentChannelRevisionEventSchema = z.strictObject({
  kind: z.enum(['status', 'event', 'toast']),
  value: jsonValueSchema,
});

/** One revision-root projection or page-facing outcome. @public */
export type AgentChannelRevisionEvent = z.infer<typeof agentChannelRevisionEventSchema>;

/**
 * The agent protocol both legs serve: one call per verb answering `ans`, the long-poll `read`, and the bounded live
 * deltas. The daemon also serves its one revision root (`revision`, `revisionEvents`).
 *
 * @public
 */
export type AgentWireProtocol = {
  readonly hello: AgentWireHello;
  readonly calls: {
    readonly [Verb in CommandVerb]: {
      args: CommandFrame<Verb>;
      /** The key is read strictly and the payload carried; the owner's adapter parses it (SC-R4). */
      wireArgs: z.infer<typeof commandFrameSchema>;
      result: CommandAnswer;
    };
  } & {
    readonly read: { args: ReadRequest; result: ReadAnswer };
    readonly revision: {
      args: Readonly<{ request: JsonValue }>;
      result: Readonly<{ result: JsonValue; status: JsonValue }>;
    };
  };
  readonly notifies: Record<never, never>;
  readonly listens: {
    readonly catchUp: { args: CatchUpRequest; event: CatchUpFrame };
    readonly liveEvents: { args: Readonly<{ chatId: string }>; event: SourceLiveEvent };
    readonly revisionEvents: { args: undefined; wireArgs: unknown; event: AgentChannelRevisionEvent };
  };
};

const commandCalls = Object.fromEntries(
  commandVerbs.map((verb) => [verb, { args: commandFrameSchema, result: commandAnswerSchema }]),
) as Record<CommandVerb, { args: typeof commandFrameSchema; result: typeof commandAnswerSchema }>;

/**
 * Wire validators for {@link AgentWireProtocol}, ready for `protocolSchemas`. Command payloads are parsed by the
 * owner's adapter, which answers `COMMAND_UNREADABLE` (SC-R4).
 *
 * @public
 */
export const agentWireProtocolSchemas = {
  hello: agentWireHelloSchema,
  calls: {
    ...commandCalls,
    read: { args: readRequestSchema, result: readAnswerSchema },
    revision: {
      args: z.strictObject({ request: jsonValueSchema }),
      result: z.strictObject({ result: jsonValueSchema, status: jsonValueSchema }),
    },
  },
  notifies: {},
  listens: {
    catchUp: { args: catchUpRequestSchema, event: catchUpFrameSchema },
    liveEvents: { args: z.strictObject({ chatId }), event: sourceLiveEventSchema },
    revisionEvents: { args: z.null(), event: agentChannelRevisionEventSchema },
  },
};
