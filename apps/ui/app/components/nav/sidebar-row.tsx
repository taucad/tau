/**
 * The one-line sidebar row both projects and chats are built from (sidebar v2
 * D1, D7, D13, D15, D17).
 *
 * - The name runs to the row's edge and dissolves there (`fade-row`,
 *   `fade-label`, `fade-action` — the shared owner in `@taucad/ui` tokens).
 * - The actions sit absolutely over the dissolved tail, so revealing them never
 *   moves the name; fine pointers see them on hover or focus, coarse pointers
 *   always (I3).
 * - The row's sentence is its link's tooltip and `aria-describedby` text.
 * - A row being renamed carries the focus outline; the field inside draws none.
 */

import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { CircleAlert, EllipsisVertical } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@taucad/ui/components/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { cn } from '@taucad/ui/utils/cn';
import { warmMonaco } from '#lib/monaco-warmup.js';

/*
 * `--fade-scrim-into` follows the row's own background, so the actions' scrim
 * matches it at rest (coarse pointers) and on hover, focus and active. An open
 * menu keeps the row lit: the actions menu through its trigger, the context
 * menu through the row's own `data-state`.
 */
const rowClass =
  'group/row fade-row flex h-7 w-full min-w-0 items-center gap-1 rounded-md pr-0.5 pl-0.5 text-sm text-sidebar-foreground [--fade-scrim-into:var(--sidebar-background)] focus-within:bg-sidebar-accent focus-within:[--fade-scrim-into:var(--sidebar-accent)] hover:bg-sidebar-accent hover:[--fade-scrim-into:var(--sidebar-accent)] data-[active=true]:bg-sidebar-accent data-[active=true]:[--fade-scrim-into:var(--sidebar-accent)] has-[[aria-haspopup=menu][data-state=open]]:bg-sidebar-accent has-[[aria-haspopup=menu][data-state=open]]:[--fade-scrim-into:var(--sidebar-accent)] data-[state=open]:bg-sidebar-accent data-[state=open]:[--fade-scrim-into:var(--sidebar-accent)] pointer-coarse:[--fade-label-size:var(--fade-label-size-actions)]';

/**
 * The row's class. Renaming moves the focus outline onto the row (D17): the
 * editor owns focus while it is mounted, and a field the editor focuses itself
 * does not reliably report `:focus-visible`.
 *
 * @param isEditing - Whether the row's name is being edited.
 * @returns The row's class.
 * @public
 */
export const sidebarRowClass = (isEditing: boolean): string => cn(rowClass, isEditing && 'focus-outline');

/** The inline editor inside a renamed row: no Save button, no outline of its own. @public */
export const sidebarRowEditorClass =
  'h-7 min-w-0 flex-1 [&_[data-slot=input]]:h-7 [&_[data-slot=input]]:focus-visible:outline-none [&_[data-slot=save-button]]:hidden';

/** A 24 px icon control inside a row. @public */
export const sidebarRowButtonClass = nestedActionVariants({ className: 'size-6 shrink-0 text-muted-foreground' });

/**
 * The actions slot, over the dissolved tail of the name (D13, D15).
 *
 * @param props - The row's controls.
 * @returns The slot.
 * @public
 */
export function SidebarRowActions({ children }: { readonly children: ReactNode }): React.JSX.Element {
  /* An action is not the row: its clicks — and those of a menu it opens, which
   * bubble back through the portal — never select, open or rename the row. */
  const stop = (event: React.SyntheticEvent): void => {
    event.stopPropagation();
  };
  return (
    /* An open menu moves focus into its portal and the pointer off the row; the
     * slot stays shown so the menu keeps an anchor instead of jumping to (0,0). */
    <span
      data-slot='row-actions'
      className='fade-action absolute inset-y-0 right-0.5 hidden items-center rounded-r-md bg-(--fade-scrim-into) group-focus-within/row:flex group-hover/row:flex has-[[aria-haspopup=menu][data-state=open]]:flex pointer-coarse:flex'
      onClick={stop}
      onDoubleClick={stop}
    >
      {children}
    </span>
  );
}

type SidebarRowMenuItemProps = Pick<
  ComponentProps<typeof DropdownMenuItem>,
  'aria-label' | 'children' | 'disabled' | 'onSelect' | 'variant'
>;

/** The menu parts a row's items are written against, so one list serves both menus. @public */
export type SidebarRowMenuParts = {
  readonly Item: ComponentType<SidebarRowMenuItemProps>;
  readonly Separator: ComponentType;
};

