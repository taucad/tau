/**
 * The runtime schemas of `projectHost` (MC-R30), apart from the machine so it imports values only from `xstate` and
 * `#` modules (MC-R2).
 */

import { z } from 'zod';

/** An attach generation: main's per-root count, monotone for the broker's life; `null` from a main that sent none. */
const generation = z.number().int().nonnegative().nullable();

/** An event the machine holds until it can serve it: a connect or release while it opens, one while it closes. */
export const queuedSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('connect'), gen: generation, connectionId: z.string() }),
  z.object({ type: z.literal('release'), gen: generation, requestId: z.string() }),
  z.object({ type: z.literal('shutdown'), requestId: z.string() }),
]);

/** Events `projectHost` takes (MC-R30). */
export const projectHostEventSchemas = {
  /* From the composition: one renderer connection (by the id its port is held under), one release, the quit. */
  connect: z.object({ gen: generation, connectionId: z.string() }),
  release: z.object({ gen: generation, requestId: z.string() }),
  shutdown: z.object({ requestId: z.string() }),
  /* Effect outcomes, correlated by incarnation or drain. */
  opened: z.object({ incarnation: z.number().int() }),
  openFailed: z.object({ incarnation: z.number().int(), message: z.string() }),
  quiescent: z.object({ drain: z.number().int() }),
  closed: z.object({ incarnation: z.number().int(), message: z.string().nullable() }),
};

/** `projectHost`'s context in every state. */
export const projectHostContextSchema = z.object({
  /** The project root this actor owns (MC-R3). */
  root: z.string(),
  /** Which host this actor last opened; an outcome from an earlier one is stale (MC-R18). */
  incarnation: z.number().int(),
  /** Which drain this actor last started. */
  drains: z.number().int(),
  queue: z.array(queuedSchema),
  /**
   * Releases and shutdowns taken but not yet answered: the release a drain serves, and the requests a close answers.
   * Empty while opening or serving; a fault answers them (MC-R26 keeps it out of the narrowed states).
   */
  owed: z.array(z.string()),
});

/* The newest generation the host is attached under exists only while it serves (MC-R26). */
export const servingContextSchema = projectHostContextSchema.extend({ gen: z.number().int().nonnegative() });

/* A release being drained: `gen` is the generation it closes, and `drain` which drain answers it. */
export const drainingContextSchema = servingContextSchema.extend({ drain: z.number().int() });

/* A host whose close has begun: the generation it closed, and whether it is the quit. */
export const closingContextSchema = projectHostContextSchema.extend({
  closedGen: z.number().int().nonnegative(),
  shutdown: z.boolean(),
});

/** What `projectHost` tells its composition: each release and shutdown is answered once. */
export const projectHostEmittedSchemas = {
  released: z.object({
    requestId: z.string(),
    outcome: z.enum(['closed', 'stale', 'failed']),
    message: z.string().nullable(),
  }),
};

/** One `released` answer. */
export type ProjectHostReleased = { readonly type: 'released' } & z.infer<typeof projectHostEmittedSchemas.released>;

/** `projectHost`'s context. */
export type ProjectHostContext = z.infer<typeof projectHostContextSchema>;
/** One held event. */
export type ProjectHostQueued = z.infer<typeof queuedSchema>;
