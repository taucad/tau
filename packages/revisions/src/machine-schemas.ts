/**
 * Type-only helpers the revision machines share for XState's `schemas` and
 * `provide` surfaces. Nothing here runs XState or reaches the port.
 */

import type { AnyStateMachine, StateMachine, TypeSchema } from 'xstate';

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
 * `validator` is configured or the machine is serialized, and no revision machine does either.
 *
 * @returns An empty object typed as the schema map.
 */
export const eventSchemas = <TEvent extends Readonly<{ type: string }>>(): EventSchemaMap<TEvent> =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- type-only schema map, never validated.
  ({}) as EventSchemaMap<TEvent>;

/**
 * The actor source map a machine was set up with, as `machine.provide({ actors })` accepts it.
 *
 * `Parameters<typeof machine.provide>[0]['actors']` resolves to `undefined` slots, so the
 * `*Actors` host contracts read the map from the machine type instead.
 */
/* oxlint-disable typescript/no-explicit-any -- positional inference over StateMachine's parameters. */
export type MachineActors<TMachine extends AnyStateMachine> =
  TMachine extends StateMachine<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer TActorMap,
    any,
    any,
    any,
    any
  >
    ? { [K in keyof TActorMap]: TActorMap[K] }
    : never;
/* oxlint-enable typescript/no-explicit-any */