/** A row's menu items, rendered into the actions menu and the context menu alike. @public */
export type SidebarRowMenuItems = (parts: SidebarRowMenuParts) => ReactNode;

const dropdownParts: SidebarRowMenuParts = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator };
const contextParts: SidebarRowMenuParts = { Item: ContextMenuItem, Separator: ContextMenuSeparator };

/**
 * The row's menu, on right-click (or long press) anywhere on the row as well as
 * on its actions button — the file tree's two ways in.
 *
 * @param props - The row, its items, and whether the menu is available.
 * @returns The row, wrapped.
 * @public
 */
export function SidebarRowContextMenu({
  items,
  isDisabled,
  className,
  children,
}: {
  readonly items: SidebarRowMenuItems;
  /** A row being renamed keeps the field's own context menu. */
  readonly isDisabled: boolean;
  readonly className: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={isDisabled}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className={className}>{items(contextParts)}</ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The row's actions button and its menu.
 *
 * @param props - The row's name, its items, and where the menu opens.
 * @returns The button and its menu.
 * @public
 */
export function SidebarRowMenuButton({
  name,
  items,
  className,
  side = 'right',
  align = 'start',
}: {
  readonly name: string;
  readonly items: SidebarRowMenuItems;
  readonly className: string;
  readonly side?: ComponentProps<typeof DropdownMenuContent>['side'];
  readonly align?: ComponentProps<typeof DropdownMenuContent>['align'];
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={sidebarRowButtonClass}
          aria-label={`More actions for ${name}`}
        >
          <EllipsisVertical aria-hidden className='size-3.5' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className={className}>
        {items(dropdownParts)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The row's name link, with its sentence one hover or focus away (D1).
 *
 * A pending route only sets `aria-busy` here; its spinner belongs to the row's
 * status slot (`StatusMark`), so loading never moves the name.
 *
 * @param props - The link's target and state, the name, and the sentence.
 * @returns The link, its tooltip and its description.
 * @public
 */
export function SidebarRowLink({
  to,
  name,
  sentence,
  descriptionId,
  isActive,
  isPending,
  onClick,
}: {
  readonly to: string;
  readonly name: string;
  readonly sentence: string | undefined;
  readonly descriptionId: string;
  readonly isActive: boolean;
  readonly isPending: boolean;
  readonly onClick?: () => void;
}): React.JSX.Element {
  const link = (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      aria-busy={isPending}
      aria-describedby={sentence === undefined ? undefined : descriptionId}
      className='flex h-full min-w-0 flex-1 items-center rounded-sm outline-hidden focus-visible:focus-outline'
      /* Every row opens a project route, whose editors need Monaco: start it on intent. */
      onPointerEnter={warmMonaco}
      onPointerDown={warmMonaco}
      onFocus={warmMonaco}
      onClick={onClick}
    >
      <span className='fade-label flex-1'>{name}</span>
    </Link>
  );
  if (sentence === undefined) {
    return link;
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side='right'>{sentence}</TooltipContent>
      </Tooltip>
      <span id={descriptionId} className='sr-only'>
        {sentence}
      </span>
    </>
  );
}

/**
 * A list that failed to load with nothing to show (D6, D18).
 *
 * No control: the query has already retried, and tries again when the window
 * regains focus or the files it reads change. A failed *run* is retried from
 * the chat, where `continueChat` owns it.
 *
 * @param props - What failed to load.
 * @returns The row's content.
 * @public
 */
export function SidebarFailureRow({ what }: { readonly what: string }): React.JSX.Element {
  return (
    <div
      data-slot='failure-row'
      className='flex h-7 w-full min-w-0 items-center gap-1 pr-0.5 pl-0.5 text-sm text-muted-foreground'
    >
      <span className='flex size-6 shrink-0 items-center justify-center'>
        <CircleAlert aria-hidden className='size-3.5 shrink-0 text-feature' />
      </span>
      <span className='fade-label flex-1'>{`Couldn't load ${what}`}</span>
      <span className='sr-only'>Tau tries again when you return to this window.</span>
    </div>
  );
}

/**
 * One loading row: a bar where the name will be.
 *
 * @returns The row's content.
 * @public
 */
export function SidebarRowSkeleton(): React.JSX.Element {
  return (
    <div className='flex h-7 items-center pr-2 pl-7.5'>
      <Skeleton className='h-3.5 flex-1' />
    </div>
  );
}
