import { Ruler } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

export function MeasureControl(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const isMeasureActive = useGraphicsSelector((state) => state.matches({ operational: 'measure' }));
  const is2dGeometry = useGraphicsSelector((state) => state.context.geometry?.format === 'svg');

  const handleClick = (): void => {
    graphicsRef.send({
      type: 'setMeasureActive',
      payload: !isMeasureActive,
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='overlay'
          size='icon'
          data-active={isMeasureActive ? 'true' : 'false'}
          className={cn('data-[active=true]:bg-accent data-[active=true]:text-primary', is2dGeometry && 'hidden')}
          onClick={handleClick}
        >
          <Ruler className='size-4 -rotate-45' />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isMeasureActive ? 'Disable' : 'Enable'} measuring tool</TooltipContent>
    </Tooltip>
  );
}
