/**
 * Type-level tests for {@link fromSafeAsync} and the machine schema helpers.
 *
 * Verifies that generic parameters `<TReturn, TInput>` match `createAsyncLogic`
 * behavior: specify both generics explicitly, and `input` / return types
 * flow into the callback. Also verifies fire-and-forget (void return),
 * standalone actors, `on:` handler event type inference, and that provided
 * actors are typed by checking them against the machine's own actor map.
 *
 * These tests are statically analysed by the TypeScript compiler via
 * vitest --typecheck and are never executed at runtime.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { setup, types } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import type { MachineActors } from '#lib/xstate.lib.js';

// =============================================================================
// Generic parameters — fromSafeAsync<TReturn, TInput>
// =============================================================================

describe('fromSafeAsync<TReturn, TInput> generic parameters', () => {
  it('should type input and return from explicit generics', () => {
    type LoadedEvent = { type: 'loaded'; data: string };
    type LoadInput = { url: string; loadTimeout: number };

    const machine = setup({
      schemas: {
        context: types<{ result: string | undefined }>(),
        events: eventSchemas<LoadedEvent>(),
      },
      actors: {
        loadActor: fromSafeAsync<LoadedEvent, LoadInput>(async ({ input, signal }) => {
          expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
          expectTypeOf(input).toEqualTypeOf<LoadInput>();
          return { type: 'loaded', data: input.url };
        }),
      },
    }).createMachine({
      context: { result: undefined },
      initial: 'loading',
      states: {
        loading: {
          invoke: {
            src: 'loadActor',
            input: () => ({ url: 'https://example.com', loadTimeout: 5000 }),
            onDone: { target: 'done' },
          },
          on: {
            loaded: ({ event }) => {
              expectTypeOf(event.type).toEqualTypeOf<'loaded'>();
              expectTypeOf(event.data).toBeString();
              return { context: { result: event.data } };
            },
          },
        },
        done: { type: 'final' },
      },
    });

    expectTypeOf<SnapshotFrom<typeof machine>>().toBeObject();
  });

  it('should type complex input with multiple fields', () => {
    type ComputedEvent = { type: 'computed'; total: number };
    type ComputeInput = { a: number; b: number; label: string };

    const machine = setup({
      schemas: {
        context: types<{ count: number }>(),
        events: eventSchemas<ComputedEvent>(),
      },
      actors: {
        computeActor: fromSafeAsync<ComputedEvent, ComputeInput>(async ({ input }) => {
          expectTypeOf(input).toEqualTypeOf<ComputeInput>();
          return { type: 'computed', total: input.a + input.b };
        }),
      },
    }).createMachine({
      context: { count: 0 },
      initial: 'computing',
      states: {
        computing: {
          invoke: {
            src: 'computeActor',
            input: () => ({ a: 1, b: 2, label: 'sum' }),
            onDone: { target: 'done' },
          },
        },
        done: { type: 'final' },
      },
    });

    expectTypeOf<SnapshotFrom<typeof machine>>().toBeObject();
  });
});

// =============================================================================
// Fire-and-forget — fromSafeAsync<void, TInput>
// =============================================================================

describe('fire-and-forget with input', () => {
  it('should accept void return with explicit TInput', () => {
    const machine = setup({
      actors: {
        writeActor: fromSafeAsync<void, { data: string }>(async ({ input }) => {
          expectTypeOf(input.data).toBeString();
        }),
      },
    }).createMachine({
      initial: 'writing',
      states: {
        writing: {
          invoke: {
            src: 'writeActor',
            input: () => ({ data: 'payload' }),
            onDone: { target: 'done' },
          },
        },
        done: { type: 'final' },
      },
    });

    expectTypeOf<SnapshotFrom<typeof machine>>().toBeObject();
  });

  it('should compile without generics for void-returning actors', () => {
    const machine = setup({
      actors: {
        sideEffect: fromSafeAsync(async () => {
          // Fire-and-forget, no input, no return
        }),
      },
    }).createMachine({
      initial: 'working',
      states: {
        working: {
          invoke: { src: 'sideEffect', onDone: { target: 'done' } },
        },
        done: { type: 'final' },
      },
    });

    expectTypeOf<SnapshotFrom<typeof machine>>().toBeObject();
  });
});

// =============================================================================
// provide() — provided actors are typed against the machine's own map
// =============================================================================

describe('provide() actor typing', () => {
  type LoadedEvent = { type: 'loaded'; data: string };
  type LoadInput = { url: string };

  const machine = setup({
    schemas: {
      events: eventSchemas<LoadedEvent>(),
    },
    actors: {
      loadActor: fromSafeAsync<LoadedEvent, LoadInput>(async (): Promise<LoadedEvent> => {
        throw new Error('loadActor not provided');
      }),
    },
  }).createMachine({
    initial: 'loading',
    states: {
      loading: {
        invoke: {
          src: 'loadActor',
          input: () => ({ url: '/api/data' }),
          onDone: { target: 'done' },
        },
      },
      done: { type: 'final' },
    },
  });

  /* XState v6 `provide()` infers its argument rather than typing it from the machine, so an inline
   * logic is checked against `MachineActors` to get the slot's input and output. */
  it('should type input and return from the machine actor map', () => {
    machine.provide({
      actors: {
        loadActor: fromSafeAsync(async ({ input }) => {
          expectTypeOf(input).toEqualTypeOf<LoadInput>();
          return { type: 'loaded', data: input.url };
        }),
      } satisfies Partial<MachineActors<typeof machine>>,
    });
  });

  it('should reject a provided actor whose return does not fit the slot', () => {
    const actors = {
      // @ts-expect-error -- the slot emits a `loaded` event, not an `other` one
      loadActor: fromSafeAsync<{ type: 'other' }, LoadInput>(async () => ({ type: 'other' })),
    } satisfies Partial<MachineActors<typeof machine>>;
    expectTypeOf(actors).toBeObject();
  });
});

