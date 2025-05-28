import type { JSX } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '~/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';

/**
 * Reset camera control button
 */
export function ResetCameraControl(): JSX.Element {
  const handleReset = () => {
    graphicsActor.send({ type: 'resetCamera' });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="overlay" size="icon" onClick={handleReset}>
          <RotateCcw className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Reset camera</TooltipContent>
    </Tooltip>
  );
}
