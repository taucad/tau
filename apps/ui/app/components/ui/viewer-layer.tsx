import * as React from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveSurfaceProvider, useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { cn } from '@taucad/ui/utils/cn';

const subscribeToFullscreen = (onChange: () => void): (() => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
  };
};
const getPortalHost = (): Element => document.fullscreenElement ?? document.body;
const getServerPortalHost = (): undefined => undefined;

const viewerLayerContext = React.createContext<HTMLElement | undefined>(undefined);

type ViewerLayerProperties = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> &
  Record<`data-${string}`, string> & {
    readonly children: React.ReactNode;
  };

/**
 * One overlay layer for a hand-rolled viewer: its backdrop, its dialog and its floating controls. It portals to the end
 * of `<body>` (or the fullscreen element) at `z-50` like every other overlay, so it stacks by open order: above what
 * was open before it, below what opens after it. `isolate` gives it its own stacking context, so its parts order
 * themselves with small local layers (`z-0` backdrop, `z-1` content, `z-2` controls) whatever order their portals land
 * in. Dialogs and menus inside portal into the layer, not `<body>`.
 *
 * @param props - Classes and attributes for the layer, and the viewer's parts.
 * @returns The portalled layer.
 */
export function ViewerLayer({
  className,
  children,
  ...properties
}: ViewerLayerProperties): React.ReactPortal | undefined {
  const host = React.useSyncExternalStore(subscribeToFullscreen, getPortalHost, getServerPortalHost);
  const isMobile = useIsMobile();
  const [layer, setLayer] = React.useState<HTMLDivElement | undefined>(undefined);
  if (!host) {
    return undefined;
  }

  return createPortal(
    <div
      ref={(element) => {
        setLayer(element ?? undefined);
      }}
      data-slot='viewer-layer'
      className={cn('fixed inset-0 isolate z-50', className)}
      {...properties}
    >
      {/* The parts render once the layer exists, so a dialog portals straight into it instead of moving from <body>. */}
      {layer ? (
        <viewerLayerContext.Provider value={layer}>
          <ResponsiveSurfaceProvider isMobile={isMobile} container={layer}>
            {children}
          </ResponsiveSurfaceProvider>
        </viewerLayerContext.Provider>
      ) : null}
    </div>,
    host,
  );
}

/**
 * Portal a viewer part into its layer from anywhere inside it, such as a control rendered within a transformed dialog
 * that must be placed against the viewport.
 *
 * @param props - The part to portal.
 * @returns The part, portalled into the nearest viewer layer.
 */
export function ViewerLayerPortal({ children }: { readonly children: React.ReactNode }): React.ReactPortal | undefined {
  const layer = React.useContext(viewerLayerContext);
  return layer ? createPortal(children, layer) : undefined;
}
