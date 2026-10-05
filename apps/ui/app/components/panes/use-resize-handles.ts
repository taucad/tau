import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** A native layout engine's current, bounded resize operation. Sizes are CSS pixels. */
export type ResizeHandle = {
  readonly label: string;
  readonly orientation: 'vertical' | 'horizontal';
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly resize: (size: number) => void;
};

/** Adds separator semantics and pressed feedback without replacing native drag or size persistence. */
export function useResizeHandles(
  // DOM refs use React’s nullable ref contract.
  // oxlint-disable-next-line typescript/no-restricted-types -- React DOM ref contract is nullable.
  rootRef: RefObject<HTMLElement | null>,
  describe: (sash: HTMLElement) => ResizeHandle | undefined,
): void {
  const describeRef = useRef(describe);
  useLayoutEffect(() => {
    describeRef.current = describe;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const installed = new Map<HTMLElement, () => void>();
    let pressed: HTMLElement | undefined;
    let pointerId = 0;
    let frame: number | undefined;
    const end = (event?: Event): void => {
      const sash = pressed;
      pressed = undefined;
      if (!sash) {
        return;
      }
      delete sash.dataset['resizeDragging'];
      // Vendor cancellation support differs. End native move listeners as well as our paint.
      // Clear pressed first so the forwarded release cannot recurse through this listener.
      if (event?.type !== 'pointerup') {
        sash.ownerDocument.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId }));
      }
    };

    const install = (sash: HTMLElement): void => {
      const start = (event: PointerEvent): void => {
        if (!event.isTrusted || event.button !== 0 || sash.getAttribute('aria-disabled') === 'true') {
          return;
        }
        end();
        pressed = sash;
        pointerId = event.pointerId;
        sash.dataset['resizeDragging'] = 'true';
      };
      // Intrinsic separator keys stay local to the focused widget, like an input's arrow keys.
      const key = (event: KeyboardEvent): void => {
        if (
          pressed !== undefined ||
          event.isComposing ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          sash.getAttribute('aria-disabled') === 'true'
        ) {
          return;
        }
        const current = describeRef.current(sash);
        if (!current) {
          return;
        }
        const backwards = current.orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
        const forwards = current.orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
        const step = event.shiftKey ? 32 : 8;
        let next: number;
        switch (event.key) {
          case backwards: {
            next = current.value - step;
            break;
          }
          case forwards: {
            next = current.value + step;
            break;
          }
          case 'Home': {
            next = current.minimum;
            break;
          }
          case 'End': {
            next = current.maximum;
            break;
          }
          default: {
            return;
          }
        }
        event.preventDefault();
        event.stopPropagation();
        current.resize(Math.max(current.minimum, Math.min(current.maximum, next)));
        schedule();
      };
      sash.addEventListener('pointerdown', start);
      sash.addEventListener('keydown', key);
      installed.set(sash, () => {
        sash.removeEventListener('pointerdown', start);
        sash.removeEventListener('keydown', key);
      });
    };

    const refresh = (): void => {
      frame = undefined;
      for (const [sash, dispose] of installed) {
        if (!root.contains(sash)) {
          dispose();
          installed.delete(sash);
          if (pressed === sash) {
            end();
          }
        }
      }

      // Read every owned sash before writing its accessibility attributes.
      const handles = [...root.querySelectorAll<HTMLElement>('.sash, .dv-sash')]
        .filter((sash) => sash.closest('[data-resize-owner]') === root)
        .map((sash) => ({ sash, handle: describeRef.current(sash) }));
      for (const { sash, handle } of handles) {
        const isDisabled = !handle || handle.maximum <= handle.minimum || sash.matches('.sash-disabled, .dv-disabled');
        sash.setAttribute('role', 'separator');
        sash.setAttribute('aria-disabled', String(isDisabled));
        sash.tabIndex = isDisabled ? -1 : 0;
        if (handle) {
          sash.setAttribute('aria-label', handle.label);
          sash.setAttribute('aria-orientation', handle.orientation);
          sash.setAttribute('aria-valuemin', String(Math.round(handle.minimum)));
          sash.setAttribute('aria-valuemax', String(Math.round(handle.maximum)));
          sash.setAttribute('aria-valuenow', String(Math.round(handle.value)));
          sash.setAttribute('aria-valuetext', `${Math.round(handle.value)} pixels`);
          sash.setAttribute(
            'aria-description',
            'Use arrow keys to resize, Shift for larger steps, Home or End for resize limits.',
          );
        }
        if (isDisabled && pressed === sash) {
          end();
        }
        if (installed.has(sash)) {
          continue;
        }

        install(sash);
      }
    };
    const schedule = (): void => {
      frame ??= requestAnimationFrame(refresh);
    };
    const nativeLayoutSelector =
      '.sash, .dv-sash, .split-view-view, .split-view-container, .dv-view, .dv-view-container, .dv-split-view-container';
    const headerSelector = '.dv-tabs-container, [data-slot=paneview-header]';
    const isLayoutMutation = (mutation: MutationRecord): boolean => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (!target || target.closest('[data-resize-owner]') !== root) {
        return false;
      }
      if (mutation.type === 'attributes') {
        return target === root || target.matches(`${nativeLayoutSelector}, .dv-tab, [data-slot=paneview-header]`);
      }
      // Titles name the adjacent panes. Content text, Monaco decorations and
      // streaming chat have no bearing on sash constraints or accessible labels.
      if (target.closest(headerSelector)) {
        return true;
      }
      if (mutation.type !== 'childList') {
        return false;
      }
      return [...mutation.addedNodes, ...mutation.removedNodes].some(
        (node) =>
          node instanceof Element &&
          (node.matches(nativeLayoutSelector) || node.querySelector(nativeLayoutSelector) !== null),
      );
    };
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => isLayoutMutation(mutation))) {
        schedule();
      }
    });
    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    const sizeObserver = new ResizeObserver(schedule);
    sizeObserver.observe(root);
    const onVisibility = (): void => {
      if (document.hidden) {
        end();
      }
    };
    const endEvents = ['pointerup', 'pointercancel', 'lostpointercapture', 'contextmenu'] as const;
    for (const event of endEvents) {
      document.addEventListener(event, end, true);
    }
    window.addEventListener('blur', end);
    document.addEventListener('visibilitychange', onVisibility);
    schedule();

    return () => {
      end();
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      observer.disconnect();
      sizeObserver.disconnect();
      for (const dispose of installed.values()) {
        dispose();
      }
      for (const event of endEvents) {
        document.removeEventListener(event, end, true);
      }
      window.removeEventListener('blur', end);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [rootRef]);
}
