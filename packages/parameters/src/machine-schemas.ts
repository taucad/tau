/**
 * Type-only helper for XState's `schemas` surface. Nothing here runs XState.
 */

import type { TypeSchema } from 'xstate';

/** An event's payload; distributes so an event whose payload is itself a union keeps every member. */
type EventPayload<Event> = Event extends unknown ? Omit<Event, 'type'> : never;

/** The `schemas.events` or `schemas.emitted` map for a union of `{ type }` events. */
export type EventSchemaMap<Event extends Readonly<{ type: string }>> = {
  [K in Event['type']]: TypeSchema<EventPayload<Extract<Event, Readonly<{ type: K }>>>>;
};

/**
 * Declares a machine's events (or emitted events) from its exported union, for type inference only.
 *
 * The union stays the single source of truth; XState reads schema values at runtime only when a
 * `validator` is configured or the machine is serialized, and the parameter machine does neither.
 *
 * @returns An empty object typed as the schema map.
 */
export const eventSchemas = <Event extends Readonly<{ type: string }>>(): EventSchemaMap<Event> =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- type-only schema map, never validated.
  ({}) as EventSchemaMap<Event>;
