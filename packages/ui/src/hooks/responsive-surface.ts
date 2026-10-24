import { createContext, useContext } from 'react';

/** Responsive viewport supplied by embedded hosts. */
export const responsiveSurfaceContext = createContext<
  { readonly isMobile: boolean; readonly container: HTMLElement | undefined } | undefined
>(undefined);

/**
 * Read the portal container of an embedded responsive surface.
 * @returns The surface container, or undefined for the application document.
 * @public
 */
export function useResponsiveSurfaceContainer(): HTMLElement | undefined {
  return useContext(responsiveSurfaceContext)?.container;
}
