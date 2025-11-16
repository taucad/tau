import { useSelector } from '@xstate/react';
import type { StateFrom } from 'xstate';
import { ChevronDown, Info, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { useBuild } from '#hooks/use-build.js';
import { cn } from '#utils/ui.utils.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';

type GraphicsState = StateFrom<typeof graphicsMachine>;

const infoFromState = (
  state: GraphicsState,
): {
  label: string;
  description: React.ReactNode;
  tooltipLabel: string;
  tips?: React.ReactNode[];
} => {
  switch (true) {
    case state.matches({ operational: { 'section-view': 'pending' } }): {
      return {
        label: 'Section View',
        description: 'Select a plane to view a cross section',
        tooltipLabel: 'Close section view',
      };
    }

    case state.matches({ operational: { 'section-view': 'active' } }): {
      return {
        label: 'Section View',
        description: 'Move arrows to adjust section view',
        tooltipLabel: 'Close section view',
      };
    }

    case state.matches({ operational: { measure: 'selecting' } }):
    case state.matches({ operational: { measure: 'selected' } }): {
      const measurementCount = state.context.measurements.length;
      const hasMeasurements = measurementCount > 0;

      return {
        label: 'Measure',
        description: (
          <div className="flex flex-col gap-2">
            {hasMeasurements ? <p>Click more points or clear to restart</p> : <p>Click points to measure distances</p>}
          </div>
        ),
        tooltipLabel: 'Close measuring tool',
        tips: ['Left click to add a point', 'Right click to cancel adding a point', 'Zoom in for better accuracy'],
      };
    }

    default: {
      return {
        label: 'Unknown',
        description: `Unknown graphics state: ${JSON.stringify(state.value)}`,
        tooltipLabel: 'Close unknown state',
      };
    }
  }
};

export function ChatInterfaceStatus({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
  const { graphicsRef: graphicsActor } = useBuild();
  const state = useSelector(graphicsActor, (state) => state);
  const [isViewerStatusOpen, setIsViewerStatusOpen] = useCookie(cookieName.viewOpStatus, true);

  const handleClose = (): void => {
    if (state.matches({ operational: 'section-view' })) {
      graphicsActor.send({ type: 'setSectionViewActive', payload: false });
    } else if (state.matches({ operational: 'measure' })) {
      graphicsActor.send({ type: 'setMeasureActive', payload: false });
    }
  };

  const { formattedKeyCombination } = useKeydown(
    {
      key: 'Escape',
    },
    handleClose,
  );

  const { label, description, tooltipLabel, tips } = infoFromState(state);

  return state.matches({ operational: 'section-view' }) || state.matches({ operational: 'measure' }) ? (
    <Collapsible
      {...props}
      open={isViewerStatusOpen}
      className={cn('group/viewer-status m-auto items-start rounded-2xl border bg-background', className)}
      onOpenChange={setIsViewerStatusOpen}
    >
      <CollapsibleTrigger asChild>
        <div className="flex flex-col items-center p-2 select-none md:px-3">
          <div className="flex w-full items-center justify-between gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="-m-1.5 mr-0 size-6 text-muted-foreground hover:text-foreground"
                  size="icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleClose();
                  }}
                >
                  <X className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2 align-baseline">
                {tooltipLabel} <KeyShortcut variant="tooltip">{formattedKeyCombination}</KeyShortcut>
              </TooltipContent>
            </Tooltip>
            <span className="text-sm font-medium">{label}</span>
            <ChevronDown className="size-4 text-muted-foreground group-data-[state=open]/viewer-status:rotate-180" />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 overflow-hidden p-3 pt-0 text-balance">
        <div className="text-sm text-muted-foreground">{description}</div>
        {tips !== undefined && tips.length > 0 ? (
          <div>
            {tips.map((tip) => (
              <div key={tip as string} className="flex items-center gap-1 text-muted-foreground">
                <Info className="size-3" />
                <p className="text-xs text-muted-foreground">{tip}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  ) : null;
}
