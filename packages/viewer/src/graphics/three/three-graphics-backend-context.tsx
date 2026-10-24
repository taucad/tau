import { createContext, useContext } from 'react';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';

const ThreeGraphicsBackendContext = createContext<ResolvedGraphicsBackend>('webgl');

/**
 * Provides the material family (`webgpu` for shared nodes, `webgl` for classic) for this `@react-three/fiber` subtree.
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
 * Read the material family for the enclosing `@react-three/fiber` subtree. Defaults to `webgl` outside a provider.
 *
 * Execution API is reported separately from the initialized renderer in the graphics actor.
 * @returns The material-family discriminator.
 * @public
 */
export function useThreeGraphicsBackend(): ResolvedGraphicsBackend {
  return useContext(ThreeGraphicsBackendContext);
}
