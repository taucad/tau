import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { ProjectShareDialog } from '#components/publish/project-share-dialog.js';

export function ProjectShareAction(): React.JSX.Element {
  const { mainEntryFile, projectId, projectRef } = useProject();
  const project = useSelector(projectRef, (state) => state.context.project);
  const projectName = project?.name ?? 'Untitled';
  const projectDescription = project?.description ?? '';
  const projectUpdatedAt = project?.updatedAt;
  const parameters = project?.assets.mechanical?.parameters ?? {};

  const [shareOpen, setShareOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='secondary'
            size='sm'
            className='max-md:size-8'
            onClick={() => {
              setShareOpen(true);
            }}
          >
            <Share2 className='size-3.5' aria-hidden />
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
        entryFile={mainEntryFile}
        parameters={parameters}
      />
    </>
  );
}
