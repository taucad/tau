import { Check, Focus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useGraphics } from '#hooks/use-graphics.js';
import { useTickAnimation } from '#hooks/use-tick-animation.js';

/**
 * Reset camera control button.
 * Uses the per-view graphics actor from GraphicsProvider.
 */
export function ResetCameraControl(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const { ticked, trigger } = useTickAnimation();

  const handleReset = (): void => {
    graphicsRef.send({ type: 'resetCamera' });
    trigger();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='overlay' size='icon' onClick={handleReset}>
          {ticked ? <Check className='size-4 text-success' /> : <Focus className='size-4' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{ticked ? 'Camera reset' : 'Reset camera'}</TooltipContent>
    </Tooltip>
  );
}
