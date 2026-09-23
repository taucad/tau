import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor, setup, types, waitFor } from 'xstate';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import { strictModeRemount, unmountAndRemount } from '#lib/xstate-test.utils.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fromSafeAsync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Completion
  // =========================================================================
  describe('completion', () => {
    it('should transition via onDone when work completes', async () => {
      const machine = setup({
        schemas: {
          context: types<{ done: boolean }>(),
        },
        actors: {
          work: fromSafeAsync(async () => {
            // Fire-and-forget
          }),
        },
      }).createMachine({
        context: { done: false },
        initial: 'working',
        states: {
          working: {
            invoke: {
              src: 'work',
              onDone: { target: 'finished', context: { done: true } },
            },
          },
          finished: { type: 'final' },
        },
      });

      const actor = createActor(machine);
      actor.start();
      await waitFor(actor, (s) => s.value === 'finished');

      expect(actor.getSnapshot().value).toBe('finished');
      expect(actor.getSnapshot().context.done).toBe(true);
      actor.stop();
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe('error', () => {
    it('should transition via onError when work throws', async () => {
      const machine = setup({
        schemas: {
          context: types<{ errorMessage: string | undefined }>(),
        },
        actors: {
          work: fromSafeAsync(async () => {
            throw new Error('boom');
          }),
        },
      }).createMachine({
        context: { errorMessage: undefined },
        initial: 'working',
        states: {
          working: {
            invoke: {
              src: 'work',
              onDone: 'finished',
              onError: {
                target: 'failed',
                context: ({ event }) => ({
                  errorMessage: event.error instanceof Error ? event.error.message : 'unknown',
                }),
              },
            },
          },
          finished: { type: 'final' },
          failed: { type: 'final' },
        },
      });

      const actor = createActor(machine);
      actor.start();
      await waitFor(actor, (s) => s.value === 'failed');

      expect(actor.getSnapshot().value).toBe('failed');
      expect(actor.getSnapshot().context.errorMessage).toBe('boom');
      actor.stop();
    });
  });

  // =========================================================================
  // Data delivery via return
  // =========================================================================
  describe('data delivery', () => {
    it('should deliver returned event to parent on: handler', async () => {
      type DataEvent = { type: 'dataReady'; value: number };

      const machine = setup({
        schemas: {
          context: types<{ receivedValue: number | undefined }>(),
          events: eventSchemas<DataEvent>(),
        },
        actors: {
          work: fromSafeAsync<{ type: 'dataReady'; value: number }, { multiplier: number }>(async ({ input }) => {
            return { type: 'dataReady', value: input.multiplier * 10 };
          }),
        },
      }).createMachine({
        context: { receivedValue: undefined },
        initial: 'working',
        states: {
          working: {
            invoke: {
              src: 'work',
              input: () => ({ multiplier: 5 }),
              onDone: 'finished',
            },
            on: {
              dataReady: {
                context: ({ event }) => ({ receivedValue: event.value }),
              },
            },
          },
          finished: { type: 'final' },
        },
      });

      const actor = createActor(machine);
      actor.start();
      await waitFor(actor, (s) => s.value === 'finished');

      expect(actor.getSnapshot().context.receivedValue).toBe(50);
      actor.stop();
    });
  });

  // =========================================================================
  // Signal abort
  // =========================================================================
  describe('signal abort', () => {
    it('should abort signal when machine leaves invoking state', async () => {
      let capturedSignal: AbortSignal | undefined;

      const machine = setup({
        schemas: {
          events: eventSchemas<{ type: 'cancel' }>(),
        },
        actors: {
          work: fromSafeAsync(async ({ signal }) => {
            capturedSignal = signal;
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 10_000);
              signal.addEventListener('abort', () => {
                clearTimeout(timer);
                resolve();
              });
            });
          }),
        },
      }).createMachine({
        initial: 'working',
        states: {
          working: {
            invoke: { src: 'work', onDone: 'finished' },
            on: { cancel: 'cancelled' },
          },
          finished: { type: 'final' },
          cancelled: { type: 'final' },
        },
      });

      const actor = createActor(machine);
      actor.start();

      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal!.aborted).toBe(false);

      actor.send({ type: 'cancel' });
      expect(capturedSignal!.aborted).toBe(true);

      actor.stop();
    });
  });

  // =========================================================================
  // Zombie prevention across a React unmount and re-mount
  // =========================================================================
  describe('zombie prevention', () => {
    type TagEvent = { type: 'tagged'; invocation: number };

    const createTaggingMachine = (onReturn: (invocation: number) => void) => {
      let invocationCount = 0;
      return setup({
        schemas: {
          context: types<{ tags: number[] }>(),
          events: eventSchemas<TagEvent>(),
        },
        actors: {
          work: fromSafeAsync(async () => {
            const myInvocation = ++invocationCount;
            await new Promise((resolve) => {
              setTimeout(resolve, 50);
            });
            onReturn(myInvocation);
            return { type: 'tagged', invocation: myInvocation };
          }),
        },
      }).createMachine({
        context: { tags: [] },
        initial: 'working',
        states: {
          working: {
            invoke: { src: 'work', onDone: 'finished' },
            on: {
              tagged: { context: ({ context, event }) => ({ tags: [...context.tags, event.invocation] }) },
            },
          },
          finished: { type: 'final' },
        },
      });
    };

    it('should keep the running invocation through a Strict Mode re-mount', async () => {
      const returned: number[] = [];
      const actor = createActor(createTaggingMachine((invocation) => returned.push(invocation)));
      actor.start();

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      strictModeRemount(actor);

      await waitFor(actor, (s) => s.value === 'finished', { timeout: 5000 });

      // The binding cancels its own stop, so the first invocation is the only one and it lands.
      expect(returned).toEqual([1]);
      expect(actor.getSnapshot().context.tags).toEqual([1]);
      actor.stop();
    });

    it('should only deliver events from the replacement invocation after an unmount and re-mount', async () => {
      const returned: number[] = [];
      const machine = createTaggingMachine((invocation) => returned.push(invocation));
      const first = createActor(machine);
      first.start();

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      const replacement = await unmountAndRemount(first, () => createActor(machine));

      await waitFor(replacement, (s) => s.value === 'finished', { timeout: 5000 });
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });

      // Both invocations ran to completion; only the replacement's reached a machine.
      expect(returned).toEqual([1, 2]);
      expect(replacement.getSnapshot().context.tags).toEqual([2]);
      expect(first.getSnapshot().status).toBe('stopped');
      expect(first.getSnapshot().context.tags).toEqual([]);
      replacement.stop();
    });
  });

  // =========================================================================
  // Fire-and-forget (TEmittedEvent = never)
  // =========================================================================
  describe('fire-and-forget', () => {
    it('should complete without emitting any events', async () => {
      const sideEffect = vi.fn();

      const machine = setup({
        actors: {
          work: fromSafeAsync(async () => {
            sideEffect();
          }),
        },
      }).createMachine({
        initial: 'working',
        states: {
          working: {
            invoke: { src: 'work', onDone: 'finished' },
          },
          finished: { type: 'final' },
        },
      });

      const actor = createActor(machine);
      actor.start();
      await waitFor(actor, (s) => s.value === 'finished');

      expect(sideEffect).toHaveBeenCalledOnce();
      expect(actor.getSnapshot().value).toBe('finished');
      actor.stop();
    });
  });

  // =========================================================================
  // Error suppression on abort
  // =========================================================================
  describe('error suppression on abort', () => {
    it('should not fire onError when work throws after signal is aborted', async () => {
      const machine = setup({
        schemas: {
          context: types<{ error: boolean }>(),
          events: eventSchemas<{ type: 'cancel' }>(),
        },
        actors: {
          work: fromSafeAsync(async ({ signal }) => {
            await new Promise<void>((_resolve, reject) => {
              signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            });
          }),
        },
      }).createMachine({
        context: { error: false },
        initial: 'working',
        states: {
          working: {
            invoke: {
              src: 'work',
              onDone: 'finished',
              onError: {
                target: 'failed',
                context: { error: true },
              },
            },
            on: { cancel: 'cancelled' },
          },
          finished: { type: 'final' },
          cancelled: { type: 'final' },
          failed: { type: 'final' },
        },
      });

      const actor = createActor(machine);
      actor.start();

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      actor.send({ type: 'cancel' });

      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      // Should be in 'cancelled', NOT 'failed'
      expect(actor.getSnapshot().value).toBe('cancelled');
      expect(actor.getSnapshot().context.error).toBe(false);
      actor.stop();
    });
  });
});
