import { useViewerControlSize } from '#cad/viewer-control-size.js';
import { Check, Focus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import { useSelector } from '@xstate/react';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import type { SnapshotFrom } from 'xstate';
import { selectFramingFitsModel, selectGraphicsFraming } from '#machines/graphics.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { useTickAnimation } from '@taucad/ui/hooks/use-tick-animation';

type FitViewControlProps = Readonly<{
  /** The formatted shortcut the tooltip shows. */
  shortcut?: string;
}>;

type GraphicsSnapshot = SnapshotFrom<typeof graphicsMachine>;

const selectIs2d = (state: GraphicsSnapshot): boolean => state.context.artifact?.mimeType === 'image/svg+xml';
const selectHasModel = (state: GraphicsSnapshot): boolean => state.context.geometryRadius > 0;

/**
 * Fit view control button: zooms and recentres on the model without rotating the camera.
 * Uses the per-view graphics actor from GraphicsProvider.
 * @public
 */
export function FitViewControl({ shortcut }: FitViewControlProps): React.JSX.Element {
  const controlSize = useViewerControlSize();
  const graphicsRef = useGraphics();
  const is2d = useGraphicsSelector(selectIs2d);
  const hasModel = useGraphicsSelector(selectHasModel);
  // Framing ignores Fit view while an entry waits for its first presentation, so the button
  // offers it only once framing holds a measurement, as the F shortcut does.
  const framingRef = useGraphicsSelector(selectGraphicsFraming);
  const framingFits = useSelector(framingRef, selectFramingFitsModel);
  const canFit = is2d || (hasModel && framingFits);
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
          size={controlSize}
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
