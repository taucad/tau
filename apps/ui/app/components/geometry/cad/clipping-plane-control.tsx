import { FlipHorizontal } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';

export function ClippingPlaneControl(): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="overlay" size="icon">
          <FlipHorizontal className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Apply clipping plane</TooltipContent>
    </Tooltip>
  );
}
