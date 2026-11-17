import { createContext, lazy, Suspense, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { ModelComponentPreviewRequest } from '@taucad/workbench-panes/component-menu/component-actions';

/** Which part to show first, and where focus returns when the gallery closes. */
export type PartGalleryRequest = ModelComponentPreviewRequest;

const PartGalleryContext = createContext<((request: PartGalleryRequest) => void) | undefined>(undefined);
const ProjectPartGallery = lazy(async () => {
  const module = await import('#components/geometry/cad/project-part-gallery.js');
  return { default: module.ProjectPartGallery };
});

/** Open the part gallery; `undefined` outside a project workspace. */
export const useOpenPartGallery = (): ((request: PartGalleryRequest) => void) | undefined =>
  useContext(PartGalleryContext);

/**
 * One part gallery per project workspace, shared by the Explorer, Properties and every part menu: the shared
 * `PartGallery` with the project's part verbs and the project's part thumbnail service.
 */
export function PartGalleryProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [request, setRequest] = useState<PartGalleryRequest>();
  const close = useCallback(() => {
    setRequest(undefined);
  }, []);
  return (
    <PartGalleryContext.Provider value={setRequest}>
      {children}
      {request ? (
        /* The gallery is its own chunk; it opens over the page when it arrives. */
        <Suspense fallback={null}>
          <ProjectPartGallery key={`${request.unitId}:${request.componentId}`} request={request} onClose={close} />
        </Suspense>
      ) : undefined}
    </PartGalleryContext.Provider>
  );
}
