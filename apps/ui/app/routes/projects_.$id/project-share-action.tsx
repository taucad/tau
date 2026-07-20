import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { ProjectShareDialog } from '#components/publish/project-share-dialog.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { getActiveGroupValues } from '#utils/parameter-config.utils.js';

export function ProjectShareAction(): React.JSX.Element {
  const { mainEntryPath, parameterEntries, projectId, projectRef } = useProject();
  const projectManager = useProjectManager();
  const project = useSelector(projectRef, (state) => state.context.project);
  const projectName = project?.name ?? 'Untitled';
  const projectDescription = project?.description ?? '';
  const parameters = getActiveGroupValues(parameterEntries.get(mainEntryPath));
  const [projectUpdatedAt, setProjectUpdatedAt] = useState<number | undefined>();

  useEffect(() => {
    let cancelled = false;
    void projectManager.getProjectLibraryState(projectId).then((state) => {
      if (!cancelled) {
        setProjectUpdatedAt(state?.lastActivityAt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, projectManager]);

  const [shareOpen, setShareOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='max-md:size-8'
            onClick={() => {
              setShareOpen(true);
            }}
          >
            <Share2 className='size-3' aria-hidden />
            <span className='sr-only sm:hidden'>Share</span>
            <span className='hidden sm:inline'>Share</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Share project</TooltipContent>
      </Tooltip>
      <ProjectShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        projectId={projectId}
        projectName={projectName}
        projectDescription={projectDescription}
        projectUpdatedAt={projectUpdatedAt}
        entryPath={mainEntryPath}
        parameters={parameters}
      />
    </>
  );
}
