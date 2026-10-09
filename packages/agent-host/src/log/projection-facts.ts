import { z } from 'zod';
import { agentWireLimits } from '#wire/limits.js';
import {
  historyRowTypes,
  opaqueProjectionRowSchema,
  projectionEffectSchemas,
  projectionRowSchema,
  userProviderMessageSchema,
} from '#log/event-schema.js';
import type { AgentLogEvent, LogEventBase, UserProviderMessage } from '#log/event-types.js';
import type { ReadRow } from '#log/serialization.js';

type EventBody<Event extends AgentLogEvent> = Event extends AgentLogEvent
  ? Omit<Event, Event extends { type: 'turn.changed' } ? Exclude<keyof LogEventBase, 'attempt'> : keyof LogEventBase>
  : never;
/** The validated user portion of an admission, without execution context. @public */
export type AdmittedTurnFact = Readonly<{ kind: 'tau' | 'external'; turnId: string; message: UserProviderMessage }>;
/** The semantic content of a compact row, distinct from a durable event. @public */
export type ProjectionEffect =
  | Readonly<
      EventBody<Extract<AgentLogEvent, { type: 'run.lifecycle' }>> & {
        admission?: AdmittedTurnFact;
        rewind?: Readonly<{ retainedMessageIds: readonly string[] }>;
      }
    >
  | Readonly<Pick<Extract<AgentLogEvent, { type: 'turn.history-projection-committed' }>, 'type' | 'message'>>
  | Readonly<{ type: 'snapshot-context.refreshed' }>
  | EventBody<
      Exclude<
        AgentLogEvent,
        { type: 'run.lifecycle' | 'turn.history-projection-committed' | 'snapshot-context.refreshed' }
      >
    >;

const effectInputSchema: z.ZodType<ProjectionEffect> = z.union(projectionEffectSchemas);
// Owned classified rows already have a stable type. Do not traverse unrelated fields on failed union branches.
const effectInputsByType = new Map<string, z.ZodType<ProjectionEffect>>();
for (const schema of projectionEffectSchemas) {
  const type = schema.shape.type.value;
  if (!effectInputsByType.has(type)) {
    const variants = projectionEffectSchemas.filter((candidate) => candidate.shape.type.value === type);
    effectInputsByType.set(type, variants.length === 1 ? schema : z.union(variants));
  }
}
const effectSchema: z.ZodType<ProjectionEffect> = z.union(projectionEffectSchemas.map((schema) => schema.strict()));

/** A known compact event accepted by presentation and shared ledger transitions. @public */
export type KnownProjectionEvent = LogEventBase & ProjectionEffect;

/** Strict physical row identity plus a known semantic effect or an opaque history classification. @public */
export const projectionFactSchema = z.discriminatedUnion('classification', [
  z
    .strictObject({ classification: z.literal('known'), row: projectionRowSchema, effect: effectSchema })
    .refine((fact) => !('attempt' in fact.effect) || fact.effect.attempt === fact.row.attempt, {
      path: ['effect', 'attempt'],
      message: 'must match the physical row attempt',
    }),
  z
    .strictObject({
      classification: z.literal('opaque'),
      row: opaqueProjectionRowSchema,
      eventType: z.string().min(1),
      affectsHistory: z.boolean(),
    })
    .refine((fact) => fact.affectsHistory === historyRowTypes.has(fact.eventType), {
      path: ['affectsHistory'],
      message: 'must match the opaque event type history classification',
    }),
]);
/** Exactly one compact fact for each kept physical row, including opaque and execution-only rows. @public */
export type ProjectionFact = z.infer<typeof projectionFactSchema>;
/** A known, schema-validated compact fact. @public */
export type KnownProjectionFact = Extract<ProjectionFact, { classification: 'known' }>;

/** Bounded host authority facts which kept rows alone cannot reconstruct. @public */
export const projectionSourceHealthSchema = z.strictObject({
  historyIntact: z.boolean(),
  newerHistory: z.boolean(),
  quarantined: z.boolean(),
});
/** Health of a captured or observed source, qualified by its batch generation and end cursor. @public */
export type ProjectionSourceHealth = z.infer<typeof projectionSourceHealthSchema>;

const position = z.number().int().nonnegative();
/** Strict compact page with an exact physical cursor interval. @public */
export const projectionBatchSchema = z
  .strictObject({
    status: z.literal('batch'),
    chatId: z.string().min(1),
    cursor: position,
    nextCursor: position,
    endCursor: position,
    sourceGeneration: z.string().min(1),
    facts: z.array(projectionFactSchema).max(agentWireLimits.batchRows),
  })
  .refine((batch) => batch.nextCursor === batch.cursor + batch.facts.length && batch.endCursor >= batch.nextCursor, {
    path: ['nextCursor'],
    message: 'must equal cursor plus fact count, at or before endCursor',
  });
/** A bounded provisional compact page. @public */
export type ProjectionBatch = z.infer<typeof projectionBatchSchema>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const rewindSchema = z.object({ retainedMessageIds: z.array(z.string()) });
const projectionRowInputSchema = projectionRowSchema.strip();
const opaqueProjectionRowInputSchema = opaqueProjectionRowSchema.strip();

/** Select semantic fields from an already classified owned row; execution context is never copied. @internal */
export const projectLogRow = ({ event, opaque }: ReadRow): ProjectionFact => {
  if (opaque) {
    return {
      classification: 'opaque',
      row: opaqueProjectionRowInputSchema.parse(event),
      eventType: event.type,
      affectsHistory: historyRowTypes.has(event.type),
    };
  }
  const admission =
    event.type === 'run.lifecycle' && event.state === 'admitted' && 'admission' in event && isRecord(event.admission)
      ? event.admission
      : undefined;
  const message = admission === undefined ? undefined : userProviderMessageSchema.safeParse(admission['message']);
  const admitted =
    (admission?.['kind'] === 'tau' || admission?.['kind'] === 'external') &&
    message?.success &&
    admission['turnId'] === message.data.id
      ? { kind: admission['kind'], turnId: message.data.id, message: message.data }
      : undefined;
  const rewind = admission === undefined ? undefined : rewindSchema.safeParse(admission['rewind']);
  const input =
    event.type === 'run.lifecycle'
      ? {
          ...event,
          admission: admitted,
          rewind: rewind?.success ? rewind.data : undefined,
          stopReason: typeof event.stopReason === 'string' ? event.stopReason : undefined,
        }
      : event;
  return {
    classification: 'known',
    row: projectionRowInputSchema.parse(event),
    effect: (effectInputsByType.get(event.type) ?? effectInputSchema).parse(input),
  };
};

/** Compare the last observed scalar health by value; it is never a source-byte proof. @internal */
export const sameSourceHealth = (left: ProjectionSourceHealth | undefined, right: ProjectionSourceHealth): boolean =>
  left?.historyIntact === right.historyIntact &&
  left.newerHistory === right.newerHistory &&
  left.quarantined === right.quarantined;
