/**
 * A project row's liveness glyph and the words that describe it (S46, D33).
 *
 * The project row is an aggregate of its chats plus its session: a spinner
 * while any chat runs, an amber count while any needs a person, a red disc for
 * a session child that failed to open or an unread failed run, a solid dot when
 * live and idle, and nothing at all when closed. The count is a numeral, the
 * discs differ in shape, and the sentence below carries all of it — so no state
 * here is a hue (DESIGN.md, colour policy §189).
 */

import { Circle, CircleAlert, CircleDot, CloudUpload } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { Loader } from '#components/ui/loader.js';
import { pluralize } from '#hooks/use-sidebar-status.js';
import type { ProjectSidebarRow } from '#hooks/use-sidebar-status.js';

const livenessPhrase = (row: ProjectSidebarRow): string => {
  switch (row.glyph) {
    case 'none': {
      return 'closed';
    }
    case 'opening': {
      return 'opening';
    }
    case 'failed': {
      return 'failed';
    }
    case 'busy': {
      return 'live, busy';
    }
    default: {
      return 'live';
    }
  }
};

const syncPhrases = (row: ProjectSidebarRow): readonly string[] => {
  if (row.glyph === 'none' || row.sync === undefined) {
    return [];
  }
  if (row.sync === 'conflicted') {
    return ['needs resolution'];
  }
  if (row.sync === 'pending') {
    return ['backing up', `${pluralize(row.pending, 'revision')} pending`];
  }
  return row.sync === 'queued' || row.sync === 'failed'
    ? ['not backed up', `${pluralize(row.pending, 'revision')} pending`]
    : [];
};

/**
 * The sentence a screen reader reads for a project row.
 *
 * @param name - The project's name, which the row shows anyway.
 * @param row - That project's aggregated row.
 * @returns The `aria-describedby` text.
 * @public
 */
export const projectRowDescription = (name: string, row: ProjectSidebarRow): string =>
  `${[
    name,
    livenessPhrase(row),
    ...(row.attention > 0 ? [`${String(row.attention)} need${row.attention === 1 ? 's' : ''} you`] : []),
    ...syncPhrases(row),
    ...(row.branch === undefined ? [] : [`on branch ${row.branch}`]),
    ...(row.dirty ? ['unsaved edits'] : []),
  ].join(', ')}.`;

/**
 * The glyph itself — decorative, and never the only channel.
 *
 * @param props - The project's aggregated row and an optional class.
 * @returns The glyph, or nothing for a closed project.
 * @public
 */
export function LivenessGlyph({
  row,
  className,
}: {
  readonly row: ProjectSidebarRow;
  readonly className?: string;
}): React.JSX.Element | undefined {
  const size = cn('size-3 shrink-0', className);
  /* The amber count outranks the spinner: a project that is both running and
   * waiting for a person is, to the person, waiting for them. */
  if (row.attention > 0) {
    return (
      <span data-glyph='attention' className={cn('flex shrink-0 items-center gap-0.5 text-warning', className)}>
        <CircleDot aria-hidden className='size-3' />
        <span aria-hidden className='text-xs leading-none font-medium tabular-nums'>
          {row.attention}
        </span>
      </span>
    );
  }
  switch (row.glyph) {
    case 'failed': {
      return <CircleAlert aria-hidden data-glyph='failed' className={cn(size, 'text-destructive')} />;
    }
    case 'opening': {
      /* R15: `opening` and `busy` used to be the same spinner in two hues, and
       * a project row shows no text for either. The ring is the queued chat's
       * shape and means the same thing here — admitted, not yet working. */
      return <Circle aria-hidden data-glyph='opening' className={cn(size, 'text-muted-foreground')} />;
    }
    case 'busy': {
      return (
        <span data-glyph='busy' className='flex shrink-0 text-information'>
          <Loader className={size} />
        </span>
      );
    }
    case 'idle': {
      return (
        <Circle
          aria-hidden
          data-glyph='idle'
          className={cn('size-2 shrink-0 fill-current text-muted-foreground', className)}
        />
      );
    }
    default: {
      return undefined;
    }
  }
}

/**
 * The project row's sync facet, shown only while sync needs to say something.
 *
 * @param props - The project's aggregated row.
 * @returns The cloud-up or conflict glyph, or nothing for a settled/no-remote row.
 * @public
 */
export function ProjectSyncGlyph({ row }: { readonly row: ProjectSidebarRow }): React.JSX.Element | undefined {
  const size = 'size-3 shrink-0';
  switch (row.sync) {
    case 'pending': {
      return <CloudUpload aria-hidden data-glyph='sync-pending' className={`${size} text-information`} />;
    }
    case 'queued':
    case 'failed': {
      return <CloudUpload aria-hidden data-glyph={`sync-${row.sync}`} className={`${size} text-muted-foreground`} />;
    }
    case 'conflicted': {
      return <CircleAlert aria-hidden data-glyph='sync-conflicted' className={`${size} text-warning`} />;
    }
    default: {
      return undefined;
    }
  }
}
