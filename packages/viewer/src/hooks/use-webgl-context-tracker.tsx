import { createContext, useContext } from 'react';
import { useActorRef } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { webglContextMachine } from '#machines/webgl-context.machine.js';

// ── React context ────────────────────────────────────────────────────────────

type WebglContextActorRef = ActorRefFrom<typeof webglContextMachine>;

const WebglContextTrackerContext = createContext<WebglContextActorRef | undefined>(undefined);

type WebglContextTrackerProviderProps = {
  readonly children: React.ReactNode;
};

/**
 * Provides a shared WebGL-context tracking actor to all descendant viewers.
 * Mount once above the viewer dockview so every panel shares the same count.
 * @public
 */
export function WebglContextTrackerProvider({ children }: WebglContextTrackerProviderProps): React.JSX.Element {
  const actorRef = useActorRef(webglContextMachine);

  return <WebglContextTrackerContext.Provider value={actorRef}>{children}</WebglContextTrackerContext.Provider>;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the raw actor ref for the WebGL context tracker, or `undefined`
 * if no `<WebglContextTrackerProvider>` is mounted above this component.
 *
 * Returning `undefined` (instead of throwing) allows `ThreeProvider` to work
 * in both tracked contexts (multi-viewer dockview) and untracked contexts
 * (single-viewer pages like the landing page, converter, preview, etc.).
 *
 * Consumers use `actorRef.send()` to fire `acquire` / `release` events and
 * `actorRef.getSnapshot()` to imperatively read the current count/limit.
 *
 * **Important**: Do NOT use `useSelector` on this actor ref in any component
 * that controls mounting/unmounting of a WebGL Canvas based on the count.
 * Reactive subscriptions create a parent-child feedback loop:
 * acquire -> count++ -> re-render -> unmount -> release -> count-- -> re-render
 * -> mount -> acquire -> ... (infinite loop).
 * @public
 */
export function useWebglContextRef(): WebglContextActorRef | undefined {
  return useContext(WebglContextTrackerContext);
}
