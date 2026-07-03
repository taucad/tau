import { createContext, useContext } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';

type CadActorRef = ActorRefFrom<typeof cadMachine>;

const CadContext = createContext<CadActorRef | undefined>(undefined);

/**
 * Provider that makes the per-view geometry unit (cad machine) available to all descendants.
 * Placed in ChatViewer alongside GraphicsProvider.
 *
 * Unlike GraphicsProvider, the value may be `undefined` when the geometry unit
 * has not yet been created for the current entry file.
 */
export function CadProvider({
  cadRef,
  children,
}: {
  readonly cadRef: CadActorRef | undefined;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <CadContext.Provider value={cadRef}>{children}</CadContext.Provider>;
}

/**
 * Returns the per-view cad actor ref from the nearest CadProvider.
 * May return `undefined` if no geometry unit exists yet.
 * Use for `.send()` calls to dispatch events to the cad machine.
 */
export function useCad(): CadActorRef | undefined {
  return useContext(CadContext);
}

/**
 * Curried selector hook for reading state from the nearest per-view cad machine.
 * Handles undefined cad actor gracefully by returning the provided default value.
 * Delegates to XState's useSelector for subscription management and re-render optimization.
 *
 * @example
 * const geometry = useCadSelector(state => state.context.geometry, undefined);
 * const status = useCadSelector(state => state.value, undefined);
 */
export function useCadSelector<T>(selector: (state: SnapshotFrom<typeof cadMachine>) => T, defaultValue: T): T {
  const cadRef = useCad();
  return useSelector(cadRef, (state) => (state ? selector(state) : defaultValue));
}