// =============================================================================
// Standalone actors with explicit input annotation
// =============================================================================

describe('standalone actors with inline annotation', () => {
  it('should infer input type from inline parameter annotation', () => {
    fromSafeAsync(async ({ input }: { input: { id: string }; signal: AbortSignal }) => {
      expectTypeOf(input).toEqualTypeOf<{ id: string }>();
      return { type: 'fetched', id: input.id };
    });
  });
});

// =============================================================================
// on: handler event type inference
// =============================================================================

describe('on: handler event type inference', () => {
  it('should infer event type in on: handlers from the event schemas', () => {
    type ResultEvent = { type: 'result'; value: number };

    setup({
      schemas: {
        events: eventSchemas<ResultEvent>(),
      },
      actors: {
        computeActor: fromSafeAsync<ResultEvent>(async () => {
          return { type: 'result', value: 42 };
        }),
      },
    }).createMachine({
      initial: 'running',
      states: {
        running: {
          invoke: { src: 'computeActor', onDone: { target: 'done' } },
          on: {
            result: ({ event }) => {
              expectTypeOf(event.type).toEqualTypeOf<'result'>();
              expectTypeOf(event.value).toBeNumber();
              return {};
            },
          },
        },
        done: { type: 'final' },
      },
    });
  });

  it('should keep every member of an event whose payload is a union', () => {
    type AttachEvent = { type: 'attach' } & ({ dataUrl: string } | { bytes: Uint8Array<ArrayBuffer> });

    setup({
      schemas: {
        events: eventSchemas<AttachEvent>(),
      },
    }).createMachine({
      on: {
        attach: ({ event }) => {
          expectTypeOf(event).toExtend<
            { type: 'attach' } & ({ dataUrl: string } | { bytes: Uint8Array<ArrayBuffer> })
          >();
          return {};
        },
      },
    });
  });
});
