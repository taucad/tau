import { DownloadIcon } from 'lucide-react';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

export function ProjectExportAction({
  className,
  labelClassName,
}: {
  readonly className?: string;
  readonly labelClassName?: string;
} = {}): React.JSX.Element {
  const { openPanel } = useProjectWorkspace();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className={className ?? 'max-md:size-8'}
          aria-label='Export'
          onClick={() => {
            openPanel('export');
          }}
        >
          <DownloadIcon className='size-3.5' aria-hidden />
          <span className={labelClassName ?? 'hidden @xl/viewer:inline'}>Export</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Open exporter</TooltipContent>
    </Tooltip>
  );
}
