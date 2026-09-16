/**
 * A chat row's state glyph and the words that describe it (S46, D33).
 *
 * The canvas *Sidebar* page's Legend artboard is this file's contract: one
 * glyph per run state, never hue alone — a hollow ring, a spinner, a filled dot
 * carrying a numeral, a distinct question mark, an alert disc — and every one
 * of them `aria-hidden`, because the sentence a screen reader reads is the
 * visually hidden description, not the icon.
 *
 * The words those glyphs go with live in `use-sidebar-status.ts` beside the
 * selectors (R17): they are pure functions of `ChatSidebarStatus`, and the
 * Agents pane reads them without dragging a component module and its icon set
 * in with them.
 */

import { Circle, CircleAlert, CircleDot, CircleHelp, GitBranch } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { Loader } from '#components/ui/loader.js';
import type { ChatSidebarStatus } from '#hooks/use-sidebar-status.js';

/**
 * The glyph itself — decorative, and never the only channel.
 *
 * @param props - The chat's status and an optional class.
 * @returns The glyph, or nothing for a row with no state.
 * @public
 */
export function ChatStatusGlyph({
  status,
  className,
}: {
  readonly status: ChatSidebarStatus;
  readonly className?: string;
}): React.JSX.Element | undefined {
  const size = cn('size-3 shrink-0', className);
  switch (status.state) {
    case 'queued': {
      return <Circle aria-hidden data-glyph='queued' className={cn(size, 'text-muted-foreground')} />;
    }
    case 'working':
    case 'tool':
    case 'finishing': {
      return (
        <span data-glyph={status.state} className='flex shrink-0 text-information'>
          <Loader className={size} />
        </span>
      );
    }
    case 'reconnecting': {
      return (
        <span data-glyph='reconnecting' className='flex shrink-0 text-muted-foreground/60'>
          <Loader className={size} />
        </span>
      );
    }
    case 'approval': {
      return (
        <span data-glyph='approval' className={cn('flex shrink-0 items-center gap-0.5 text-warning', className)}>
          <CircleDot aria-hidden className='size-3' />
          <span aria-hidden className='text-xs leading-none font-medium tabular-nums'>
            {status.pendingApprovalCount}
          </span>
        </span>
      );
    }
    case 'question': {
      return <CircleHelp aria-hidden data-glyph='question' className={cn(size, 'text-warning')} />;
    }
    case 'done': {
      return status.unread ? (
        <CircleDot aria-hidden data-glyph='unread' className={cn(size, 'text-information')} />
      ) : undefined;
    }
    case 'failed': {
      return <CircleAlert aria-hidden data-glyph='failed' className={cn(size, 'text-destructive')} />;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * The branch chip, with the amber pip that means unsaved edits.
 *
 * It exists only off `main` (A29): a chat working on the line everything else
 * works on has nothing to say about branches.
 *
 * @param props - The branch and whether the tree is dirty.
 * @returns The chip, or nothing.
 * @public
 */
export function BranchChip({
  branch,
  isDirty,
}: {
  readonly branch: string | undefined;
  readonly isDirty: boolean;
}): React.JSX.Element | undefined {
  if (branch === undefined) {
    return undefined;
  }
  return (
    <span
      data-slot='branch-chip'
      data-glyph='branch'
      data-dirty={isDirty}
      className='flex min-w-0 shrink items-center gap-0.5 rounded-sm border border-border/60 px-1 text-xs text-muted-foreground'
    >
      <GitBranch aria-hidden className='size-2.5 shrink-0' />
      <span className='truncate'>{branch}</span>
      {isDirty ? (
        <span
          aria-hidden
          data-slot='dirty-pip'
          data-glyph='dirty'
          className='size-1 shrink-0 rounded-full bg-warning'
        />
      ) : null}
    </span>
  );
}
