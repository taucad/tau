import { waitFor } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';

import { defaultRenderTimeout } from '#constants/editor.constants.js';
import type { cadMachine } from '#machines/cad.machine.js';

/**
 * Thrown when {@link awaitFreshRender} cannot observe a render result at-or-above
 * the captured baseline within the configured timeout window.
 *
 * RPC handlers map this to `RENDER_TIMEOUT` so the agent receives a typed
 * outcome rather than a generic Promise rejection.
 */
export class AwaitFreshRenderTimeoutError extends Error {
  public get code(): 'RENDER_TIMEOUT' {
    return 'RENDER_TIMEOUT';
  }

  /**
   * @param awaitTimeout - Configured wait window that was exceeded. Milliseconds.
   * @param baselineRenderId - Render id captured at call-time
   */
  public constructor(awaitTimeout: number, baselineRenderId: number) {
    super(`Fresh render did not arrive within ${awaitTimeout}ms (baseline render ${baselineRenderId}).`);
    this.name = 'AwaitFreshRenderTimeoutError';
  }
}

export type AwaitFreshRenderOptions = {
  /**
   * Optional `AbortSignal` for cooperative cancellation. The returned promise
   * will reject with the underlying abort reason if the signal aborts before
   * a fresh render arrives.
   */
  signal?: AbortSignal;
  /**
   * Maximum wall-clock time to await a fresh render. Milliseconds.
   * Defaults to {@link defaultRenderTimeout} — the same default as {@link cadMachine}'s
   * `renderTimeout`.
   */
  awaitTimeout?: number;
};

/**
 * XState's `waitFor` requires a finite `timeout`. We pass a generous
 * super-timeout (`awaitTimeout + slop`) so our owned `Promise.race` timer
 * always wins. If `waitFor` ever throws first (e.g. consumer-supplied
 * AbortSignal), we propagate that error verbatim — never re-classifying by
 * substring.
 */
const innerTimeoutSlop = 1000;

/**
 * Awaits the next settled state on `cadActor` whose `lastSettledRenderId`
 * is greater-than-or-equal to the baseline captured at call-time.
 *
 * This is the freshness oracle for RPC flows like `get_kernel_result`,
 * `export_geometry`, and `capture_images` — guarantees the geometry returned
 * reflects the most recent UI intent, eliminating staleness windows where the
 * machine settled on an older render after the agent issued a new request.
 *
 * Resolves when:
 * 1. the machine is `idle` and `lastSettledRenderId >= baselineRenderId`, or
 * 2. the machine is in `error` and no render newer than the baseline was
 *    requested while the wait was open — an error that a newer request has
 *    already overtaken is the previous render's verdict, not this one's.
 *
 * Timeout is owned locally via `Promise.race` against an explicit `setTimeout`
 * — the helper never depends on XState's rejection wording. Any future XState
 * message change cannot silently degrade timeout classification.
 *
 * @param cadActor - Live CAD actor reference (typically a project's geometry-unit actor)
 * @param options - Optional cancellation/timeout knobs
 * @throws {@link AwaitFreshRenderTimeoutError} when no fresh render is observed before timeout
 */
export async function awaitFreshRender(
  cadActor: ActorRefFrom<typeof cadMachine>,
  options: AwaitFreshRenderOptions = {},
): Promise<SnapshotFrom<typeof cadMachine>> {
  const baselineRenderId = cadActor.getSnapshot().context.lastRequestedRenderId;
  const awaitTimeout = options.awaitTimeout ?? defaultRenderTimeout;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AwaitFreshRenderTimeoutError(awaitTimeout, baselineRenderId));
    }, awaitTimeout);
  });

  const waitForPromise = waitFor(
    cadActor,
    (state) => {
      // Error is terminal for the current render — surface it so the RPC
      // handler can report the kernel issues rather than waiting for a fresh
      // render that will never arrive. But an error that landed while a newer
      // render was already requested belongs to the render before it, and
      // answering with it is the stale verdict this oracle exists to prevent.
      //
      // ponytail: the watermark alone cannot gate this — `error` is the
      // runtime-death state and never advances `lastSettledRenderId`, so
      // requiring it would turn every dead kernel into a RENDER_TIMEOUT.
      // Provenance in the result (blueprint R4) is the upgrade path.
      if (state.value === 'error') {
        return (
          state.context.lastRequestedRenderId <= baselineRenderId ||
          state.context.lastSettledRenderId >= baselineRenderId
        );
      }
      return state.value === 'idle' && state.context.lastSettledRenderId >= baselineRenderId;
    },
    // XState's waitFor accepts `timeout` (their schema) — give it a generous
    // super-timeout so our race always wins. We never depend on its rejection
    // message text.
    { signal: options.signal, timeout: awaitTimeout + innerTimeoutSlop },
  );

  try {
    return await Promise.race([waitForPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
