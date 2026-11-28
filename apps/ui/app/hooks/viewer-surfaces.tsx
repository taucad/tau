import { createContext, useContext, useEffect, useState } from 'react';
import type { AnnotationView } from '@taucad/chat/annotations';
import type { CommentPinSurface } from '@taucad/viewer/cad/comment-pins';

/*
 * The chat's viewers, by what each shows, so a picture of the model can find the part under one of its points
 * (charter D22): only a pane that shows the picture's scene at its revision lifts it. A registry, not state: it
 * changes as panes mount, and nothing renders from it.
 */

/** One viewer, as mark up asks it. */
export type ViewerSurfaceEntry = Readonly<{
  path: string;
  kernelView: string | undefined;
  instance: string | undefined;
  /** The geometry on screen and the presented scene, read when asked: both change without a remount. */
  presented: () => { revision: string; scene: string } | undefined;
  surface: { readonly current: CommentPinSurface | undefined };
}>;

export type ViewerSurfaces = Readonly<{
  register: (entry: ViewerSurfaceEntry) => () => void;
  showing: (view: AnnotationView) => ViewerSurfaceEntry | undefined;
}>;

const createViewerSurfaces = (): ViewerSurfaces => {
  const entries = new Set<ViewerSurfaceEntry>();
  return {
    register(entry) {
      entries.add(entry);
      return () => {
        entries.delete(entry);
      };
    },
    showing(view) {
      for (const entry of entries) {
        const presented = entry.presented();
        if (
          entry.path === view.path &&
          entry.kernelView === view.kernelView &&
          entry.instance === view.instance &&
          presented?.revision === view.revision &&
          presented.scene === view.scene &&
          entry.surface.current !== undefined
        ) {
          return entry;
        }
      }
      return undefined;
    },
  };
};

const ViewerSurfacesContext = createContext<ViewerSurfaces | undefined>(undefined);

/**
 * Holds the chat's viewers for mark up.
 *
 * @param props - The chat's composer and viewers.
 * @returns The provider.
 */
export function ViewerSurfacesProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  // oxlint-disable-next-line react/hook-use-state -- created once for the provider's life; never replaced.
  const [surfaces] = useState(createViewerSurfaces);
  return <ViewerSurfacesContext.Provider value={surfaces}>{children}</ViewerSurfacesContext.Provider>;
}

/**
 * The chat's viewers, for mark up to ask which one shows a picture's scene.
 *
 * @returns `undefined` outside a chat.
 */
export function useViewerSurfaces(): ViewerSurfaces | undefined {
  return useContext(ViewerSurfacesContext);
}

/**
 * Lists a viewer for mark up while it is mounted.
 *
 * @param entry - The viewer, or `undefined` while it offers no pins.
 */
export function useRegisterViewerSurface(entry: ViewerSurfaceEntry | undefined): void {
  const surfaces = useContext(ViewerSurfacesContext);
  useEffect(() => (surfaces && entry ? surfaces.register(entry) : undefined), [entry, surfaces]);
}
