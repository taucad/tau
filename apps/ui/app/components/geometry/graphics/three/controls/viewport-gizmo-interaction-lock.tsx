import React, { createContext, useContext, useState } from 'react';

export type ViewportGizmoInteractionLock = {
  readonly activeRef: React.RefObject<boolean>;
  begin: (source?: string) => () => void;
  isActive: () => boolean;
};

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

export function ViewportGizmoInteractionLockProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [lock] = useState(createViewportGizmoInteractionLock);

  return (
    <ViewportGizmoInteractionLockContext.Provider value={lock}>{children}</ViewportGizmoInteractionLockContext.Provider>
  );
}

export const useViewportGizmoInteractionLock = (): ViewportGizmoInteractionLock => {
  return useContext(ViewportGizmoInteractionLockContext);
};
