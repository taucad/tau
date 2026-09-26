import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { ContextMenuItem } from '@taucad/ui/components/context-menu';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';

export type MenuDisclosureItemProperties = {
  /** The row's label; the row keeps an ordinary menu row's height. */
  readonly label: React.ReactNode;
  /** Right-aligned content that previews what the disclosure holds. */
  readonly trailing?: React.ReactNode;
  /** Revealed under the row when it is expanded; without it the row is a plain label. */
  readonly children?: React.ReactNode;
  readonly className?: string;
};

type RowRenderer = (properties: {
  readonly className: string;
  readonly 'aria-expanded': boolean;
  readonly 'aria-controls': string;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}) => React.ReactNode;

/**
 * A menu row that discloses content beneath it, for progressive disclosure inside menus: the row is
 * a menu item (arrow keys reach it, Enter or Space toggles it) that never closes the menu.
 */
const MenuDisclosure = ({
  label,
  trailing,
  children,
  className,
  renderRow,
}: MenuDisclosureItemProperties & { readonly renderRow: RowRenderer }): React.JSX.Element => {
  const [isOpen, setIsOpen] = React.useState(false);
  const contentId = React.useId();
  const rowContent = (
    <>
      <span className='min-w-0 flex-1 truncate text-left font-medium text-foreground'>{label}</span>
      {trailing}
    </>
  );

  if (children === undefined) {
    return (
      <div data-slot='menu-disclosure-item' className={cn(menuItemVariants(), 'hover:bg-transparent', className)}>
        {/* Holds the chevron's column so the label lines up with the rows below. */}
        <span aria-hidden className='size-3.5 shrink-0' />
        {rowContent}
      </div>
    );
  }

  return (
    <div data-slot='menu-disclosure-item' data-state={isOpen ? 'open' : 'closed'}>
      {renderRow({
        className: cn(menuItemVariants(), 'w-full', className),
        'aria-expanded': isOpen,
        'aria-controls': contentId,
        onToggle: () => {
          setIsOpen((previous) => !previous);
        },
        children: (
          <>
            <ChevronDown aria-hidden className={cn('transition-transform', isOpen && 'rotate-180')} />
            {rowContent}
          </>
        ),
      })}
      <div id={contentId} hidden={!isOpen} data-slot='menu-disclosure-content'>
        {isOpen ? children : null}
      </div>
    </div>
  );
};

/** Keeps the menu open: selecting the row toggles its content instead. */
const toggleOnSelect =
  (onToggle: () => void) =>
  (event: Event): void => {
    event.preventDefault();
    onToggle();
  };

export const DropdownMenuDisclosureItem = (properties: MenuDisclosureItemProperties): React.JSX.Element => (
  <MenuDisclosure
    {...properties}
    renderRow={({ onToggle, ...row }) => <DropdownMenuItem {...row} onSelect={toggleOnSelect(onToggle)} />}
  />
);

export const ContextMenuDisclosureItem = (properties: MenuDisclosureItemProperties): React.JSX.Element => (
  <MenuDisclosure
    {...properties}
    renderRow={({ onToggle, ...row }) => <ContextMenuItem {...row} onSelect={toggleOnSelect(onToggle)} />}
  />
);

/** For menus rendered in a plain popover (the viewer's), where rows are buttons with the menuitem role. */
export const MenuDisclosureItem = (properties: MenuDisclosureItemProperties): React.JSX.Element => (
  <MenuDisclosure
    {...properties}
    renderRow={({ onToggle, ...row }) => (
      <button
        type='button'
        role='menuitem'
        {...row}
        onPointerMove={(event) => {
          event.currentTarget.focus({ preventScroll: true });
        }}
        onClick={onToggle}
      />
    )}
  />
);
