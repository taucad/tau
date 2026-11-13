/**
 * The runtime's start boundary: named boundary 2 (app state orchestration charter D5, D15; I1).
 *
 * `AppRuntimeProvider` hands the app runtime to the tree. It reads the client entry's held runtime; the server and
 * tests pass theirs as `runtime`. Its one effect starts the runtime after hydration, so the server render and the
 * first client render read the same unstarted snapshot. That effect is the only `.start()` a component may hold. The
 * provider never stops the runtime: it outlives every tree that reads it, StrictMode's simulated unmount included,
 * and a second start of a running actor does nothing.
 */
import { createContext, useContext, useEffect } from 'react';
import type { Context, ReactNode } from 'react';
import type { AppRuntime } from '#runtime/app-runtime.js';
import { heldAppRuntime } from '#runtime/app-runtime-holder.js';

/* This module exports hooks beside the provider, so a hot update re-imports it rather than refreshing it; `hot.data`
 * keeps one context across updates, or the provider and its readers would end up on different contexts. */
const hotContexts = import.meta.hot?.data as { appRuntimeContext?: Context<AppRuntime | undefined> } | undefined;
const AppRuntimeContext = hotContexts?.appRuntimeContext ?? createContext<AppRuntime | undefined>(undefined);
if (hotContexts) {
  hotContexts.appRuntimeContext = AppRuntimeContext;
}

/**
 * Hand down the app runtime and start it once after hydration.
 *
 * @param props - The tree, and the runtime the server or a test composes instead of the held one.
 * @returns The provider element.
 * @public
 */
export function AppRuntimeProvider({
  children,
  runtime: composed,
}: {
  readonly children: ReactNode;
  readonly runtime?: AppRuntime;
}): React.JSX.Element {
  const runtime = composed ?? heldAppRuntime();
  if (runtime === undefined) {
    throw new Error('AppRuntimeProvider has no runtime: the client entry holds one; the server and tests pass one.');
  }

  /* Named boundary 2 (D15): the one start, after hydration. */
  useEffect(() => {
    runtime.start();
  }, [runtime]);

  return <AppRuntimeContext.Provider value={runtime}>{children}</AppRuntimeContext.Provider>;
}

/**
 * The app runtime, or `undefined` outside an `AppRuntimeProvider`.
 *
 * @returns The runtime.
 * @public
 */
export function useOptionalAppRuntime(): AppRuntime | undefined {
  return useContext(AppRuntimeContext);
}

/**
 * The app runtime.
 *
 * @returns The runtime.
 * @public
 */
export function useAppRuntime(): AppRuntime {
  const runtime = useOptionalAppRuntime();
  if (runtime === undefined) {
    throw new Error('useAppRuntime must be used within <AppRuntimeProvider>');
  }
  return runtime;
}
