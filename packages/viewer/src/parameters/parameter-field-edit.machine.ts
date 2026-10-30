import { setup, types } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import { eventSchemas } from '#machines/machine-schemas.js';

/** A value one parameter row edits: a number, a string or a boolean. */
export type ParameterFieldScalar = number | string | boolean;

/**
 * One parameter row's own edits, against the authority value it renders.
 *
 * The row renders the authority through the form's deferred projection, which can trail the row's
 * own settled commits by more than one step. While the row leads, every value it rendered on the way
 * (the value its first edit started from and each value it sent) is its own echo, never news: the row
 * stands on its last sent value, so its next edit builds on that and nothing it already wrote reads as
 * a change made elsewhere. It follows the authority again once nothing it sent is unsettled and the
 * authority shows its last value, or a value it never sent, which only another writer can have left.
 * A refused edit ends the lead at once: the authority holds something the row did not write.
 *
 * The projection moves forward only, so a value outside the trail is newer than everything in it.
 */
export type ParameterFieldEditContext = Readonly<{
  /** The authority value the row last rendered. */
  authority: ParameterFieldScalar;
  /** While leading: the value the first edit started from, then every value sent since, oldest first. */
  trail: readonly ParameterFieldScalar[];
  /** While leading: the sent edits that have not settled. */
  unsettled: number;
}>;

/** What the row observed, sent and heard back. */
export type ParameterFieldEditEvent =
  | Readonly<{ type: 'observed'; value: ParameterFieldScalar }>
  | Readonly<{ type: 'submitted'; from: ParameterFieldScalar; value: ParameterFieldScalar }>
  | Readonly<{ type: 'settled'; isKept: boolean }>;

/** The authority value the row renders when it mounts. */
export type ParameterFieldEditInput = Readonly<{ authority: ParameterFieldScalar }>;

const following = { trail: [], unsettled: 0 } as const satisfies Partial<ParameterFieldEditContext>;

/** Whether a leading row can follow the authority it last rendered. */
const isCaughtUp = (context: ParameterFieldEditContext): boolean =>
  context.unsettled === 0 &&
  (Object.is(context.authority, context.trail.at(-1)) || !context.trail.includes(context.authority));

const parameterFieldEditMachineDefinition = setup({
  schemas: {
    context: types<ParameterFieldEditContext>(),
    events: eventSchemas<ParameterFieldEditEvent>(),
    input: types<ParameterFieldEditInput>(),
  },
}).createMachine({
  id: 'parameter-field-edit',
  context: ({ input }) => ({ authority: input.authority, ...following }),
  initial: 'following',
  states: {
    following: {
      on: {
        observed: { context: ({ event }) => ({ authority: event.value }) },
        submitted: {
          target: 'leading',
          context: ({ event }) => ({ trail: [event.from, event.value], unsettled: 1 }),
        },
        // Declared in `parameterFieldEditIgnoredEvents`: an edit sent before a refusal ended the lead
        // settles afterwards, and there is nothing left to lead.
        settled: {},
      },
    },
    leading: {
      on: {
        observed: ({ context, event }) => {
          const next = { ...context, authority: event.value };
          return isCaughtUp(next) ? { target: 'following', context: { ...next, ...following } } : { context: next };
        },
        submitted: {
          context: ({ context, event }) => ({
            trail: [...context.trail, event.value],
            unsettled: context.unsettled + 1,
          }),
        },
        settled: ({ context, event }) => {
          if (!event.isKept) {
            return { target: 'following', context: following };
          }
          const next = { ...context, unsettled: context.unsettled - 1 };
          return isCaughtUp(next) ? { target: 'following', context: { ...next, ...following } } : { context: next };
        },
      },
    },
  },
});

type ParameterFieldEditMachineDefinition = typeof parameterFieldEditMachineDefinition;

/**
 * The type of {@link parameterFieldEditMachine}.
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface ParameterFieldEditMachine extends ParameterFieldEditMachineDefinition {}

/** The (state, event) pairs the machine answers by design with no change. */
export const parameterFieldEditIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['following', 'settled'],
];

/** One parameter row's own-edit lineage; see {@link ParameterFieldEditContext}. */
export const parameterFieldEditMachine: ParameterFieldEditMachine = parameterFieldEditMachineDefinition;

/**
 * The row's own last sent value while the authority it renders is still an echo of its own edits, or
 * `undefined` when the row stands on that authority value.
 *
 * Read in render with the value being rendered, so a projection that moved since the last
 * `observed` is classified before the effect reports it.
 *
 * @param snapshot - The row's edit snapshot.
 * @param authority - The authority value being rendered.
 * @returns The value the row stands on when it is its own.
 */
export const selectOwnValue = <Value extends ParameterFieldScalar>(
  snapshot: SnapshotFrom<ParameterFieldEditMachine>,
  authority: Value,
): Value | undefined => {
  if (!snapshot.matches('leading')) {
    return undefined;
  }
  const { trail, unsettled } = snapshot.context;
  // A row only ever sends values of the type it renders, so its trail holds that type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  return unsettled > 0 || trail.includes(authority) ? (trail.at(-1) as Value) : undefined;
};
