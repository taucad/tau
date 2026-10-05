import { createActor, createAsyncLogic, createCallbackLogic, setup, types, matchesState } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic } from 'xstate';

/** Captured resource identity; decoded facts remain in the owning service. @public */
export type ObservationMachineInput = { readonly resource: string };
/** Memory-only scheduling state, reconstructed by subscribing before reading. @public */
export type ObservationMachineContext = { readonly resource: string; readonly generation: number };
/** Observation lifecycle commands. @public */
export type ObservationMachineEvent =
  | { readonly type: 'ready' }
  | { readonly type: 'invalidate' }
  | { readonly type: 'reset' }
  | { readonly type: 'closed'; readonly error: string }
  | { readonly type: 'retry' };
/** Deliberately ignored deliveries after closure or before registration. @public */
export const observationIgnoredEvents: ReadonlyArray<readonly [string, string]> = [
  ['registering', 'retry'],
  ['reading.clean', 'ready'],
  ['reading.dirty', 'ready'],
  ['reading.clean', 'retry'],
  ['reading.dirty', 'retry'],
  ['idle', 'ready'],
  ['closed', 'ready'],
  ['closed', 'invalidate'],
  ['closed', 'reset'],
  ['closed', 'closed'],
  ['closed', 'retry'],
];
const observationDriver = createCallbackLogic<ObservationMachineEvent, ObservationMachineInput>(() => () => undefined);
/** Read completion carries scalar lifecycle facts only. @public */
export type ObservationReadOutput =
  | { readonly kind: 'read'; readonly generation: number }
  | { readonly kind: 'failed'; readonly generation: number; readonly error: string };
const observationRead = createAsyncLogic<ObservationReadOutput, { readonly generation: number }>({
  run: async (): Promise<ObservationReadOutput> => {
    throw new Error('Observation read was not provided.');
  },
});
/** Injectable lifecycle I/O. @public */
export type ObservationActors = {
  observationDriver: typeof observationDriver;
  observationRead: typeof observationRead;
};
/** Pure single-flight scheduler. Values are never stored in snapshots. @public */
export const observationMachine = setup({
  schemas: {
    tags: types<'registering' | 'pending' | 'ready' | 'error' | 'closed'>(),
    context: types<ObservationMachineContext>(),
    input: types<ObservationMachineInput>(),
    events: {
      ready: types<Readonly<Record<never, never>>>(),
      invalidate: types<Readonly<Record<never, never>>>(),
      reset: types<Readonly<Record<never, never>>>(),
      closed: types<{ error: string }>(),
      retry: types<Readonly<Record<never, never>>>(),
    },
    emitted: { publish: types<{ generation: number }>() },
  },
  states: {
    registering: {},
    reading: { states: { clean: {}, dirty: {} } },
    idle: {},
    failed: { schemas: { context: types<{ error: string }>() } },
    closed: { schemas: { context: types<{ error: string }>() } },
  },
  actors: { observationDriver, observationRead },
}).createMachine({
  id: 'observation',
  version: '1',
  context: ({ input }) => ({ resource: input.resource, generation: 0 }),
  initial: 'registering',
  invoke: { src: 'observationDriver', input: ({ context }) => ({ resource: context.resource }) },
  onError: ({ context, event }) => ({
    target: '.closed',
    context: { generation: context.generation + 1, error: String(event.error) },
  }),
  on: {
    closed: ({ context, event }) => ({
      target: '.closed',
      context: { generation: context.generation + 1, error: event.error },
    }),
  },
  states: {
    registering: {
      tags: ['registering'],
      on: {
        ready: { target: 'reading' },
        invalidate: ({ context }) => ({ context: { generation: context.generation + 1 } }),
        reset: ({ context }) => ({ context: { generation: context.generation + 1 } }),
      },
    },
    reading: {
      tags: ['pending'],
      initial: 'clean',
      invoke: {
        id: 'observation-read',
        src: 'observationRead',
        input: ({ context }) => ({ generation: context.generation }),
        onDone: ({ context, event }, enq) => {
          if (event.output.generation !== context.generation) {
            return { target: 'reading', reenter: true };
          }
          if (event.output.kind === 'failed') {
            return { target: 'failed', context: { error: event.output.error } };
          }
          enq.emit({ type: 'publish', generation: event.output.generation });
          return { target: 'idle' };
        },
        onError: ({ event, value }) =>
          matchesState('reading.dirty', value)
            ? { target: 'reading', reenter: true }
            : { target: 'failed', context: { error: String(event.error) } },
      },
      on: {
        invalidate: ({ context }) => ({ target: '.dirty', context: { generation: context.generation + 1 } }),
        reset: ({ context }) => ({ target: '.dirty', context: { generation: context.generation + 1 } }),
      },
      states: { clean: {}, dirty: {} },
    },
    idle: {
      tags: ['ready'],
      on: {
        invalidate: ({ context }) => ({ target: 'reading', context: { generation: context.generation + 1 } }),
        reset: ({ context }) => ({ target: 'reading', context: { generation: context.generation + 1 } }),
        retry: { target: 'reading' },
      },
    },
    failed: {
      tags: ['error'],
      on: {
        ready: { target: 'reading' },
        retry: { target: 'reading' },
        invalidate: ({ context }) => ({ target: 'reading', context: { generation: context.generation + 1 } }),
        reset: ({ context }) => ({ target: 'reading', context: { generation: context.generation + 1 } }),
      },
    },
    closed: { tags: ['closed'] },
  },
});
/**
 * Create an unstarted lifecycle actor with explicitly provided I/O.
 * @param input - Captured identity.
 * @param actors - Named I/O implementations.
 * @param options - Host clock and diagnostics.
 * @returns Unstarted actor.
 * @public
 */
export const createObservationActor = (
  input: ObservationMachineInput,
  actors: ObservationActors,
  options: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> = {},
): Actor<typeof observationMachine> => createActor(observationMachine.provide({ actors }), { ...options, input });
