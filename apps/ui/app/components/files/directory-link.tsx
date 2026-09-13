import { useCallback } from 'react';
import { Slot as SlotPrimitive } from 'radix-ui';
import { useProject } from '#hooks/use-project.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { cn } from '#utils/ui.utils.js';

type DirectoryLinkProps = {
  readonly path: string;
  readonly className?: string;
  readonly children: React.ReactNode;
  /**
   * When true, merges props onto child element instead of rendering a
   * `<span>`. Consumers own the rendered element's semantics; the link only
   * forwards `onClick`/`className`.
   */
  readonly asChild?: boolean;
};

/**
 * Clickable link that reveals a directory in the editor file tree, expanding
 * every parent directory AND the directory itself, then focusing/scrolling it
 * into view.
 *
 * Sibling of {@link FileLink} (which routes to `openFile`) and
 * {@link ViewerLink} (which routes to `openInViewer`). The three components
 * intentionally stay separate because their downstream machine events have
 * fundamentally different semantics:
 *
 * - `FileLink` -> `openFile`: heavyweight, persisted, ref-counted; allocates
 *   an editor tab. The downstream `fileOpened` listener in
 *   `chat-editor-dockview.tsx` calls `setIsEditorOpen(true)` so the editor
 *   pane becomes visible on desktop.
 * - `ViewerLink` -> `openInViewer`: opens a 3D viewer pane.
 * - `DirectoryLink` -> `setPanelState { openPanels: { files: true } }` +
 *   `revealFileInTree { expandTarget: true }` on desktop; no-op on mobile.
 *   The pane-open side-effect mirrors `FileLink`'s editor-pane-open path so
 *   that clicking a folder row in a chat tool surfaces the tree expansion
 *   (otherwise the `files` Allotment pane is hidden by default and the
 *   `fileRevealRequested` emit lands on a non-visible pane). Mobile is a
 *   deliberate no-op because switching `mobileActiveTab` to `files` would
 *   yank the user away from the chat they are reading.
 *
 * The `expandTarget: true` flag is what distinguishes a directory reveal from
 * the file-reveal flow used by the editor tab context menu (which expands
 * parent directories only; it does not need to expand the file itself because
 * a file has no expandable children).
 *
 * Renders as a bare `<span>` with `role='button'`, `tabIndex={0}`, and an
 * `onKeyDown` handler so the link is focusable, keyboard-activatable
 * (Enter/Space), and announced as a button by screen readers — while still
 * being plain phrasing content that can sit inside any ancestor (including
 * `<button>` chat-tool triggers) without invalid-nesting fallout. See
 * {@link FileLink} for the full `<span>`-vs-`<button>`-vs-`<a>` rationale
 * (TL;DR: `<span>` is the only inline element that's both non-replaced — so
 * character-truncation works — AND non-interactive — so the parent
 * `<button>` chat-tool trigger doesn't hijack the click).
 *
 * @example <caption>basic usage — renders as an inline span with button semantics</caption>
 * ```tsx
 * <DirectoryLink path='src/utils'>src/utils</DirectoryLink>
 * ```
 *
 * @example <caption>asChild merges onto a styled wrapper</caption>
 * ```tsx
 * <DirectoryLink path='src/utils' asChild>
 *   <span className='custom-styles'>src/utils</span>
 * </DirectoryLink>
 * ```
 */
export function DirectoryLink({ path, className, children, asChild = false }: DirectoryLinkProps): React.JSX.Element {
  const project = useProject({ enableNoContext: true });
  const isMobile = useIsMobile();

  const activate = useCallback(() => {
    if (!project || isMobile) {
      return;
    }

    project.editorRef.send({
      type: 'setPanelState',
      panelState: { openPanels: { files: true } },
    });
    project.editorRef.send({
      type: 'revealFileInTree',
      path,
      expandTarget: true,
    });
  }, [project, isMobile, path]);

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
        // `asChild` merges onto a consumer element, the consumer owns display
        // semantics — Radix Slot concatenates classNames (no twMerge), so
        // forcing `inline` here would collide with the consumer's
        // `inline-flex`/`flex` and make layout dependent on Tailwind's CSS
        // source order. See {@link FileLink} for the full rationale.
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
