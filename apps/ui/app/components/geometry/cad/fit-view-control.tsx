import { Check, Focus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { useGraphics } from '#hooks/use-graphics.js';
import { useTickAnimation } from '#hooks/use-tick-animation.js';

type FitViewControlProps = Readonly<{
  /** The formatted shortcut the tooltip shows. */
  shortcut?: string;
}>;

/**
 * Fit view control button: zooms and recentres on the model without rotating the camera.
 * Uses the per-view graphics actor from GraphicsProvider.
 */
export function FitViewControl({ shortcut }: FitViewControlProps): React.JSX.Element {
  const graphicsRef = useGraphics();
  const { ticked, trigger } = useTickAnimation();

  const handleFit = (): void => {
    graphicsRef.send({ type: 'fitView' });
    trigger();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='ghost' size='icon-sm' aria-label='Fit view' onClick={handleFit}>
          {ticked ? <Check className='size-4 text-success' /> : <Focus className='size-4' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {ticked ? 'View fitted' : 'Fit view'}
        {shortcut ? (
          <KeyShortcut variant='tooltip' className='ml-1'>
            {shortcut}
          </KeyShortcut>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
