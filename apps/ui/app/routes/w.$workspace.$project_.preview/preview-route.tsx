/**
 * Shared internals of the owned-project preview route.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '@taucad/ui/components/loader';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import {
  OwnedPreviewWorkbench,
  OwnedPreviewProviders,
} from '#routes/w.$workspace.$project_.preview/preview-workbench.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { PreviewProjectContext } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
import type { PreviewProjectContextValue } from '#routes/w.$workspace.$project_.preview/preview-project-context.js';
import { toast } from '#components/ui/sonner.js';

/** Project details live in tau.json, which Tau refuses to write while it needs repair (R4). */
const reportDetailsError = (error: unknown): void => {
  toast.error('Could not save project details', {
    description: error instanceof Error ? error.message : undefined,
  });
};

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
      // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- a refused manifest write is named, not left loose
      void projectManager.updateProject(project.id, { ...project, name }).catch(reportDetailsError);
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
      // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- a refused manifest write is named, not left loose
      void projectManager.updateProject(project.id, { ...project, description }).catch(reportDetailsError);
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
          <div className='flex flex-col items-center gap-3 text-feature'>
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
        <OwnedPreviewProviders projectId={projectId} mainFile={mainFile}>
          {children}
        </OwnedPreviewProviders>
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

export default function ProjectPreview(): React.JSX.Element {
  return <OwnedPreviewWorkbench />;
}
