import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlushRegistration = {
  id: symbol;
  callbackRef: React.RefObject<() => void>;
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
 * Attaches a single set of window-level listeners for `beforeunload` and
 * `visibilitychange` events. When either fires, all registered flush
 * callbacks are invoked synchronously. Must be placed near the root of
 * the React tree.
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
    const flush = (): void => {
      for (const reg of registryRef.current) {
        reg.callbackRef.current();
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };

    globalThis.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      globalThis.removeEventListener('beforeunload', flush);
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
 * Register a callback to be called when the page is about to unload or
 * becomes hidden. Useful for flushing debounced state to prevent data loss.
 *
 * The callback is stored via ref -- it never causes re-registration when
 * the closure changes. Registration is effect-based and StrictMode-safe.
 *
 * @example
 * ```tsx
 * useFlushOnClose(() => {
 *   actorRef.send({ type: 'flushNow' });
 * });
 * ```
 */
export function useFlushOnClose(callback: () => void): void {
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
