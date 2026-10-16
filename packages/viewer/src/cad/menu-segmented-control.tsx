import { cn } from '@taucad/ui/utils/cn';
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@taucad/ui/components/dropdown-menu';

/** One segment: the value it selects and its visible label. */
export type MenuSegment = Readonly<{ value: string; label: string }>;

type MenuSegmentedControlProps = Readonly<{
  /** The control's accessible name. */
  label: string;
  value: string;
  segments: readonly MenuSegment[];
  onValueChange: (value: string) => void;
}>;

/**
 * A segmented control inside a dropdown menu: one row of equal segments, one of them selected. Each segment is a menu
 * radio item, so the menu's arrow keys reach it and Enter or Space selects it; the menu stays open after a choice.
 *
 * @param props - The accessible name, the selected value, the segments and the change handler.
 * @returns The labelled radio group.
 */
export function MenuSegmentedControl({
  label,
  value,
  segments,
  onValueChange,
}: MenuSegmentedControlProps): React.JSX.Element {
  return (
    <DropdownMenuRadioGroup
      aria-label={label}
      value={value}
      className='mx-3 my-0.5 flex rounded-md border border-input p-0.5'
      onValueChange={(next) => {
        if (next !== value) {
          onValueChange(next);
        }
      }}
    >
      {segments.map((segment) => (
        <DropdownMenuRadioItem
          key={segment.value}
          value={segment.value}
          className={cn(
            'h-6 flex-1 justify-center px-1.5 text-xs whitespace-nowrap',
            'data-[state=checked]:bg-menu-highlight data-[state=checked]:font-medium data-[state=checked]:text-foreground',
            '[&>[data-slot=dropdown-menu-radio-item-indicator]]:hidden',
          )}
          onSelect={(event) => {
            // Keep the menu open: a segment is a setting, not a command.
            event.preventDefault();
          }}
        >
          {segment.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
