import { Ruler } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';

export function MeasureControl(): React.JSX.Element {
  const isMeasureActive = useSelector(graphicsActor, (state) => state.matches({ operational: 'measure' }));

  const handleClick = (): void => {
    graphicsActor.send({
      type: 'setMeasureActive',
      payload: !isMeasureActive,
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="overlay"
          size="icon"
          data-active={isMeasureActive ? 'true' : 'false'}
          className="data-[active=true]:bg-accent data-[active=true]:text-primary"
          onClick={handleClick}
        >
          <Ruler className="size-4 -rotate-45" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isMeasureActive ? 'Disable' : 'Enable'} measuring tool</TooltipContent>
    </Tooltip>
  );
}
