import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { ContextMenuItem } from '@taucad/ui/components/context-menu';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';
import { cn } from '@taucad/ui/utils/cn';

export type MenuDisclosureItemProperties = {
  /** The row's label. */
  readonly label: React.ReactNode;
  /** A second line under the label, as Matcap's or Post-processing's, summarising what the disclosure holds. */
  readonly description?: React.ReactNode;
  /** The row's glyph, in the menu's icon column. Disclosed content still starts at the menu's left edge. */
  readonly icon?: React.ReactNode;
  /** Right-aligned content that previews what the disclosure holds, before the chevron. */
  readonly trailing?: React.ReactNode;
  /** Revealed under the row when it is expanded; without it the row is a plain label. */
  readonly children?: React.ReactNode;
  /** Whether the content starts revealed. Disclosures default to closed: they hold what most people never need. */
  readonly isDefaultOpen?: boolean;
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
 * A menu row that discloses content beneath it, for progressive disclosure inside menus: the row is a menu item
 * (arrow keys reach it, Enter or Space toggles it) that never closes the menu. Its chevron points down and sits in the
 * menu's right-hand control column, where switches and values end, and turns over while the content shows; a
 * flyout submenu keeps the right-pointing chevron.
 */
const MenuDisclosure = ({
  label,
  description,
  icon,
  trailing,
  children,
  isDefaultOpen = false,
  className,
  renderRow,
}: MenuDisclosureItemProperties & { readonly renderRow: RowRenderer }): React.JSX.Element => {
  const [isOpen, setIsOpen] = React.useState(isDefaultOpen);
  const contentId = React.useId();
  const rowClassName = cn(menuItemVariants(), 'w-full text-left', description !== undefined && 'h-10', className);
  const rowContent = (
    <>
      {icon}
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='truncate text-foreground'>{label}</span>
        {description === undefined ? null : (
          <span className='truncate text-xs font-medium text-muted-foreground/80'>{description}</span>
        )}
      </span>
      {trailing}
    </>
  );

  if (children === undefined) {
    return (
      <div data-slot='menu-disclosure-item' className={cn(rowClassName, 'hover:bg-transparent')}>
        {rowContent}
      </div>
    );
  }

  return (
    <div data-slot='menu-disclosure-item' data-state={isOpen ? 'open' : 'closed'}>
      {renderRow({
        // The chevron ends where a switch row's switch ends.
        className: cn(rowClassName, 'pr-2'),
        'aria-expanded': isOpen,
        'aria-controls': contentId,
        onToggle: () => {
          setIsOpen((previous) => !previous);
        },
        children: (
          <>
            {rowContent}
            <ChevronDown aria-hidden className={cn('motion-safe:transition-transform', isOpen && 'rotate-180')} />
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
