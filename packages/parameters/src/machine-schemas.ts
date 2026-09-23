/**
 * Type-only helper for XState's `schemas` surface. Nothing here runs XState.
 */

import type { TypeSchema } from 'xstate';

/** An event's payload; distributes so an event whose payload is itself a union keeps every member. */
type EventPayload<TEvent> = TEvent extends unknown ? Omit<TEvent, 'type'> : never;

/** The `schemas.events` or `schemas.emitted` map for a union of `{ type }` events. */
export type EventSchemaMap<TEvent extends Readonly<{ type: string }>> = {
  [K in TEvent['type']]: TypeSchema<EventPayload<Extract<TEvent, Readonly<{ type: K }>>>>;
};

/**
 * Declares a machine's events (or emitted events) from its exported union, for type inference only.
 *
 * The union stays the single source of truth; XState reads schema values at runtime only when a
 * `validator` is configured or the machine is serialized, and the parameter machine does neither.
 *
 * @returns An empty object typed as the schema map.
 */
export const eventSchemas = <TEvent extends Readonly<{ type: string }>>(): EventSchemaMap<TEvent> =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- type-only schema map, never validated.
  ({}) as EventSchemaMap<TEvent>;
