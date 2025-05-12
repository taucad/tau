import type { JSX } from 'react';
import { Focus } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useGraphics } from '@/components/geometry/graphics/graphics-context.js';

/**
 * Reset camera control button that resets the camera to the default view
 * Uses the Graphics context's resetCamera method
 */
export function ResetCameraControl(): JSX.Element {
  const { camera } = useGraphics();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="overlay" size="icon" onClick={camera.reset}>
          <Focus />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Reset camera</TooltipContent>
    </Tooltip>
  );
}
