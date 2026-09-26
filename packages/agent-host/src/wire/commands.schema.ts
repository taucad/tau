/**
 * The commands a client sends an agent host, one strict payload per verb (SC-R1, SC-R2), and the answer every command
 * gets (`ans`). The rpc method name is the verb, so no payload carries a `type`. Zod only.
 */

import { z } from 'zod';

import { jsonValueSchema, userProviderMessageSchema } from '#log/event-schema.js';
import type { UserProviderMessage } from '#log/event-types.js';
import { agentChannelAdmissionConfigSchema, agentChannelModelSchema } from '#wire/admission.schema.js';

const id = z.string().min(1);
/** 1 to 94 printable ASCII characters, so W7's attempt key `${runId}:${attempt}:${position}` fits the gateway's 128. */
const runId = z.string().regex(/^[!-~]{1,94}$/u);

/** The start payload's fields, before its one cross-field rule. */
const startPayloadSchema = z.strictObject({
  chatId: id,
  runId,
  message: userProviderMessageSchema,
  trigger: z.enum(['submit', 'edit', 'regenerate', 'retry']),
  /** The prefix a rewinding trigger keeps; present exactly when `trigger` is not `submit`. */
  retainedMessageIds: z.array(id).optional(),
  /** Holds the agent selector (`config.agent`) on both legs. */
  config: agentChannelAdmissionConfigSchema.optional(),
  /** The person's placement choice; placement answers the base and mode (W8). Replaces `mode` and `baseRevisionId`. */
  checkoutId: id.optional(),
});

/**
 * One strict payload per verb. `chatId` routes each verb to its chat's actor (W7); M1's `schemas.events` reuses these
 * inside `{ commandId, payload }` (D11, MC-R30).
 *
 * @public
 */
export const commandPayloads = {
  start: startPayloadSchema.refine(
    (payload) => (payload.trigger === 'submit') === (payload.retainedMessageIds === undefined),
    { path: ['retainedMessageIds'], message: 'present exactly when the trigger rewinds' },
  ),
  steer: z.strictObject({ chatId: id, runId, message: z.string() }),
  /** D17's "request cancellation". Aborting a wait and detaching are client-local. */
  cancel: z.strictObject({ chatId: id, runId }),
  /** EQ1: no consent field. A charged lost reply is recorded and retried by the host without a gesture. */
  resume: z.strictObject({
    chatId: id,
    runId,
    /** The model row, with its reasoning effort, chosen at Resume (D21): the row `start.config.model` carries (SC-G4). */
    selection: agentChannelModelSchema.optional(),
  }),
  interrupt: z.strictObject({
    chatId: id,
    runId,
    interruptId: id,
    kind: z.enum(['approval', 'operator', 'safeguard']),
    prompt: z.string(),
    payload: jsonValueSchema.optional(),
  }),
  'resolve-interrupt': z.strictObject({
    chatId: id,
    runId,
    interruptId: id,
    outcome: z.enum(['approved', 'denied', 'cancelled']),
    /** The option the person chose, when the request offered a list. */
    optionId: id.optional(),
    payload: jsonValueSchema.optional(),
  }),
  /** A read: writes nothing and carries no row (W6 RH-R1). Its answer's `details` is the host's snapshot at open. */
  attach: z.strictObject({ chatId: id }),
} as const;

/** One command verb. @public */
export type CommandVerb = keyof typeof commandPayloads;

/** Every verb, in declaration order. @internal */
export const commandVerbs = Object.keys(commandPayloads) as readonly CommandVerb[];

type InferredPayloads = { [Verb in CommandVerb]: z.infer<(typeof commandPayloads)[Verb]> };

/**
 * A verb's payload type: the schema's output, except `start.message`, which is the log's `UserProviderMessage`. The
 * schema's output is assignable to that type but not the reverse (its metadata is a JSON catchall), so a caller
 * holding a real message could not send it (SC-G8).
 *
 * @public
 */
export type CommandPayload<Verb extends CommandVerb> = Verb extends 'start'
  ? Omit<InferredPayloads['start'], 'message'> & { readonly message: UserProviderMessage }
  : InferredPayloads[Verb];

/** The rpc args of one command: the gesture's key, the payload and, on the forwarding leg only, the addressed generation. @public */
export type CommandFrame<Verb extends CommandVerb> = Readonly<{
  /** Minted once per gesture and reused by every re-send (SC-R6). */
  commandId: string;
  payload: CommandPayload<Verb>;
  generation?: number;
}>;

/**
 * The rpc args schema of every verb: the key is read strictly and the payload is carried, so an owner that can read
 * the key answers `COMMAND_UNREADABLE` for a payload it cannot read, instead of an uncoded validation error (SC-R4).
 *
 * @internal
 */
export const commandFrameSchema = z.strictObject({
  commandId: id,
  payload: z.unknown(),
  generation: z.number().int().nonnegative().optional(),
});

const answerBase = { commandId: id, generation: z.number().int().nonnegative() };

/**
 * Every command is answered (I15). `status` and `effect` discriminate; fields ride only the branch that has them. A
 * `code` is read open (SC-R3): `refusalOf(code)` resolves an unknown one to retry `never`.
 *
 * @public
 */
export const commandAnswerSchema = z.union([
  /** Done: the decision row is durable at `cursor` (the command's first row). */
  z.strictObject({
    ...answerBase,
    status: z.enum(['applied', 'replayed']),
    effect: z.literal('durable'),
    cursor: z.number().int().nonnegative(),
  }),
  /** Done with nothing to do, such as `cancel` of an ended run (W7's A0); `details.state` names the state. */
  z.strictObject({
    ...answerBase,
    status: z.literal('applied'),
    effect: z.literal('not-applied'),
    details: z.record(z.string(), z.unknown()),
  }),
  /** Refused: `not-applied` leaves no record and follows the code's retry class; `unknown` means re-send the same key. */
  z.strictObject({
    ...answerBase,
    status: z.literal('refused'),
    effect: z.enum(['not-applied', 'unknown']),
    code: id,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
]);

/** One `ans`. @public */
export type CommandAnswer = z.infer<typeof commandAnswerSchema>;

/**
 * One command as every local caller writes it: the page and CLI client, the owner adapter, and M1's event (SC-G7).
 * The client moves `type` into the rpc method name.
 *
 * @public
 */
export type HostCommand = {
  [Verb in CommandVerb]: Readonly<{ type: Verb; commandId: string; payload: CommandPayload<Verb> }>;
}[CommandVerb];

/** The client's input: the command plus a signal that only stops waiting (D17); the outbox keeps the entry. @public */
export type CommandInput = HostCommand & { readonly signal?: AbortSignal };
