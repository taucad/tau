import { Check, Focus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import { useTickAnimation } from '@taucad/ui/hooks/use-tick-animation';

type FitViewControlProps = Readonly<{
  /** The formatted shortcut the tooltip shows. */
  shortcut?: string;
}>;

/**
 * Fit view control button: zooms and recentres on the model without rotating the camera.
 * Uses the per-view graphics actor from GraphicsProvider.
 * @public
 */
export function FitViewControl({ shortcut }: FitViewControlProps): React.JSX.Element {
  const graphicsRef = useGraphics();
  const canFit = useGraphicsSelector(
    (state) => state.context.geometryRadius > 0 || state.context.artifact?.mimeType === 'image/svg+xml',
  );
  const { ticked, trigger } = useTickAnimation();

  const handleFit = (): void => {
    graphicsRef.send({ type: 'fitView' });
    trigger();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label='Fit view'
          aria-disabled={!canFit}
          onClick={canFit ? handleFit : undefined}
        >
          {ticked ? <Check className='size-4 text-success' /> : <Focus className='size-4' />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {canFit ? (ticked ? 'View fitted' : 'Fit view') : 'Available when a model is displayed'}
        {shortcut ? (
          <KeyShortcut variant='tooltip' className='ml-1'>
            {shortcut}
          </KeyShortcut>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
