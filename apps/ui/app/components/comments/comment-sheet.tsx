import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/*
 * On a phone a comment's card is a sheet docked above the keyboard, not a popover beside its pin (charter, desktop and
 * mobile): a popover beside a pin has no room on a narrow screen, and the keyboard would cover it.
 */

/** A visual viewport shorter than the layout viewport by less than this is browser chrome, not a keyboard. CSS pixels. */
const softKeyboardThreshold = 120;

const subscribeViewport = (onChange: () => void): (() => void) => {
  const viewport = globalThis.visualViewport;
  viewport?.addEventListener('resize', onChange);
  viewport?.addEventListener('scroll', onChange);
  return () => {
    viewport?.removeEventListener('resize', onChange);
    viewport?.removeEventListener('scroll', onChange);
  };
};

/**
 * How much of the layout viewport's bottom the on-screen keyboard covers, in CSS pixels; 0 with no keyboard. A pinch
 * zoom shrinks the visual viewport too, so a scaled viewport never reads as a keyboard.
 *
 * @returns The covered height.
 */
export const readKeyboardInset = (): number => {
  const viewport = globalThis.visualViewport;
  if (!viewport || viewport.scale > 1.01) {
    return 0;
  }
  const covered = Math.round(globalThis.innerHeight - viewport.offsetTop - viewport.height);
  return covered < softKeyboardThreshold ? 0 : covered;
};

const readNoInset = (): number => 0;

/**
 * The height the on-screen keyboard covers, kept current as it opens and closes.
 *
 * @returns The covered height in CSS pixels.
 */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribeViewport, readKeyboardInset, readNoInset);
}

/**
 * A comment card as a sheet on a phone: docked at the bottom of the screen and lifted above the keyboard while it is
 * open.
 *
 * @param props - The sheet's label, how it closes, and the card.
 * @returns The sheet, in a portal on the page's body.
 */
export function CommentSheet({
  label,
  onClose,
  children,
}: {
  readonly label: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}): React.ReactNode {
  const inset = useKeyboardInset();
  return createPortal(
    <div
      role='dialog'
      aria-label={label}
      data-comment-ui=''
      className='fixed inset-x-0 z-50 rounded-t-xl border-t border-border bg-popover p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg'
      style={{ bottom: inset }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
