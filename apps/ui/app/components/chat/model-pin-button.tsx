import { Pin, PinOff } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';

/**
 * The pin toggle on a model row (F1 of `docs/research/chat-model-list-pinned-blueprint.md`): a 20 px ghost icon
 * button with a tooltip, in the quiet `neutral` grey so a list of pins never shouts. Pinned, the pin is filled and
 * always drawn; pointing at it (or focusing it) turns it into “pin off”, the action a click takes. Unpinned, it is an
 * outline the caller shows only on the active row. Under the pointer either state darkens and gains the ghost
 * button's fill. A click never reaches the row, so pinning does not choose the model.
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
            'group/pin size-5 rounded-sm text-neutral hover:bg-background hover:text-foreground hover:shadow-xs focus-visible:text-foreground',
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
