import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Which half of A38's two-phase unload is running.
 *
 * `hidden` is the real close in a browser: the document is still alive, so a
 * callback can send, await and see an answer. `pagehide` is best-effort — the
 * document is going away and nothing asynchronous will finish — so a callback
 * that has one last thing to say says it there and expects no reply.
 *
 * @public
 */
export type FlushPhase = 'hidden' | 'pagehide';

/** Producer flushes settle before session close preparation begins. */
export type FlushStage = 'producer' | 'session';

type FlushCallback = (phase: FlushPhase) => void | Promise<void>;

type FlushRegistration = {
  id: symbol;
  stage: FlushStage;
  callbackRef: React.RefObject<FlushCallback>;
};

type UnloadContextValue = {
  register: (registration: FlushRegistration) => void;
  unregister: (id: symbol) => void;
  flushProducers: () => Promise<void>;
};

/** Run one stage's callbacks in the phase that can still await, and wait for every one to settle. */
const flushStage = async (registrations: readonly FlushRegistration[], stage: FlushStage): Promise<void> => {
  await Promise.allSettled(
    registrations
      .filter((registration) => registration.stage === stage)
      .map(async (registration) => registration.callbackRef.current('hidden')),
  );
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const UnloadContext = createContext<UnloadContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Global unload service provider.
 *
 * Attaches one set of document-level listeners for A38's two-phase unload:
 * `visibilitychange: hidden`, which is the real close and the phase that can
 * still do work, and `pagehide`, which is best-effort. `beforeunload` is gone:
 * `pagehide` fires wherever it did, fires for the back/forward cache too, and
 * does not make the browser consider showing a leave-site prompt.
 *
 * Individual services register their flush callbacks via {@link useFlushOnClose};
 * a close the page hears about first runs the producers via {@link useFlushProducers}.
 */
export function UnloadProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const registryRef = useRef(new Set<FlushRegistration>());

  // Stable register/unregister functions
  const register = useCallback((registration: FlushRegistration): void => {
    registryRef.current.add(registration);
  }, []);

  const unregister = useCallback((id: symbol): void => {
    for (const reg of registryRef.current) {
      if (reg.id === id) {
        registryRef.current.delete(reg);
        break;
      }
    }
  }, []);

  const flushProducers = useCallback(async (): Promise<void> => {
    await flushStage([...registryRef.current], 'producer');
  }, []);

  useEffect(() => {
    const flushHidden = async (): Promise<void> => {
      const registrations = [...registryRef.current];
      await flushStage(registrations, 'producer');
      await flushStage(registrations, 'session');
    };
    const flushPageHide = (): void => {
      for (const registration of registryRef.current) {
        if (registration.stage === 'session') {
          /* Synchronous by contract: pagehide can only emit data prepared by
           * hidden and cannot wait for a fresh producer flush. */
          void registration.callbackRef.current('pagehide');
        }
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        void flushHidden();
      }
    };
    const handlePageHide = (): void => {
      flushPageHide();
    };

    globalThis.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      globalThis.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const contextValue = useMemo<UnloadContextValue>(
    () => ({ register, unregister, flushProducers }),
    [register, unregister, flushProducers],
  );

  return <UnloadContext.Provider value={contextValue}>{children}</UnloadContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Access the unload context. Throws if used outside UnloadProvider.
 */
function useUnloadContext(): UnloadContextValue {
  const context = useContext(UnloadContext);

  if (!context) {
    throw new Error('useFlushOnClose and useFlushProducers must be used within an UnloadProvider');
  }

  return context;
}

/**
 * Register a callback for both phases of the unload (A38).
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
  const { register, unregister } = useUnloadContext();

  // Stable callback ref -- updated every render, read in handler
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const id = Symbol('flush-on-close');
    const registration: FlushRegistration = {
      id,
      stage: options.stage,
      callbackRef,
    };

    register(registration);

    return () => {
      unregister(id);
    };
  }, [options.stage, register, unregister]);
}

/**
 * The producer stage of `hidden`, on demand, for a close the page is told about
 * while it can still work.
 *
 * The desktop quit hold (D31) runs it before any session closes: on Electron,
 * `hidden` comes at window teardown, after main has disposed the services
 * utility that producers such as the Home draft write through. Producers see
 * the `hidden` phase, the one that can await; session callbacks are left to
 * the caller's own close.
 *
 * @returns Run every producer now; resolves once each has settled.
 */
export function useFlushProducers(): () => Promise<void> {
  return useUnloadContext().flushProducers;
}
