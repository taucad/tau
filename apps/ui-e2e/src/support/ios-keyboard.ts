import * as target from '#support/external-target.js';

/** An iPhone 15's software keyboard with its accessory bar. CSS pixels. */
export const iosKeyboardHeight = 336;

/** An iPhone 15's layout viewport in Safari, between the status bar and the toolbar. CSS pixels. */
export const iosViewport = { width: 393, height: 659 } as const;

/** Where a focused field sits once the keyboard is up, in layout-viewport coordinates. CSS pixels. */
export type FieldPlacement = {
  /** The share of the field's height inside the visible frame and every clipping ancestor, 0 to 1. */
  readonly visibleFraction: number;
  /** Whether the field itself is what a tap at its visible centre would hit. */
  readonly unobstructed: boolean;
  readonly fontSize: string;
  readonly userSelect: string;
};

/**
 * Installs a model of Safari's software keyboard. The layout viewport keeps its size, the visual
 * viewport loses the keyboard's height, and Safari pans the visual viewport down
 * (`visualViewport.offsetTop`) far enough to reveal the focused field. No window resize fires.
 * Chromium has no software keyboard, so the model replaces `window.visualViewport` and the spec
 * asserts against the frame the model reports.
 */
export const installIosKeyboard = async (): Promise<void> =>
  target.addInitScript(() => {
    const state = { keyboard: 0, offsetTop: 0 };
    class ModelledVisualViewport extends EventTarget {
      public get width(): number {
        return globalThis.innerWidth;
      }

      public get height(): number {
        return globalThis.innerHeight - state.keyboard;
      }

      public get offsetTop(): number {
        return state.offsetTop;
      }

      public get offsetLeft(): number {
        return 0;
      }

      public get scale(): number {
        return 1;
      }

      public get pageTop(): number {
        return globalThis.scrollY + state.offsetTop;
      }
    }

    const viewport = new ModelledVisualViewport();
    Object.defineProperty(globalThis, 'visualViewport', { configurable: true, get: () => viewport });
    const announce = (): void => {
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
    Object.defineProperty(globalThis, '__iosKeyboard', {
      configurable: true,
      value: {
        open(keyboard: number, pan: boolean): void {
          const fieldBottom = document.activeElement?.getBoundingClientRect().bottom ?? 0;
          const visibleBottom = globalThis.innerHeight - keyboard;
          state.keyboard = keyboard;
          state.offsetTop = pan ? Math.min(Math.max(fieldBottom + 8 - visibleBottom, 0), keyboard) : 0;
          announce();
        },
        close(): void {
          state.keyboard = 0;
          state.offsetTop = 0;
          announce();
        },
      },
    });
  });

type IosKeyboard = { open: (keyboard: number, pan: boolean) => void; close: () => void };

/**
 * Raises the modelled keyboard over the focused field, as Safari does once a tap focuses it.
 *
 * @param options - `pan: false` models a field Safari did not need to scroll to.
 * @returns Nothing.
 */
export const openIosKeyboard = async (options: { readonly pan?: boolean } = {}): Promise<void> => {
  await target.evaluate(
    ([keyboard, pan]) => {
      (globalThis as unknown as { __iosKeyboard: IosKeyboard }).__iosKeyboard.open(keyboard, pan);
    },
    [iosKeyboardHeight, options.pan ?? true] as const,
  );
};

/**
 * Blurs the focused field and lowers the modelled keyboard, as tapping Done on iOS does.
 *
 * @returns Nothing.
 */
export const dismissIosKeyboard = async (): Promise<void> => {
  await target.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    (globalThis as unknown as { __iosKeyboard: IosKeyboard }).__iosKeyboard.close();
  });
};

/**
 * Measures the focused field against the frame the keyboard leaves visible: clipped by the frame and
 * by every scrolling or clipping ancestor, then hit-tested at the centre of what is left. The chat
 * composer is measured as its whole box, so its controls count, not just the editable line.
 *
 * @returns Where the focused field sits.
 */
export const readFocusedFieldPlacement = async (): Promise<FieldPlacement | undefined> =>
  target.evaluate(() => {
    const field = document.activeElement;
    const viewport = globalThis.visualViewport;
    if (!(field instanceof HTMLElement) || field === document.body || !viewport) {
      return undefined;
    }
    const subject = field.closest<HTMLElement>('[data-chat-composer]') ?? field;
    const rect = subject.getBoundingClientRect();
    const box = {
      top: Math.max(rect.top, viewport.offsetTop),
      bottom: Math.min(rect.bottom, viewport.offsetTop + viewport.height),
      left: Math.max(rect.left, 0),
      right: Math.min(rect.right, globalThis.innerWidth),
    };
    for (let ancestor = subject.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (/hidden|clip|auto|scroll/u.test(`${style.overflowX} ${style.overflowY}`)) {
        const clip = ancestor.getBoundingClientRect();
        box.top = Math.max(box.top, clip.top);
        box.bottom = Math.min(box.bottom, clip.bottom);
        box.left = Math.max(box.left, clip.left);
        box.right = Math.min(box.right, clip.right);
      }
    }
    const visibleHeight = Math.max(0, box.bottom - box.top);
    const hit =
      visibleHeight > 0 && box.right > box.left
        ? document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2)
        : null;
    const fieldStyle = getComputedStyle(field);
    return {
      // Rounded to a hundredth so a subpixel border does not read as clipping.
      visibleFraction: rect.height > 0 ? Math.round((visibleHeight / rect.height) * 100) / 100 : 0,
      unobstructed: hit !== null && (subject.contains(hit) || hit.contains(subject)),
      fontSize: fieldStyle.fontSize,
      userSelect: fieldStyle.userSelect,
    };
  });
