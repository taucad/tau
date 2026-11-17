import { useMemo } from 'react';
import type { Ref, UIEventHandler } from 'react';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { cn } from '@taucad/ui/utils/cn';

/* Ragged code-shaped line lengths, as fractions of the pane. */
const skeletonLineWidths = ['42%', '68%', '55%', '30%', '0%', '61%', '74%', '48%', '36%', '0%', '58%', '44%'] as const;

/**
 * What an editor pane shows until its editor can mount, in the editor's own place: skeleton lines on the editor's
 * background until the file is read, then the file's own text, read-only, in the editor's font, size, line height and
 * content padding, beside gutters of the editor's widths. The editor then mounts over the same box with its first line
 * where this one was.
 *
 * The metrics follow `code-editor-view.client.tsx`: 14 px (16 px on a phone) at line height 1.5, a line-number gutter
 * at least 4ch wide with `var(--spacing)` either side, the fold gutter as wide as its closed marker plus 2 px, a
 * lint gutter 1em wide, and CodeMirror's own 6 px and 2 px line padding.
 *
 * The busy state is on the pane for the whole wait. The wait's words ("Opening file") belong to the pane that hosts
 * this placeholder, which outlives it (the workbench's `FileEditor`): this node is replaced when the editor mounts, so
 * an indicator here would lose its minimum and restart its clock.
 *
 * @param props - The pane's accessible name, the file's text once read, whether the editor shows line numbers, a
 *   scroll handler that hands the position to the editor, and the frame's classes and ref.
 * @returns The placeholder.
 */
export function EditorPanePlaceholder({
  label,
  text,
  hasLineNumbers = true,
  className,
  onScroll,
  ref,
}: {
  readonly label: string;
  /** The file's text, once read. */
  readonly text?: string;
  readonly hasLineNumbers?: boolean;
  readonly className?: string;
  readonly onScroll?: UIEventHandler<HTMLDivElement>;
  readonly ref?: Ref<HTMLDivElement>;
}): React.JSX.Element {
  const isMobile = useIsMobile();
  /* One pass over the text per text, not per render: the pane re-renders while it waits. */
  const lineNumbers = useMemo(() => {
    if (text === undefined) {
      return '';
    }
    const lineCount = text.split(/\r\n?|\n/u).length;
    return Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
  }, [text]);
  return (
    <div
      ref={ref}
      role='group'
      aria-label={label}
      aria-busy='true'
      data-slot='editor-pane-placeholder'
      className={cn('relative size-full overflow-hidden bg-background', className)}
    >
      {text === undefined ? (
        /* Before the file is read: faint code-shaped lines where the text will be. */
        <div aria-hidden='true' data-testid='editor-pane-skeleton' className='flex flex-col gap-2 py-1.5 pr-6 pl-16'>
          {skeletonLineWidths.map((width, index) => (
            <Skeleton
              // oxlint-disable-next-line react/no-array-index-key -- static decorative list
              key={index}
              className={cn('h-3 shrink-0 rounded-sm', width === '0%' && 'invisible')}
              style={{ width }}
            />
          ))}
        </div>
      ) : (
        <div
          data-slot='editor-pane-scroller'
          className={cn(
            'flex size-full items-start overflow-auto font-mono leading-[1.4] text-foreground [overflow-anchor:none]',
            isMobile ? 'text-[16px]' : 'text-[14px]',
          )}
          onScroll={onScroll}
        >
          <div
            aria-hidden='true'
            className='sticky left-0 z-10 flex min-h-full shrink-0 bg-background leading-[1.5] text-muted-foreground select-none'
          >
            {hasLineNumbers ? (
              /* CodeMirror sizes this gutter to the widest line number, as here: digits are one width in a mono font. */
              <div className='box-border min-w-[4ch] px-(--spacing) text-right whitespace-pre'>{lineNumbers}</div>
            ) : null}
            {/* The fold gutter is as wide as its closed marker, which CodeMirror pads by 1 px each side. */}
            <span className='invisible px-px'>›</span>
            {/* The lint gutter, 1em wide whether or not it holds a marker. */}
            <span className='w-[1em] shrink-0' />
          </div>
          <div
            data-slot='editor-pane-text'
            className='box-border min-h-full shrink-0 grow-[2] pr-[2px] pl-[6px] leading-[1.5] whitespace-pre [tab-size:2]'
          >
            {text}
          </div>
        </div>
      )}
    </div>
  );
}
