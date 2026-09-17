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

import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { cn } from '@taucad/ui/utils/cn';
import { Loader } from '#components/ui/loader.js';
import { warmMonaco } from '#lib/monaco-warmup.js';

/*
 * `--fade-scrim-into` follows the row's own background, so the actions' scrim
 * matches it at rest (coarse pointers) and on hover, focus and active.
 */
const rowClass =
  'group/row fade-row flex h-7 w-full min-w-0 items-center gap-1 rounded-md pr-0.5 pl-0.5 text-sm text-sidebar-foreground transition-colors [--fade-scrim-into:var(--sidebar-background)] focus-within:bg-sidebar-accent focus-within:[--fade-scrim-into:var(--sidebar-accent)] hover:bg-sidebar-accent hover:[--fade-scrim-into:var(--sidebar-accent)] data-[active=true]:bg-sidebar-accent data-[active=true]:[--fade-scrim-into:var(--sidebar-accent)] pointer-coarse:[--fade-label-size:var(--fade-label-size-actions)]';

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
  return (
    <span className='fade-action absolute inset-y-0 right-0.5 hidden items-center rounded-r-md bg-(--fade-scrim-into) group-focus-within/row:flex group-hover/row:flex pointer-coarse:flex'>
      {children}
    </span>
  );
}

/**
 * The row's name link, with its sentence one hover or focus away (D1).
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
      {isPending ? <Loader className='mr-1.5 size-3.5 shrink-0' /> : null}
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
