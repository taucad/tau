import { Pin, PinOff } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';

/**
 * The pin toggle on a model row (F1 of `docs/research/chat-model-list-pinned-blueprint.md`): a 20 px ghost icon
 * button with a tooltip. Its colour steps up with attention, all from the theme's neutral greys: `border` at rest, so
 * a column of pins stays quiet; `neutral` while its row is highlighted, hovered or keyboard-focused (the highlight is as light as
 * `border`); the foreground under the pointer or focus, with the ghost button's fill. Pinned, the pin is filled and
 * always drawn, and pointing at it turns it into “pin off”, the action a click takes. Unpinned, it is an outline the
 * caller shows only on the active row. Both callers mark the row `group/row`. A click never reaches the row, so
 * pinning does not choose the model.
 *
 * @returns The pin toggle.
 */
export function ModelPinButton({
  name,
  isOn,
  onToggle,
  className,
  tabIndex,
}: {
  /** The model's name, for the accessible name “Pin ‹name›”. */
  readonly name: string;
  readonly isOn: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
  readonly tabIndex?: number;
}): React.JSX.Element {
  /* `text-current`: a command row recolours an svg that names no text colour. */
  const iconClass = 'size-3.5 text-current';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon-xs'
          tabIndex={tabIndex}
          data-slot='model-pin'
          aria-label={`Pin ${name}`}
          aria-pressed={isOn}
          className={cn(
            'group/pin size-5 rounded-sm text-border group-hover/row:text-neutral group-data-[selected=true]/row:text-neutral group-has-focus-visible/row:text-neutral hover:bg-background hover:text-foreground! hover:shadow-xs focus-visible:text-foreground!',
            className,
          )}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onToggle();
          }}
        >
          {isOn ? (
            <>
              <Pin
                aria-hidden='true'
                className={cn(iconClass, 'fill-current group-hover/pin:hidden group-focus-visible/pin:hidden')}
              />
              <PinOff
                aria-hidden='true'
                className={cn(iconClass, 'hidden group-hover/pin:block group-focus-visible/pin:block')}
              />
            </>
          ) : (
            <Pin aria-hidden='true' className={iconClass} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side='left'>{isOn ? 'Unpin' : 'Pin'}</TooltipContent>
    </Tooltip>
  );
}
