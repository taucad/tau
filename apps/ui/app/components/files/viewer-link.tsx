import { useCallback } from 'react';
import { Box } from 'lucide-react';
import { Slot as SlotPrimitive } from 'radix-ui';
import { useProject } from '#hooks/use-project.js';
import { cn } from '#utils/ui.utils.js';

type ViewerLinkProps = {
  readonly path: string;
  readonly className?: string;
  readonly children: React.ReactNode;
  /**
   * When true, merges props onto child element instead of rendering a
   * `<span>`. Consumers own the rendered element's semantics; the link only
   * forwards `onClick`/`className` and auto-injects the cube icon as the first
   * child of the consumer's element via `SlotPrimitive.Slottable` (so the
   * "viewer link = cube" visual contract cannot be skipped or duplicated).
   */
  readonly asChild?: boolean;
};

/**
 * Clickable link that opens a file in a new viewer pane.
 *
 * Internalizes the project state machine event emission for opening files in
 * the 3D viewer. Mirrors {@link FileLink} but routes through `openInViewer` so
 * binary geometry artifacts (GLB, STEP, etc.) render in the viewer rather than
 * the editor.
 *
 * Renders as a bare `<span>` with `role='button'`, `tabIndex={0}`, and an
 * `onKeyDown` handler so the link is focusable, keyboard-activatable
 * (Enter/Space), and announced as a button by screen readers — while still
 * being plain phrasing content that can sit inside any ancestor (including
 * `<button>` chat-tool triggers) without invalid-nesting fallout. See
 * {@link FileLink} for the architectural rationale (TL;DR: `<span>` is the
 * only inline element that's both non-replaced — so character-truncation
 * works — AND non-interactive — so the parent `<button>` chat-tool trigger
 * doesn't hijack the click).
 *
 * **Cube icon is built-in.** Every `ViewerLink` prepends a `lucide-react`
 * `Box` glyph so viewer links self-identify against extension-iconed
 * `FileLink`s in the same chat-tool surfaces. Two design choices preserve the
 * existing truncation contract:
 *
 * 1. The `Box` is rendered as an **inline `<svg>`** (`inline-block` +
 *    `align-text-bottom`), NOT inside a `flex` chip. The wrapper stays
 *    `inline`, so the link still participates in the parent's inline
 *    formatting context and `text-overflow: ellipsis` on the chat-tool title
 *    row (`ChatToolDescription` / `ChatToolCardTitle`) can character-clip
 *    *through* the filename text (e.g. `Failed to compile main.sc…`). If we
 *    switched the wrapper to `inline-flex`, the link would become an atomic
 *    flex chip and the entire filename would drop wholesale — exactly the bug
 *    the prior truncation work fixed.
 * 2. For `asChild`, the `Box` is injected **into** the consumer's element via
 *    `SlotPrimitive.Slottable`. Slot finds the `<Slottable>` among ViewerLink's
 *    rendered children, treats its children as the consumer's element, and
 *    splices the other (non-Slottable) children into the consumer's element as
 *    siblings of the consumer's original content. Net effect: an `asChild`
 *    consumer does not need to render its own `<Box />` and cannot duplicate
 *    the icon accidentally.
 *
 * @example <caption>basic usage — renders as an inline span with cube + button semantics</caption>
 * ```tsx
 * <ViewerLink path='.tau/artifacts/tc-1__main.glb'>.tau/artifacts/tc-1__main.glb</ViewerLink>
 * ```
 *
 * @example <caption>asChild merges onto a styled chip — cube auto-injected</caption>
 * ```tsx
 * <ViewerLink asChild path='.tau/artifacts/tc-1__main.glb'>
 *   <div className='flex items-center gap-1.5 rounded-md border px-2 py-1'>
 *     <span className='min-w-0 truncate'>tc-1__main.glb</span>
 *   </div>
 * </ViewerLink>
 * ```
 */
export function ViewerLink({ path, className, children, asChild = false }: ViewerLinkProps): React.JSX.Element {
  const project = useProject({ enableNoContext: true });

  const activate = useCallback(() => {
    if (!project) {
      return;
    }

    project.projectRef.send({ type: 'openInViewer', entryPath: path });
  }, [project, path]);

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
        // case. When `asChild` merges onto a consumer element (e.g. a chip
        // wrapper with `inline-flex`, or the artifact-badge `<div>` with
        // `flex`), the consumer owns display semantics — Radix Slot
        // concatenates classNames (no twMerge), so forcing `inline` here
        // would collide with the consumer's flex display and make layout
        // dependent on Tailwind's CSS source order. See {@link FileLink} for
        // the full rationale.
        !asChild && 'inline',
        'cursor-pointer decoration-current underline-offset-2 hover:text-foreground hover:underline',
        className,
      )}
      onClick={handleClick}
    >
      {/* Inline-svg cube — see component JSDoc for why this stays out of the */}
      {/* flex chip world. `align-middle` aligns the SVG's vertical centre to */}
      {/* the parent text's x-height midpoint, then `relative -top-px` lifts */}
      {/* the icon 1px to compensate for the cube glyph's bottom-heavy mass */}
      {/* (the front face occupies the lower half of the 24x24 viewBox), */}
      {/* which otherwise reads visually low against the lowercase letters. */}
      {/* The shift uses `position: relative` (not negative margin) so the */}
      {/* line box stays the same height — protecting the surrounding text */}
      {/* run from off-by-one wrapping shifts. `align-text-bottom` (the */}
      {/* original attempt) parked the icon's bottom on the baseline and */}
      {/* sagged below the text. */}
      <Box aria-hidden className='relative -top-px mr-1 inline-block size-3 shrink-0 align-middle' />
      <SlotPrimitive.Slottable>{children}</SlotPrimitive.Slottable>
    </Component>
  );
}
