import * as React from 'react';
import { createPortal } from 'react-dom';
import { Popper } from 'radix-ui/internal';
import { cn } from '#utils/cn.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

/**
 * What a coach mark can be placed beside: an element, or any object that reports a rectangle (a point on screen, a
 * corner of a larger element).
 *
 * @public
 */
export type CoachMarkAnchor = Readonly<{ getBoundingClientRect: () => DOMRect }>;

/**
 * Properties of {@link CoachMark}.
 *
 * @public
 */
export type CoachMarkProps = Omit<
  React.ComponentProps<typeof Popper.Content>,
  'role' | 'aria-modal' | 'aria-label' | 'onKeyDown'
> &
  Readonly<{
    /** What the tip is placed beside. Nothing renders while it is `undefined`. */
    anchor: CoachMarkAnchor | undefined;
    /** The accessible name of the tip, for example "Tour tip 2 of 5: Look around". */
    label: string;
    /**
     * Called when Escape is pressed while focus is inside the tip. The event is then cancelled; an Escape pressed
     * anywhere else never reaches this handler and is left untouched.
     */
    onEscape?: () => void;
    /** Other keys pressed while focus is inside the tip. */
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    /**
     * The element the tip is portalled into. Defaults to the body of the anchor's own document, so a tip beside a
     * control in a popped-out window opens in that window.
     */
    container?: Element;
  }>;

/* Stands in while no anchor is given; nothing renders then, so its rectangle is never read for placement. */
const noAnchor: CoachMarkAnchor = { getBoundingClientRect: () => new DOMRect() };

const isElement = (anchor: CoachMarkAnchor): anchor is Element =>
  typeof (anchor as Partial<Element>).ownerDocument === 'object';

const portalTarget = (anchor: CoachMarkAnchor, container: Element | undefined): Element | undefined => {
  if (container !== undefined) {
    return container;
  }
  if (isElement(anchor)) {
    return anchor.ownerDocument.body;
  }
  return typeof document === 'undefined' ? undefined : document.body;
};

/**
 * A small non-modal card placed beside the control it explains, for product tours and first-run hints.
 *
 * It is positioned by Radix Popper, the layer under {@link Popover}, and wears the popover's surface, but it is not a
 * popover: it has no dismissable layer, no focus scope and no outside-press handling. Pressing outside it does
 * nothing, it never moves focus by itself, and it adds no document-level key listener, so Escape keeps closing a code
 * editor's completion list or a viewer's tool while a tip is on screen. Escape is handled on the tip element alone.
 * Nothing in it animates.
 *
 * The tip is `role="dialog"` without `aria-modal`, named by `label`, and focusable (`tabIndex={-1}`) so a host can move
 * focus into it when the person asks.
 *
 * @public
 * @param properties - The anchor, the accessible name, the Escape handler and Popper's placement options.
 * @returns The tip, portalled beside its anchor, or nothing without an anchor.
 *
 * @example <caption>Place a tip beside a button</caption>
 * ```tsx
 * import { CoachMark } from '@taucad/ui/components/coach-mark';
 *
 * export function Hint({ target }: { readonly target: HTMLElement | undefined }) {
 *   return (
 *     <CoachMark anchor={target} label='Tip 1 of 3: Export' side='bottom' onEscape={() => undefined}>
 *       Export writes the formats this model offers.
 *     </CoachMark>
 *   );
 * }
 * ```
 */
function CoachMark({
  anchor,
  label,
  onEscape,
  onKeyDown,
  container,
  className,
  sideOffset = 10,
  collisionPadding = 12,
  children,
  ...properties
}: CoachMarkProps): React.JSX.Element | undefined {
  const anchorRef = React.useMemo(() => ({ current: anchor ?? noAnchor }), [anchor]);
  if (anchor === undefined) {
    return undefined;
  }
  const target = portalTarget(anchor, container);
  if (target === undefined) {
    return undefined;
  }
  return (
    <Popper.Root>
      <Popper.Anchor virtualRef={anchorRef} />
      {createPortal(
        <Popper.Content
          data-slot='coach-mark'
          role='dialog'
          tabIndex={-1}
          aria-label={label}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          className={cn(popoverSurfaceVariants(), 'z-50 flex flex-col gap-3 p-4 text-xs', className)}
          onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
            onKeyDown?.(event);
            if (event.key !== 'Escape' || event.defaultPrevented || onEscape === undefined) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onEscape();
          }}
          {...properties}
        >
          {children}
        </Popper.Content>,
        target,
      )}
    </Popper.Root>
  );
}

export { CoachMark };
