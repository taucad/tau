import { DownloadIcon } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { useProject } from '#hooks/use-project.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

export function ProjectExportAction(): React.JSX.Element {
  const { projectRef, editorRef } = useProject();
  const hasExportableGeometry = useSelector(projectRef, (state) => state.context.exportableGeometryUnitPaths.size > 0);
  const isConverterOpen = useSelector(editorRef, (state) => state.context.panelState.openPanels.converter);

  const handleClick = (): void => {
    const nextOpen = !isConverterOpen;

    editorRef.send({
      type: 'setPanelState',
      panelState: {
        openPanels: { converter: nextOpen },
        ...(nextOpen ? { mobileActiveTab: 'converter' } : {}),
      },
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className='max-md:size-8'
          disabled={!hasExportableGeometry}
          aria-pressed={isConverterOpen}
          onClick={handleClick}
        >
          <DownloadIcon className='size-3' aria-hidden />
          <span className='sr-only sm:hidden'>Export</span>
          <span className='hidden sm:inline'>Export</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hasExportableGeometry
          ? `${isConverterOpen ? 'Close' : 'Open'} exporter`
          : 'Generate exportable geometry first'}
      </TooltipContent>
    </Tooltip>
  );
}
