import { Check, Focus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useGraphics } from '#hooks/use-graphics.js';
import { useTickAnimation } from '#hooks/use-tick-animation.js';

/**
 * Fit view control button: zooms and recentres on the model without rotating the camera.
 * Uses the per-view graphics actor from GraphicsProvider.
 */
export function FitViewControl(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const { ticked, trigger } = useTickAnimation();

  const handleFit = (): void => {
    graphicsRef.send({ type: 'fitView' });
    trigger();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='overlay' size='icon' aria-label='Fit view' onClick={handleFit}>
          {ticked ? <Check className='size-4 text-success' /> : <Focus className='size-4' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{ticked ? 'View fitted' : 'Fit view'}</TooltipContent>
    </Tooltip>
  );
}
