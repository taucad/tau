import { useSelector } from '@xstate/react';
import type { StateFrom } from 'xstate';
import { ChevronDown, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
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
  description: string;
  tooltipLabel: string;
} => {
  switch (true) {
    case state.matches({ operational: { 'section-view': 'pending' } }): {
      return {
        label: 'Section View Pending',
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

    case state.matches({ operational: { measure: 'selecting' } }): {
      return {
        label: 'Measuring Tool',
        description: 'Click points to measure distances',
        tooltipLabel: 'Close measuring tool',
      };
    }

    case state.matches({ operational: { measure: 'selected' } }): {
      const measurementCount = state.context.measurements.length;
      const { gridUnit } = state.context;
      const distances = state.context.measurements
        .map((m) => (m.distance / state.context.gridUnitFactor).toFixed(1))
        .join(` ${gridUnit}, `);
      const description =
        measurementCount > 0
          ? `${measurementCount} measurement${measurementCount > 1 ? 's' : ''}: ${distances} ${gridUnit}`
          : 'Click more points or clear to restart';

      return {
        label: 'Measure Mode',
        description,
        tooltipLabel: 'Close measure mode',
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

  const { label, description, tooltipLabel } = infoFromState(state);

  return state.matches({ operational: 'section-view' }) || state.matches({ operational: 'measure' }) ? (
    <Collapsible
      {...props}
      open={isViewerStatusOpen}
      className={cn('group/viewer-status m-auto items-start rounded-2xl border bg-background', className)}
      onOpenChange={setIsViewerStatusOpen}
    >
      <CollapsibleTrigger className="flex flex-col items-center p-2 select-none md:px-3">
        <div className="flex items-center gap-1">
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
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2 align-baseline">
              {tooltipLabel} <KeyShortcut variant="tooltip">{formattedKeyCombination}</KeyShortcut>
            </TooltipContent>
          </Tooltip>
          <span className="text-sm font-medium">{label}</span>
          <ChevronDown className="size-4 text-muted-foreground group-data-[state=open]/viewer-status:rotate-180" />
        </div>
        <CollapsibleContent className="overflow-hidden text-balance">
          <p className="text-sm text-muted-foreground">{description}</p>
        </CollapsibleContent>
      </CollapsibleTrigger>
    </Collapsible>
  ) : null;
}
