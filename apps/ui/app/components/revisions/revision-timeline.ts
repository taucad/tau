/**
 * The History timeline's geometry, shared by every row that sits on its columns
 * (canvas rounds 3–12): revisions, autosave folds, day dividers, Show more, and
 * Sync's remote and People rows.
 *
 * Each row is a two-column grid: a 1rem gutter that draws the line as two
 * segments around the row's marker, then the row's content. The gutter sits
 * 8 px in from the hover fill's edge, as the chevron sits 8 px from the right,
 * and rows sit 2 px apart with each segment reaching up across that gap, so the
 * line never breaks and two fills never touch.
 */
import { cn } from '@taucad/ui/utils/cn';

/** One timeline list: rows 2 px apart, as sidebar items are. */
export const timelineList = 'flex list-none flex-col gap-0.5';

/** A row's grid: the markers' column, then the content. */
export const timelineRow = 'grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1 pl-2';

/** A row that is itself the disclosure: the whole row, gutter and marker included, is the button. */
export const timelineRowButton = cn(
  timelineRow,
  'group/row min-h-6 w-full min-w-0 cursor-action rounded-md text-left transition-colors focus-visible:focus-outline motion-reduce:transition-none',
);

/** A closed row's hover fill; an open revision is one continuous fill instead. */
export const timelineRowHover = 'hover:bg-accent/50';

/** The content column: title and facts, then the trailing cluster. */
export const timelineRowContent = 'flex min-w-0 items-start gap-2 py-1 pr-2 pl-1';

/* A fold's segments are dashed, 2 px every 4 px, drawn as a gradient: a 1 px
   dashed border reads as solid over 6 px because Chromium stretches the dash.
   Written out whole, because Tailwind only generates classes it can read. */

/**
 * The gutter around a row's marker: a segment above it, reaching up across the
 * 2 px gap, and one below it.
 *
 * @param segments - Which segments to draw, and whether they are dashed.
 * @returns The gutter's classes.
 */
export const timelineGutter = ({
  hasTop = true,
  hasBottom = true,
  isDashed = false,
}: Readonly<{ hasTop?: boolean; hasBottom?: boolean; isDashed?: boolean }>): string =>
  cn(
    'relative flex justify-center',
    hasTop && 'before:absolute before:-top-0.5 before:h-2 before:w-px',
    hasTop &&
      (isDashed
        ? 'before:bg-[repeating-linear-gradient(to_bottom,var(--color-border)_0_2px,transparent_2px_4px)]'
        : 'before:bg-border'),
    hasBottom && 'after:absolute after:top-5.5 after:bottom-0 after:w-px',
    hasBottom &&
      (isDashed
        ? 'after:bg-[repeating-linear-gradient(to_bottom,var(--color-border)_0_2px,transparent_2px_4px)]'
        : 'after:bg-border'),
  );

/** Show more's gutter: the rest of the line, compressed, so dashed like a fold. */
export const timelineMoreGutter =
  'relative flex justify-center before:absolute before:-top-0.5 before:h-3.5 before:w-px before:bg-[repeating-linear-gradient(to_bottom,var(--color-border)_0_2px,transparent_2px_4px)]';

/**
 * What a revision opens sits beside a continuation of the line and starts where
 * the row's title starts.
 *
 * @param hasLine - Whether the line continues past this row.
 * @returns The block's classes.
 */
export const timelineOpenBlock = (hasLine: boolean): string =>
  cn(
    'relative pr-2 pl-8',
    hasLine && 'before:absolute before:inset-y-0 before:left-[15.5px] before:w-px before:bg-border',
  );

/** Where a row's marker sits: centred on the title's first line. */
export const timelineMarker = 'relative mt-1.5 flex size-4 items-center justify-center';
