import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Share2 } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { getActiveGroupValues } from '@taucad/types';
import { useProject } from '#hooks/use-project.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { ProjectShareDialog } from '#components/publish/project-share-dialog.js';
import { useProjectManager } from '#hooks/use-project-manager.js';

type ProjectShareContextValue = { readonly openShare: () => void };

const ProjectShareContext = createContext<ProjectShareContextValue | undefined>(undefined);

export function useProjectShare(): ProjectShareContextValue {
  const value = useContext(ProjectShareContext);
  if (!value) {
    throw new Error('useProjectShare must be used within ProjectShareProvider');
  }
  return value;
}

export function ProjectShareProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { mainEntryPath, parameterEntries, projectId, projectRef } = useProject();
  const projectManager = useProjectManager();
  const project = useSelector(projectRef, (state) => state.context.project);
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<number | undefined>();
  const [shareOpen, setShareOpen] = useState(false);
  const value = useMemo(
    () => ({
      openShare: () => {
        setShareOpen(true);
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const loadProjectUpdatedAt = async (): Promise<void> => {
      try {
        const state = await projectManager.getProjectLibraryState(projectId);
        if (!cancelled) {
          setProjectUpdatedAt(state?.lastActivityAt);
        }
      } catch (error) {
        console.error('Failed to load project activity for sharing:', error);
      }
    };
    void loadProjectUpdatedAt();
    return () => {
      cancelled = true;
    };
  }, [projectId, projectManager]);

  return (
    <ProjectShareContext.Provider value={value}>
      {children}
      <ProjectShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        projectId={projectId}
        projectName={project?.name ?? 'Untitled'}
        projectDescription={project?.description ?? ''}
        projectUpdatedAt={projectUpdatedAt}
        entryPath={mainEntryPath}
        parameters={getActiveGroupValues(parameterEntries.get(mainEntryPath))}
      />
    </ProjectShareContext.Provider>
  );
}

export function ProjectShareAction(): React.JSX.Element {
  const { openShare } = useProjectShare();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='ghost' size='xs' className='max-md:size-8' onClick={openShare}>
          <Share2 className='size-3.5' aria-hidden />
          <span className='sr-only @xl/viewer:hidden'>Share</span>
          <span className='hidden @xl/viewer:inline'>Share</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Share project</TooltipContent>
    </Tooltip>
  );
}
