import { useState, useSyncExternalStore } from 'react';
import type { Ref, UIEventHandler } from 'react';
import { WaitIndicator } from '@taucad/ui/components/wait-indicator';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { cn } from '@taucad/ui/utils/cn';

const subscribeToNothing = (): (() => void) => () => undefined;
const isClient = (): boolean => true;
const isServer = (): boolean => false;

/**
 * When a pane's wait started, on the performance timeline, for `WaitIndicator`'s `startedAt`. A pane in the
 * server-rendered document is part of the route open, whose clock starts at navigation (0). A pane that mounts on the
 * client is opened by a gesture, or by the workbench right after one, so its mount stands in for that moment; for a
 * pane the workbench mounts during the open this is later than navigation, so its indicator can show late but never
 * early. Read once, in the first render.
 *
 * @returns The wait's start. Milliseconds.
 */
export function useWaitStart(): number {
  const isOnClient = useSyncExternalStore(subscribeToNothing, isClient, isServer);
  const [startedAt] = useState(() => (isOnClient ? performance.now() : 0));
  return startedAt;
}

/**
 * What an editor pane shows until its editor can mount, in the editor's own place: the editor's background, and as
 * soon as the file is read, the file's own text, read-only, in the editor's font, size, line height and content padding,
 * beside gutters of the editor's widths. The editor then mounts over the same box with its first line where this one
 * was (loading states UX blueprint, P-i). It draws nothing that stands for text it does not have.
 *
 * The metrics follow `code-editor-view.client.tsx`: 14 px (16 px on a phone) at line height 1.5, a line-number gutter
 * at least 4ch wide with `var(--spacing)` either side, the fold gutter as wide as its closed marker plus 2 px, a
 * lint gutter of zero width, and CodeMirror's own 6 px and 2 px line padding.
 *
 * The busy state is on the pane for the whole wait. Past 1,000 ms without the text, "Opening file" shows in the
 * pane's top corner. That slot is not live: a pane that opens with the route is part of the route's one announcement,
 * and a pane opened later carries the tab's own selected state and the busy state; a live slot here would speak twice
 * at open.
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
  const startedAt = useWaitStart();
  const lineCount = text === undefined ? 0 : text.split(/\r\n?|\n/u).length;
  return (
    <div
      ref={ref}
      role='group'
      aria-label={label}
      aria-busy='true'
      data-slot='editor-pane-placeholder'
      className={cn('relative size-full overflow-hidden bg-background', className)}
    >
      {text === undefined ? null : (
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
              <div className='box-border min-w-[4ch] px-(--spacing) text-right whitespace-pre'>
                {Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')}
              </div>
            ) : null}
            {/* The fold gutter is as wide as its closed marker, which CodeMirror pads by 1 px each side. */}
            <span className='invisible px-px'>›</span>
          </div>
          <div
            data-slot='editor-pane-text'
            className='box-border min-h-full shrink-0 grow-[2] pr-[2px] pl-[6px] leading-[1.5] whitespace-pre [tab-size:2]'
          >
            {text}
          </div>
        </div>
      )}
      <div className='pointer-events-none absolute top-1 right-3'>
        <WaitIndicator
          active={text === undefined}
          label='Opening file'
          slowLabel='Still opening file'
          startedAt={startedAt}
          live={false}
        />
      </div>
    </div>
  );
}
