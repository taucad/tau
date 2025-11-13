import { Ruler } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useBuild } from '#hooks/use-build.js';
import { cn } from '#utils/ui.utils.js';

export function MeasureControl(): React.JSX.Element {
  const { graphicsRef: graphicsActor } = useBuild();
  const isMeasureActive = useSelector(graphicsActor, (state) => state.matches({ operational: 'measure' }));
  const is2dGeometry = useSelector(graphicsActor, (state) =>
    state.context.geometries.some((geometry) => geometry.format === 'svg'),
  );

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
          className={cn('data-[active=true]:bg-accent data-[active=true]:text-primary', is2dGeometry && 'hidden')}
          onClick={handleClick}
        >
          <Ruler className="size-4 -rotate-45" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isMeasureActive ? 'Disable' : 'Enable'} measuring tool</TooltipContent>
    </Tooltip>
  );
}
