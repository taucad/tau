import { createContext, useContext } from 'react';

/** Embedders can request touch sizing when a viewer lives inside a smaller surface. */
export const viewerTouchContext = createContext<boolean | undefined>(undefined);

/** Resolve the shared viewer button size, retaining compact desktop controls. */
export function useViewerControlSize(): 'icon-touch' | 'icon-sm' {
  const override = useContext(viewerTouchContext);
  return (override ?? false) ? 'icon-touch' : 'icon-sm';
}
