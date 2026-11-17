import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createUnloadSequencer } from '#runtime/environment.js';
import type { FlushCallback, FlushStage, UnloadSequencer } from '#runtime/environment.js';
import { selectRuntimeUnload } from '#runtime/app-runtime.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const UnloadContext = createContext<UnloadSequencer | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * The unload registrations, handed down (app state orchestration charter D26).
 *
 * A provider over the runtime's unload sequencer: `environment` is the only sequencer of the ordered flush on
 * `hidden`, `pagehide` and quit, so this provider holds no listener. Services register their flush callbacks via
 * {@link useFlushOnClose}; a close the page hears about first runs the producers via {@link useFlushProducers}.
 *
 * @param props - The subtree, and the sequencer a test composes instead of the runtime's.
 * @returns The provider element.
 */
export function UnloadProvider({
  children,
  sequencer: composed,
}: {
  readonly children: ReactNode;
  readonly sequencer?: UnloadSequencer;
}): React.JSX.Element {
  const runtime = useOptionalAppRuntime();
  /* Outside a runtime (a test that mounts no `AppRuntimeProvider`) registrations still collect, and nothing listens. */
  const [detached] = useState(createUnloadSequencer);
  const sequencer = composed ?? (runtime === undefined ? detached : selectRuntimeUnload(runtime));
  return <UnloadContext.Provider value={sequencer}>{children}</UnloadContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Access the unload sequencer. Throws if used outside UnloadProvider.
 */
function useUnloadSequencer(): UnloadSequencer {
  const sequencer = useContext(UnloadContext);

  if (!sequencer) {
    throw new Error('useFlushOnClose and useFlushProducers must be used within an UnloadProvider');
  }

  return sequencer;
}

/**
 * Register a callback for both phases of the unload (A38) into `environment`'s sequencer (D26).
 *
 * Producer callbacks run first and may await their persistence acknowledgements
 * during `hidden`; session callbacks run only after all producers settle.
 * `pagehide` invokes session callbacks synchronously and skips producers, so it
 * can send prepared data but cannot start another persistence flush.
 *
 * The callback is stored via ref -- it never causes re-registration when
 * the closure changes. Registration is effect-based and StrictMode-safe.
 *
 * @example
 * ```tsx
 * useFlushOnClose(async () => {
 *   actorRef.send({ type: 'flushNow' });
 *   await waitUntilIdle(actorRef);
 * }, { stage: 'producer' });
 * ```
 */
export function useFlushOnClose(callback: FlushCallback, options: Readonly<{ stage: FlushStage }>): void {
  const sequencer = useUnloadSequencer();

  // Stable callback ref -- updated every render, read in handler
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(
    () =>
      sequencer.register(options.stage, async (phase) => {
        await callbackRef.current(phase);
      }),
    [options.stage, sequencer],
  );
}

/**
 * The producer stage of `hidden`, on demand, for a close the page is told about
 * while it can still work.
 *
 * The desktop quit hold (D31) runs it in `environment` before any session closes:
 * on Electron, `hidden` comes at window teardown, after main has disposed the
 * services utility that producers such as the Home draft write through. Producers
 * see the `hidden` phase, the one that can await; session callbacks are left to
 * the caller's own close.
 *
 * @returns Run every producer now; resolves once each has settled.
 */
export function useFlushProducers(): () => Promise<void> {
  return useUnloadSequencer().flushProducers;
}
