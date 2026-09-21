/**
 * Shared internals of the owned-project preview route.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import type { ProjectManifest } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '#components/ui/loader.js';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { resolveProjectRoute } from '#hooks/use-project-slug-route.js';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { PreviewDesktop } from '#routes/w.$workspace.$project_.preview/preview-desktop.js';
import { PreviewMobile } from '#routes/w.$workspace.$project_.preview/preview-mobile.js';
import { PreviewProjectContext } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
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
  const [loadedProject, setLoadedProject] = useState<{
    readonly projectId: string;
    readonly project: ProjectManifest | undefined;
  }>();

  useEffect(() => {
    let cancelled = false;
    async function loadProjectMetadata(): Promise<void> {
      const loaded = await projectManager.getProject(projectId);
      if (cancelled) {
        return;
      }
      setLoadedProject({ projectId, project: loaded });
    }

    void loadProjectMetadata();

    return (): void => {
      cancelled = true;
    };
  }, [projectId, projectManager]);

  const isLoaded = loadedProject?.projectId === projectId;
  const project = isLoaded ? loadedProject.project : undefined;

  const updateName = useCallback(
    (name: string) => {
      if (!project) {
        return;
      }

      setLoadedProject((previous) =>
        previous?.projectId === projectId && previous.project
          ? { projectId, project: { ...previous.project, name } }
          : previous,
      );
      void projectManager.updateProject(project.id, { ...project, name });
    },
    [project, projectManager],
  );

  const updateDescription = useCallback(
    (description: string) => {
      if (!project) {
        return;
      }

      setLoadedProject((previous) =>
        previous?.projectId === projectId && previous.project
          ? { projectId, project: { ...previous.project, description } }
          : previous,
      );
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

/*
 * The shell renders breadcrumbs above every route provider, so this one reads the project
 * listing the root layout already holds instead of the preview's own context.
 */
function ProjectNameBreadcrumb({
  to,
  workspace,
  project,
}: {
  readonly to: string;
  readonly workspace: string;
  readonly project: string;
}): React.JSX.Element {
  const { projects } = useProjects({ includeDeleted: true });
  const projectId = resolveProjectRoute(projects, workspace, project);
  const name = projects.find((candidate) => candidate.id === projectId)?.name ?? 'Project';

  return (
    <Button asChild variant='ghost'>
      <Link to={to}>{name}</Link>
    </Button>
  );
}

/** Breadcrumb trail for a preview route, linking back to its own URL. */
export const previewBreadcrumb = (
  slugs: { readonly workspace: string; readonly project: string },
  to: string,
): React.ReactNode[] => [
  <ProjectNameBreadcrumb
    key={`${slugs.project}-project-name`}
    to={to}
    workspace={slugs.workspace}
    project={slugs.project}
  />,
  <span key={`${slugs.project}-preview`} className='flex h-8 items-center px-3 text-sm font-medium'>
    Preview
  </span>,
];

export default function ProjectPreview(): React.JSX.Element {
  const isMobile = useIsMobile();

  return isMobile ? <PreviewMobile /> : <PreviewDesktop />;
}
