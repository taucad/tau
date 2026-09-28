import { describe, expect, it, vi } from 'vitest';
import { createActor, setup, types } from 'xstate';
import { eventSchemas } from '#lib/xstate.lib.js';

import { defaultRenderTimeout } from '#constants/editor.constants.js';
import { awaitFreshRender, AwaitFreshRenderTimeoutError } from '#machines/await-fresh-render.js';

/**
 * Minimal stand-in for `cadMachine` that exposes the same public-context shape
 * relied on by `awaitFreshRender` (`lastRequestedRenderId`,
 * `lastSettledRenderId`, plus the `idle | rendering | error` state values).
 *
 * Keeps the helper test isolated from the full cadMachine wiring. The helper
 * only depends on the structural contract, not the concrete machine.
 */
const fakeCadMachine = setup({
  schemas: {
    context: types<{ lastRequestedRenderId: number; lastSettledRenderId: number }>(),
    events: eventSchemas<
      { type: 'request' } | { type: 'settle' } | { type: 'startRender' } | { type: 'finishRender' } | { type: 'fail' }
    >(),
  },
}).createMachine({
  id: 'fakeCad',
  initial: 'idle',
  context: { lastRequestedRenderId: 0, lastSettledRenderId: 0 },
  states: {
    idle: {
      on: {
        request: {
          context: ({ context }) => ({ lastRequestedRenderId: context.lastRequestedRenderId + 1 }),
        },
        startRender: { target: 'rendering' },
        settle: {
          context: ({ context }) => ({ lastSettledRenderId: context.lastRequestedRenderId }),
        },
        fail: { target: 'error' },
      },
    },
    rendering: {
      on: {
        /* The real machine re-enters `rendering.submitting` on a new render
         * intent and bumps the requested id there, so a render can be
         * overtaken before its own outcome arrives. */
        request: {
          context: ({ context }) => ({ lastRequestedRenderId: context.lastRequestedRenderId + 1 }),
        },
        finishRender: {
          target: 'idle',
          context: ({ context }) => ({ lastSettledRenderId: context.lastRequestedRenderId }),
        },
        fail: { target: 'error' },
      },
    },
    error: {
      on: {
        request: {
          context: ({ context }) => ({ lastRequestedRenderId: context.lastRequestedRenderId + 1 }),
        },
      },
    },
  },
});

