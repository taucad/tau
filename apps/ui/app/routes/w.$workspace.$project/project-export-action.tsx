import { DownloadIcon } from 'lucide-react';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

export function ProjectExportAction(): React.JSX.Element {
  const { openPanel } = useProjectWorkspace();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='max-md:size-8'
          onClick={() => {
            openPanel('export');
          }}
        >
          <DownloadIcon className='size-3.5' aria-hidden />
          <span className='sr-only @xl/viewer:hidden'>Export</span>
          <span className='hidden @xl/viewer:inline'>Export</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Open exporter</TooltipContent>
    </Tooltip>
  );
}
