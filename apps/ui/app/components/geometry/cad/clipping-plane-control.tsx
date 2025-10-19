import { useEffect } from 'react';
import { FlipHorizontal } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';

type ClippingPlaneSettings = {
  stripeColor: string;
  stripeSpacing: number;
  stripeWidth: number;
};

const defaultClippingPlaneSettings: ClippingPlaneSettings = {
  stripeColor: '#00ff00',
  stripeSpacing: 10,
  stripeWidth: 1,
};

export function ClippingPlaneControl(): React.JSX.Element {
  const isClippingPlaneActive = useSelector(graphicsActor, (state) => state.context.isClippingPlaneActive);

  const [clippingSettings] = useCookie<ClippingPlaneSettings>(
    cookieName.clippingPlaneSettings,
    defaultClippingPlaneSettings,
  );

  // Sync cookie with graphics machine on mount/change
  useEffect(() => {
    graphicsActor.send({
      type: 'setClippingPlaneVisualization',
      payload: clippingSettings,
    });
  }, [clippingSettings]);

  const handleClick = (): void => {
    graphicsActor.send({
      type: 'setClippingPlaneActive',
      payload: !isClippingPlaneActive,
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="overlay"
          size="icon"
          data-active={isClippingPlaneActive ? 'true' : 'false'}
          className="data-[active=true]:bg-accent data-[active=true]:text-primary"
          onClick={handleClick}
        >
          <FlipHorizontal className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isClippingPlaneActive ? 'Disable' : 'Enable'} clipping plane</TooltipContent>
    </Tooltip>
  );
}
