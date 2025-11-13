import { Focus } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useBuild } from '#hooks/use-build.js';

/**
 * Reset camera control button
 */
export function ResetCameraControl(): React.JSX.Element {
  const { graphicsRef: graphicsActor } = useBuild();
  const handleReset = () => {
    graphicsActor.send({ type: 'resetCamera' });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="overlay" size="icon" onClick={handleReset}>
          <Focus className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Reset camera zoom</TooltipContent>
    </Tooltip>
  );
}
