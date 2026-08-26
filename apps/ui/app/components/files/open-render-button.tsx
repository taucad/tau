import { useCallback } from 'react';
import { Box } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useProject } from '#hooks/use-project.js';

export type OpenRenderButtonProperties = {
  readonly path: string;
  readonly tooltip?: string;
} & React.ComponentProps<typeof Button>;

/**
 * Ghost action that focuses the CAD viewer for an entry path.
 *
 * Mirrors {@link CopyButton} sizing in file-operation toolbars: optional
 * visible label plus trailing icon. Routes through `openInViewer` on the
 * project machine (same as {@link ViewerLink}).
 */
export function OpenRenderButton({
  path,
  size = 'xs',
  variant = 'ghost',
  tooltip = 'Open in viewer',
  className,
  ...properties
}: OpenRenderButtonProperties): React.JSX.Element {
  const project = useProject({ enableNoContext: true });

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!project) {
        return;
      }

      project.projectRef.send({ type: 'openInViewer', entryPath: path });
    },
    [project, path],
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type='button' size={size} variant={variant} className={className} onClick={handleClick} {...properties}>
          {size !== 'icon' && <span data-slot='label'>Open</span>}
          <Box className='size-3.5' />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