describe('awaitFreshRender', () => {
  it('should resolve immediately when current render result is already at-or-above baseline', async () => {
    const actor = createActor(fakeCadMachine).start();
    actor.send({ type: 'request' });
    actor.send({ type: 'settle' });

    // Re-arm a baseline equal to the current render result. The helper should
    // resolve immediately because the machine already satisfies the predicate.
    const snapshot = await awaitFreshRender(actor as unknown as Parameters<typeof awaitFreshRender>[0], {
      awaitTimeout: 100,
    });
    expect(snapshot.context.lastSettledRenderId).toBeGreaterThanOrEqual(snapshot.context.lastRequestedRenderId);
    actor.stop();
  });

  it('should wait for next settled geometry that satisfies the baseline', async () => {
    const actor = createActor(fakeCadMachine).start();
    actor.send({ type: 'request' });
    actor.send({ type: 'startRender' });

    const promise = awaitFreshRender(actor as unknown as Parameters<typeof awaitFreshRender>[0], {
      awaitTimeout: 1000,
    });

    setTimeout(() => {
      actor.send({ type: 'finishRender' });
    }, 10);

    const snapshot = await promise;
    expect(snapshot.value).toBe('idle');
    expect(snapshot.context.lastSettledRenderId).toBe(1);
    actor.stop();
  });

  it('should ignore stale settlements that do not satisfy the baseline', async () => {
    const actor = createActor(fakeCadMachine).start();
    actor.send({ type: 'request' });
    actor.send({ type: 'request' });

    const promise = awaitFreshRender(actor as unknown as Parameters<typeof awaitFreshRender>[0], {
      awaitTimeout: 1000,
    });

    actor.send({ type: 'startRender' });
    actor.send({ type: 'finishRender' });

    const snapshot = await promise;
    expect(snapshot.context.lastSettledRenderId).toBe(2);
    expect(snapshot.context.lastSettledRenderId).toBeGreaterThanOrEqual(2);
    actor.stop();
  });

  it('should resolve when the machine reaches error state', async () => {
    const actor = createActor(fakeCadMachine).start();
    actor.send({ type: 'request' });
    actor.send({ type: 'startRender' });

    const promise = awaitFreshRender(actor as unknown as Parameters<typeof awaitFreshRender>[0], {
      awaitTimeout: 1000,
    });

    actor.send({ type: 'fail' });

    const snapshot = await promise;
    expect(snapshot.value).toBe('error');
    actor.stop();
  });

  /* The sibling of the stale-kernel class: an error raised for render N while
   * render N+1 is already in flight is the *previous* render's verdict, and
   * handing it back as this wait's answer is exactly the staleness the
   * baseline exists to exclude. */
  it('should not settle on an error that a newer render request has overtaken', async () => {
    const actor = createActor(fakeCadMachine).start();
    actor.send({ type: 'request' });
    actor.send({ type: 'startRender' });

    const promise = awaitFreshRender(actor as unknown as Parameters<typeof awaitFreshRender>[0], {
      awaitTimeout: 50,
    });
    actor.send({ type: 'request' });
    actor.send({ type: 'fail' });

    await expect(promise).rejects.toBeInstanceOf(AwaitFreshRenderTimeoutError);
    expect(actor.getSnapshot().value).toBe('error');
    actor.stop();
  });

  it('should reject with AwaitFreshRenderTimeoutError when no fresh result arrives in time', async () => {
    const actor = createActor(fakeCadMachine).start();
    actor.send({ type: 'request' });
    actor.send({ type: 'startRender' });

    await expect(
      awaitFreshRender(actor as unknown as Parameters<typeof awaitFreshRender>[0], {
        awaitTimeout: 25,
      }),
    ).rejects.toBeInstanceOf(AwaitFreshRenderTimeoutError);
    actor.stop();
  });

  it('should default to the shared render timeout when awaitTimeout is omitted', async () => {
    vi.useFakeTimers();
    const actor = createActor(fakeCadMachine).start();
    actor.send({ type: 'request' });
    actor.send({ type: 'startRender' });

    let settledError: unknown;
    let settled = false;
    const promise = (async () => {
      try {
        await awaitFreshRender(actor as unknown as Parameters<typeof awaitFreshRender>[0]);
      } catch (error) {
        settled = true;
        settledError = error;
      }
    })();

    try {
      await vi.advanceTimersByTimeAsync(defaultRenderTimeout - 1);
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await promise;

      expect(settled).toBe(true);
      expect(settledError).toBeInstanceOf(AwaitFreshRenderTimeoutError);
    } finally {
      actor.stop();
      vi.useRealTimers();
    }
  });

  it('should expose code === "RENDER_TIMEOUT" on AwaitFreshRenderTimeoutError (never depends on XState message)', async () => {
    const actor = createActor(fakeCadMachine).start();
    actor.send({ type: 'request' });
    actor.send({ type: 'startRender' });

    try {
      await awaitFreshRender(actor as unknown as Parameters<typeof awaitFreshRender>[0], {
        awaitTimeout: 10,
      });
      throw new Error('Expected awaitFreshRender to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AwaitFreshRenderTimeoutError);
      // Discriminator must come from our owned timeout race, not from any
      // substring scan of the inner XState error wording. Future XState
      // releases that change the timeout message must not break this contract.
      expect((error as AwaitFreshRenderTimeoutError).code).toBe('RENDER_TIMEOUT');
    } finally {
      actor.stop();
    }
  });
});
