import { X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { cn } from '@taucad/ui/utils/cn';

/**
 * Props for {@link WorkbenchTab}.
 *
 * @public
 */
export type WorkbenchTabProps = Readonly<{
  /** The glyph before the title, such as a pane's registry icon or the viewer's cube, drawn by the host at 12–14 px. */
  icon: React.ReactNode;
  /** The visible title, such as a pane's name or a file's basename. */
  title: string;
  /** The tooltip and accessible name, such as the file's path; the title when absent. */
  fullTitle?: string;
  /**
   * Whether this is its strip's active tab. Absent when the strip draws the active state itself, as dockview's theme
   * does.
   */
  isActive?: boolean;
  /**
   * The element the tab is. `'button'` (the default) is a complete `role="tab"` for a host's own tablist, which
   * activates on click and closes on Delete or Backspace. `'div'` is the content of a tab another element owns, such as
   * dockview's `.dv-tab`, which takes focus, activation and the Delete key itself.
   */
  as?: 'button' | 'div';
  /** Activates the tab; `as: 'button'` only. */
  onSelect?: () => void;
  /** Closes the tab from its close glyph, and from Delete or Backspace with `as: 'button'`. No glyph when absent. */
  onClose?: () => void;
  /**
   * The close glyph, for a host that listens on it natively, as dockview's tab does before React sees an event. A glyph
   * is drawn when this or `onClose` is given.
   */
  closeRef?: React.Ref<HTMLSpanElement>;
  /** Classes on the tab's root, such as dockview's `dv-default-tab`. */
  className?: string;
  /** Classes on the icon-and-title row, such as dockview's `dv-default-tab-content`. */
  contentClassName?: string;
  /** Classes on the title, such as the Tau app's `dockview-tab-title`. */
  titleClassName?: string;
  /** Classes on the close glyph, such as dockview's `dv-default-tab-action`. */
  closeClassName?: string;
}>;

const closeGlyphClasses =
  'fade-action absolute right-1 z-10 flex size-4.5 items-center justify-center rounded-xs opacity-0 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100 pointer-coarse:opacity-100';

/**
 * One workbench tab, the same in the Tau app's dock and the agent plugin viewer's pane lane: the glyph, the title that
 * dissolves at its end (under the close glyph once the glyph shows) instead of clipping, the close glyph on hover,
 * focus or a coarse pointer, and the full title in a tooltip. With `as: 'button'` the tab is 144 px wide, shrinks
 * equally with its siblings to 48 px, where its centre still clears the glyph, and its tablist scrolls past that. The
 * glyph is never a second focusable control inside the tab: keyboard and assistive technology close with Delete. Draw it
 * inside a `TooltipProvider`.
 *
 * @param props - The glyph, the titles, the active state, the element and what selecting and closing do.
 * @returns The tab.
 * @public
 *
 * @example <caption>A pane tab in a host's own tablist</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { WorkbenchTab } from '@taucad/workbench-panes/components/workbench-tab';
 * import { workbenchPanes } from '@taucad/workbench-panes/registry/pane-registry';
 *
 * const { icon: Icon, title } = workbenchPanes.model;
 * export const tab = createElement(WorkbenchTab, {
 *   icon: createElement(Icon, { 'aria-hidden': true, className: 'size-3.5 shrink-0' }),
 *   title,
 *   isActive: true,
 *   onSelect: () => undefined,
 *   onClose: () => undefined,
 * });
 * ```
 */
export function WorkbenchTab({
  icon,
  title,
  fullTitle,
  isActive,
  as = 'button',
  onSelect,
  onClose,
  closeRef,
  className,
  contentClassName,
  titleClassName,
  closeClassName,
}: WorkbenchTabProps): React.JSX.Element {
  const label = fullTitle ?? title;
  const hasClose = onClose !== undefined || closeRef !== undefined;
  const activeClasses =
    isActive === undefined
      ? undefined
      : isActive
        ? 'bg-accent text-foreground'
        : 'text-muted-foreground [--fade-scrim-into:var(--background)] hover:text-foreground';
  const titleNode = (
    <span
      className={cn(
        'fade-label flex-1 text-left',
        isActive === true && hasClose && '[--fade-label-size:var(--fade-label-size-actions)]',
        titleClassName,
      )}
    >
      {title}
    </span>
  );
  const closeGlyph = hasClose ? (
    <span
      ref={closeRef}
      aria-hidden
      className={nestedActionVariants({
        className: cn(closeGlyphClasses, isActive === true && 'opacity-100', closeClassName),
      })}
      onPointerDown={
        onClose === undefined
          ? undefined
          : (event) => {
              // The tab ignores a press that starts on its glyph.
              event.preventDefault();
              event.stopPropagation();
            }
      }
      onClick={
        onClose === undefined
          ? undefined
          : (event) => {
              event.stopPropagation();
              onClose();
            }
      }
    >
      <X className='size-3.5' />
    </span>
  ) : null;

  if (as === 'div') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-slot='workbench-tab'
            className={cn(
              'group/tab fade-row flex size-full min-w-0 items-center overflow-hidden py-1 pr-1 pl-2 text-[13px]',
              activeClasses,
              className,
            )}
          >
            <span className={cn('flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden', contentClassName)}>
              {icon}
              {titleNode}
            </span>
            {closeGlyph}
          </div>
        </TooltipTrigger>
        <TooltipContent className='max-w-[min(42rem,calc(100vw-1rem))] text-left break-all'>{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      data-slot='workbench-tab'
      className={cn(
        'group/tab fade-row flex h-7 w-36 min-w-12 shrink items-center overflow-hidden rounded-sm text-[13px]',
        activeClasses,
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type='button'
            role='tab'
            aria-label={label === title ? undefined : label}
            aria-selected={isActive === true}
            aria-keyshortcuts={onClose === undefined ? undefined : 'Delete'}
            className={cn(
              'flex size-full min-w-0 items-center gap-1.5 pr-1 pl-2 outline-none focus-visible:focus-outline',
              contentClassName,
            )}
            onClick={onSelect}
            onKeyDown={(event) => {
              if (onClose !== undefined && (event.key === 'Delete' || event.key === 'Backspace')) {
                event.preventDefault();
                onClose();
              }
            }}
          >
            {icon}
            {titleNode}
          </button>
        </TooltipTrigger>
        <TooltipContent className='max-w-[min(42rem,calc(100vw-1rem))] text-left break-all'>{label}</TooltipContent>
      </Tooltip>
      {closeGlyph}
    </div>
  );
}
