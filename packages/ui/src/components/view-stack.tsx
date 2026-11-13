import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '#utils/cn.js';
import { menuItemVariants, menuViewBackClass, menuViewEnterVariants } from '#components/menu.variants.js';

/*
 * The responsive view stack (UX policy §7): one surface whose list is replaced in place by a sub-view and restored by a
 * Back row, Escape, or Backspace in an empty search. It holds no host: the same views render in a popover, a menu or a
 * drawer, so pointer and touch see one pattern. The Left arrow is never bound to Back, because slider rows use it.
 */

/** Where a view was opened from, so a step back can return to it. */
type ViewStackEntry<V extends string> = {
  readonly view: V;
  /** The row that opened the view; focus returns to it on a step back. */
  readonly origin: HTMLElement | undefined;
  /** A key the host uses to restore its own highlight when the row is virtually focused (cmdk). */
  readonly returnKey: string | undefined;
};

/**
 * A view stack's state and its two moves.
 *
 * @public
 */
export type ViewStack<V extends string> = {
  /** The view on top. */
  readonly view: V;
  /** Views above the root; 0 at the root. */
  readonly depth: number;
  /** The open views above the root, bottom first. */
  readonly views: readonly V[];
  /** How the current view entered: `none` before any move, so the first paint does not slide. */
  readonly direction: 'forward' | 'back' | 'none';
  /** The key the last step back returned to, for a host that highlights rows itself. */
  readonly returnedTo: string | undefined;
  /**
   * Open a view on top. The origin defaults to the focused element.
   *
   * @param view - The view to open.
   * @param options - The row that opened it and a key to restore a virtual highlight.
   */
  readonly push: (view: V, options?: { readonly origin?: HTMLElement; readonly returnKey?: string }) => void;
  /**
   * Step back one view. Does nothing at the root.
   *
   * @returns Whether a view was closed.
   */
  readonly pop: () => boolean;
  /** Return to the root without moving focus. */
  readonly reset: () => void;
};

/**
 * Hold a stack of views over a root. A step back returns focus to the row that opened the view once the parent view
 * has rendered.
 *
 * @param root - The root view.
 * @returns The stack.
 * @public
 */
export function useViewStack<V extends string>(root: V): ViewStack<V> {
  const [entries, setEntries] = React.useState<ReadonlyArray<ViewStackEntry<V>>>([]);
  const [direction, setDirection] = React.useState<ViewStack<V>['direction']>('none');
  const [returnedTo, setReturnedTo] = React.useState<string | undefined>(undefined);
  const focusAfterPop = React.useRef<HTMLElement | undefined>(undefined);
  const entriesRef = React.useRef(entries);
  entriesRef.current = entries;

  React.useEffect(() => {
    const origin = focusAfterPop.current;
    focusAfterPop.current = undefined;
    if (origin?.isConnected) {
      origin.focus({ preventScroll: true });
    }
  }, [entries]);

  const push = React.useCallback<ViewStack<V>['push']>((view, options) => {
    const { activeElement } = document;
    const origin = options?.origin ?? (activeElement instanceof HTMLElement ? activeElement : undefined);
    setDirection('forward');
    setReturnedTo(undefined);
    setEntries((current) => [...current, { view, origin, returnKey: options?.returnKey }]);
  }, []);

  const pop = React.useCallback((): boolean => {
    const { current } = entriesRef;
    const top = current.at(-1);
    if (top === undefined) {
      return false;
    }
    focusAfterPop.current = top.origin;
    setDirection('back');
    setReturnedTo(top.returnKey);
    const next = current.slice(0, -1);
    entriesRef.current = next;
    setEntries(next);
    return true;
  }, []);

  const reset = React.useCallback(() => {
    entriesRef.current = [];
    setDirection('none');
    setReturnedTo(undefined);
    setEntries([]);
  }, []);

  return {
    view: entries.at(-1)?.view ?? root,
    depth: entries.length,
    views: entries.map((entry) => entry.view),
    direction,
    returnedTo,
    push,
    pop,
    reset,
  };
}

/**
 * A keydown handler that steps back on Backspace while the view's search is empty.
 *
 * @param query - The view's search text.
 * @param onBack - The step back; it returns whether a view was closed.
 * @returns The handler for the search's surface.
 * @public
 */
export const stepBackOnEmptySearch =
  (query: string, onBack: () => boolean | void) =>
  (event: React.KeyboardEvent): void => {
    if (event.key === 'Backspace' && query === '' && onBack() !== false) {
      event.preventDefault();
    }
  };

/**
 * The Back row's class: a list row, full width, muted.
 *
 * @public
 */
export const viewStackBackRowClass = cn(menuItemVariants({ highlight: 'focus' }), menuViewBackClass);

/**
 * The content of a Back row: a ChevronLeft and "Back". Hosts wrap it in their own row element (a button, a menu item, a
 * command item), so the row keeps the host's role and focus model, and name the row `Back to <parent>` for assistive
 * technology. The view's own name belongs to its group or heading, not to the Back row.
 *
 * @returns The row's content.
 * @public
 */
export function ViewStackBackContent(): React.JSX.Element {
  return (
    <>
      <ChevronLeft aria-hidden='true' className='size-3.5 shrink-0' />
      <span className='truncate'>Back</span>
    </>
  );
}

/**
 * A plain Back row for a host whose rows are buttons (a popover or drawer body).
 *
 * @param props - The parent's name for assistive technology, and the step back.
 * @returns The Back row.
 * @public
 */
export function ViewStackBack({
  parentLabel,
  onBack,
  className,
  ...properties
}: Omit<React.ComponentProps<'button'>, 'onClick'> & {
  /** Names where Back goes, as `Back to <parentLabel>`. */
  readonly parentLabel: string;
  readonly onBack: () => void;
}): React.JSX.Element {
  return (
    <button
      type='button'
      data-slot='view-stack-back'
      aria-label={`Back to ${parentLabel}`}
      className={cn(viewStackBackRowClass, className)}
      onClick={onBack}
      {...properties}
    >
      <ViewStackBackContent />
    </button>
  );
}

/**
 * The class a view enters with, from the stack's last move.
 *
 * @param direction - The stack's direction.
 * @returns The motion class; empty before any move.
 * @public
 */
export const viewStackEnterClass = (direction: ViewStack<string>['direction']): string =>
  menuViewEnterVariants({ direction });
