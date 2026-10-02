import { createContext, useContext } from 'react';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';

const ThreeGraphicsBackendContext = createContext<ResolvedGraphicsBackend>('webgl');

/** Provides the CAD viewer rendering backend resolved for this `@react-three/fiber` subtree. */
export function ThreeGraphicsBackendProvider({
  value,
  children,
}: {
  readonly value: ResolvedGraphicsBackend;
  readonly children: React.ReactNode;
}): React.ReactNode {
  return <ThreeGraphicsBackendContext.Provider value={value}>{children}</ThreeGraphicsBackendContext.Provider>;
}

export function useThreeGraphicsBackend(): ResolvedGraphicsBackend {
  return useContext(ThreeGraphicsBackendContext);
}
