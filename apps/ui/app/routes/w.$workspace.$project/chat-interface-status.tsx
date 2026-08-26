import { ChevronDown, Info, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/ui/collapsible.js';
import { cn } from '#utils/ui.utils.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

type ChatInterfaceStatusProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Derives a stable string for the detailed operational sub-state.
 * Returns a primitive so useSelector only re-renders when the actual
 * operational state transitions, not on unrelated context changes.
 */
type DetailedMode =
  | 'ready'
  | 'section-view-pending'
  | 'section-view-active'
  | 'measure-selecting'
  | 'measure-selected'
  | 'unknown';

function useDetailedOperationalMode(): DetailedMode {
  return useGraphicsSelector((state) => {
    if (state.matches({ operational: 'ready' })) {
      return 'ready';
    }

    if (state.matches({ operational: { 'section-view': 'pending' } })) {
      return 'section-view-pending';
    }

    if (state.matches({ operational: { 'section-view': 'active' } })) {
      return 'section-view-active';
    }

    if (state.matches({ operational: { measure: 'selecting' } })) {
      return 'measure-selecting';
    }

    if (state.matches({ operational: { measure: 'selected' } })) {
      return 'measure-selected';
    }

    return 'unknown';
  });
}

type StatusInfo = {
  label: string;
  description: React.ReactNode;
  tooltipLabel: string;
  tips?: React.ReactNode[];
};

function useStatusInfo(mode: DetailedMode): StatusInfo {
  const hasMeasurements = useGraphicsSelector((state) => state.context.measurements.length > 0);

  switch (mode) {
    case 'section-view-pending': {
      return {
        label: 'Section View',
        description: 'Select a plane to view a cross section',
        tooltipLabel: 'Close section view',
      };
    }

    case 'section-view-active': {
      return {
        label: 'Section View',
        description: 'Move arrows to adjust section view',
        tooltipLabel: 'Close section view',
      };
    }

    case 'measure-selecting':
    case 'measure-selected': {
      return {
        label: 'Measure',
        description: (
          <div className='flex flex-col gap-2'>
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
        description: 'Unknown graphics state',
        tooltipLabel: 'Close unknown state',
      };
    }
  }
}

export function ChatInterfaceStatus({ className, ...props }: ChatInterfaceStatusProps): React.ReactNode {
  const graphicsRef = useGraphics();
  const mode = useDetailedOperationalMode();
  const [isViewerStatusOpen, setIsViewerStatusOpen] = useCookie(cookieName.viewOpStatus, true);

  const isSectionView = mode === 'section-view-pending' || mode === 'section-view-active';
  const isMeasure = mode === 'measure-selecting' || mode === 'measure-selected';
  const isVisible = isSectionView || isMeasure;

  const handleClose = (): void => {
    if (isSectionView) {
      graphicsRef.send({ type: 'setSectionViewActive', payload: false });
    } else if (isMeasure) {
      graphicsRef.send({ type: 'setMeasureActive', payload: false });
    }
  };

  const { formattedKeyCombination } = useKeybinding(
    {
      key: 'Escape',
    },
    handleClose,
  );

  const { label, description, tooltipLabel, tips } = useStatusInfo(mode);

  return isVisible ? (
    <Collapsible
      {...props}
      open={isViewerStatusOpen}
      className={cn('group/viewer-status m-auto max-w-full items-start rounded-2xl border bg-background', className)}
      onOpenChange={setIsViewerStatusOpen}
    >
      <CollapsibleTrigger asChild>
        <div className='flex flex-col items-center p-2 select-none md:px-3'>
          <div className='flex w-full items-center justify-between gap-1'>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  className='-m-1.5 mr-0 size-6 text-muted-foreground hover:text-foreground'
                  size='icon'
                  onClick={(event) => {
                    event.stopPropagation();
                    handleClose();
                  }}
                >
                  <X className='size-3' />
                </Button>
              </TooltipTrigger>
              <TooltipContent className='flex items-center gap-2 align-baseline'>
                {tooltipLabel} <KeyShortcut variant='tooltip'>{formattedKeyCombination}</KeyShortcut>
              </TooltipContent>
            </Tooltip>
            <span className='text-sm font-medium'>{label}</span>
            <ChevronDown className='size-4 text-muted-foreground group-data-[state=open]/viewer-status:rotate-180' />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className='flex flex-col gap-2 overflow-hidden p-3 pt-0 text-center text-balance'>
        <div className='text-sm text-muted-foreground'>{description}</div>
        {tips !== undefined && tips.length > 0 ? (
          <div>
            {tips.map((tip) => (
              <div key={tip as string} className='flex items-center gap-1 text-muted-foreground'>
                <Info className='size-3' />
                <p className='text-xs text-muted-foreground'>{tip}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  ) : null;
}
