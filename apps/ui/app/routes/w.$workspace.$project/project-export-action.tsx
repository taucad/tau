import { DownloadIcon } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

export function ProjectExportAction(): React.JSX.Element {
  const { projectRef } = useProject();
  const { openPanel } = useProjectWorkspace();
  const hasExportableGeometry = useSelector(projectRef, (state) => state.context.exportableGeometryUnitPaths.size > 0);

  const handleClick = (): void => {
    if (hasExportableGeometry) {
      openPanel('export');
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='aria-disabled:cursor-not-allowed aria-disabled:opacity-50 max-md:size-8'
          aria-disabled={!hasExportableGeometry}
          onClick={handleClick}
        >
          <DownloadIcon className='size-3.5' aria-hidden />
          <span className='sr-only @xl/viewer:hidden'>Export</span>
          <span className='hidden @xl/viewer:inline'>Export</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hasExportableGeometry ? 'Open exporter' : 'Generate exportable geometry first'}</TooltipContent>
    </Tooltip>
  );
}
