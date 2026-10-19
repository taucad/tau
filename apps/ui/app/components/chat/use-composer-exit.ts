import { useCallback, useEffect, useRef } from 'react';

/**
 * Marks portalled UI that belongs to a composer, such as its menus, popovers and drawers. Focus
 * inside a marked element counts as still being in the composer, so any new composer control with
 * portalled content carries it.
 */
export const focusTrapAttribute = 'data-chat-textarea-focustrap';

/** Whether an element is the composer, inside it, or inside UI marked as its own. */
const isComposerOwned = (element: Element, container: HTMLElement): boolean => {
  if (container.contains(element)) {
    return true;
  }
  // Marked UI counts, but not the controls of another composer on the page.
  const otherComposer = element.closest('[data-chat-composer]');
  return element.closest(`[${focusTrapAttribute}]`) !== null && (!otherComposer || otherComposer.contains(container));
};

/**
 * Whether a composer's menu, popover or drawer is open: a press outside it dismisses that, not the
 * composer. Those are portalled out of every composer; the marked triggers inside one are not. One
 * still animating closed is already dismissed.
 */
const hasOpenSurface = (): boolean =>
  [...document.querySelectorAll(`[${focusTrapAttribute}]:not([data-state="closed"])`)].some(
    (element) => !element.closest('[data-chat-composer]'),
  );

/**
 * Reports when the user has left a composer, so an edit box can close. Leaving means focus moved to
 * something outside the composer and its marked UI. A press inside that leaves focus nowhere does
 * not count: WebKit never focuses a pressed button, and a drawer opened by one keeps focus out of
 * itself, so focus falls to the body while the user is still working in the composer. The next
 * press or focus outside then counts as leaving, unless the press dismisses one of the composer's
 * own open surfaces.
 *
 * @param options - The composer's container and the callback to run when the user leaves it.
 * @returns The container's blur handler.
 */
export function useComposerExit({
  containerReference,
  onExit,
}: {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly containerReference: React.RefObject<HTMLElement | null>;
  readonly onExit?: () => void;
}): { readonly handleBlur: () => void } {
  const onExitReference = useRef(onExit);
  const wasPressedInside = useRef(false);
  /* Focus fell to the body after a press inside: the user has not left yet. */
  const isAwaitingNextTouch = useRef(false);
  const isTracked = onExit !== undefined;

  useEffect(() => {
    onExitReference.current = onExit;
  });

  useEffect(() => {
    if (!isTracked) {
      return undefined;
    }
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- DOM event target
    const isOwned = (target: EventTarget | null): boolean => {
      const container = containerReference.current;
      return container !== null && target instanceof Element && isComposerOwned(target, container);
    };
    const leave = (): void => {
      isAwaitingNextTouch.current = false;
      onExitReference.current?.();
    };
    const handlePointerDown = (event: PointerEvent): void => {
      wasPressedInside.current = isOwned(event.target) || hasOpenSurface();
      if (isAwaitingNextTouch.current && !wasPressedInside.current) {
        leave();
      }
    };
    const handleFocusIn = (event: FocusEvent): void => {
      if (!isAwaitingNextTouch.current) {
        return;
      }
      if (isOwned(event.target)) {
        isAwaitingNextTouch.current = false;
      } else {
        leave();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
    };
  }, [containerReference, isTracked]);

  const handleBlur = useCallback((): void => {
    // Check after the focus change settles, so portalled UI has had the chance to take focus.
    requestAnimationFrame(() => {
      const container = containerReference.current;
      const { activeElement } = document;
      if (!container || (activeElement && isComposerOwned(activeElement, container))) {
        return;
      }
      if ((activeElement === null || activeElement === document.body) && wasPressedInside.current) {
        isAwaitingNextTouch.current = true;
        return;
      }
      onExitReference.current?.();
    });
  }, [containerReference]);

  return { handleBlur };
}
