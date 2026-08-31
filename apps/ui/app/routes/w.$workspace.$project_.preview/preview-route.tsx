/**
 * Shared internals of the owned-project preview route.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import type { ProjectManifest } from '@taucad/types';
import { Button } from '#components/ui/button.js';
import { Loader } from '#components/ui/loader.js';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { PreviewDesktop } from '#routes/w.$workspace.$project_.preview/preview-desktop.js';
import { PreviewMobile } from '#routes/w.$workspace.$project_.preview/preview-mobile.js';
import {
  PreviewProjectContext,
  usePreviewProject,
} from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
import type { PreviewProjectContextValue } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';

/**
 * Provider for dynamic projects (from storage). Loads project metadata and defers rendering
 * until the main file is known.
 */
export function DynamicPreviewProvider({
  children,
  projectId,
}: {
  readonly children?: React.ReactNode;
  readonly projectId: string;
}): React.JSX.Element {
  const projectManager = useProjectManager();
  const [project, setProject] = useState<ProjectManifest | undefined>();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);

    async function loadProjectMetadata(): Promise<void> {
      const loaded = await projectManager.getProject(projectId);
      if (cancelled) {
        return;
      }
      setProject(loaded);
      setIsLoaded(true);
    }

    void loadProjectMetadata();

    return (): void => {
      cancelled = true;
    };
  }, [projectId, projectManager]);

  const updateName = useCallback(
    (name: string) => {
      if (!project) {
        return;
      }

      setProject((previous) => (previous ? { ...previous, name } : previous));
      void projectManager.updateProject(project.id, { ...project, name });
    },
    [project, projectManager],
  );

  const updateDescription = useCallback(
    (description: string) => {
      if (!project) {
        return;
      }

      setProject((previous) => (previous ? { ...previous, description } : previous));
      void projectManager.updateProject(project.id, { ...project, description });
    },
    [project, projectManager],
  );

  const metadataValue = useMemo<PreviewProjectContextValue>(
    () => ({
      project,
      updateName,
      updateDescription,
    }),
    [project, updateName, updateDescription],
  );

  const mainFile = project?.assets.main.entryPath;

  if (isLoaded && !project) {
    return (
      <PreviewProjectContext.Provider value={metadataValue}>
        <div role='alert' aria-label='Preview error' className='flex h-full items-center justify-center'>
          <div className='flex flex-col items-center gap-3 text-destructive'>
            <AlertTriangle className='size-10 opacity-60' strokeWidth={1.5} />
            <span className='max-w-sm text-center text-sm'>
              Project <span className='font-mono'>{projectId}</span> was not found.
            </span>
          </div>
        </div>
      </PreviewProjectContext.Provider>
    );
  }

  return (
    <PreviewProjectContext.Provider value={metadataValue}>
      {mainFile ? (
        <CadPreviewProvider projectId={projectId} mainFile={mainFile}>
          {children}
        </CadPreviewProvider>
      ) : (
        <div
          role='status'
          aria-label='Loading preview'
          aria-busy='true'
          className='flex h-full items-center justify-center'
        >
          <Loader className='size-16 text-primary' />
        </div>
      )}
    </PreviewProjectContext.Provider>
  );
}

/**
 * The preview shell. `projectId` is the owned-project identity every preview pane is keyed by.
 */
export function PreviewSession({
  children,
  projectId,
}: {
  readonly children?: React.ReactNode;
  readonly projectId: string;
}): React.JSX.Element {
  return (
    <SharedWorkerGate>
      <HomeFileManagerProvider key={projectId} projectId={projectId} rootDirectory={`/projects/${projectId}`}>
        <DynamicPreviewProvider projectId={projectId}>{children}</DynamicPreviewProvider>
      </HomeFileManagerProvider>
    </SharedWorkerGate>
  );
}

function ProjectNameBreadcrumb({ to }: { readonly to: string }): React.JSX.Element {
  const { project } = usePreviewProject();
  const name = project?.name ?? 'Project';

  return (
    <Button asChild variant='ghost'>
      <Link to={to}>{name}</Link>
    </Button>
  );
}

/** Breadcrumb trail for a preview route, linking back to its own URL. */
export const previewBreadcrumb = (key: string, to: string): React.ReactNode[] => [
  <ProjectNameBreadcrumb key={`${key}-project-name`} to={to} />,
  <span key={`${key}-preview`} className='flex h-8 items-center px-3 text-sm font-medium'>
    Preview
  </span>,
];

export default function ProjectPreview(): React.JSX.Element {
  const isMobile = useIsMobile();

  return isMobile ? <PreviewMobile /> : <PreviewDesktop />;
}
