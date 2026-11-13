import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import type { EditorDocument } from '#lib/editor-document.js';

/**
 * What an editor pane shows while it has no document yet: the editor's own background and a
 * screen-reader status. It draws nothing shaped like code, holds no timer and has no entrance
 * animation, so a pane never cycles through bars, text and a blank on its way in.
 *
 * @param props - The screen-reader label, and optional classes for the frame.
 * @returns The placeholder.
 */
export function EditorPanePlaceholder({
  label,
  className,
}: {
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <div
      role='status'
      aria-busy='true'
      data-slot='editor-pane-placeholder'
      className={cn('size-full overflow-hidden bg-background', className)}
    >
      <span className='sr-only'>{label}</span>
    </div>
  );
}

/**
 * Lines drawn before the editor mounts. A pane shows far fewer; CodeMirror draws its own viewport
 * once it mounts, so a long file costs no more than a screenful here.
 */
const textLineLimit = 200;
const lineBreak = /\r\n?|\n/u;

/* The metrics below mirror `code-editor-view.client.tsx`'s themes and CodeMirror's base theme, so
 * each line keeps its box when the editor replaces this text: the font, size and 1.5 line height of
 * `.cm-content`, the `.cm-line` padding, the line-number gutter (at least 4ch, `--spacing` either
 * side, sized by the largest line number) and the fold gutter (one `›` marker, 1px either side). */
const gutterCell: React.CSSProperties = {
  boxSizing: 'border-box',
  minWidth: '4ch',
  height: '1.5em',
  padding: '0 var(--spacing)',
  lineHeight: 1.4,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};
const linePadding: React.CSSProperties = { padding: '0 2px 0 6px' };

/**
 * The file's own text in the box and metrics of the editor that will replace it, read-only, while
 * the editor runtime loads. It follows the document until then and never writes to it, so the
 * editor mounts on exactly the document's text with its undo history untouched.
 *
 * @param props - The document to show, the screen-reader label, whether the editor shows line
 *   numbers, and the classes the editor's own frame takes.
 * @returns The read-only text.
 */
export function EditorPaneText({
  document,
  label,
  hasLineNumbers = true,
  className,
}: {
  readonly document: EditorDocument;
  readonly label: string;
  readonly hasLineNumbers?: boolean;
  readonly className?: string;
}): React.JSX.Element {
  const subscribe = useCallback((onChange: () => void) => document.subscribe(onChange), [document]);
  const text = useSyncExternalStore(
    subscribe,
    () => document.text,
    () => document.text,
  );
  const isMobile = useIsMobile();
  const { lines, lineCount } = useMemo(() => {
    const all = text.split(lineBreak);
    return { lines: all.slice(0, textLineLimit), lineCount: all.length };
  }, [text]);
  return (
    <div
      data-slot='editor-pane-text'
      className={cn('size-full overflow-hidden bg-background text-foreground', className)}
      style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? '16px' : '14px' }}
    >
      <span role='status' aria-busy='true' className='sr-only'>
        {`${label}. The text is read-only until the editor opens.`}
      </span>
      <div className='flex h-full cursor-default items-start overflow-hidden'>
        <div aria-hidden='true' className='flex shrink-0 text-muted-foreground'>
          {hasLineNumbers ? (
            <div className='flex flex-col'>
              {lines.map((_, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- a line number is its own key
                <div key={index} style={gutterCell}>
                  {index + 1}
                </div>
              ))}
              {/* CodeMirror sizes the gutter by the largest line number, shown or not. */}
              <div className='invisible' style={{ ...gutterCell, height: 0 }}>
                {lineCount}
              </div>
            </div>
          ) : undefined}
          <div className='invisible' style={{ lineHeight: 1.4 }}>
            <span style={{ padding: '0 1px' }}>›</span>
          </div>
        </div>
        <div
          data-slot='editor-pane-text-content'
          className='min-w-0 grow'
          style={{ lineHeight: 1.5, whiteSpace: 'pre', tabSize: 2 }}
        >
          {lines.map((line, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- lines are positional and never reorder
            <div key={index} style={linePadding}>
              {line === '' ? <br /> : line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
