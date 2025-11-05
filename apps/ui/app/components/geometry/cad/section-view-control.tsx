import { useEffect } from 'react';
import { FlipHorizontal } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useBuild } from '#hooks/use-build.js';

type SectionViewSettings = {
  stripeColor: string;
  stripeSpacing: number;
  stripeWidth: number;
};

const defaultSectionViewSettings: SectionViewSettings = {
  stripeColor: '#00ff00',
  stripeSpacing: 10,
  stripeWidth: 1,
};

export function SectionViewControl(): React.JSX.Element {
  const { graphicsRef: graphicsActor } = useBuild();
  const isSectionViewActive = useSelector(graphicsActor, (state) => state.context.isSectionViewActive);

  const [sectionViewSettings] = useCookie<SectionViewSettings>(
    cookieName.sectionViewSettings,
    defaultSectionViewSettings,
  );

  // Sync cookie with graphics machine on mount/change
  useEffect(() => {
    graphicsActor.send({
      type: 'setSectionViewVisualization',
      payload: sectionViewSettings,
    });
  }, [sectionViewSettings, graphicsActor]);

  const handleClick = (): void => {
    graphicsActor.send({
      type: 'setSectionViewActive',
      payload: !isSectionViewActive,
    });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="overlay"
          size="icon"
          data-active={isSectionViewActive ? 'true' : 'false'}
          className="data-[active=true]:bg-accent data-[active=true]:text-primary"
          onClick={handleClick}
        >
          <FlipHorizontal className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isSectionViewActive ? 'Disable' : 'Enable'} section view</TooltipContent>
    </Tooltip>
  );
}
