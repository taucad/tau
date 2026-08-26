import { FlipHorizontal } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

export function SectionViewControl(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const is2dGeometry = useGraphicsSelector((state) => state.context.geometry?.format === 'svg');

  const handleClick = (): void => {
    graphicsRef.send({
      type: 'setSectionViewActive',
      payload: !isSectionViewActive,
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='overlay'
          size='icon'
          data-active={isSectionViewActive ? 'true' : 'false'}
          className={cn('data-[active=true]:bg-accent data-[active=true]:text-primary', is2dGeometry && 'hidden')}
          onClick={handleClick}
        >
          <FlipHorizontal className='size-4' />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isSectionViewActive ? 'Disable' : 'Enable'} section view</TooltipContent>
    </Tooltip>
  );
}
