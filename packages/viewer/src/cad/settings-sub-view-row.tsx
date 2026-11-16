import { DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@taucad/ui/components/dropdown-menu';
import { menuItemIconClass, menuItemLayoutClass } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';

type SettingsSubViewRowProps = Readonly<{
  icon: React.ReactNode;
  /** The row's name, which also names its sub-view for assistive technology. */
  label: string;
  /** The setting's current value, right-aligned against the chevron. */
  value: React.ReactNode;
  /** How the value reads aloud when it is not plain text. */
  valueText?: string;
  infoTooltip?: React.ReactNode;
  /** Controlled open state, for a sub-view that steps back on a choice. */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** The sub-view's rows, starting with the heading that names it: its Back row reads "Back". */
  children: React.ReactNode;
}>;

/**
 * The one row a viewer settings sub-view opens from: icon, label, the value against the chevron, and the sub-view
 * under a Back row. Timeout, Grid & units and Kernel settings all use it.
 *
 * @param props - The row's icon, label and value, and the sub-view's rows.
 * @returns The row and its sub-view.
 */
export function SettingsSubViewRow({
  icon,
  label,
  value,
  valueText,
  infoTooltip,
  isOpen,
  onOpenChange,
  children,
}: SettingsSubViewRowProps): React.JSX.Element {
  return (
    <DropdownMenuSub open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuSubTrigger
        data-slot='dropdown-menu-select-item'
        aria-label={`${label}, ${valueText ?? (typeof value === 'string' ? value : '')}`}
        textValue={label}
      >
        <span className={cn(menuItemLayoutClass, menuItemIconClass, 'min-w-0')}>
          {icon}
          {label}
          {infoTooltip}
        </span>
        <span className='ml-auto flex min-w-0 items-center gap-1 truncate pl-3 text-muted-foreground'>{value}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * A radio row's `onSelect` in a sub-view: a value is a setting, not a command, so the menu stays open.
 *
 * @param event - The row's select event.
 */
export const keepMenuOpen = (event: Event): void => {
  event.preventDefault();
};
