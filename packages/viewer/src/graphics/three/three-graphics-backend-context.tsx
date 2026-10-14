import { createContext, useContext } from 'react';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';

const ThreeGraphicsBackendContext = createContext<ResolvedGraphicsBackend>('webgl');

/**
 * Provides the CAD viewer rendering backend resolved for this `@react-three/fiber` subtree.
 *
 * @public
 */
export function ThreeGraphicsBackendProvider({
  value,
  children,
}: {
  readonly value: ResolvedGraphicsBackend;
  readonly children: React.ReactNode;
}): React.ReactNode {
  return <ThreeGraphicsBackendContext.Provider value={value}>{children}</ThreeGraphicsBackendContext.Provider>;
}

/**
 * Read the rendering backend resolved for the enclosing `@react-three/fiber` subtree. Defaults to `webgl` outside a provider.
 *
 * @returns The resolved graphics backend.
 * @public
 */
export function useThreeGraphicsBackend(): ResolvedGraphicsBackend {
  return useContext(ThreeGraphicsBackendContext);
}
