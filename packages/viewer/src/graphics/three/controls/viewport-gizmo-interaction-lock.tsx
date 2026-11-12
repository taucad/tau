import React, { createContext, useContext, useState } from 'react';

/**
 * A reference-counted lock held while a viewport gizmo interaction is in progress, so other viewer input can stand
 * aside.
 *
 * @public
 */
export type ViewportGizmoInteractionLock = {
  readonly activeRef: React.RefObject<boolean>;
  begin: (source?: string) => () => void;
  isActive: () => boolean;
};

/**
 * Create a viewport gizmo interaction lock. Each `begin` call returns a release function, and the lock stays active
 * until every holder has released it.
 *
 * @returns A new, inactive lock.
 * @public
 */
export const createViewportGizmoInteractionLock = (): ViewportGizmoInteractionLock => {
  const activeRef = { current: false };
  const activeTokens = new Set<symbol>();

  return {
    activeRef,
    begin(source = 'viewport-gizmo') {
      const token = Symbol(source);
      let ended = false;

      activeTokens.add(token);
      activeRef.current = true;

      return () => {
        if (ended) {
          return;
        }

        ended = true;
        activeTokens.delete(token);
        activeRef.current = activeTokens.size > 0;
      };
    },
    isActive() {
      return activeRef.current;
    },
  };
};

const defaultViewportGizmoInteractionLock: ViewportGizmoInteractionLock = {
  activeRef: { current: false },
  begin: () => () => undefined,
  isActive: () => false,
};

const ViewportGizmoInteractionLockContext = createContext<ViewportGizmoInteractionLock>(
  defaultViewportGizmoInteractionLock,
);

/**
 * Provide one viewport gizmo interaction lock to its descendants: the given one (the canvas's, which its controls
 * adapter also reads), else the one an enclosing provider gives, else a new one.
 *
 * @param props - The children that share the lock, and the lock to give them.
 * @returns The context provider element.
 * @public
 */
export function ViewportGizmoInteractionLockProvider({
  children,
  lock: given,
}: {
  readonly children: React.ReactNode;
  readonly lock?: ViewportGizmoInteractionLock;
}): React.JSX.Element {
  const enclosing = useContext(ViewportGizmoInteractionLockContext);
  const [own] = useState(createViewportGizmoInteractionLock);
  const lock = given ?? (enclosing === defaultViewportGizmoInteractionLock ? own : enclosing);

  return (
    <ViewportGizmoInteractionLockContext.Provider value={lock}>{children}</ViewportGizmoInteractionLockContext.Provider>
  );
}

/**
 * Read the nearest viewport gizmo interaction lock. Outside a provider it returns an inert lock that is never active.
 *
 * @returns The provided lock, or an inert lock outside a provider.
 * @public
 */
export const useViewportGizmoInteractionLock = (): ViewportGizmoInteractionLock => {
  return useContext(ViewportGizmoInteractionLockContext);
};
