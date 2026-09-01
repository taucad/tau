import { useCallback } from 'react';
import { Slot as SlotPrimitive } from 'radix-ui';
import { useProject } from '#hooks/use-project.js';
import { cn } from '@taucad/ui/utils/cn';

type FileLinkProps = {
  readonly path: string;
  readonly lineNumber?: number;
  readonly column?: number;
  readonly className?: string;
  readonly children: React.ReactNode;
  /**
   * When true, merges props onto child element instead of rendering a
   * `<span>`. Consumers own the rendered element's semantics (e.g. a chip
   * `<span>`); the link only forwards `onClick`/`className`.
   */
  readonly asChild?: boolean;
};

/**
 * Clickable link that opens a file in the editor.
 *
 * Renders as a bare `<span>` with `role='button'`, `tabIndex={0}`, and an
 * `onKeyDown` handler so the link is focusable, keyboard-activatable
 * (Enter/Space), and announced as a button by screen readers — while still
 * being plain phrasing content that can sit inside any ancestor (including
 * `<button>` chat-tool triggers) without invalid-nesting fallout.
 *
 * **Why `<span>` and not `<button>` or `<a>`?**
 * - `<button>` is rendered by browsers as an atomic inline-level box (CSS 2.1
 *   §9.2.2 — its internal anonymous boxes establish their own formatting
 *   context). Setting `display: inline` on a `<button>` still behaves as
 *   `inline-block`, so an ancestor's `text-overflow: ellipsis` cannot
 *   character-clip through the button's text — the entire button gets dropped
 *   wholesale, never `failed to compile main.kc…`.
 * - `<a>` is a true non-replaced inline element (text-truncation works), but
 *   in the chat-tool title row the link sits inside the `<button>` rendered by
 *   `CollapsibleTrigger asChild → Button` (see `chat-tool-card.tsx`). HTML5
 *   classifies anchors as **interactive content**, which is forbidden inside
 *   a `<button>` — browsers then hijack pointer/click activation up to the
 *   ancestor button so the inner anchor's `onClick` no longer fires
 *   (clicking the filename toggled the collapsible instead of opening the
 *   file).
 * - `<span>` is a non-replaced inline element AND is plain phrasing content
 *   (NOT interactive content), so it satisfies both constraints: its text
 *   joins the parent inline-formatting context (character-truncatable) and
 *   the browser delivers click events to it normally even inside a `<button>`
 *   ancestor.
 *
 * @example <caption>basic usage — renders as an inline span with button semantics</caption>
 * ```tsx
 * <FileLink path='main.kcl' lineNumber={10}>main.kcl:10</FileLink>
 * ```
 *
 * @example <caption>asChild merges onto a styled wrapper</caption>
 * ```tsx
 * <FileLink path='main.kcl' asChild>
 *   <span className='custom-styles'>main.kcl</span>
 * </FileLink>
 * ```
 */
export function FileLink({
  path,
  lineNumber,
  column,
  className,
  children,
  asChild = false,
}: FileLinkProps): React.JSX.Element {
  const project = useProject({ enableNoContext: true });

  const activate = useCallback(() => {
    if (!project) {
      return;
    }

    project.editorRef.send({
      type: 'openFile',
      path,
      source: 'user',
      lineNumber: lineNumber ?? 1,
      column: column ?? 1,
    });
  }, [project, path, lineNumber, column]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      activate();
    },
    [activate],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        activate();
      }
    },
    [activate],
  );

  const Component = asChild ? SlotPrimitive.Slot : 'span';

  return (
    <Component
      {...(asChild ? {} : { role: 'button', tabIndex: 0, onKeyDown: handleKeyDown })}
      className={cn(
        // `inline` is only applied to the standalone `<span>` (non-asChild)
        // case to pin its display in case a parent stylesheet flips it. When
        // `asChild` merges onto a consumer element (e.g. a chip span with
        // `inline-flex`, or a chat-message-tool flex chip wrapper), the
        // consumer owns display semantics — Radix Slot concatenates classNames
        // (no twMerge), so forcing `inline` here would collide with the
        // consumer's `inline-flex`/`flex` and make layout dependent on
        // Tailwind's CSS source order.
        !asChild && 'inline',
        'cursor-pointer decoration-current underline-offset-2 hover:text-foreground hover:underline',
        className,
      )}
      onClick={handleClick}
    >
      {children}
    </Component>
  );
}
