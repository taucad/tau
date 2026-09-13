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

type FlushRegistration = {
  id: symbol;
  callbackRef: React.RefObject<(phase: FlushPhase) => void>;
};

type UnloadContextValue = {
  register: (registration: FlushRegistration) => void;
  unregister: (id: symbol) => void;
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
 * Individual services register their flush callbacks via {@link useFlushOnClose}.
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

  useEffect(() => {
    const flush = (phase: FlushPhase): void => {
      for (const reg of registryRef.current) {
        reg.callbackRef.current(phase);
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        flush('hidden');
      }
    };
    const handlePageHide = (): void => {
      flush('pagehide');
    };

    globalThis.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      globalThis.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const contextValue = useMemo<UnloadContextValue>(() => ({ register, unregister }), [register, unregister]);

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
    throw new Error('useFlushOnClose must be used within an UnloadProvider');
  }

  return context;
}

/**
 * Register a callback for both phases of the unload (A38).
 *
 * It receives the {@link FlushPhase}: `hidden` can still send and await,
 * `pagehide` cannot. A callback that does not care about the difference ignores
 * the argument and runs twice, which is what every existing flush wants.
 *
 * The callback is stored via ref -- it never causes re-registration when
 * the closure changes. Registration is effect-based and StrictMode-safe.
 *
 * @example
 * ```tsx
 * useFlushOnClose((phase) => {
 *   actorRef.send({ type: phase === 'hidden' ? 'flushNow' : 'flushBestEffort' });
 * });
 * ```
 */
export function useFlushOnClose(callback: (phase: FlushPhase) => void): void {
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
      callbackRef,
    };

    register(registration);

    return () => {
      unregister(id);
    };
  }, [register, unregister]);
}
